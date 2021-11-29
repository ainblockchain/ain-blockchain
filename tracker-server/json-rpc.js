'use strict';
/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {list} nodes - List of all nodes from.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(tracker) {
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
    }
  };
};
