const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const PathUtil = require('../common/path-util');
const JsonRpcUtil = require('./json-rpc-util');

module.exports = function getAccountApis(node) {
  return {
    ain_getAddress: function(args, done) {
      const beginTime = Date.now();
      const result = node.account ? node.account.address : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getBalance: function(args, done) {
      const beginTime = Date.now();
      const address = args.address;
      const balance = node.db.getValue(PathUtil.getAccountBalancePath(address)) || 0;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: balance }));
    },

    ain_getNonce: function(args, done) {
      const beginTime = Date.now();
      const result = node.getNonceForAddr(args.address, args.from === 'pending');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getTimestamp: function(args, done) {
      const beginTime = Date.now();
      const result = node.getTimestampForAddr(args.address, args.from === 'pending');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getValidatorInfo: function(args, done) {
      const beginTime = Date.now();
      const addr = args.address;
      const isWhitelisted = node.db.getValue(PathUtil.getConsensusProposerWhitelistAddrPath(addr)) || false;
      const stake = node.db.getValue(PathUtil.getServiceAccountBalancePath(addr)) || 0;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({
        result: {
          isWhitelisted,
          stake,
        }
      }));
    },
  };
};
