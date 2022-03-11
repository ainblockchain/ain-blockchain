const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');

module.exports = function getEventHandlerApis(eventHandler) {
  return {
    net_getEventHandlerNetworkInfo: async function(args) {
      const beginTime = Date.now();
      const result = await eventHandler.eventChannelManager.getNetworkInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      return JsonRpcUtil.addProtocolVersion({ result });
    },

    ain_getEventHandlerFilterInfo: function(args, done) {
      const beginTime = Date.now();
      const result = eventHandler.getFilterInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getEventHandlerChannelInfo: function(args, done) {
      const beginTime = Date.now();
      const result = eventHandler.eventChannelManager.getChannelInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
