const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const PathUtil = require('../common/path-util');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

module.exports = function getAccountApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_GET_ADDRESS]: function(args, done) {
      const beginTime = Date.now();
      const result = node.account ? node.account.address : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_BALANCE]: function(args, done) {
      const beginTime = Date.now();
      const address = args.address;
      const balance = node.db.getValue(PathUtil.getAccountBalancePath(address)) || 0;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: balance }));
    },

    [JSON_RPC_METHODS.AIN_GET_NONCE]: function(args, done) {
      const beginTime = Date.now();
      const result = node.getNonceForAddr(args.address, args.from === 'pending');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_TIMESTAMP]: function(args, done) {
      const beginTime = Date.now();
      const result = node.getTimestampForAddr(args.address, args.from === 'pending');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
