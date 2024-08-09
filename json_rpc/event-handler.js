const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

module.exports = function getEventHandlerApis(eventHandler) {
  return {
    // NOTE(cshcomcom): Async function doesn't need a done parameter. (Ref: https://www.npmjs.com/package/jayson#promises)
    [JSON_RPC_METHODS.NET_GET_EVENT_HANDLER_NETWORK_INFO]: function(args, done) {
      const beginTime = Date.now();
      const result = eventHandler.eventChannelManager.getNetworkInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_EVENT_HANDLER_FILTER_INFO]: function(args, done) {
      const beginTime = Date.now();
      const result = eventHandler.getFilterInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_EVENT_HANDLER_CHANNEL_INFO]: function(args, done) {
      const beginTime = Date.now();
      const result = eventHandler.eventChannelManager.getChannelInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
