const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateTarget, retainedMounts } = require('./refresh-node');

function fixture() {
  const manifest = { runId: 'native_fixture', chains: [{ name: 'root', nodes: [{ service: 'root2' }] }] };
  const compose = { name: 'ain-cert-shards-native-fixture' };
  const image = `sha256:${'a'.repeat(64)}`;
  const current = { Image: `sha256:${'b'.repeat(64)}`,
    Config: { Labels: { 'com.docker.compose.project': compose.name, 'com.docker.compose.service': 'root2',
      'org.ain.cert.run': manifest.runId }, Env: ['ENABLE_TX_SIG_VERIF_WORKAROUND=false'] },
    HostConfig: { CpuQuota: 3200000, CpusetCpus: '0-7', Memory: 128 * 1024 ** 3, MemorySwap: 128 * 1024 ** 3 },
    State: { Running: true, Status: 'running' },
    Mounts: [{ Type: 'volume', Name: `${compose.name}_data-root2`, Destination: '/data' }] };
  return { manifest, compose, current, image };
}

test('refresh is scoped to the original validator, retained volume and tested image', () => {
  const { manifest, compose, current, image } = fixture();
  const check = () => validateTarget(manifest, compose, 'root2', current, image, image, { pass: true }, '0');
  assert.equal(check(), manifest.chains[0]);
  current.Mounts[0].Name = 'another-ledger';
  assert.throws(check);
});

test('untested images, signature bypass and unrelated stopped containers are rejected', () => {
  const { manifest, compose, current, image } = fixture();
  const check = () => validateTarget(manifest, compose, 'root2', current, image, image, { pass: true }, '0');
  assert.throws(() => validateTarget(manifest, compose, 'root2', current, image, image, { pass: false }, '0'));
  current.Config.Env = ['ENABLE_TX_SIG_VERIF_WORKAROUND=true'];
  assert.throws(check);
  current.Config.Env = ['ENABLE_TX_SIG_VERIF_WORKAROUND=false'];
  current.State = { Running: false, Status: 'exited', ExitCode: 0 };
  assert.throws(check);
  current.State.ExitCode = 139;
  assert.equal(check(), manifest.chains[0]);
  current.Image = image;
  assert.throws(check, /already runs/);
});

test('Docker mount enumeration order does not change retained volume identity', () => {
  const mounts = [{ Type: 'volume', Name: 'original', Source: '/volumes/original', Destination: '/data', RW: true },
    { Type: 'bind', Source: '/network', Destination: '/network', RW: false }];
  assert.deepEqual(retainedMounts({ Mounts: mounts }), retainedMounts({ Mounts: [...mounts].reverse() }));
  const changed = structuredClone(mounts);
  changed[0].Name = 'replacement';
  assert.notDeepEqual(retainedMounts({ Mounts: mounts }), retainedMounts({ Mounts: changed }));
});
