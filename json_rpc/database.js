const {
  ReadDbOperations,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const { JsonRpcApiResultCode } = require('../common/result-code');
const CommonUtil = require('../common/common-util');
const JsonRpcUtil = require('./json-rpc-util');

module.exports = function getDatabaseApis(node) {
  return {
    ain_get: function(args, done) {
      const beginTime = Date.now();
      let result;
      let latency;
      switch (args.type) {
        case ReadDbOperations.GET_VALUE:
          result = node.db.getValue(args.ref, CommonUtil.toGetOptions(args));
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, JsonRpcUtil.addProtocolVersion({ result }));
          return;
        case ReadDbOperations.GET_RULE:
          result = node.db.getRule(args.ref, CommonUtil.toGetOptions(args));
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, JsonRpcUtil.addProtocolVersion({ result }));
          return;
        case ReadDbOperations.GET_FUNCTION:
          result = node.db.getFunction(args.ref, CommonUtil.toGetOptions(args));
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, JsonRpcUtil.addProtocolVersion({ result }));
          return;
        case ReadDbOperations.GET_OWNER:
          result = node.db.getOwner(args.ref, CommonUtil.toGetOptions(args));
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, JsonRpcUtil.addProtocolVersion({ result }));
          return;
        case ReadDbOperations.GET:
          result = node.db.get(args.op_list);
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, JsonRpcUtil.addProtocolVersion({ result }));
          return;
        default:
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, JsonRpcUtil.addProtocolVersion({
            code: JsonRpcApiResultCode.GET_INVALID_OPERATION,
            message: 'Invalid get operation'
          }));
      }
    },

    ain_matchFunction: function(args, done) {
      const beginTime = Date.now();
      const result =
          node.db.matchFunction(args.ref, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_matchRule: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.matchRule(args.ref, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_matchOwner: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.matchOwner(args.ref, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_evalRule: function(args, done) {
      const beginTime = Date.now();
      const auth = {};
      if (args.address) {
        auth.addr = args.address;
      }
      if (args.fid) {
        auth.fid = args.fid;
      }
      const timestamp = args.timestamp || Date.now();
      const result = node.db.evalRule(
          args.ref, args.value, auth, timestamp, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_evalOwner: function(args, done) {
      const beginTime = Date.now();
      const auth = {};
      if (args.address) {
        auth.addr = args.address;
      }
      if (args.fid) {
        auth.fid = args.fid;
      }
      const result = node.db.evalOwner(
          args.ref, args.permission, auth, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getStateProof: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.getStateProof(args.ref);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getProofHash: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.getProofHash(args.ref);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getStateInfo: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.getStateInfo(args.ref);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getStateUsage: function(args, done) {
      const beginTime = Date.now();
      const result = node.getStateUsage(args.app_name);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
