const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');
const { hash, verifyHistory, capture } = require('./capture-finalized-checkpoint');

function fixture() {
  const now = Date.now();
  const records = Array.from({ length: 7 }, (_, number) => ({ number,
    hash: `0x${hash(`block-${number}`)}`,
    parentHash: number ? `0x${hash(`block-${number - 1}`)}` : '',
    stateProofHash: `0x${hash(`state-${number}`)}`,
    fileSha256: hash(`bytes-${number}`), bytes: 100 }));
  const files = new Map();
  const summary = { pass: true, error: null, signatureBypass: false, chainId: 0,
    startedAt: new Date(now - 3000).toISOString(), completedAt: new Date(now - 2000).toISOString(),
    requestedLastNumber: 6, blocksVerified: 7, genesisHash: records[0].hash,
    lastHash: records[6].hash };
  const instance = { index: 1, id: 'same-instance', pid: 101,
    startedAt: new Date(now - 10000).toISOString(), image: 'running-image', running: true,
    signatureBypassDisabled: true };
  const proof = { kind: 'finalized-history', pass: true,
    captureAt: new Date(now - 1000).toISOString(), instanceBefore: instance,
    instanceAfter: structuredClone(instance), address: 'node-address', nodeState: 'SERVING',
    consensusState: 'RUNNING', nativeHealth: true, signatureBypass: false,
    finalizedNumber: 8, auditedNumber: 6, auditedHash: records[6].hash,
    originalHash: records[2].hash, audit: { summaryFile: '/summary', manifestFile: '/manifest',
      imageFile: '/image', exitFile: '/exit' } };
  const checkpoint = { kind: proof.kind, index: 1, containerId: instance.id, pid: instance.pid,
    startedAt: instance.startedAt, image: instance.image, address: proof.address };
  const plan = { image: 'tested-auditor', snapshotNumber: 2, originalFinalHash: records[2].hash,
    originalStateProof: records[2].stateProofHash, genesisHash: records[0].hash,
    repair: { requiredPending: [records[3].hash, records[4].hash] } };
  files.set('/image', Buffer.from(plan.image));
  files.set('/exit', Buffer.from('0\n'));
  const refresh = () => {
    const manifest = Buffer.from(records.map((record) => JSON.stringify(record)).join('\n') + '\n');
    summary.manifestSha256 = hash(manifest);
    files.set('/manifest', manifest);
    const summaryBytes = Buffer.from(JSON.stringify(summary));
    files.set('/summary', summaryBytes);
    proof.audit.summarySha256 = hash(summaryBytes);
  };
  refresh();
  return { now, plan, checkpoint, proof, summary, records, files, refresh,
    read: (filename) => {
      assert.ok(files.has(filename));
      return files.get(filename);
    } };
}

test('original pending blocks may be retained in native-audited finalized history', () => {
  const sample = fixture();
  const result = verifyHistory(sample.plan, sample.checkpoint, sample.proof,
      sample.read, sample.now, sample.now - 5000);
  assert.equal(result.originalPendingFinalized, 2);
  assert.equal(result.auditedNumber, 6);
  assert.match(result.scope, /not full DB replay/);
});

