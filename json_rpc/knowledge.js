const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

module.exports = function getKnowledgeApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_KNOWLEDGE_GET_TOPIC_STATS]: function(args, done) {
      const beginTime = Date.now();
      const kgi = node.knowledgeGraphIndex;
      if (!kgi || !kgi.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30701, message: 'Knowledge graph index not enabled'
        }));
        return;
      }
      kgi.getTopicStats(args.topic_path).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30702, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_KNOWLEDGE_GET_FRONTIER_MAP]: function(args, done) {
      const beginTime = Date.now();
      const kgi = node.knowledgeGraphIndex;
      if (!kgi || !kgi.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30701, message: 'Knowledge graph index not enabled'
        }));
        return;
      }
      kgi.getFrontierMap(args.topic_path).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30702, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_KNOWLEDGE_GET_LINEAGE]: function(args, done) {
      const beginTime = Date.now();
      const kgi = node.knowledgeGraphIndex;
      if (!kgi || !kgi.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30701, message: 'Knowledge graph index not enabled'
        }));
        return;
      }
      kgi.getLineage(args.exploration_id).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30702, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_KNOWLEDGE_GET_DESCENDANTS]: function(args, done) {
      const beginTime = Date.now();
      const kgi = node.knowledgeGraphIndex;
      if (!kgi || !kgi.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30701, message: 'Knowledge graph index not enabled'
        }));
        return;
      }
      kgi.getDescendants(args.exploration_id).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30702, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_KNOWLEDGE_GET_SHORTEST_PATH]: function(args, done) {
      const beginTime = Date.now();
      const kgi = node.knowledgeGraphIndex;
      if (!kgi || !kgi.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30701, message: 'Knowledge graph index not enabled'
        }));
        return;
      }
      kgi.getShortestPath(args.from_id, args.to_id).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30702, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_KNOWLEDGE_GET_EXPLORERS]: function(args, done) {
      const beginTime = Date.now();
      const kgi = node.knowledgeGraphIndex;
      if (!kgi || !kgi.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30701, message: 'Knowledge graph index not enabled'
        }));
        return;
      }
      kgi.getExplorers(args.topic_path).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30702, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_KNOWLEDGE_LIST_TOPICS]: function(args, done) {
      const beginTime = Date.now();
      const kgi = node.knowledgeGraphIndex;
      if (!kgi || !kgi.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30701, message: 'Knowledge graph index not enabled'
        }));
        return;
      }
      kgi.listTopics().then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30702, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_KNOWLEDGE_LIST_SUBTOPICS]: function(args, done) {
      const beginTime = Date.now();
      const kgi = node.knowledgeGraphIndex;
      if (!kgi || !kgi.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30701, message: 'Knowledge graph index not enabled'
        }));
        return;
      }
      kgi.listSubtopics(args.topic_path).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30702, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_KNOWLEDGE_GET_GRAPH_STATS]: function(args, done) {
      const beginTime = Date.now();
      const kgi = node.knowledgeGraphIndex;
      if (!kgi || !kgi.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30701, message: 'Knowledge graph index not enabled'
        }));
        return;
      }
      kgi.getGraphStats().then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30702, message: err.message
        }));
      });
    },
  };
};
