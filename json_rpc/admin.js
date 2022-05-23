const net = require('net');
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

module.exports = function getApiAccessApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_GET_DEV_CLIENT_API_IP_WHITELIST]: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_GET, latency);
      if (_.get(args.message, 'method') === JSON_RPC_METHODS.AIN_GET_DEV_CLIENT_API_IP_WHITELIST &&
          verified) {
        done(null,
            JsonRpcUtil.addProtocolVersion({ result: NodeConfigs.DEV_CLIENT_API_IP_WHITELIST }));
      } else {
        done({ code: 403, message: 'Forbidden' });
      }
    },

    [JSON_RPC_METHODS.AIN_ADD_TO_DEV_CLIENT_API_IP_WHITELIST]: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      if (_.get(args.message, 'method') !== JSON_RPC_METHODS.AIN_ADD_TO_DEV_CLIENT_API_IP_WHITELIST ||
          !verified) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done({ code: 403, message: 'Forbidden' });
        return;
      }
      if (CommonUtil.isWildcard(args.message.ip)) {
        NodeConfigs.DEV_CLIENT_API_IP_WHITELIST = '*';
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.SUCCESS,
            message: `Added IP (${args.message.ip}) to whitelist: ${JSON.stringify(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST)}`
          }
        }));
        return;
      }
      if (!net.isIPv4(args.message.ip)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.INVALID_IP,
            message: `Invalid IP: ${args.message.ip}`
          }
        }));
        return;
      }
      if (!CommonUtil.isArray(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST)) {
        // NOTE(liayoo): if the whitelist was "*" previously, adding an IP will no longer "allow-all".
        NodeConfigs.DEV_CLIENT_API_IP_WHITELIST = [];
      }
      if (NodeConfigs.DEV_CLIENT_API_IP_WHITELIST.includes(args.message.ip)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.IP_ALREADY_IN_WHITELIST,
            message: `IP (${args.message.ip}) already in whitelist: ${JSON.stringify(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST)}`
          }
        }));
      } else {
        NodeConfigs.DEV_CLIENT_API_IP_WHITELIST.push(args.message.ip);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.SUCCESS,
            message: `Added IP (${args.message.ip}) to whitelist: ${JSON.stringify(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST)}`
          }
        }));
      }
    },

    [JSON_RPC_METHODS.AIN_REMOVE_FROM_DEV_CLIENT_API_IP_WHITELIST]: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      if (_.get(args.message, 'method') !== JSON_RPC_METHODS.AIN_REMOVE_FROM_DEV_CLIENT_API_IP_WHITELIST ||
          !verified) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done({ code: 403, message: 'Forbidden' });
        return;
      }
      if (CommonUtil.isWildcard(args.message.ip)
          && CommonUtil.isWildcard(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST)) {
        NodeConfigs.DEV_CLIENT_API_IP_WHITELIST = [];
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.SUCCESS,
            message: `Removed IP (${args.message.ip}) from whitelist: ${JSON.stringify(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST)}`
          }
        }));
        return;
      }
      if (!CommonUtil.isArray(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST) ||
          !NodeConfigs.DEV_CLIENT_API_IP_WHITELIST.includes(args.message.ip)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.IP_NOT_IN_WHITELIST,
            message: `IP (${args.message.ip}) not in whitelist: ${JSON.stringify(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST)}`
          }
        }));
        return;
      }
      NodeConfigs.DEV_CLIENT_API_IP_WHITELIST = NodeConfigs.DEV_CLIENT_API_IP_WHITELIST
        .filter((ip) => ip !== args.message.ip);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({
        result: {
          code: JsonRpcApiResultCode.SUCCESS,
          message: `Removed IP (${args.message.ip}) from whitelist: ${JSON.stringify(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST)}`
        }
      }));
    },
  }
};
