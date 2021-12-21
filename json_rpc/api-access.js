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

module.exports = function getApiAccessApis(node) {
  return {
    ain_getDevClientApiIpWhitelist: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_GET, latency);
      if (_.get(args.message, 'method') === 'ain_getDevClientApiIpWhitelist' && verified) {
        done(null, JsonRpcUtil.addProtocolVersion({ result: NodeConfigs.DEV_CLIENT_API_IP_WHITELIST }));
      } else {
        done({ code: 403, message: 'Forbidden' });
      }
    },

    ain_addToDevClientApiIpWhitelist: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      if (_.get(args.message, 'method') !== 'ain_addToDevClientApiIpWhitelist' || !verified) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done({ code: 403, message: 'Forbidden' });
        return;
      }
      if (!CommonUtil.isWildcard(args.message.ip) && net.isIP(args.message.ip) !== 0) {
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

    ain_removeFromDevClientApiIpWhitelist: function(args, done) {
      const beginTime = Date.now();
      const verified = node.verifyNodeAccountSignature(args.message, args.signature);
      if (_.get(args.message, 'method') !== 'ain_removeFromDevClientApiIpWhitelist' || !verified) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.ACCESS_CONTROL_SET, latency);
        done({ code: 403, message: 'Forbidden' });
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
