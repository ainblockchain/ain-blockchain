const semver = require('semver');
const {
  BlockchainConsts,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const { JsonRpcApiResultCode } = require('../common/result-code');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

module.exports = function getVersionApis(minProtocolVersion, maxProtocolVersion) {
  return {
    [JSON_RPC_METHODS.AIN_GET_PROTOCOL_VERSION]: function(args, done) {
      const beginTime = Date.now();
      const result = BlockchainConsts.CURRENT_PROTOCOL_VERSION;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_CHECK_PROTOCOL_VERSION]: function(args, done) {
      const beginTime = Date.now();
      const version = args.protoVer;
      const coercedVer = semver.coerce(version);
      if (version === undefined) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: false,
          code: JsonRpcApiResultCode.PROTO_VERSION_NOT_SPECIFIED,
          message: 'Protocol version not specified.'
        }));
      } else if (!semver.valid(coercedVer)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: false,
          code: JsonRpcApiResultCode.PROTO_VERSION_INVALID,
          message: 'Invalid protocol version.'
        }));
      } else if (semver.lt(coercedVer, minProtocolVersion) ||
          (maxProtocolVersion && semver.gt(coercedVer, maxProtocolVersion))) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: false,
          code: JsonRpcApiResultCode.PROTO_VERSION_INCOMPATIBLE,
          message: 'Incompatible protocol version.'
        }));
      } else {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: true,
          code: JsonRpcApiResultCode.SUCCESS,
        }));
      }
    },
  };
};
