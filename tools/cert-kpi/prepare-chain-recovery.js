const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

function main() {
  const parameters = process.argv.slice(2);
  const [composeFile, image, configDirectory, seedDirectory, replayFile, outputPath] = parameters;
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  const original = JSON.parse(fs.readFileSync(composeFile));
  const replay = JSON.parse(fs.readFileSync(replayFile));
  assert.equal(original.name, 'ain-cert-docker');
  assert.equal(replay.pass, true);
  assert.equal(replay.signatureBypass, false);
  assert.equal(replay.diskTipStateProof, replay.exportedSnapshot.rootProofHash);
  const number = replay.exportedSnapshot.number;
  assert.equal(number, replay.diskLastNumber);
  const seed = path.resolve(seedDirectory, 'n2s', `${number}.json.gz`);
  const seedBytes = fs.readFileSync(seed);
  const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(seedBytes), replay.exportedSnapshot.sha256);
  zlib.gunzipSync(seedBytes, { maxOutputLength: 256 * 1024 ** 2 });
  const genesis = JSON.parse(zlib.gunzipSync(fs.readFileSync(
      path.resolve(configDirectory, 'genesis_block.json.gz'))));
  assert.equal(genesis.hash, replay.genesisHash);
  fs.mkdirSync(outputPath, { mode: 0o700 });
  const output = path.resolve(outputPath);
  const client = path.join(output, 'cert-client.js');
  fs.copyFileSync(path.resolve(path.dirname(composeFile), 'cert-client.js'), client);
  const services = {};
  const volumes = {};
  for (let index = 0; index < 10; index++) {
    const service = structuredClone(original.services[`node${index}`]);
    assert.equal(service.environment.NODE_INDEX, String(index));
    assert.equal(service.environment.PORT, String(18081 + index));
    assert.equal(service.network_mode, 'host');
    assert.equal(service.cpu_quota, 3200000);
    assert.equal(service.mem_limit, '128g');
    assert.equal(service.memswap_limit, '128g');
    service.image = image;
    service.runtime = 'runc';
    service.cap_drop = ['ALL'];
    service.security_opt = ['no-new-privileges'];
    service.environment.ENABLE_TX_SIG_VERIF_WORKAROUND = 'false';
    service.environment.ENABLE_EARLY_TX_SIG_VERIF = 'true';
    service.environment.NVIDIA_VISIBLE_DEVICES = 'void';
    service.volumes = [`chain-node${index}:/data`,
      `${client}:/app/ain-blockchain/cert-client.js:ro`,
      `${path.resolve(configDirectory)}:/app/ain-blockchain/blockchain-configs/cert-10-nodes:ro`];
    delete service.depends_on;
    services[`node${index}`] = service;
    volumes[`chain-node${index}`] = { external: true, name: `ain-cert-docker_chain-node${index}` };
  }
  fs.writeFileSync(path.join(output, 'compose.json'),
      JSON.stringify({ name: original.name, services, volumes }, null, 2) + '\n');
  const plan = { at: new Date().toISOString(), image, seed,
    snapshotNumber: number, snapshotSha256: replay.exportedSnapshot.sha256,
    originalFinalHash: replay.diskTipHash, originalStateProof: replay.diskTipStateProof,
    genesisHash: genesis.hash, configDirectory: path.resolve(configDirectory),
    sourceComposeSha256: hash(fs.readFileSync(composeFile)),
    canary: 1, finalBridge: 0, order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0],
    constraints: 'one node at a time; keep node0 as pending-chain bridge until peers recover; ' +
      'preserve all historical block files; no automatic rollback or timeout-triggered restart' };
  fs.writeFileSync(path.join(output, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify({ output, image, snapshotNumber: number, stagedOnly: true }));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
