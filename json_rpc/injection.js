const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHOD } = require('./constants');

module.exports = function getInjectionApis(node, p2pServer) {
  return {
    [JSON_RPC_METHOD.AIN_GET_BOOTSTRAP_PUB_KEY]: function(args, done) {
      const beginTime = Date.now();
      const result = node.bootstrapAccount ? node.bootstrapAccount.public_key : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHOD.AIN_INJECT_ACCOUNT_FROM_PRIVATE_KEY]: async function(args, done) {
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

    [JSON_RPC_METHOD.AIN_INJECT_ACCOUNT_FROM_KEYSTORE]: async function(args, done) {
      const beginTime = Date.now();
      let result = false;
      if (await node.injectAccountFromKeystore(args.encryptedKeystore, args.encryptedPassword)) {
        result = true;
        p2pServer.client.run();
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
      return JsonRpcUtil.addProtocolVersion({ result });
    },

    [JSON_RPC_METHOD.AIN_INJECT_ACCOUNT_FROM_HD_WALLET]: async function(args, done) {
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
  };
};
