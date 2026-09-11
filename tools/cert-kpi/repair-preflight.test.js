const assert = require('assert/strict');
const { test } = require('node:test');
const { hash, validate } = require('./repair-preflight');

function fixture() {
  const now = 1789145000000;
  const containers = [1, 2, 3, 8].map((index) => ({ index, id: `container-${index}`,
    image: 'old-image', pid: index + 100, startedAt: 'original-start',
    running: true, signatureBypassDisabled: true }));
  const files = new Map();
  const checkpoint = (index) => {
    const capture = Buffer.from(`private signed capture ${index}`);
    const proof = { pass: true, signatureBypass: false,
      captureAt: new Date(now - 1000).toISOString(),
      address: `address-${index}`, nodeState: 'SERVING', consensusState: 'RUNNING',
      finalizedNumber: 100, finalizedHash: 'original-final', captureSha256: hash(capture),
      records: [{ hash: 'pending-101' }, { hash: 'pending-102' }], tipHashes: ['pending-102'] };
    const proofFile = `/proof-${index}.json`;
    const captureFile = `/capture-${index}.json`;
    const proofBytes = Buffer.from(JSON.stringify(proof));
    files.set(proofFile, proofBytes);
    files.set(captureFile, capture);
    return { index, containerId: `container-${index}`, pid: index + 100,
      startedAt: 'original-start', address: proof.address, proofFile,
      proofSha256: hash(proofBytes), captureFile };
  };
  const plan = { image: 'new-image', snapshotNumber: 100, originalFinalHash: 'original-final',
    order: [2, 3], repair: { kind: 'bounded-consensus-gossip', runId: 'repair-test',
      reason: 'Verified oversized relay and queued consensus messages', tests: '/tests',
      requiredPending: ['pending-101', 'pending-102'],
      bridges: [checkpoint(1), checkpoint(8)], checkpoints: [],
      originalContainers: structuredClone(containers),
    } };
  files.set('/tests/exit-code.txt', Buffer.from('0\n'));
  files.set('/tests/image-id.txt', Buffer.from('new-image\n'));
  files.set('/tests/runtime-source.json', Buffer.from('{"pass":true}'));
  return { plan, containers, files, now, checkpoint,
    run: (index = 2) => validate(plan, index, containers, (filename) => {
      assert.ok(files.has(filename), 'fixture file missing');
      return files.get(filename);
    }, now) };
}

test('permits the first planned repair, not funding or a native-health claim', () => {
  const sample = fixture();
  const result = sample.run();
  assert.equal(result.pass, true);
  assert.equal(result.bridges.length, 2);
  assert.match(result.scope, /not native consensus health/);
});

test('a prior upgraded node must retain the signed original tail before advancing', () => {
  const sample = fixture();
  assert.throws(() => sample.run(3), /checkpoint/);
  sample.containers.find((entry) => entry.index === 2).image = 'new-image';
  sample.plan.repair.checkpoints.push(sample.checkpoint(2));
  assert.equal(sample.run(3).previous.length, 1);
});

for (const failure of ['bridge-target', 'one-bridge', 'dead-bridge', 'restarted-bridge',
  'changed-target', 'dead-target', 'already-applied', 'unverified-image',
  'failed-tests', 'altered-capture', 'altered-proof', 'wrong-prior-image']) {
  test(`refuses unsafe planned repair: ${failure}`, () => {
    const sample = fixture();
    const target = sample.containers.find((entry) => entry.index === 2);
    let index = 2;
    if (failure === 'bridge-target') sample.plan.order.push(1);
    if (failure === 'one-bridge') sample.plan.repair.bridges.pop();
    if (failure === 'dead-bridge') sample.containers[0].running = false;
    if (failure === 'restarted-bridge') sample.containers[0].pid++;
    if (failure === 'changed-target') target.id = 'different';
    if (failure === 'dead-target') target.running = false;
    if (failure === 'already-applied') target.image = 'new-image';
    if (failure === 'unverified-image') {
      sample.files.set('/tests/runtime-source.json', Buffer.from('{"pass":false}'));
    }
    if (failure === 'failed-tests') sample.files.set('/tests/exit-code.txt', Buffer.from('1'));
    if (failure === 'altered-capture') sample.files.set('/capture-1.json', Buffer.from('changed'));
    if (failure === 'altered-proof') sample.files.set('/proof-1.json', Buffer.from('{}'));
    if (failure === 'wrong-prior-image') {
      sample.plan.repair.checkpoints.push(sample.checkpoint(2));
      index = 3;
    }
    assert.throws(() => sample.run(index));
  });
}

for (const failure of ['stale', 'future', 'missing-tail', 'not-serving', 'signature-bypass',
  'wrong-final', 'wrong-address']) {
  test(`refuses an unsuitable native checkpoint: ${failure}`, () => {
    const sample = fixture();
    const proof = JSON.parse(sample.files.get('/proof-1.json'));
    if (failure === 'stale') proof.captureAt = new Date(sample.now - 900001).toISOString();
    if (failure === 'future') proof.captureAt = new Date(sample.now + 1).toISOString();
    if (failure === 'missing-tail') proof.records.pop();
    if (failure === 'not-serving') proof.nodeState = 'CHAIN_SYNCING';
    if (failure === 'signature-bypass') proof.signatureBypass = true;
    if (failure === 'wrong-final') proof.finalizedHash = 'other-final';
    if (failure === 'wrong-address') proof.address = 'other-address';
    const bytes = Buffer.from(JSON.stringify(proof));
    sample.files.set('/proof-1.json', bytes);
    sample.plan.repair.bridges[0].proofSha256 = hash(bytes);
    assert.throws(() => sample.run());
  });
}
