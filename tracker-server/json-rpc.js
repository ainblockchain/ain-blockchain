'use strict';
/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {list} peers - List of all peers from.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(peers) {
  return {
    getAllPeerInfo: function(args, done) {
      done(null, peers.map((peer) => {
        return peer.getPeerInfo();
      }));
    },

    getPeerPublicKeys: function(args, done) {
      done(null, peers.map((peer) => {
        return peer.publicKey;
      }));
    },

    getPeerInfoByPublicKey: function(args, done) {
      let result = null;
      for (let i = 0; i < peers.length; i++) {
        if (peers[i].publicKey === args[0]) {
          result = peers[i].getPeerInfo();
          break;
        }
      }
      done(null, result);
    },
  };
};
