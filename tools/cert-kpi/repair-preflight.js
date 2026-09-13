const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { verifyHistory } = require('./capture-finalized-checkpoint');

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function validate(plan, index, containers, readFile = fs.readFileSync, now = Date.now(),
    terminalRecovery = false) {
  const repair = plan.repair;
  assert.equal(repair?.kind, 'bounded-consensus-gossip');
  assert.ok(repair.checkpointKind === undefined || repair.checkpointKind === 'finalized-history');
  assert.match(repair.runId, /^[a-z0-9][a-z0-9_-]{0,40}$/);
  assert.ok(repair.reason.length >= 20);
  assert.ok(Array.isArray(plan.order) && new Set(plan.order).size === plan.order.length);
  assert.ok(plan.order.includes(index), 'node is outside this repair phase');
  assert.equal(repair.bridges.length, 2, 'two live bridges required');
  assert.equal(new Set(repair.bridges.map((bridge) => bridge.index)).size, 2);
  assert.ok(repair.bridges.every((bridge) => !plan.order.includes(bridge.index)),
      'a preserved bridge cannot be a replacement target');
  assert.ok(repair.bridges.some((bridge) => bridge.index === plan.bridgeIndex &&
    bridge.containerId === plan.bridgeContainerId), 'primary bridge must match a live checkpoint');
  const original = repair.originalContainers.find((entry) => entry.index === index);
  const current = containers.find((entry) => entry.index === index);
  assert.ok(original && current);
  assert.equal(current.id, original.id, 'target instance changed');
  assert.equal(current.image, original.image, 'target image changed');
  assert.notEqual(current.image, plan.image, 'target already uses the requested image');
  let terminalTime;
  if (terminalRecovery) {
    const terminal = repair.terminalTargets?.find((entry) => entry.index === index);
    assert.equal(terminal?.kind, 'heap-exhaustion', 'explicit terminal heap recovery required');
    assert.equal(current.running, false);
    assert.equal(current.status, 'exited');
    assert.equal(current.pid, 0);
    assert.ok(Number.isInteger(current.exitCode) && current.exitCode >= 128 &&
      current.exitCode <= 255);
    assert.equal(terminal.containerId, current.id);
    assert.equal(terminal.exitCode, current.exitCode);
    assert.equal(terminal.finishedAt, current.finishedAt);
    terminalTime = Date.parse(current.finishedAt);
    assert.ok(terminalTime > Date.parse(current.startedAt) && terminalTime <= now);
    const terminalLog = readFile(terminal.logFile);
    assert.equal(hash(terminalLog), terminal.logSha256, 'terminal evidence changed');
    assert.match(String(terminalLog), /FATAL ERROR:.*heap/i);
  } else {
    assert.equal(current.running, true, 'planned repair only replaces a live known instance');
  }
  assert.equal(current.pid, original.pid, 'target restarted since planning');
  assert.equal(current.startedAt, original.startedAt);
  assert.equal(current.signatureBypassDisabled, true);
  assert.equal(String(readFile(path.join(repair.tests, 'exit-code.txt'))).trim(), '0');
  assert.equal(String(readFile(path.join(repair.tests, 'image-id.txt'))).trim(), plan.image);
  assert.equal(JSON.parse(readFile(path.join(repair.tests, 'runtime-source.json'))).pass, true);
  assert.ok(Array.isArray(repair.requiredPending) && repair.requiredPending.length > 0);
  const verifyCheckpoint = (checkpoint, expectedImage) => {
    assert.ok(checkpoint, 'a retained-tail checkpoint is required before the next node');
    const instance = containers.find((entry) => entry.index === checkpoint.index);
    assert.ok(instance?.running, 'checkpoint process is no longer running');
    assert.equal(instance.id, checkpoint.containerId);
    assert.equal(instance.pid, checkpoint.pid);
    assert.equal(instance.startedAt, checkpoint.startedAt);
    assert.equal(instance.signatureBypassDisabled, true);
    if (expectedImage) assert.equal(instance.image, expectedImage);
    const proofBytes = readFile(checkpoint.proofFile);
    assert.equal(hash(proofBytes), checkpoint.proofSha256, 'checkpoint proof changed');
    const proof = JSON.parse(proofBytes);
    assert.equal(proof.pass, true);
    if (repair.checkpointKind === 'finalized-history') {
      assert.equal(instance.image, checkpoint.image);
      return verifyHistory(plan, checkpoint, proof, readFile, now, terminalTime);
    }
    assert.equal(checkpoint.kind, undefined, 'unexpected checkpoint kind');
    assert.equal(proof.signatureBypass, false);
    assert.equal(proof.nodeState, 'SERVING');
    assert.equal(proof.consensusState, 'RUNNING');
    assert.equal(proof.finalizedNumber, plan.snapshotNumber);
    assert.equal(proof.finalizedHash, plan.originalFinalHash);
    assert.equal(proof.address, checkpoint.address);
    assert.equal(hash(readFile(checkpoint.captureFile)), proof.captureSha256,
        'private capture changed after native verification');
    const captureTime = Date.parse(proof.captureAt);
    assert.ok(Number.isFinite(captureTime) && captureTime <= now && now - captureTime <= 900000,
        'retained-tail checkpoint must be at most fifteen minutes old');
    if (terminalRecovery) {
      assert.ok(captureTime > terminalTime, 'checkpoint must follow the confirmed terminal event');
    }
    const retained = new Set(proof.records.map((record) => record.hash));
    assert.ok(repair.requiredPending.every((blockHash) => retained.has(blockHash)),
        'checkpoint lost an original pending block');
    assert.ok(proof.tipHashes.length > 0);
    return { index: checkpoint.index, containerId: checkpoint.containerId,
      proofSha256: checkpoint.proofSha256, captureAt: proof.captureAt,
      tipHashes: proof.tipHashes, originalPendingRetained: repair.requiredPending.length };
  };
  const bridges = repair.bridges.map((checkpoint) => verifyCheckpoint(checkpoint));
  const previous = plan.order.slice(0, plan.order.indexOf(index)).map((prior) => {
    const checkpoint = repair.checkpoints?.find((entry) => entry.index === prior);
    return verifyCheckpoint(checkpoint, plan.image);
  });
  return { at: new Date(now).toISOString(), pass: true, target: index, bridges, previous,
    terminalRecovery,
    scope: 'planned software repair with two preserved live signed-history bridges; ' +
      'not native consensus health, finalized progress or permission for funding/KPI traffic' };
}

function inspect() {
  const names = Array.from({ length: 10 }, (_, index) => `ain-cert-docker-node${index}-1`);
  return JSON.parse(execFileSync('docker', ['inspect', ...names], {
    maxBuffer: 8 * 1024 ** 2,
  })).map((container, index) => ({ index, id: container.Id, image: container.Image,
    pid: container.State.Pid, startedAt: container.State.StartedAt,
    running: container.State.Running, status: container.State.Status,
    exitCode: container.State.ExitCode, finishedAt: container.State.FinishedAt,
    oomKilled: container.State.OOMKilled,
    signatureBypassDisabled:
      container.Config.Env.includes('ENABLE_TX_SIG_VERIF_WORKAROUND=false') }));
}

if (require.main === module) {
  try {
    const [, , filename, index] = process.argv;
    assert.match(index, /^[0-9]$/);
    const plan = JSON.parse(fs.readFileSync(filename));
    console.log(JSON.stringify(validate(plan, Number(index), inspect(), fs.readFileSync,
        Date.now(), process.env.RECOVER_CRASHED === '1')));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { hash, validate, inspect };
