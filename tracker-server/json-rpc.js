'use strict';
const { getGraphData } = require('./network-topology');

/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {list} nodes - List of all nodes from.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(tracker, logger) {
  const blockchainNodes = tracker.blockchainNodes;
  return {
    getNodeInfoList: function(args, done) {
      const list = [];
      Object.keys(blockchainNodes).forEach((key) => {
        list.push(blockchainNodes[key].getNodeInfo());
      });
      done(null, list);
    },

    getNodeAddressList: function(args, done) {
      const list = [];
      Object.keys(blockchainNodes).forEach((key) => {
        list.push(blockchainNodes[key].address);
      });
      done(null, list);
    },

    getNodeInfoByAddress: function(args, done) {
      let result = null;
      for (let i = 0; i < blockchainNodes.length; i++) {
        if (blockchainNodes[i].address === args[0]) {
          result = blockchainNodes[i].getNodeInfo();
          break;
        }
      }
      done(null, result);
    },

    updateNodeInfo: function(args, done) {
      const nodeInfo = args;
      tracker.setBlockchainNode(nodeInfo);
      done(null);
    },

    getNetworkTopology: function(args, done) {
      const networkStatus = tracker.getNetworkStatus();
      const graphData = getGraphData(networkStatus);
      args.isError ? logger.error(`Network Topology:\n${JSON.stringify(graphData)}`) :
          logger.info(`Network Topology:\n${JSON.stringify(graphData)}`);
      done(null, graphData);
    }
  };
};
