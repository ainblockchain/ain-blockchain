const PEER_LIVENESS_THRESHOLD_MS = 5 * 60 * 1000   // 5 minutes

function abbrAddr(address) {
  return `${address.substring(0, 6)}..${address.substring(address.length - 4)}`;
}

function isPeerAlive(updatedAt) {
  return PEER_LIVENESS_THRESHOLD_MS > Date.now() - updatedAt;
}

module.exports = {
  abbrAddr,
  isPeerAlive
};
