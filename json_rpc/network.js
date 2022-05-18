const {
  BlockchainNodeStates,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

module.exports = function getNetworkApis(node, p2pServer) {
  return {
    [JSON_RPC_METHODS.NET_LISTENING]: function(args, done) {
      const beginTime = Date.now();
      const peerCount = Object.keys(p2pServer.inbound).length;
      const result = !!peerCount;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.NET_PEER_COUNT]: function(args, done) {
      const beginTime = Date.now();
      const peerCount = Object.keys(p2pServer.inbound).length;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: peerCount }));
    },

    [JSON_RPC_METHODS.NET_SYNCING]: function(args, done) {
      const beginTime = Date.now();
      const result = (node.state === BlockchainNodeStates.CHAIN_SYNCING);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      // TODO(liayoo): Return { starting, latest } with block numbers
      // if the node is currently syncing.
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.NET_GET_NETWORK_ID]: function(args, done) {
      const beginTime = Date.now();
      const result = node.getBlockchainParam('genesis/network_id');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.NET_GET_CHAIN_ID]: function(args, done) {
      const beginTime = Date.now();
      const result = node.getBlockchainParam('genesis/chain_id');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.NET_CONSENSUS_STATUS]: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.consensus.getStatus();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.NET_RAW_CONSENSUS_STATUS]: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.consensus.getRawStatus();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.P2P_GET_PEER_CANDIDATE_INFO]: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.client.getPeerCandidateInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
