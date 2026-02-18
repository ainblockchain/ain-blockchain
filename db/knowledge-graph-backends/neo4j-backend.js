/**
 * Neo4j implementation of GraphBackend.
 *
 * Translates graph-backend interface calls into Cypher queries over bolt://.
 * Requires `neo4j-driver` package and a running Neo4j instance.
 * Port of ain-js/src/knowledge/neo4j-backend.ts to CommonJS.
 *
 * The neo4j-driver is lazy-loaded so the module can be required without
 * the driver being installed (it is an optional dependency).
 */

let neo4j = null;

function getNeo4j() {
  if (!neo4j) {
    try {
      neo4j = require('neo4j-driver');
    } catch (e) {
      throw new Error(
        'neo4j-driver is not installed. Install it with: npm install neo4j-driver'
      );
    }
  }
  return neo4j;
}

class Neo4jBackend {
  constructor(config) {
    const driver = getNeo4j();
    this.driver = driver.driver(
      config.uri,
      driver.auth.basic(config.username, config.password)
    );
  }

  _session() {
    return this.driver.session();
  }

  /** Convert a Neo4j record node to a GraphNode. */
  _toGraphNode(record) {
    const neo4jMod = getNeo4j();
    const props = record.properties ? Object.assign({}, record.properties) : {};
    const keys = Object.keys(props);
    for (let i = 0; i < keys.length; i++) {
      if (neo4jMod.isInt(props[keys[i]])) {
        props[keys[i]] = props[keys[i]].toNumber();
      }
    }
    const label = record.labels ? record.labels[0] : '';
    const id = props.id || '';
    delete props.id;
    return { label, id, properties: props };
  }

  // --- Lifecycle ---

  async initialize() {
    const session = this._session();
    try {
      await session.run('CREATE INDEX topic_path_idx IF NOT EXISTS FOR (t:Topic) ON (t.path)');
      await session.run('CREATE INDEX topic_id_idx IF NOT EXISTS FOR (t:Topic) ON (t.id)');
      await session.run('CREATE INDEX exploration_id_idx IF NOT EXISTS FOR (e:Exploration) ON (e.id)');
      await session.run('CREATE INDEX user_address_idx IF NOT EXISTS FOR (u:User) ON (u.address)');
      await session.run('CREATE INDEX user_id_idx IF NOT EXISTS FOR (u:User) ON (u.id)');
      await session.run('CREATE INDEX txlog_timestamp_idx IF NOT EXISTS FOR (tx:TxLog) ON (tx.timestamp)');
      await session.run('CREATE INDEX txlog_id_idx IF NOT EXISTS FOR (tx:TxLog) ON (tx.id)');
      await session.run('CREATE INDEX snapshot_created_idx IF NOT EXISTS FOR (s:Snapshot) ON (s.created_at)');
      await session.run('CREATE INDEX snapshot_id_idx IF NOT EXISTS FOR (s:Snapshot) ON (s.id)');
    } finally {
      await session.close();
    }
  }

  async close() {
    await this.driver.close();
  }

  // --- Write ---

  async createNode(node) {
    const session = this._session();
    try {
      const props = Object.assign({}, node.properties, { id: node.id });
      await session.run(
        `CREATE (n:${node.label} $props)`,
        { props }
      );
    } finally {
      await session.close();
    }
  }

  async mergeNode(label, id, properties) {
    const session = this._session();
    try {
      await session.run(
        `MERGE (n:${label} {id: $id}) ON CREATE SET n += $props ON MATCH SET n += $props`,
        { id, props: properties }
      );
    } finally {
      await session.close();
    }
  }

  async createEdge(edge) {
    const session = this._session();
    try {
      const propsClause = edge.properties ? ' SET r += $props' : '';
      await session.run(
        `MATCH (a {id: $from}), (b {id: $to}) CREATE (a)-[r:${edge.type}]->(b)${propsClause}`,
        { from: edge.from, to: edge.to, props: edge.properties || {} }
      );
    } finally {
      await session.close();
    }
  }

  async mergeEdge(edge) {
    const session = this._session();
    try {
      await session.run(
        `MATCH (a {id: $from}), (b {id: $to}) MERGE (a)-[r:${edge.type}]->(b) ON CREATE SET r += $props ON MATCH SET r += $props`,
        { from: edge.from, to: edge.to, props: edge.properties || {} }
      );
    } finally {
      await session.close();
    }
  }

  async incrementEdgeProperty(type, from, to, property, delta) {
    const session = this._session();
    try {
      await session.run(
        `MATCH (a {id: $from}), (b {id: $to})
         MERGE (a)-[r:${type}]->(b)
         ON CREATE SET r.${property} = $delta
         ON MATCH SET r.${property} = coalesce(r.${property}, 0) + $delta`,
        { from, to, delta }
      );
    } finally {
      await session.close();
    }
  }

  // --- Read ---

