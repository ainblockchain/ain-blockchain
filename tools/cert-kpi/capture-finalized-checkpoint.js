const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function recent(timestamp, now) {
  const time = Date.parse(timestamp);
  assert.ok(Number.isFinite(time) && time <= now && now - time <= 900000,
      'finalized checkpoint and audit must be at most fifteen minutes old');
  return time;
}

function verifyHistory(plan, checkpoint, proof, readFile = fs.readFileSync,
    now = Date.now(), terminalTime) {
  assert.equal(checkpoint.kind, 'finalized-history');
  assert.equal(proof.kind, checkpoint.kind);
  assert.equal(proof.pass, true);
  const expected = { index: checkpoint.index, id: checkpoint.containerId, pid: checkpoint.pid,
    startedAt: checkpoint.startedAt, image: checkpoint.image, running: true,
    signatureBypassDisabled: true };
  assert.deepEqual(proof.instanceBefore, expected, 'checkpoint instance differs');
  assert.deepEqual(proof.instanceAfter, expected, 'instance changed during capture');
  assert.ok(Number.isInteger(expected.pid) && expected.pid > 0);
  assert.equal(proof.address, checkpoint.address);
  assert.equal(proof.nodeState, 'SERVING');
  assert.equal(proof.consensusState, 'RUNNING');
  assert.equal(proof.nativeHealth, true);
  assert.equal(proof.signatureBypass, false);
  const capturedAt = recent(proof.captureAt, now);
  assert.equal(String(readFile(proof.audit.imageFile)).trim(), plan.image);
  assert.equal(String(readFile(proof.audit.exitFile)).trim(), '0');
  const summaryBytes = readFile(proof.audit.summaryFile);
  assert.equal(hash(summaryBytes), proof.audit.summarySha256, 'audit summary changed');
  const summary = JSON.parse(summaryBytes);
  assert.equal(summary.pass, true);
  assert.equal(summary.error, null);
  assert.equal(summary.signatureBypass, false);
  assert.equal(summary.chainId, 0);
  const auditStarted = recent(summary.startedAt, now);
  const auditCompleted = recent(summary.completedAt, now);
  assert.ok(auditStarted >= Date.parse(expected.startedAt) && auditCompleted >= auditStarted &&
    capturedAt >= auditCompleted, 'audit must belong to this live instance and precede capture');
  if (terminalTime !== undefined) {
    assert.ok(auditStarted > terminalTime, 'audit must follow the confirmed terminal event');
  }
  const manifestBytes = readFile(proof.audit.manifestFile);
  assert.ok(manifestBytes.length <= 128 * 1024 ** 2, 'audit manifest too large');
  assert.equal(hash(manifestBytes), summary.manifestSha256, 'audit manifest changed');
  const records = String(manifestBytes).trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(Number.isSafeInteger(summary.requestedLastNumber) &&
    summary.requestedLastNumber > plan.snapshotNumber);
  assert.equal(records.length, summary.requestedLastNumber + 1);
  assert.equal(summary.blocksVerified, records.length);
  records.forEach((record, number) => {
    assert.equal(record.number, number, 'noncontiguous audited history');
    assert.match(record.hash, /^0x[a-f0-9]{64}$/);
    assert.match(record.fileSha256, /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0);
    if (number) assert.equal(record.parentHash, records[number - 1].hash, 'broken audit linkage');
  });
  assert.equal(records[0].hash, plan.genesisHash);
  assert.equal(summary.genesisHash, plan.genesisHash);
  assert.equal(records[plan.snapshotNumber].hash, plan.originalFinalHash);
  assert.equal(records[plan.snapshotNumber].stateProofHash, plan.originalStateProof);
  assert.equal(records.at(-1).hash, summary.lastHash);
  assert.equal(proof.auditedNumber, summary.requestedLastNumber);
  assert.equal(proof.auditedHash, summary.lastHash, 'live node has a different audited block');
  assert.equal(proof.originalHash, plan.originalFinalHash);
  assert.ok(Number.isSafeInteger(proof.finalizedNumber) &&
    proof.finalizedNumber >= summary.requestedLastNumber, 'live finalized head behind audit');
  const retained = new Set(records.map((record) => record.hash));
  assert.ok(plan.repair.requiredPending.every((blockHash) => retained.has(blockHash)),
      'original pending block missing from finalized history');
  return { index: checkpoint.index, containerId: checkpoint.containerId,
    kind: checkpoint.kind, proofSha256: checkpoint.proofSha256, captureAt: proof.captureAt,
    auditedNumber: proof.auditedNumber, auditedHash: proof.auditedHash,
    originalPendingFinalized: plan.repair.requiredPending.length,
    scope: 'retained native-audited finalized history and same-instance RPC; not full DB replay' };
}

