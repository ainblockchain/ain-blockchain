const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHOD } = require('./constants');

module.exports = function getAppApis(node) {
  return {
    [JSON_RPC_METHOD.AIN_VALIDATE_APP_NAME]: function(args, done) {
      const beginTime = Date.now();
      const result = node.validateAppName(args.app_name);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
