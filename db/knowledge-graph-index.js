const logger = new (require('../logger'))('KNOWLEDGE_GRAPH_INDEX');

const PushId = require('./push-id');
const MemoryBackend = require('./knowledge-graph-backends/memory-backend');

/**
 * Singleton graph index manager for the knowledge module.
 *
 * Provides sync methods (called by native function triggers) and
 * query methods (called by JSON-RPC handlers). The graph index is a
 * read optimization — not consensus state.
 */
class KnowledgeGraphIndex {
  /**
   * @param {string} backendType 'memory' or 'neo4j'
   * @param {object} config Neo4j config: { uri, username, password }
   */
  constructor(backendType, config) {
    this.backendType = backendType || 'memory';
    this.config = config || {};
    this.backend = null;
    this._enabled = false;
  }

  async initialize() {
    try {
      if (this.backendType === 'neo4j') {
        const Neo4jBackend = require('./knowledge-graph-backends/neo4j-backend');
        this.backend = new Neo4jBackend(this.config);
      } else {
        this.backend = new MemoryBackend();
      }
      await this.backend.initialize();
      this._enabled = true;
      this._syncSuppressed = true; // Suppress incremental syncs until rebuild completes.
      logger.info(`Knowledge Graph Index initialized with ${this.backendType} backend.`);
    } catch (err) {
      this._enabled = false;
      logger.error(`Failed to initialize Knowledge Graph Index: ${err.message}`);
      throw err;
    }
  }

  isEnabled() {
    return this._enabled;
  }

  // ---------------------------------------------------------------------------
  // Sync (called by native functions, fire-and-forget)
  // ---------------------------------------------------------------------------