  async getNode(label, id) {
    const session = this._session();
    try {
      const result = await session.run(
        `MATCH (n:${label} {id: $id}) RETURN n`,
        { id }
      );
      if (result.records.length === 0) return null;
      return this._toGraphNode(result.records[0].get('n'));
    } finally {
      await session.close();
    }
  }

  async findNodes(label, filter) {
    const session = this._session();
    try {
      let query;
      const params = {};

      if (filter && Object.keys(filter).length > 0) {
        const filterKeys = Object.keys(filter);
        const conditions = filterKeys
          .map(function(k, i) { return `n.${k} = $filter_${i}`; })
          .join(' AND ');
        for (let i = 0; i < filterKeys.length; i++) {
          params[`filter_${i}`] = Object.values(filter)[i];
        }
        query = `MATCH (n:${label}) WHERE ${conditions} RETURN n`;
      } else {
        query = `MATCH (n:${label}) RETURN n`;
      }

      const result = await session.run(query, params);
      const self = this;
      return result.records.map(function(r) { return self._toGraphNode(r.get('n')); });
    } finally {
      await session.close();
    }
  }

  async getChildren(parentLabel, parentId, edgeType, childLabel) {
    const session = this._session();
    try {
      const result = await session.run(
        `MATCH (:${parentLabel} {id: $id})-[:${edgeType}]->(c:${childLabel}) RETURN c`,
        { id: parentId }
      );
      const self = this;
      return result.records.map(function(r) { return self._toGraphNode(r.get('c')); });
    } finally {
      await session.close();
    }
  }

  async getRoots(label, incomingEdgeType) {
    const session = this._session();
    try {
      const result = await session.run(
        `MATCH (t:${label}) WHERE NOT ()-[:${incomingEdgeType}]->(t) RETURN t`
      );
      const self = this;
      return result.records.map(function(r) { return self._toGraphNode(r.get('t')); });
    } finally {
      await session.close();
    }
  }

  async getEdges(nodeId, edgeType, direction) {
    const session = this._session();
    try {
      const neo4jMod = getNeo4j();
      let query;
      if (direction === 'out') {
        query = `MATCH (a {id: $id})-[r:${edgeType}]->(b) RETURN a.id AS fromId, b.id AS toId, r`;
      } else {
        query = `MATCH (a)-[r:${edgeType}]->(b {id: $id}) RETURN a.id AS fromId, b.id AS toId, r`;
      }

      const result = await session.run(query, { id: nodeId });
      return result.records.map(function(r) {
        const props = r.get('r').properties ? Object.assign({}, r.get('r').properties) : {};
        const propKeys = Object.keys(props);
        for (let i = 0; i < propKeys.length; i++) {
          if (neo4jMod.isInt(props[propKeys[i]])) props[propKeys[i]] = props[propKeys[i]].toNumber();
        }
        return {
          type: edgeType,
          from: r.get('fromId'),
          to: r.get('toId'),
          properties: Object.keys(props).length > 0 ? props : undefined,
        };
      });
    } finally {
      await session.close();
    }
  }

  // --- Aggregation ---

  async aggregateOverEdge(targetLabel, targetId, edgeType, sourceLabel, metrics) {
    const session = this._session();
    try {
      const neo4jMod = getNeo4j();
      const query = `
        OPTIONAL MATCH (u:${sourceLabel})-[r:${edgeType}]->(t:${targetLabel} {id: $id})
        OPTIONAL MATCH (e:Exploration)-[:IN_TOPIC]->(t)
        RETURN count(DISTINCT u) AS explorer_count,
               CASE WHEN count(e) > 0 THEN max(e.depth) ELSE 0 END AS max_depth,
               CASE WHEN count(e) > 0 THEN avg(e.depth) ELSE 0.0 END AS avg_depth
      `;

      const result = await session.run(query, { id: targetId });
      const record = result.records[0];
      const output = {};

      for (let i = 0; i < metrics.length; i++) {
        const m = metrics[i];
        if (m.fn === 'count') {
          const val = record.get('explorer_count');
          output[m.property] = neo4jMod.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
        } else if (m.fn === 'max') {
          const val = record.get('max_depth');
          output[m.property] = neo4jMod.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
        } else if (m.fn === 'avg') {
          const val = record.get('avg_depth');
          const num = neo4jMod.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
          output[m.property] = Math.round(num * 100) / 100;
        } else if (m.fn === 'sum') {
          const val = record.get('max_depth');
          output[m.property] = neo4jMod.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
        }
      }
      return output;
    } finally {
      await session.close();
    }
  }

