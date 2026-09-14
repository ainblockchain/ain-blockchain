const assert = require('assert');
const ip = require('ip');
const { NodeConfigs, HostingEnvs } = require('../../common/constants');
const { getIpAddress } = require('../../common/network-util');

describe('Local network address discovery', () => {
  it('uses the local interface for both advertised and internal addresses without public IP discovery', async () => {
    const previous = NodeConfigs.HOSTING_ENV;
    NodeConfigs.HOSTING_ENV = HostingEnvs.LOCAL;
    try {
      assert.strictEqual(await getIpAddress(false), ip.address());
      assert.strictEqual(await getIpAddress(true), ip.address());
    } finally {
      NodeConfigs.HOSTING_ENV = previous;
    }
  });
});