  /**
   * Sync a topic into the graph index.
   * @param {string} topicPath e.g. "ai/transformers"
   * @param {object} topicInfo { title, description, created_at, created_by }
   */
  async syncTopic(topicPath, topicInfo) {
    if (!this._enabled || !this.backend || this._syncSuppressed) return;

    const topicProps = {
      path: topicPath,
      title: topicInfo.title || '',
      description: topicInfo.description || '',
      created_at: topicInfo.created_at || Date.now(),
      created_by: topicInfo.created_by || '',
    };

    await this.backend.mergeNode('Topic', topicPath, topicProps);

    // If the topic has a parent, create the PARENT_OF edge
    const parts = topicPath.split('/');
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join('/');
      await this.backend.mergeEdge({
        type: 'PARENT_OF',
        from: parentPath,
        to: topicPath,
      });
    }
  }

  /**
   * Sync an exploration entry into the graph index.
   * @param {string} address Explorer's address
   * @param {string} topicPath e.g. "ai/transformers"
   * @param {string} entryId Unique exploration ID
   * @param {object} exploration Exploration data from on-chain
   */
  async syncExploration(address, topicPath, entryId, exploration) {
    if (!this._enabled || !this.backend || this._syncSuppressed) return;

    // Merge User node (idempotent)
    await this.backend.mergeNode('User', address, { address });

    // Create Exploration node
    await this.backend.createNode({
      label: 'Exploration',
      id: entryId,
      properties: {
        topic_path: topicPath,
        title: exploration.title || '',
        content: exploration.content || null,
        summary: exploration.summary || '',
        depth: exploration.depth || 1,
        tags: exploration.tags || '',
        price: exploration.price || null,
        gateway_url: exploration.gateway_url || null,
        content_hash: exploration.content_hash || null,
        created_at: exploration.created_at || Date.now(),
        updated_at: exploration.updated_at || Date.now(),
      },
    });

    // Edges: CREATED, IN_TOPIC, EXPLORED (with count increment)
    await this.backend.createEdge({
      type: 'CREATED',
      from: address,
      to: entryId,
    });

    await this.backend.createEdge({
      type: 'IN_TOPIC',
      from: entryId,
      to: topicPath,
    });

    await this.backend.incrementEdgeProperty(
      'EXPLORED',
      address,
      topicPath,
      'count',
      1
    );

    // Parse builds-on tags and create BUILDS_ON edges
    const tags = (exploration.tags || '').split(',').map(function(t) { return t.trim(); });
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      if (tag.startsWith('builds-on:')) {
        const parentId = tag.slice('builds-on:'.length);
        if (parentId) {
          await this.backend.createEdge({
            type: 'BUILDS_ON',
            from: entryId,
            to: parentId,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Query (called by JSON-RPC handlers)
  // ---------------------------------------------------------------------------

  /** Get statistics for a topic. */
  async getTopicStats(topicPath) {
    if (!this._enabled || !this.backend) return null;

    const result = await this.backend.aggregateOverEdge(
      'Topic',
      topicPath,
      'EXPLORED',
      'User',
      [
        { property: 'explorer_count', fn: 'count' },
        { property: 'max_depth', fn: 'max' },
        { property: 'avg_depth', fn: 'avg' },
      ]
    );

    return {
      explorer_count: result.explorer_count || 0,
      max_depth: result.max_depth || 0,
      avg_depth: result.avg_depth || 0,
    };
  }

  /** Get frontier map: stats per subtopic. */
  async getFrontierMap(topicPath) {
    if (!this._enabled || !this.backend) return null;

    if (topicPath) {
      const results = await this.backend.aggregateGrouped(
        'Topic',
        topicPath,
        'PARENT_OF',
        'Topic',
        'IN_TOPIC',
        'Exploration',
        [
          { property: 'explorer_count', fn: 'count_distinct' },
          { property: 'max_depth', fn: 'max' },
          { property: 'avg_depth', fn: 'avg' },
        ]
      );

      return results.map(function(r) {
        return {
          topic: r.group,
          stats: {
            explorer_count: r.values.explorer_count || 0,
            max_depth: r.values.max_depth || 0,
            avg_depth: r.values.avg_depth || 0,
          },
        };
      });
    }

    // No parent specified: get stats for all root topics
    const roots = await this.listTopics();
    const entries = [];
    for (let i = 0; i < roots.length; i++) {
      const stats = await this.getTopicStats(roots[i]);
      entries.push({ topic: roots[i], stats });
    }
    return entries;
  }

  /** Get the ancestor chain of an exploration (via BUILDS_ON edges). */
  async getLineage(explorationId) {
    if (!this._enabled || !this.backend) return null;

    const paths = await this.backend.traverse(explorationId, 'BUILDS_ON', 'out');
    if (paths.length === 0) return [];

    // Get the longest path (deepest lineage)
    const longest = paths.reduce(function(a, b) {
      return a.nodes.length > b.nodes.length ? a : b;
    });
    return longest.nodes
      .filter(function(n) { return n.label === 'Exploration'; })
      .map(function(n) { return KnowledgeGraphIndex._nodeToExploration(n); });
  }

  /** Get all descendants of an exploration (via BUILDS_ON edges, reversed). */
  async getDescendants(explorationId) {
    if (!this._enabled || !this.backend) return null;

    const paths = await this.backend.traverse(explorationId, 'BUILDS_ON', 'in');
    const seen = new Set();
    const results = [];

    for (let pi = 0; pi < paths.length; pi++) {
      const path = paths[pi];
      for (let ni = 0; ni < path.nodes.length; ni++) {
        const node = path.nodes[ni];
        if (node.label === 'Exploration' && node.id !== explorationId && !seen.has(node.id)) {
          seen.add(node.id);
          results.push(KnowledgeGraphIndex._nodeToExploration(node));
        }
      }
    }
    return results;
  }

  /** Get shortest path between two explorations. */
  async getShortestPath(fromId, toId) {
    if (!this._enabled || !this.backend) return null;

    const path = await this.backend.shortestPath(fromId, toId, 'BUILDS_ON');
    if (!path) return [];
    return path.nodes
      .filter(function(n) { return n.label === 'Exploration'; })
      .map(function(n) { return KnowledgeGraphIndex._nodeToExploration(n); });
  }

  /** Get explorers for a topic. */
  async getExplorers(topicPath) {
    if (!this._enabled || !this.backend) return null;

    const edges = await this.backend.getEdges(topicPath, 'EXPLORED', 'in');
    return edges.map(function(e) { return e.from; });
  }

  /** List all top-level topic paths. */
  async listTopics() {
    if (!this._enabled || !this.backend) return null;

    const roots = await this.backend.getRoots('Topic', 'PARENT_OF');
    return roots.map(function(n) { return n.id; }).sort();
  }

  /** List subtopic paths under a given topic. */
  async listSubtopics(topicPath) {
    if (!this._enabled || !this.backend) return null;

    const children = await this.backend.getChildren('Topic', topicPath, 'PARENT_OF', 'Topic');
    return children.map(function(n) { return n.id; }).sort();
  }

  /** Get graph stats (node and edge counts). */
  async getGraphStats() {
    if (!this._enabled || !this.backend) return null;

    const nodeCount = await this.backend.nodeCount();
    const edgeCount = await this.backend.edgeCount();
    return { node_count: nodeCount, edge_count: edgeCount };
  }

  // ---------------------------------------------------------------------------
  // Block / Transaction sync & query
  // ---------------------------------------------------------------------------

  /**
   * Sync a finalized block (with transactions) into the graph index.
   * Creates Block + Transaction nodes and CONTAINS_TX edges.
   */
  async syncFinalizedBlock(block) {
    if (!this._enabled || !this.backend) return;
    if (!block || !block.transactions || block.transactions.length === 0) return;

    try {
      const blockId = `block:${block.number}`;
      await this.backend.mergeNode('Block', blockId, {
        number: block.number,
        hash: block.hash,
        epoch: block.epoch,
        timestamp: block.timestamp,
        proposer: block.proposer,
        tx_count: block.transactions.length,
      });

      for (let i = 0; i < block.transactions.length; i++) {
        const tx = block.transactions[i];
        const txId = tx.hash;
        await this.backend.mergeNode('Transaction', txId, {
          hash: tx.hash,
          block_number: block.number,
          index: i,
          address: tx.address,
          timestamp: tx.tx_body ? tx.tx_body.timestamp : block.timestamp,
          transaction_json: JSON.stringify(tx),
          receipt_json: block.receipts && block.receipts[i] ? JSON.stringify(block.receipts[i]) : null,
        });
        await this.backend.mergeEdge({
          type: 'CONTAINS_TX',
          from: blockId,
          to: txId,
        });
      }
    } catch (err) {
      logger.error(`[syncFinalizedBlock] Failed to sync block ${block.number}: ${err.message}`);
    }
  }

  /**
   * Get recent blocks that contain transactions, ordered by block number DESC.
   */
  async getRecentBlocksWithTransactions(count) {
    if (!this._enabled || !this.backend) return [];

    try {
      const blockNodes = await this.backend.findNodesOrdered('Block', 'number', 'DESC', count);
      const results = [];
      for (let i = 0; i < blockNodes.length; i++) {
        const b = blockNodes[i].properties;
        const txNodes = await this.backend.getChildren('Block', blockNodes[i].id, 'CONTAINS_TX', 'Transaction');
        // Sort transactions by index ASC
        txNodes.sort(function(a, c) { return a.properties.index - c.properties.index; });
        const transactions = [];
        const receipts = [];
        for (let j = 0; j < txNodes.length; j++) {
          const txProps = txNodes[j].properties;
          transactions.push(txProps.transaction_json ? JSON.parse(txProps.transaction_json) : null);
          receipts.push(txProps.receipt_json ? JSON.parse(txProps.receipt_json) : null);
        }
        results.push({
          number: b.number,
          hash: b.hash,
          epoch: b.epoch,
          timestamp: b.timestamp,
          proposer: b.proposer,
          tx_count: b.tx_count,
          transactions,
          receipts,
        });
      }
      return results;
    } catch (err) {
      logger.error(`[getRecentBlocksWithTransactions] Failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get recent transactions ordered by block_number DESC, index DESC.
   */
  async getRecentTransactions(count) {
    if (!this._enabled || !this.backend) return [];

    try {
      const txNodes = await this.backend.findNodesOrdered('Transaction', 'block_number', 'DESC', count);
      const results = [];
      for (let i = 0; i < txNodes.length; i++) {
        const p = txNodes[i].properties;
        results.push({
          block_number: p.block_number,
          block_timestamp: p.timestamp,
          index: p.index,
          transaction: p.transaction_json ? JSON.parse(p.transaction_json) : null,
          receipt: p.receipt_json ? JSON.parse(p.receipt_json) : null,
        });
      }
      return results;
    } catch (err) {
      logger.error(`[getRecentTransactions] Failed: ${err.message}`);
      return [];
    }
  }

  /**
   * Get a transaction by its hash from the graph index.
   */
  async getTransactionByHash(hash) {
    if (!this._enabled || !this.backend) return null;

    try {
      const node = await this.backend.getNode('Transaction', hash);
      if (!node) return null;
      const p = node.properties;
      return {
        state: 'FINALIZED',
        number: p.block_number,
        index: p.index,
        address: p.address,
        timestamp: p.timestamp,
        is_executed: true,
        is_finalized: true,
        transaction: p.transaction_json ? JSON.parse(p.transaction_json) : null,
        receipt: p.receipt_json ? JSON.parse(p.receipt_json) : null,
      };
    } catch (err) {
      logger.error(`[getTransactionByHash] Failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Get the maximum indexed block number from the graph.
   */
  async getLatestIndexedBlockNumber() {
    if (!this._enabled || !this.backend) return -1;

    try {
      const maxNum = await this.backend.getMaxProperty('Block', 'number');
      return maxNum !== null ? maxNum : -1;
    } catch (err) {
      logger.error(`[getLatestIndexedBlockNumber] Failed: ${err.message}`);
      return -1;
    }
  }

  /**
   * Check integrity and rebuild block index only for missing blocks.
   * @param {object} bc The Blockchain instance
   */
  async checkAndRebuildBlockIndex(bc) {
    if (!this._enabled || !this.backend) return;

    const chainTip = bc.lastBlockNumber();
    const indexedMax = await this.getLatestIndexedBlockNumber();
    logger.info(
      `[checkAndRebuildBlockIndex] Chain tip: ${chainTip}, Neo4j max block: ${indexedMax}`);

    if (indexedMax >= chainTip) {
      logger.info('[checkAndRebuildBlockIndex] Block index is up to date, no rebuild needed.');
      return;
    }

    const startBlock = indexedMax + 1;
    let syncedCount = 0;
    for (let num = startBlock; num <= chainTip; num++) {
      const block = bc.getBlockByNumber(num);
      if (block && block.transactions && block.transactions.length > 0) {
        await this.syncFinalizedBlock(block);
        syncedCount++;
      }
    }
    logger.info(
      `[checkAndRebuildBlockIndex] Synced ${syncedCount} blocks from ${startBlock} to ${chainTip}.`);
  }

  /**
   * Get recent explorations ordered by created_at DESC.
   */
  async getRecentKnowledge(count) {
    if (!this._enabled || !this.backend) return [];

    try {
      const expNodes = await this.backend.findNodesOrdered('Exploration', 'created_at', 'DESC', count);
      const results = [];
      for (let i = 0; i < expNodes.length; i++) {
        const exp = KnowledgeGraphIndex._nodeToExploration(expNodes[i]);
        // Fetch the user who created this exploration
        const createdEdges = await this.backend.getEdges(expNodes[i].id, 'CREATED', 'in');
        exp.created_by = createdEdges.length > 0 ? createdEdges[0].from : null;
        results.push(exp);
      }
      return results;
    } catch (err) {
      logger.error(`[getRecentKnowledge] Failed: ${err.message}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Rebuild (called on snapshot restore / cold start)
  // ---------------------------------------------------------------------------

  /**
   * Rebuild the graph index from the JSON DB state.
   * Walks /apps/knowledge/topics and /apps/knowledge/explorations.
   * @param {object} db The DB instance
   */
  async rebuildFromState(db) {
    if (!this._enabled || !this.backend) return;

    logger.info('Rebuilding knowledge graph index from state...');

    // Clear only knowledge-related nodes (preserve Block/Transaction data)
    await this.backend.clearNodesByLabel('Topic');
    await this.backend.clearNodesByLabel('User');
    await this.backend.clearNodesByLabel('Exploration');

    // Temporarily allow syncs during rebuild
    this._syncSuppressed = false;

    // Rebuild topics
    const topicsData = db.getValue('/apps/knowledge/topics');
    if (topicsData) {
      await this._rebuildTopics(topicsData, '');
    }

    // Rebuild explorations
    const explorationsData = db.getValue('/apps/knowledge/explorations');
    if (explorationsData) {
      const addresses = Object.keys(explorationsData);
      for (let ai = 0; ai < addresses.length; ai++) {
        const address = addresses[ai];
        const topicKeys = Object.keys(explorationsData[address] || {});
        for (let ti = 0; ti < topicKeys.length; ti++) {
          const topicKey = topicKeys[ti];
          const topicPath = topicKey.replace(/\|/g, '/');
          const entries = explorationsData[address][topicKey] || {};
          const entryIds = Object.keys(entries);
          for (let ei = 0; ei < entryIds.length; ei++) {
            const entryId = entryIds[ei];
            const exploration = entries[entryId];
            if (exploration) {
              await this.syncExploration(address, topicPath, entryId, exploration);
            }
          }
        }
      }
    }

    const stats = await this.getGraphStats();
    logger.info(`Knowledge graph index rebuilt: ${stats.node_count} nodes, ${stats.edge_count} edges.`);
    // Syncs now remain enabled for live blocks.
  }

  /**
   * Recursively rebuild topics from the nested state tree.
   * @param {object} data The topic subtree
   * @param {string} prefix Current path prefix
   */
  async _rebuildTopics(data, prefix) {
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key === '.info') {
        // This is topic info for the current prefix
        if (prefix && data[key]) {
          await this.syncTopic(prefix, data[key]);
        }
        continue;
      }
      const childPath = prefix ? `${prefix}/${key}` : key;
      if (typeof data[key] === 'object' && data[key] !== null) {
        await this._rebuildTopics(data[key], childPath);
      }
    }
  }

  async close() {
    if (this.backend) {
      await this.backend.close();
      this._enabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  static _nodeToExploration(node) {
    const p = node.properties;
    return {
      topic_path: p.topic_path,
      title: p.title,
      content: p.content || null,
      summary: p.summary,
      depth: p.depth,
      tags: p.tags,
      price: p.price || null,
      gateway_url: p.gateway_url || null,
      content_hash: p.content_hash || null,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  }
}

module.exports = KnowledgeGraphIndex;
