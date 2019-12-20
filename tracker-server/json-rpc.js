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
    getAllNodeInfo: function(args, done) {
      done(null, nodes.map((entry) => {
        return entry.getNodeInfo();
      }));
    },

    getNodePublicKeys: function(args, done) {
      done(null, nodes.map((entry) => {
        return entry.publicKey;
      }));
    },

    getNodeInfoByPublicKey: function(args, done) {
      let result = null;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].publicKey === args[0]) {
          result = nodes[i].getNodeInfo();
          break;
        }
      }
      done(null, result);
    },
  };
};
