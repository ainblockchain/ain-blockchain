const chai = require('chai');
const assert = chai.assert;
const KnowledgeGraphIndex = require('../../db/knowledge-graph-index');

describe('KnowledgeGraphIndex', () => {
  let kgi;

  before(async () => {
    kgi = new KnowledgeGraphIndex('memory', {});
    await kgi.initialize();
  });

  after(async () => {
    await kgi.close();
  });

  describe('Lifecycle', () => {
    it('should be enabled after initialization', () => {
      assert.isTrue(kgi.isEnabled());
    });
  });

  describe('syncTopic', () => {
    it('should sync a root topic', async () => {
      await kgi.syncTopic('ai', {
        title: 'Artificial Intelligence',
        description: 'AI research',
        created_at: 1000,
        created_by: '0xAddr1',
      });

      const topics = await kgi.listTopics();
      assert.deepEqual(topics, ['ai']);
    });

    it('should sync nested topics with parent edges', async () => {
      await kgi.syncTopic('ai/transformers', {
        title: 'Transformers',
        description: 'Transformer architecture',
        created_at: 1001,
        created_by: '0xAddr1',
      });

      await kgi.syncTopic('ai/rl', {
        title: 'Reinforcement Learning',
        description: 'RL research',
        created_at: 1002,
        created_by: '0xAddr1',
      });

      const subtopics = await kgi.listSubtopics('ai');
      assert.include(subtopics, 'ai/transformers');
      assert.include(subtopics, 'ai/rl');
    });

    it('should sync deeply nested topics', async () => {
      await kgi.syncTopic('ai/transformers/attention', {
        title: 'Attention Mechanisms',
        description: 'Self-attention and variants',
        created_at: 1003,
        created_by: '0xAddr1',
      });

      const subtopics = await kgi.listSubtopics('ai/transformers');
      assert.deepEqual(subtopics, ['ai/transformers/attention']);
    });
  });

  describe('syncExploration', () => {
    it('should sync a basic exploration', async () => {
      await kgi.syncExploration('0xAddr1', 'ai/transformers', 'exp001', {
        title: 'Attention Is All You Need',
        content: 'The transformer paper',
        summary: 'Introduced the transformer',
        depth: 3,
        tags: 'seminal,architecture',
        created_at: 2000,
        updated_at: 2000,
      });

      const explorers = await kgi.getExplorers('ai/transformers');
      assert.include(explorers, '0xAddr1');
    });

    it('should sync an exploration with builds-on tags', async () => {
      await kgi.syncExploration('0xAddr2', 'ai/transformers', 'exp002', {
        title: 'BERT: Pre-training',
        content: 'BERT paper',
        summary: 'Bidirectional transformers',
        depth: 4,
        tags: 'builds-on:exp001,nlp',
        created_at: 2001,
        updated_at: 2001,
      });

      // Should have a BUILDS_ON edge from exp002 to exp001
      const lineage = await kgi.getLineage('exp002');
      assert.isArray(lineage);
      assert.isTrue(lineage.length >= 1);
      // The lineage should include exp002 (start) and exp001
      const ids = lineage.map(function(e) { return e.title; });
      assert.include(ids, 'Attention Is All You Need');
    });

    it('should track multiple explorers', async () => {
      await kgi.syncExploration('0xAddr2', 'ai/transformers', 'exp003', {
        title: 'GPT',
        content: 'GPT paper',
        summary: 'Generative Pre-Training',
        depth: 4,
        tags: 'builds-on:exp001,generative',
        created_at: 2002,
        updated_at: 2002,
      });

      const explorers = await kgi.getExplorers('ai/transformers');
      assert.include(explorers, '0xAddr1');
      assert.include(explorers, '0xAddr2');
    });
  });

  describe('getTopicStats', () => {
    it('should return stats for a topic with explorations', async () => {
      const stats = await kgi.getTopicStats('ai/transformers');
      assert.isObject(stats);
      assert.strictEqual(stats.explorer_count, 2); // 0xAddr1 and 0xAddr2
      assert.isAtLeast(stats.max_depth, 3);
      assert.isAbove(stats.avg_depth, 0);
    });

    it('should return zero stats for a topic without explorations', async () => {
      const stats = await kgi.getTopicStats('ai/rl');
      assert.isObject(stats);
      assert.strictEqual(stats.explorer_count, 0);
      assert.strictEqual(stats.max_depth, 0);
      assert.strictEqual(stats.avg_depth, 0);
    });
  });

  describe('getFrontierMap', () => {
    it('should return frontier map for subtopics', async () => {
      const map = await kgi.getFrontierMap('ai');
      assert.isArray(map);
      assert.isTrue(map.length >= 2); // transformers, rl
      const transformersEntry = map.find(function(e) { return e.topic === 'ai/transformers'; });
      assert.isObject(transformersEntry);
      assert.strictEqual(transformersEntry.stats.explorer_count, 2);
    });

    it('should return frontier map for root topics when no path given', async () => {
      const map = await kgi.getFrontierMap();
      assert.isArray(map);
      assert.isTrue(map.length >= 1);
      const aiEntry = map.find(function(e) { return e.topic === 'ai'; });
      assert.isObject(aiEntry);
    });
  });

  describe('getLineage', () => {
    it('should return lineage for an exploration with builds-on', async () => {
      const lineage = await kgi.getLineage('exp002');
      assert.isArray(lineage);
      // exp002 builds on exp001, so lineage should include at least both
      const titles = lineage.map(function(e) { return e.title; });
      assert.include(titles, 'Attention Is All You Need');
    });

    it('should return empty for an exploration without builds-on', async () => {
      const lineage = await kgi.getLineage('exp001');
      assert.isArray(lineage);
      assert.strictEqual(lineage.length, 0);
    });
  });

  describe('getDescendants', () => {
    it('should return descendants of a root exploration', async () => {
      const descendants = await kgi.getDescendants('exp001');
      assert.isArray(descendants);
      assert.isTrue(descendants.length >= 2); // exp002 and exp003 build on exp001
      const titles = descendants.map(function(e) { return e.title; });
      assert.include(titles, 'BERT: Pre-training');
      assert.include(titles, 'GPT');
    });

    it('should return empty for a leaf exploration', async () => {
      const descendants = await kgi.getDescendants('exp002');
      assert.isArray(descendants);
      assert.strictEqual(descendants.length, 0);
    });
  });

  describe('getShortestPath', () => {
    it('should find a path between connected explorations', async () => {
      const path = await kgi.getShortestPath('exp002', 'exp003');
      assert.isArray(path);
      assert.isTrue(path.length >= 2);
    });

    it('should return empty for unconnected explorations', async () => {
      // Add an isolated exploration
      await kgi.syncExploration('0xAddr3', 'ai/rl', 'exp_isolated', {
        title: 'RL Intro',
        content: 'RL content',
        summary: 'RL summary',
        depth: 1,
        tags: 'intro',
        created_at: 3000,
        updated_at: 3000,
      });

      const path = await kgi.getShortestPath('exp001', 'exp_isolated');
      assert.isArray(path);
      assert.strictEqual(path.length, 0);
    });
  });

  describe('getExplorers', () => {
    it('should return all explorer addresses for a topic', async () => {
      const explorers = await kgi.getExplorers('ai/transformers');
      assert.isArray(explorers);
      assert.include(explorers, '0xAddr1');
      assert.include(explorers, '0xAddr2');
    });

    it('should return empty for a topic with no explorers', async () => {
      await kgi.syncTopic('physics', {
        title: 'Physics',
        description: 'Physics research',
        created_at: 4000,
        created_by: '0xAddr1',
      });
      const explorers = await kgi.getExplorers('physics');
      assert.isArray(explorers);
      assert.strictEqual(explorers.length, 0);
    });
  });

  describe('listTopics and listSubtopics', () => {
    it('should list root topics', async () => {
      const topics = await kgi.listTopics();
      assert.isArray(topics);
      assert.include(topics, 'ai');
      assert.include(topics, 'physics');
    });

    it('should list subtopics', async () => {
      const subtopics = await kgi.listSubtopics('ai');
      assert.isArray(subtopics);
      assert.include(subtopics, 'ai/transformers');
      assert.include(subtopics, 'ai/rl');
    });

    it('should return empty for topic with no subtopics', async () => {
      const subtopics = await kgi.listSubtopics('physics');
      assert.isArray(subtopics);
      assert.strictEqual(subtopics.length, 0);
    });
  });

  describe('getGraphStats', () => {
    it('should return node and edge counts', async () => {
      const stats = await kgi.getGraphStats();
      assert.isObject(stats);
      assert.isAbove(stats.node_count, 0);
      assert.isAbove(stats.edge_count, 0);
    });
  });

  describe('rebuildFromState', () => {
    it('should rebuild graph from mock DB state', async () => {
      // Create a fresh KGI
      const freshKgi = new KnowledgeGraphIndex('memory', {});
      await freshKgi.initialize();

      // Mock DB with getValue method
      const mockDb = {
        getValue: function(path) {
          if (path === '/apps/knowledge/topics') {
            return {
              math: {
                '.info': {
                  title: 'Mathematics',
                  description: 'Math research',
                  created_at: 5000,
                  created_by: '0xAddr1',
                },
                algebra: {
                  '.info': {
                    title: 'Algebra',
                    description: 'Algebra research',
                    created_at: 5001,
                    created_by: '0xAddr1',
                  },
                },
              },
            };
          }
          if (path === '/apps/knowledge/explorations') {
            return {
              '0xAddr1': {
                'math|algebra': {
                  'entry001': {
                    title: 'Galois Theory',
                    content: 'Galois content',
                    summary: 'Galois summary',
                    depth: 2,
                    tags: 'algebra,theory',
                    created_at: 5100,
                    updated_at: 5100,
                  },
                },
              },
            };
          }
          return null;
        },
      };

      await freshKgi.rebuildFromState(mockDb);

      const topics = await freshKgi.listTopics();
      assert.include(topics, 'math');

      const subtopics = await freshKgi.listSubtopics('math');
      assert.include(subtopics, 'math/algebra');

      const stats = await freshKgi.getTopicStats('math/algebra');
      assert.strictEqual(stats.explorer_count, 1);

      await freshKgi.close();
    });
  });

  describe('disabled state', () => {
    it('should return null when not enabled', async () => {
      const disabledKgi = new KnowledgeGraphIndex('memory', {});
      // Don't call initialize

      assert.isFalse(disabledKgi.isEnabled());
      assert.isNull(await disabledKgi.getTopicStats('ai'));
      assert.isNull(await disabledKgi.listTopics());
      assert.isNull(await disabledKgi.getGraphStats());
    });
  });
});