  async aggregateGrouped(parentLabel, parentId, parentToChildEdge, childLabel, childToLeafEdge, leafLabel, metrics) {
    const session = this._session();
    try {
      const neo4jMod = getNeo4j();
      const query = `
        MATCH (:${parentLabel} {id: $id})-[:${parentToChildEdge}]->(child:${childLabel})
        OPTIONAL MATCH (u:User)-[:EXPLORED]->(child)
        OPTIONAL MATCH (e:Exploration)-[:IN_TOPIC]->(child)
        RETURN child.id AS group,
               count(DISTINCT u) AS explorer_count,
               CASE WHEN count(e) > 0 THEN max(e.depth) ELSE 0 END AS max_depth,
               CASE WHEN count(e) > 0 THEN avg(e.depth) ELSE 0.0 END AS avg_depth
      `;

      const result = await session.run(query, { id: parentId });
      return result.records.map(function(record) {
        const values = {};
        for (let i = 0; i < metrics.length; i++) {
          const m = metrics[i];
          if (m.fn === 'count_distinct') {
            const val = record.get('explorer_count');
            values[m.property] = neo4jMod.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
          } else if (m.fn === 'max') {
            const val = record.get('max_depth');
            values[m.property] = neo4jMod.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
          } else if (m.fn === 'avg') {
            const val = record.get('avg_depth');
            const num = neo4jMod.isInt(val) ? val.toNumber() : (typeof val === 'number' ? val : 0);
            values[m.property] = Math.round(num * 100) / 100;
          }
        }
        return { group: record.get('group'), values };
      });
    } finally {
      await session.close();
    }
  }

  // --- Graph traversal ---

  async traverse(startId, edgeType, direction, maxDepth) {
    const session = this._session();
    try {
      const depthClause = maxDepth !== undefined ? `*1..${maxDepth}` : '*';
      let query;

      if (direction === 'out') {
        query = `MATCH path = (start {id: $id})-[:${edgeType}${depthClause}]->(end)
                 RETURN path`;
      } else {
        query = `MATCH path = (end)-[:${edgeType}${depthClause}]->(start {id: $id})
                 RETURN path`;
      }

      const self = this;
      const result = await session.run(query, { id: startId });
      return result.records.map(function(record) {
        const path = record.get('path');
        const nodes = path.segments.map(function(seg) { return self._toGraphNode(seg.end); });
        // Add start node at beginning
        nodes.unshift(self._toGraphNode(path.start));

        const neo4jMod = getNeo4j();
        const edges = path.segments.map(function(seg) {
          const rel = seg.relationship;
          const props = {};
          const relPropKeys = Object.keys(rel.properties || {});
          for (let i = 0; i < relPropKeys.length; i++) {
            const key = relPropKeys[i];
            props[key] = neo4jMod.isInt(rel.properties[key])
              ? rel.properties[key].toNumber()
              : rel.properties[key];
          }
          return {
            type: rel.type,
            from: self._toGraphNode(seg.start).id,
            to: self._toGraphNode(seg.end).id,
            properties: Object.keys(props).length > 0 ? props : undefined,
          };
        });

        return { nodes, edges };
      });
    } finally {
      await session.close();
    }
  }

  async shortestPath(fromId, toId, edgeType) {
    const session = this._session();
    try {
      const result = await session.run(
        `MATCH path = shortestPath(
           (a {id: $from})-[:${edgeType}*]-(b {id: $to})
         ) RETURN path`,
        { from: fromId, to: toId }
      );

      if (result.records.length === 0) return null;

      const self = this;
      const neo4jMod = getNeo4j();
      const path = result.records[0].get('path');
      const nodes = path.segments.map(function(seg) { return self._toGraphNode(seg.end); });
      nodes.unshift(self._toGraphNode(path.start));

      const edges = path.segments.map(function(seg) {
        const rel = seg.relationship;
        const props = {};
        const relPropKeys = Object.keys(rel.properties || {});
        for (let i = 0; i < relPropKeys.length; i++) {
          const key = relPropKeys[i];
          props[key] = neo4jMod.isInt(rel.properties[key])
            ? rel.properties[key].toNumber()
            : rel.properties[key];
        }
        return {
          type: rel.type,
          from: self._toGraphNode(seg.start).id,
          to: self._toGraphNode(seg.end).id,
          properties: Object.keys(props).length > 0 ? props : undefined,
        };
      });

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  // --- Ledger ---

  async nodeCount(label) {
    const session = this._session();
    try {
      const neo4jMod = getNeo4j();
      const query = label
        ? `MATCH (n:${label}) RETURN count(n) AS cnt`
        : 'MATCH (n) RETURN count(n) AS cnt';
      const result = await session.run(query);
      const val = result.records[0].get('cnt');
      return neo4jMod.isInt(val) ? val.toNumber() : val;
    } finally {
      await session.close();
    }
  }

  async edgeCount(type) {
    const session = this._session();
    try {
      const neo4jMod = getNeo4j();
      const query = type
        ? `MATCH ()-[r:${type}]->() RETURN count(r) AS cnt`
        : 'MATCH ()-[r]->() RETURN count(r) AS cnt';
      const result = await session.run(query);
      const val = result.records[0].get('cnt');
      return neo4jMod.isInt(val) ? val.toNumber() : val;
    } finally {
      await session.close();
    }
  }

  /** Utility: clear all data in the database (for benchmarks). */
  async clearAll() {
    const session = this._session();
    try {
      await session.run('MATCH (n) DETACH DELETE n');
    } finally {
      await session.close();
    }
  }
}

module.exports = Neo4jBackend;