function inspect(index) {
  const container = JSON.parse(execFileSync('docker', ['inspect',
    `ain-cert-docker-node${index}-1`], { maxBuffer: 2 * 1024 ** 2 }))[0];
  return { index, id: container.Id, pid: container.State.Pid,
    startedAt: container.State.StartedAt, image: container.Image,
    running: container.State.Running, signatureBypassDisabled:
      container.Config.Env.includes('ENABLE_TX_SIG_VERIF_WORKAROUND=false') };
}

async function request(index, endpoint) {
  const response = await fetch(`http://127.0.0.1:${18081 + index}/${endpoint}`, {
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `RPC HTTP ${response.status}`);
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    assert.ok(length <= 2 * 1024 ** 2, 'RPC status exceeds limit');
    chunks.push(chunk);
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(payload.code, 0);
  return payload.result;
}

async function capture(plan, index, auditRoot, output, dependencies = {}) {
  const inspectNode = dependencies.inspect || inspect;
  const requestNode = dependencies.request || request;
  assert.ok(Number.isInteger(index) && index >= 0 && index <= 9);
  assert.equal(fs.existsSync(output), false, 'use a NEW checkpoint directory');
  assert.equal(fs.existsSync(auditRoot), true);
  const instanceBefore = inspectNode(index);
  assert.equal(instanceBefore.running, true);
  assert.equal(instanceBefore.signatureBypassDisabled, true);
  const summaryFile = path.join(auditRoot, `node${index}`, 'summary.json');
  const summaryBytes = fs.readFileSync(summaryFile);
  const summary = JSON.parse(summaryBytes);
  const [node, consensus, finalizedNumber, audited, original] = await Promise.all([
    requestNode(index, 'node_status'), requestNode(index, 'get_consensus_status'),
    requestNode(index, 'last_block_number'),
    requestNode(index, `get_block_by_number?number=${summary.requestedLastNumber}`),
    requestNode(index, `get_block_by_number?number=${plan.snapshotNumber}`),
  ]);
  const proof = { kind: 'finalized-history', pass: true, captureAt: new Date().toISOString(),
    instanceBefore, instanceAfter: inspectNode(index), address: node.address,
    nodeState: node.state, consensusState: consensus.state,
    nativeHealth: node.health === true && consensus.health === true, signatureBypass: false,
    finalizedNumber, auditedNumber: summary.requestedLastNumber, auditedHash: audited.hash,
    originalHash: original.hash, audit: { summaryFile, summarySha256: hash(summaryBytes),
      manifestFile: path.join(auditRoot, `node${index}`, 'blocks.jsonl'),
      imageFile: path.join(auditRoot, 'image-id.txt'),
      exitFile: path.join(auditRoot, 'exit-code.txt') } };
  const proofBytes = Buffer.from(JSON.stringify(proof, null, 2) + '\n');
  const checkpoint = { kind: proof.kind, index, containerId: instanceBefore.id,
    pid: instanceBefore.pid, startedAt: instanceBefore.startedAt, image: instanceBefore.image,
    address: proof.address, proofFile: path.join(output, 'proof.json'),
    proofSha256: hash(proofBytes) };
  verifyHistory(plan, checkpoint, proof);
  fs.mkdirSync(output, { mode: 0o700 });
  fs.writeFileSync(checkpoint.proofFile, proofBytes, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(output, 'checkpoint.json'), JSON.stringify(checkpoint, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
  return checkpoint;
}

if (require.main === module) {
  const [, , filename, index, auditRoot, output] = process.argv;
  Promise.resolve().then(() => {
    assert.match(index, /^[0-9]$/);
    assert.ok(filename && auditRoot && output);
    return capture(JSON.parse(fs.readFileSync(filename)), Number(index),
        path.resolve(auditRoot), path.resolve(output));
  }).then((checkpoint) => console.log(JSON.stringify(checkpoint))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { hash, verifyHistory, capture };