for (const failure of ['altered-summary', 'altered-manifest', 'failed-audit', 'signature-bypass',
  'wrong-chain', 'wrong-image', 'failed-run', 'wrong-genesis', 'wrong-original', 'wrong-state',
  'missing-original-pending', 'noncontiguous', 'broken-parent', 'wrong-live-hash', 'behind-head',
  'restarted-process', 'wrong-checkpoint-image', 'unhealthy', 'not-serving', 'old-audit',
  'future-capture', 'audit-before-process', 'capture-before-audit', 'pre-crash-audit']) {
  test(`finalized history refuses ${failure}`, () => {
    const sample = fixture();
    const { proof, summary, records, files, plan, checkpoint } = sample;
    let terminalTime = sample.now - 5000;
    if (failure === 'failed-audit') summary.pass = false;
    if (failure === 'signature-bypass') summary.signatureBypass = true;
    if (failure === 'wrong-chain') summary.chainId = 1;
    if (failure === 'wrong-image') files.set('/image', Buffer.from('untested'));
    if (failure === 'failed-run') files.set('/exit', Buffer.from('1'));
    if (failure === 'wrong-genesis') plan.genesisHash = records[1].hash;
    if (failure === 'wrong-original') plan.originalFinalHash = records[1].hash;
    if (failure === 'wrong-state') plan.originalStateProof = 'changed';
    if (failure === 'missing-original-pending') plan.repair.requiredPending.push('missing');
    if (failure === 'noncontiguous') records[3].number++;
    if (failure === 'broken-parent') records[3].parentHash = records[0].hash;
    if (failure === 'wrong-live-hash') proof.auditedHash = records[5].hash;
    if (failure === 'behind-head') proof.finalizedNumber = 5;
    if (failure === 'restarted-process') proof.instanceAfter.pid++;
    if (failure === 'wrong-checkpoint-image') checkpoint.image = 'other';
    if (failure === 'unhealthy') proof.nativeHealth = false;
    if (failure === 'not-serving') proof.nodeState = 'CHAIN_SYNCING';
    if (failure === 'old-audit') summary.startedAt = new Date(sample.now - 900001).toISOString();
    if (failure === 'future-capture') proof.captureAt = new Date(sample.now + 1).toISOString();
    if (failure === 'audit-before-process') {
      summary.startedAt = new Date(sample.now - 11000).toISOString();
    }
    if (failure === 'capture-before-audit') {
      proof.captureAt = new Date(sample.now - 2500).toISOString();
    }
    if (failure === 'pre-crash-audit') terminalTime = sample.now - 2500;
    sample.refresh();
    if (failure === 'altered-summary') files.set('/summary', Buffer.from('{}'));
    if (failure === 'altered-manifest') files.set('/manifest', Buffer.from('{}'));
    assert.throws(() => verifyHistory(plan, checkpoint, proof,
        sample.read, sample.now, terminalTime));
  });
}

for (const scenario of ['success', 'existing-output', 'exited', 'signature-bypass', 'restarted',
  'wrong-live-hash']) {
  test(`capture checkpoint with injected read-only observations: ${scenario}`, async () => {
    const sample = fixture();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finalized-checkpoint-'));
    const auditRoot = path.join(directory, 'audit');
    const output = path.join(directory, 'capture');
    fs.mkdirSync(path.join(auditRoot, 'node1'), { recursive: true });
    const filePairs = [['node1/summary.json', '/summary'],
      ['node1/blocks.jsonl', '/manifest'], ['image-id.txt', '/image'], ['exit-code.txt', '/exit']];
    for (const [name, source] of filePairs) {
      fs.writeFileSync(path.join(auditRoot, name), sample.files.get(source));
    }
    if (scenario === 'existing-output') fs.mkdirSync(output);
    let inspected = 0;
    let requested = 0;
    const dependencies = { inspect: () => {
      const instance = structuredClone(sample.proof.instanceBefore);
      if (scenario === 'exited') instance.running = false;
      if (scenario === 'signature-bypass') instance.signatureBypassDisabled = false;
      if (scenario === 'restarted' && inspected > 0) instance.pid++;
      inspected++;
      return instance;
    }, request: async (index, endpoint) => {
      requested++;
      assert.equal(index, 1);
      if (endpoint === 'node_status') {
        return { state: 'SERVING', health: true, address: 'node-address' };
      }
      if (endpoint === 'get_consensus_status') return { state: 'RUNNING', health: true };
      if (endpoint === 'last_block_number') return 8;
      const number = Number(endpoint.split('=').at(-1));
      return { hash: sample.records[scenario === 'wrong-live-hash' ? 0 : number].hash };
    } };
    try {
      const action = () => capture(sample.plan, 1, auditRoot, output, dependencies);
      if (scenario === 'success') {
        const checkpoint = await action();
        assert.equal(hash(fs.readFileSync(checkpoint.proofFile)), checkpoint.proofSha256);
        assert.equal(fs.statSync(checkpoint.proofFile).mode & 0o777, 0o600);
        assert.equal(inspected, 2);
        assert.equal(requested, 5);
      } else {
        await assert.rejects(action);
        assert.equal(fs.existsSync(path.join(output, 'proof.json')), false);
        if (['existing-output', 'exited', 'signature-bypass'].includes(scenario)) {
          assert.equal(requested, 0);
        }
      }
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
