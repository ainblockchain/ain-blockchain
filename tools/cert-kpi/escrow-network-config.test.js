const { test } = require('node:test');
const assert = require('assert/strict');
const { parameters, timerFlags, compose } = require('./escrow-network-config');

test('fresh ten-validator configuration retains native quorum and precision activation', () => {
  const template = { genesis: {}, consensus: { health_threshold_epoch: 10 }, resource: {} };
  const accounts = { owner: { address: 'owner' },
    others: Array.from({ length: 20 }, (_, index) => ({ address: `account-${index}` })) };
  const result = parameters(template, accounts, 12345);
  assert.equal(result.consensus.min_num_validators, 5);
  assert.equal(result.consensus.max_num_validators, 10);
  assert.equal(result.consensus.health_threshold_epoch, 10);
  assert.equal(Object.keys(result.consensus.genesis_validators).length, 10);
  assert.equal(result.genesis.epoch_ms, 1000);
  assert.equal(result.genesis.genesis_addr, 'owner');
  assert.deepEqual(template, {
    genesis: {}, consensus: { health_threshold_epoch: 10 }, resource: {},
  });
  const flags = {
    allow_up_to_6_decimal_transfer_value_only: { enabled_block: 2, has_bandage: true },
    old_flag: { enabled_block: 17 } };
  assert.deepEqual(timerFlags(flags), {
    ...flags, native_escrow_micro_units: { enabled_block: 2, has_bandage: false },
  });
  assert.equal(flags.native_escrow_micro_units, undefined);
  assert.throws(() => timerFlags({}));
  assert.throws(() => parameters(template,
      { ...accounts, others: accounts.others.slice(0, 10) }, 12345));
});

test('separate project uses ten immutable images and explicit shared resource ceilings', () => {
  const plan = { project: 'ain-units-test', chainImage: `sha256:${'1'.repeat(64)}`,
    rpcPortBase: 21081, peerPort: 21041, uid: 1000, gid: 1000 };
  const result = compose(plan, '/private-test', '/source-test');
  assert.equal(Object.keys(result.services).length, 11);
  assert.equal(result.services.tracker.environment.BLOCKCHAIN_DATA_DIR, '/tmp/tracker');
  for (let index = 0; index < 10; index++) {
    const node = result.services[`node${index}`];
    assert.equal(node.environment.PORT, String(21081 + index));
    assert.equal(node.environment.ENABLE_TX_SIG_VERIF_WORKAROUND, 'false');
    assert.equal(node.image, plan.chainImage);
    assert.equal(node.read_only, true);
    assert.equal(node.user, '1000:1000');
    assert.ok(node.volumes.includes(`/private-test/data/node${index}:/data`));
    assert.equal(node.cpu_quota / node.cpu_period, 32);
    assert.equal(node.mem_limit, '128g');
    assert.equal(node.cpuset, '0-7');
    assert.equal(node.restart, 'no');
    assert.ok(node.volumes.includes('/private-test/config:/network:ro'));
  }
  assert.throws(() => compose({ ...plan, project: 'ain-cert-docker' }, '/private', '/source'));
  assert.throws(() => compose({ ...plan, rpcPortBase: 18081 }, '/private', '/source'));
  assert.throws(() => compose({ ...plan, chainImage: 'mutable-tag' }, '/private', '/source'));
});
