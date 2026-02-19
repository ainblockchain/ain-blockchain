const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

module.exports = function getLlmApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_LLM_INFER]: function(args, done) {
      const beginTime = Date.now();
      const llm = node.llmEngine;
      if (!llm || !llm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'LLM engine not enabled'
        }));
        return;
      }
      llm.infer({
        messages: args.messages,
        maxTokens: args.max_tokens,
        temperature: args.temperature,
      }).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_LLM_EXPLORE]: function(args, done) {
      const beginTime = Date.now();
      const llm = node.llmEngine;
      if (!llm || !llm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'LLM engine not enabled'
        }));
        return;
      }
      llm.explore({
        topicPath: args.topic_path,
        context: args.context,
        frontier: args.frontier,
      }).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_LLM_GENERATE_COURSE]: function(args, done) {
      const beginTime = Date.now();
      const llm = node.llmEngine;
      if (!llm || !llm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'LLM engine not enabled'
        }));
        return;
      }
      llm.generateCourse({
        topicPath: args.topic_path,
        explorations: args.explorations,
      }).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_LLM_ANALYZE]: function(args, done) {
      const beginTime = Date.now();
      const llm = node.llmEngine;
      if (!llm || !llm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'LLM engine not enabled'
        }));
        return;
      }
      llm.analyze({
        question: args.question,
        contextNodes: args.context_nodes,
      }).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      });
    },
  };
};
