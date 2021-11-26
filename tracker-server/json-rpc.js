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
  const peerNodes = tracker.peerNodes;
  return {
    getNodeInfoList: function(args, done) {
      const list = [];
      Object.keys(peerNodes).forEach((key) => {
        list.push(peerNodes[key].getNodeInfo());
      });
      done(null, list);
    },

    getNodeAddressList: function(args, done) {
      const list = [];
      Object.keys(peerNodes).forEach((key) => {
        list.push(peerNodes[key].address);
      });
      done(null, list);
    },

    getNodeInfoByAddress: function(args, done) {
      let result = null;
      for (let i = 0; i < peerNodes.length; i++) {
        if (peerNodes[i].address === args[0]) {
          result = peerNodes[i].getNodeInfo();
          break;
        }
      }
      done(null, result);
    },

    updateNodeInfo: function(args, done) {
      const nodeInfo = args;
      tracker.setPeerNodes(nodeInfo);
      done(null);
    }
  };
};
