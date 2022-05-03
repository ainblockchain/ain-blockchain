const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');

module.exports = function getAppApis(node) {
  return {
    ain_validateAppName: function(args, done) {
      const beginTime = Date.now();
      const result = node.validateAppName(args.app_name);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
