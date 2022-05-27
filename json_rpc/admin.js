const _ = require('lodash');
const {
  NodeConfigs,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const { JsonRpcApiResultCode } = require('../common/result-code');
const CommonUtil = require('../common/common-util');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

function checkCompatibility(valueA, valueB) {
  if (CommonUtil.isBool(valueA)) {
    return CommonUtil.isBool(valueB);
  } else if (CommonUtil.isIntegerString(valueA) || CommonUtil.isFloatString(valueA)) {
    return CommonUtil.isIntegerString(valueB) || CommonUtil.isFloatString(valueB);
  } else if (CommonUtil.isArray(valueA) || CommonUtil.isWildcard(valueA)) {
    return CommonUtil.isArray(valueB) || CommonUtil.isWildcard(valueB);
  } else {
    // TODO(kriii): Decide how to work on the object (e.g. TRAFFIC_STATS_PERIOD_SECS_LIST).
    return false;
  }
}

module.exports = function getAdminApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_GET_NODE_PARAM]: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      if (_.get(args.message, 'method') !== JSON_RPC_METHODS.AIN_GET_NODE_PARAM || !verified) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done({ code: 403, message: 'Forbidden' });
        return;
      }

      const param = args.message.param;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
      if (NodeConfigs[param] === undefined) {
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.PARAM_INVALID,
            message: `Param [${param}] is not exist.`
          }
        }));
      } else {
        done(null, JsonRpcUtil.addProtocolVersion({ result: NodeConfigs[param] }));
      }
    },

    [JSON_RPC_METHODS.AIN_SET_NODE_PARAM]: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      if (_.get(args.message, 'method') !== JSON_RPC_METHODS.AIN_SET_NODE_PARAM || !verified) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done({ code: 403, message: 'Forbidden' });
        return;
      }

      const param = args.message.param;
      if (NodeConfigs[param] === undefined) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.PARAM_INVALID,
            message: `Param [${param}] is not exists.`
          }
        }));
        return;
      }

      if (!checkCompatibility(NodeConfigs[param], args.message.value)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.VALUE_INCOMPATIBLE,
            message: `(${args.message.value}) is incompatible with param [${param}]: ${JSON.stringify(NodeConfigs[param])}`
          }
        }));
        return;
      }

      NodeConfigs[param] = args.message.value;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({
        result: {
          code: JsonRpcApiResultCode.SUCCESS,
          message: `Param [${param}] is now set as: ${JSON.stringify(NodeConfigs[param])}`
        }
      }));
    },

    [JSON_RPC_METHODS.AIN_ADD_TO_WHITELIST_NODE_PARAM]: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      if (_.get(args.message, 'method') !== JSON_RPC_METHODS.AIN_ADD_TO_WHITELIST_NODE_PARAM || !verified) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done({ code: 403, message: 'Forbidden' });
        return;
      }

      const param = args.message.param;
      if (NodeConfigs[param] === undefined) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.PARAM_INVALID,
            message: `Param [${param}] is not exists.`
          }
        }));
        return;
      }
      if (!CommonUtil.isArray(NodeConfigs[param]) &&
        !CommonUtil.isWildcard(NodeConfigs[param])) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.PARAM_INVALID,
            message: `Param [${param}] is not whitelist`
          }
        }));
        return;
      }

      if (!CommonUtil.isArray(NodeConfigs[param])) {
        // NOTE(liayoo): if the whitelist was "*" previously, adding an IP will no longer "allow-all".
        NodeConfigs[param] = [];
      }
      if (NodeConfigs[param].includes(args.message.value)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ALREADY_IN_WHITELIST,
            message: `(${args.message.value}) already in whitelist [${param}]: ${JSON.stringify(NodeConfigs[param])}`
          }
        }));
        return;
      }

      if (CommonUtil.isWildcard(args.message.value)) {
        NodeConfigs[param] = '*';
      } else {
        NodeConfigs[param].push(args.message.value);
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({
        result: {
          code: JsonRpcApiResultCode.SUCCESS,
          message: `Added (${args.message.value}) to whitelist [${param}]: ${JSON.stringify(NodeConfigs[param])}`
        }
      }));
    },

    [JSON_RPC_METHODS.AIN_REMOVE_FROM_WHITELIST_NODE_PARAM]: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      if (_.get(args.message, 'method') !== JSON_RPC_METHODS.AIN_REMOVE_FROM_WHITELIST_NODE_PARAM || !verified) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done({ code: 403, message: 'Forbidden' });
        return;
      }

      const param = args.message.param;
      if (NodeConfigs[param] === undefined) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.PARAM_INVALID,
            message: `Param [${param}] is not exists.`
          }
        }));
        return;
      }
      if (!CommonUtil.isArray(NodeConfigs[param]) &&
        !CommonUtil.isWildcard(NodeConfigs[param])) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.PARAM_INVALID,
            message: `Param [${param}] is not whitelist`
          }
        }));
        return;
      }

      if (CommonUtil.isWildcard(args.message.value)) {
        NodeConfigs[param] = [];
      } else if (!CommonUtil.isArray(NodeConfigs[param]) ||
        !NodeConfigs[param].includes(args.message.value)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.NOT_IN_WHITELIST,
            message: `(${args.message.value}) not in whitelist [${param}]: ${JSON.stringify(NodeConfigs[param])}`
          }
        }));
        return;
      } else {
        NodeConfigs[param] = NodeConfigs[param].filter((value) => value !== args.message.value);
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({
        result: {
          code: JsonRpcApiResultCode.SUCCESS,
          message: `Removed (${args.message.value}) from whitelist [${param}]: ${JSON.stringify(NodeConfigs[param])}`
        }
      }));
    },
  }
};
