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

function convertValue(valueFromNodeParam, value) {
  if (CommonUtil.isBool(valueFromNodeParam)) {
    return CommonUtil.convertEnvVarInputToBool(value);
  } else if (CommonUtil.isIntegerString(valueFromNodeParam) || CommonUtil.isFloatString(valueFromNodeParam)) {
    return Number(value);
  } else if (CommonUtil.isArray(valueFromNodeParam) || CommonUtil.isWildcard(valueFromNodeParam)) {
    return CommonUtil.getWhitelistFromString(value);
  } else {
    return value;
  }
}

module.exports = function getAdminApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_GET_NODE_PARAM]: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      if (_.get(args.message, 'method') !== JSON_RPC_METHODS.AIN_GET_NODE_PARAM || !verified) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_FORBIDDEN_REQUEST,
            message: `Forbidden request.`
          }
        }));
        return;
      }

      const param = args.message.param;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_GET, latency);
      if (NodeConfigs[param] === undefined) {
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_PARAM_INVALID,
            message: `Param [${param}] does not exist.`
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
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_FORBIDDEN_REQUEST,
            message: `Forbidden request.`
          }
        }));
        return;
      }

      const param = args.message.param;
      if (NodeConfigs[param] === undefined) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_PARAM_INVALID,
            message: `Param [${param}] does not exist.`
          }
        }));
        return;
      }

      if (!CommonUtil.isString(args.message.value)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_VALUE_NOT_A_STRING_TYPE,
            message: `(${args.message.value}) is not a string type.)}`
          }
        }));
        return;
      }

      NodeConfigs[param] = convertValue(NodeConfigs[param], args.message.value);
      // TODO(kriii): Add a refresher for some params.
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
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_FORBIDDEN_REQUEST,
            message: `Forbidden request.`
          }
        }));
        return;
      }

      const param = args.message.param;
      if (NodeConfigs[param] === undefined) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_PARAM_INVALID,
            message: `Param [${param}] does not exist.`
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
            code: JsonRpcApiResultCode.ADMIN_PARAM_INVALID,
            message: `Param [${param}] is not a whitelist`
          }
        }));
        return;
      }

      if (!CommonUtil.isString(args.message.value)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_VALUE_NOT_A_STRING_TYPE,
            message: `(${args.message.value}) is not a string type.)}`
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
            code: JsonRpcApiResultCode.ADMIN_ALREADY_IN_WHITELIST,
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
        done({
          code: JsonRpcApiResultCode.ADMIN_FORBIDDEN_REQUEST,
          message: `Forbidden request.`
        });
        return;
      }

      const param = args.message.param;
      if (NodeConfigs[param] === undefined) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_PARAM_INVALID,
            message: `Param [${param}] does not exist.`
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
            code: JsonRpcApiResultCode.ADMIN_PARAM_INVALID,
            message: `Param [${param}] is not a whitelist`
          }
        }));
        return;
      }

      if (!CommonUtil.isString(args.message.value)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.ADMIN_VALUE_NOT_A_STRING_TYPE,
            message: `(${args.message.value}) is not a string type.)}`
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
            code: JsonRpcApiResultCode.ADMIN_NOT_IN_WHITELIST,
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
