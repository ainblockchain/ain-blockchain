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
    getPeerInfo: function(args, done) {
      done(null, peers.map((peer) => {
        return {
          ip: peer.ip,
          port: peer.port,
          connectedPeers: peer.connectedPeers.map((peer) => {
            return peer.url;
          }),
          country: peer.country,
          region: peer.region,
          city: peer.city,
        };
      }));
    },
  };
};
