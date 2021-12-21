const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');

module.exports = function getEventHandlerApis(eventHandler) {
  return {
    net_getEventHandlerNetworkInfo: async function() {
      const beginTime = Date.now();
      const result = await eventHandler.eventChannelManager.getNetworkInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      return JsonRpcUtil.addProtocolVersion({ result });
    },
  };
};
