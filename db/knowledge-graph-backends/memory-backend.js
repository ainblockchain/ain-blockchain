/**
 * In-memory implementation of GraphBackend.
 *
 * Uses plain Maps and arrays — zero external dependencies.
 * Port of ain-js/src/knowledge/memory-backend.ts to CommonJS.
 */

class MemoryBackend {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
    /** Index: `out:${from}:${type}` → edges[], `in:${to}:${type}` → edges[] */
    this.edgeIndex = new Map();
  }

  _nodeKey(label, id) {
    return `${label}:${id}`;
  }

  _allNodes() {
    return Array.from(this.nodes.values());
  }

  _findNodeById(id) {
    const all = this._allNodes();
    for (let i = 0; i < all.length; i++) {
      if (all[i].id === id) return all[i];
    }
    return null;
  }

  _indexEdge(edge) {
    const outKey = `out:${edge.from}:${edge.type}`;
    const inKey = `in:${edge.to}:${edge.type}`;
    if (!this.edgeIndex.has(outKey)) this.edgeIndex.set(outKey, []);
    if (!this.edgeIndex.has(inKey)) this.edgeIndex.set(inKey, []);
    this.edgeIndex.get(outKey).push(edge);
    this.edgeIndex.get(inKey).push(edge);
  }

  // --- Lifecycle ---

  async initialize() {
    // No-op for in-memory backend.
  }

  async close() {
    this.nodes.clear();
    this.edges = [];
    this.edgeIndex.clear();
  }

  // --- Write ---

  async createNode(node) {
    const key = this._nodeKey(node.label, node.id);
    this.nodes.set(key, { label: node.label, id: node.id, properties: Object.assign({}, node.properties) });
  }

  async mergeNode(label, id, properties) {
    const key = this._nodeKey(label, id);
    const existing = this.nodes.get(key);
    if (existing) {
      existing.properties = Object.assign({}, existing.properties, properties);
    } else {
      this.nodes.set(key, { label, id, properties: Object.assign({}, properties) });
    }
  }

  async createEdge(edge) {
    const copy = {
      type: edge.type,
      from: edge.from,
      to: edge.to,
      properties: edge.properties ? Object.assign({}, edge.properties) : undefined,
    };
    this.edges.push(copy);
    this._indexEdge(copy);
  }

  async mergeEdge(edge) {
    const existing = this.edges.find(
      function(e) { return e.type === edge.type && e.from === edge.from && e.to === edge.to; }
    );
    if (existing) {
      if (edge.properties) {
        existing.properties = Object.assign({}, existing.properties, edge.properties);
      }
    } else {
      await this.createEdge(edge);
    }
  }

  async incrementEdgeProperty(type, from, to, property, delta) {
    let existing = this.edges.find(
      function(e) { return e.type === type && e.from === from && e.to === to; }
    );
    if (!existing) {
      existing = { type, from, to, properties: {} };
      existing.properties[property] = 0;
      this.edges.push(existing);
      this._indexEdge(existing);
    }
    if (!existing.properties) existing.properties = {};
    existing.properties[property] = (existing.properties[property] || 0) + delta;
  }

  // --- Read ---

  async getNode(label, id) {
    return this.nodes.get(this._nodeKey(label, id)) || null;
  }

  async findNodes(label, filter) {
    const results = [];
    const all = this._allNodes();
    for (let i = 0; i < all.length; i++) {
      const node = all[i];
      if (node.label !== label) continue;
      if (filter) {
        let match = true;
        const keys = Object.keys(filter);
        for (let j = 0; j < keys.length; j++) {
          if (node.properties[keys[j]] !== filter[keys[j]]) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }
      results.push(node);
    }
    return results;
  }

  async getChildren(parentLabel, parentId, edgeType, childLabel) {
    const outKey = `out:${parentId}:${edgeType}`;
    const edges = this.edgeIndex.get(outKey) || [];
    const children = [];
    for (let i = 0; i < edges.length; i++) {
      const child = this.nodes.get(this._nodeKey(childLabel, edges[i].to));
      if (child) children.push(child);
    }
    return children;
  }

  async getRoots(label, incomingEdgeType) {
    const hasIncoming = new Set();
    for (let i = 0; i < this.edges.length; i++) {
      if (this.edges[i].type === incomingEdgeType) {
        hasIncoming.add(this.edges[i].to);
      }
    }

    const roots = [];
    const all = this._allNodes();
    for (let i = 0; i < all.length; i++) {
      if (all[i].label === label && !hasIncoming.has(all[i].id)) {
        roots.push(all[i]);
      }
    }
    return roots;
  }

  async getEdges(nodeId, edgeType, direction) {
    const key = `${direction}:${nodeId}:${edgeType}`;
    return this.edgeIndex.get(key) || [];
  }

  // --- Aggregation ---

  async aggregateOverEdge(targetLabel, targetId, edgeType, sourceLabel, metrics) {
    const inKey = `in:${targetId}:${edgeType}`;
    const edges = this.edgeIndex.get(inKey) || [];

    const sourceNodes = [];
    for (let i = 0; i < edges.length; i++) {
      const node = this.nodes.get(this._nodeKey(sourceLabel, edges[i].from));
      if (node) sourceNodes.push(node);
    }

    // Collect all exploration depths for this topic
    const allDepths = [];
    const inTopicKey = `in:${targetId}:IN_TOPIC`;
    const inTopicEdges = this.edgeIndex.get(inTopicKey) || [];
    for (let i = 0; i < inTopicEdges.length; i++) {
      const expNode = this.nodes.get(this._nodeKey('Exploration', inTopicEdges[i].from));
      if (expNode && typeof expNode.properties.depth === 'number') {
        allDepths.push(expNode.properties.depth);
      }
    }

    const result = {};
    for (let i = 0; i < metrics.length; i++) {
      const metric = metrics[i];
      if (metric.fn === 'count') {
        result[metric.property] = sourceNodes.length;
      } else if (metric.fn === 'max') {
        result[metric.property] = allDepths.length > 0 ? Math.max.apply(null, allDepths) : 0;
      } else if (metric.fn === 'avg') {
        result[metric.property] =
          allDepths.length > 0
            ? Math.round((allDepths.reduce(function(a, b) { return a + b; }, 0) / allDepths.length) * 100) / 100
            : 0;
      } else if (metric.fn === 'sum') {
        result[metric.property] = allDepths.reduce(function(a, b) { return a + b; }, 0);
      }
    }
    return result;
  }

  async aggregateGrouped(parentLabel, parentId, parentToChildEdge, childLabel, childToLeafEdge, leafLabel, metrics) {
    const children = await this.getChildren(parentLabel, parentId, parentToChildEdge, childLabel);
    const results = [];

    for (let ci = 0; ci < children.length; ci++) {
      const child = children[ci];

      // Find all users who EXPLORED this child topic
      const exploredInKey = `in:${child.id}:EXPLORED`;
      const exploredEdges = this.edgeIndex.get(exploredInKey) || [];
      const explorerCount = exploredEdges.length;

      // Find all exploration depths for this child topic
      const inTopicKey = `in:${child.id}:IN_TOPIC`;
      const inTopicEdges = this.edgeIndex.get(inTopicKey) || [];
      const depths = [];
      for (let i = 0; i < inTopicEdges.length; i++) {
        const exp = this.nodes.get(this._nodeKey('Exploration', inTopicEdges[i].from));
        if (exp && typeof exp.properties.depth === 'number') {
          depths.push(exp.properties.depth);
        }
      }

      const values = {};
      for (let i = 0; i < metrics.length; i++) {
        const metric = metrics[i];
        if (metric.fn === 'count_distinct') {
          values[metric.property] = explorerCount;
        } else if (metric.fn === 'max') {
          values[metric.property] = depths.length > 0 ? Math.max.apply(null, depths) : 0;
        } else if (metric.fn === 'avg') {
          values[metric.property] =
            depths.length > 0
              ? Math.round((depths.reduce(function(a, b) { return a + b; }, 0) / depths.length) * 100) / 100
              : 0;
        }
      }

      results.push({ group: child.id, values });
    }

    return results;
  }

  // --- Graph traversal ---

  async traverse(startId, edgeType, direction, maxDepth) {
    const self = this;
    const paths = [];
    const visited = new Set();

    function dfs(currentId, currentPath, depth) {
      if (maxDepth !== undefined && depth >= maxDepth) return;

      const key = direction === 'out' ? `out:${currentId}:${edgeType}` : `in:${currentId}:${edgeType}`;
      const edges = self.edgeIndex.get(key) || [];

      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const nextId = direction === 'out' ? edge.to : edge.from;
        if (visited.has(nextId)) continue;

        visited.add(nextId);

        const nextNode = self._findNodeById(nextId);
        if (!nextNode) continue;

        const newPath = {
          nodes: currentPath.nodes.concat([nextNode]),
          edges: currentPath.edges.concat([edge]),
        };

        paths.push(newPath);
        dfs(nextId, newPath, depth + 1);
      }
    }

    const startNode = this._findNodeById(startId);
    if (!startNode) return [];

    visited.add(startId);
    const initialPath = { nodes: [startNode], edges: [] };
    dfs(startId, initialPath, 0);

    return paths;
  }

  async shortestPath(fromId, toId, edgeType) {
    const fromNode = this._findNodeById(fromId);
    if (!fromNode) return null;

    const visited = new Set([fromId]);
    const queue = [
      { nodeId: fromId, path: { nodes: [fromNode], edges: [] } },
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      const nodeId = current.nodeId;
      const path = current.path;

      const outEdges = this.edgeIndex.get(`out:${nodeId}:${edgeType}`) || [];
      const inEdges = this.edgeIndex.get(`in:${nodeId}:${edgeType}`) || [];
      const allEdges = outEdges.concat(inEdges);

      for (let i = 0; i < allEdges.length; i++) {
        const edge = allEdges[i];
        const nextId = edge.from === nodeId ? edge.to : edge.from;
        if (visited.has(nextId)) continue;

        visited.add(nextId);

        const nextNode = this._findNodeById(nextId);
        if (!nextNode) continue;

        const newPath = {
          nodes: path.nodes.concat([nextNode]),
          edges: path.edges.concat([edge]),
        };

        if (nextId === toId) return newPath;
        queue.push({ nodeId: nextId, path: newPath });
      }
    }

    return null;
  }

  // --- Ledger ---

  async nodeCount(label) {
    if (!label) return this.nodes.size;
    let count = 0;
    const all = this._allNodes();
    for (let i = 0; i < all.length; i++) {
      if (all[i].label === label) count++;
    }
    return count;
  }

  async edgeCount(type) {
    if (!type) return this.edges.length;
    return this.edges.filter(function(e) { return e.type === type; }).length;
  }

  async findNodesOrdered(label, orderByProperty, direction, limit) {
    const nodes = [];
    const all = this._allNodes();
    for (let i = 0; i < all.length; i++) {
      if (all[i].label === label) nodes.push(all[i]);
    }
    nodes.sort(function(a, b) {
      const aVal = a.properties[orderByProperty];
      const bVal = b.properties[orderByProperty];
      if (aVal < bVal) return direction === 'ASC' ? -1 : 1;
      if (aVal > bVal) return direction === 'ASC' ? 1 : -1;
      return 0;
    });
    return nodes.slice(0, limit);
  }

  async getMaxProperty(label, property) {
    let maxVal = null;
    const all = this._allNodes();
    for (let i = 0; i < all.length; i++) {
      if (all[i].label !== label) continue;
      const val = all[i].properties[property];
      if (val !== undefined && (maxVal === null || val > maxVal)) {
        maxVal = val;
      }
    }
    return maxVal;
  }

  async clearNodesByLabel(label) {
    const toDelete = [];
    const all = this._allNodes();
    for (let i = 0; i < all.length; i++) {
      if (all[i].label === label) toDelete.push(all[i].id);
    }
    for (let i = 0; i < toDelete.length; i++) {
      this.nodes.delete(this._nodeKey(label, toDelete[i]));
    }
    // Remove edges connected to deleted nodes
    const deletedIds = new Set(toDelete);
    const remaining = [];
    for (let i = 0; i < this.edges.length; i++) {
      if (!deletedIds.has(this.edges[i].from) && !deletedIds.has(this.edges[i].to)) {
        remaining.push(this.edges[i]);
      }
    }
    this.edges = remaining;
    // Rebuild edge index
    this.edgeIndex.clear();
    for (let i = 0; i < this.edges.length; i++) {
      this._indexEdge(this.edges[i]);
    }
  }

  async clearAll() {
    this.nodes.clear();
    this.edges = [];
    this.edgeIndex.clear();
  }
}

module.exports = MemoryBackend;
