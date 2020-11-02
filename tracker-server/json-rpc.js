'use strict';
/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {list} nodes - List of all nodes from.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(nodes) {
  return {
    getNodeInfoList: function(args, done) {
      const list = [];
      Object.keys(nodes).forEach((key) => {
        list.push(nodes[key].getNodeInfo());
      });
      done(null, list);
    },

    getNodeAddressList: function(args, done) {
      const list = [];
      Object.keys(nodes).forEach((key) => {
        list.push(nodes[key].address);
      });
      done(null, list);
    },

    getNodeInfoByAddress: function(args, done) {
      let result = null;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].address === args[0]) {
          result = nodes[i].getNodeInfo();
          break;
        }
      }
      done(null, result);
    },
  };
};
