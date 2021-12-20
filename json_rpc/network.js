const {
  BlockchainNodeStates,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./util');

module.exports = function getNetworkApis(node, p2pServer) {
  return {
    net_listening: function(args, done) {
      const beginTime = Date.now();
      const peerCount = Object.keys(p2pServer.inbound).length;
      const result = !!peerCount;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    net_peerCount: function(args, done) {
      const beginTime = Date.now();
      const peerCount = Object.keys(p2pServer.inbound).length;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: peerCount }));
    },

    net_syncing: function(args, done) {
      const beginTime = Date.now();
      const result = node.state === BlockchainNodeStates.SYNCING;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      // TODO(liayoo): Return { starting, latest } with block numbers
      // if the node is currently syncing.
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    net_getNetworkId: function(args, done) {
      const beginTime = Date.now();
      const result = node.getBlockchainParam('genesis/network_id');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    net_getChainId: function(args, done) {
      const beginTime = Date.now();
      const result = node.getBlockchainParam('genesis/chain_id');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    net_consensusStatus: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.consensus.getStatus();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    net_rawConsensusStatus: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.consensus.getRawStatus();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    p2p_getPeerCandidateInfo: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.client.getPeerCandidateInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
