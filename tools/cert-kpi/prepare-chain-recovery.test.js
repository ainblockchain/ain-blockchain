const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { test } = require('node:test');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chain-recovery-plan-'));
  const config = path.join(directory, 'config');
  const seed = path.join(directory, 'seed');
  fs.mkdirSync(config);
  fs.mkdirSync(path.join(seed, 'n2s'), { recursive: true });
  fs.writeFileSync(path.join(config, 'genesis_block.json.gz'),
      zlib.gzipSync(JSON.stringify({ hash: 'original-genesis' })));
  const bytes = zlib.gzipSync(JSON.stringify({ docs: [] }));
  fs.writeFileSync(path.join(seed, 'n2s/10.json.gz'), bytes);
  fs.writeFileSync(path.join(directory, 'cert-client.js'), 'original client');
  const services = {};
  for (let index = 0; index < 10; index++) {
    services[`node${index}`] = { image: 'original', network_mode: 'host',
      cpu_quota: 3200000, mem_limit: '128g', memswap_limit: '128g', cpuset: '0-7',
      environment: { NODE_INDEX: String(index), PORT: String(18081 + index),
        ENABLE_TX_SIG_VERIF_WORKAROUND: 'true' }, depends_on: ['tracker'] };
  }
  const compose = { name: 'ain-cert-docker', services };
  const replay = { pass: true, signatureBypass: false, diskTipStateProof: 'original-proof',
    diskLastNumber: 10, diskTipHash: 'original-tip', genesisHash: 'original-genesis',
    exportedSnapshot: { number: 10, rootProofHash: 'original-proof',
      sha256: crypto.createHash('sha256').update(bytes).digest('hex') } };
  const output = path.join(directory, 'staged');
  const run = () => {
    fs.writeFileSync(path.join(directory, 'compose.json'), JSON.stringify(compose));
    fs.writeFileSync(path.join(directory, 'replay.json'), JSON.stringify(replay));
    return spawnSync(process.execPath, [path.join(__dirname, 'prepare-chain-recovery.js'),
      path.join(directory, 'compose.json'), `sha256:${'a'.repeat(64)}`, config, seed,
      path.join(directory, 'replay.json'), output], { encoding: 'utf8' });
  };
  return { directory, compose, replay, config, seed, output, run };
}

test('stages the same ten identities, volumes and limits without running Docker', () => {
  const sample = fixture();
  try {
    const result = sample.run();
    assert.equal(result.status, 0, result.stderr);
    const staged = JSON.parse(fs.readFileSync(path.join(sample.output, 'compose.json')));
    assert.equal(Object.keys(staged.services).length, 10);
    for (let index = 0; index < 10; index++) {
      const service = staged.services[`node${index}`];
      assert.equal(service.environment.NODE_INDEX, String(index));
      assert.equal(service.environment.ENABLE_TX_SIG_VERIF_WORKAROUND, 'false');
      assert.equal(service.environment.ENABLE_EARLY_TX_SIG_VERIF, 'true');
      assert.equal(service.cpu_quota, 3200000);
      assert.equal(service.cpuset, '0-7');
      assert.equal(service.mem_limit, '128g');
      assert.equal(service.memswap_limit, '128g');
      assert.equal(service.depends_on, undefined);
      assert.equal(staged.volumes[`chain-node${index}`].external, true);
      assert.equal(staged.volumes[`chain-node${index}`].name,
          `ain-cert-docker_chain-node${index}`);
    }
    const plan = JSON.parse(fs.readFileSync(path.join(sample.output, 'plan.json')));
    assert.deepEqual(plan.order, [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
    assert.notEqual(sample.run().status, 0, 'cannot overwrite a staged plan');
  } finally {
    fs.rmSync(sample.directory, { recursive: true, force: true });
  }
});

for (const failure of ['failed-replay', 'signature-bypass', 'proof', 'snapshot-hash', 'genesis']) {
  test(`rejects ${failure} before creating a recovery plan`, () => {
    const sample = fixture();
    try {
      if (failure === 'failed-replay') sample.replay.pass = false;
      if (failure === 'signature-bypass') sample.replay.signatureBypass = true;
      if (failure === 'proof') sample.replay.diskTipStateProof = 'wrong';
      if (failure === 'snapshot-hash') sample.replay.exportedSnapshot.sha256 = 'wrong';
      if (failure === 'genesis') sample.replay.genesisHash = 'wrong';
      assert.notEqual(sample.run().status, 0);
      assert.equal(fs.existsSync(sample.output), false);
    } finally {
      fs.rmSync(sample.directory, { recursive: true, force: true });
    }
  });
}
