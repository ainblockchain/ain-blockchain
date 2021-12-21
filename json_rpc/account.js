const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const PathUtil = require('../common/path-util');
const JsonRpcUtil = require('./util');

module.exports = function getAccountApis(node, p2pServer) {
  return {
    ain_getBootstrapPubKey: function(args, done) {
      const beginTime = Date.now();
      const result = node.bootstrapAccount ? node.bootstrapAccount.public_key : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_injectAccountFromPrivateKey: async function(args, done) {
      const beginTime = Date.now();
      let result = false;
      if (await node.injectAccountFromPrivateKey(args.encryptedPrivateKey)) {
        result = true;
        p2pServer.client.run();
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
      return JsonRpcUtil.addProtocolVersion({ result });
    },

    ain_injectAccountFromKeystore: async function(args, done) {
      const beginTime = Date.now();
      let result = false;
      if (await node.injectAccountFromKeystore(args.encryptedPassword)) {
        result = true;
        p2pServer.client.run();
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
      return JsonRpcUtil.addProtocolVersion({ result });
    },

    ain_injectAccountFromHDWallet: async function(args, done) {
      const beginTime = Date.now();
      let result = false;
      if (await node.injectAccountFromHDWallet(args.encryptedMnemonic, args.index)) {
        result = true;
        p2pServer.client.run();
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
      return JsonRpcUtil.addProtocolVersion({ result });
    },

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
