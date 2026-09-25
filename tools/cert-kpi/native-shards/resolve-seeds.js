const { lookup } = require('node:dns/promises');
const { isIP } = require('node:net');

async function resolveSeeds(environment, resolve = lookup) {
  for (const key of ['PEER_CANDIDATE_JSON_RPC_URL', 'TRACKER_UPDATE_JSON_RPC_URL']) {
    const url = new URL(environment[key]);
    if (!isIP(url.hostname)) {
      const result = await resolve(url.hostname, { family: 4 });
      if (isIP(result.address) !== 4) throw new Error(`${key}: expected an IPv4 seed`);
      url.hostname = result.address;
    }
    environment[key] = url.href;
  }
}

module.exports = { resolveSeeds };
