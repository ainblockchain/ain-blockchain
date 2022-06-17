const _ = require('lodash');
const {
  ReadDbOperations,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const { JsonRpcApiResultCode } = require('../common/result-code');
const CommonUtil = require('../common/common-util');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

function handleGetRequest(args, node) {
  switch (args.type) {
    case ReadDbOperations.GET_VALUE:
      return node.db.getValueWithError(args.ref, CommonUtil.toGetOptions(args, true));
    case ReadDbOperations.GET_RULE:
      return node.db.getRuleWithError(args.ref, CommonUtil.toGetOptions(args, true));
    case ReadDbOperations.GET_FUNCTION:
      return node.db.getFunctionWithError(args.ref, CommonUtil.toGetOptions(args, true));
    case ReadDbOperations.GET_OWNER:
      return node.db.getOwnerWithError(args.ref, CommonUtil.toGetOptions(args, true));
    case ReadDbOperations.GET:
      return node.db.getWithError(args.op_list);
    default:
      return {
        result: null,
        code: JsonRpcApiResultCode.GET_INVALID_OPERATION,
        message: 'Invalid get operation'
      };
  }
}

module.exports = function getDatabaseApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_GET]: function(args, done) {
      const beginTime = Date.now();
      const retVal = handleGetRequest(args, node);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion(retVal));
    },

    [JSON_RPC_METHODS.AIN_MATCH_FUNCTION]: function(args, done) {
      const beginTime = Date.now();
      const result =
          node.db.matchFunction(args.ref, CommonUtil.toMatchOrEvalOptions(args, true));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_MATCH_RULE]: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.matchRule(args.ref, CommonUtil.toMatchOrEvalOptions(args, true));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_MATCH_OWNER]: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.matchOwner(args.ref, CommonUtil.toMatchOrEvalOptions(args, true));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_EVAL_RULE]: function(args, done) {
      const beginTime = Date.now();
      const auth = {};
      if (args.address) {
        auth.addr = args.address;
      }
      if (args.fid) {
        auth.fid = args.fid;
      }
      const timestamp = args.timestamp || Date.now();
      const options = Object.assign(CommonUtil.toMatchOrEvalOptions(args, true), { timestamp });
      const result = node.db.evalRule(args.ref, args.value, auth, options);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_EVAL_OWNER]: function(args, done) {
      const beginTime = Date.now();
      const auth = {};
      if (args.address) {
        auth.addr = args.address;
      }
      if (args.fid) {
        auth.fid = args.fid;
      }
      const result = node.db.evalOwner(
          args.ref, args.permission, auth, CommonUtil.toMatchOrEvalOptions(args, true));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_STATE_PROOF]: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.getStateProof(args.ref);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_PROOF_HASH]: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.getProofHash(args.ref);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_STATE_INFO]: function(args, done) {
      const beginTime = Date.now();
      const result = node.db.getStateInfo(args.ref);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_STATE_USAGE]: function(args, done) {
      const beginTime = Date.now();
      const result = node.getStateUsageWithStakingInfo(args.app_name);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
