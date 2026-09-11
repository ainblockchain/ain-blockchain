const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

async function main() {
  const [directory, capturePath, verificationPath] = process.argv.slice(2);
  const planPath = path.join(directory, 'plan.json');
  const composePath = path.join(directory, 'compose.json');
  const originalPlan = fs.readFileSync(planPath);
  const originalCompose = fs.readFileSync(composePath);
  const plan = JSON.parse(originalPlan);
  assert.equal(plan.bridgeIndex, undefined, 'bridge handoff already staged');
  const verified = JSON.parse(fs.readFileSync(verificationPath));
  assert.equal(verified.pass, true);
  assert.equal(verified.signatureBypass, false);
  assert.equal(verified.finalizedHash, plan.originalFinalHash);
  assert.ok(verified.lastNumber > plan.snapshotNumber);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(capturePath)).digest('hex'),
      verified.captureSha256);
  const captureAge = Date.now() - Date.parse(verified.captureAt);
  assert.ok(Number.isFinite(captureAge) && captureAge >= 0 && captureAge < 15 * 60 * 1000);
  const [original, canary] = JSON.parse(execFileSync('docker', ['inspect',
    'ain-cert-docker-node0-1', 'ain-cert-docker-node1-1']));
  assert.equal(original.State.Running, false);
  assert.equal(original.State.Status, 'exited');
  assert.ok(original.State.ExitCode >= 128, 'handoff requires a recorded original bridge crash');
  assert.equal(canary.State.Running, true);
  assert.equal(canary.Image, plan.image);
  const response = await fetch('http://127.0.0.1:18082/node_status', {
    signal: AbortSignal.timeout(60000),
  });
  assert.ok(response.ok);
  const status = await response.json();
  assert.equal(status.result.state, 'SERVING');
  assert.equal(status.result.address, verified.address);
  fs.writeFileSync(path.join(directory, 'plan-before-bridge-handoff.json'), originalPlan,
      { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(path.join(directory, 'compose-before-bridge-handoff.json'), originalCompose,
      { flag: 'wx', mode: 0o600 });
  plan.bridgeIndex = 1;
  plan.bridgeContainerId = canary.Id;
  plan.bridgeHandoff = { at: new Date().toISOString(), oldBridgeId: original.Id,
    oldBridgeExit: original.State.ExitCode, oldBridgeFinishedAt: original.State.FinishedAt,
    captureSha256: verified.captureSha256, tipHash: verified.lastHash,
    tipNumber: verified.lastNumber,
    reason: 'original bridge crashed; native canary retained tail' };
  const compose = JSON.parse(originalCompose);
  for (const service of Object.values(compose.services)) {
    service.environment.PEER_CANDIDATE_JSON_RPC_URL = 'http://localhost:18082/json-rpc';
  }
  fs.writeFileSync(`${composePath}.handoff`, JSON.stringify(compose, null, 2) + '\n');
  fs.renameSync(`${composePath}.handoff`, composePath);
  fs.writeFileSync(`${planPath}.handoff`, JSON.stringify(plan, null, 2) + '\n');
  fs.renameSync(`${planPath}.handoff`, planPath);
  console.log(JSON.stringify({ stagedOnly: true, bridgeIndex: 1, pendingTip: verified.lastNumber,
    reason: plan.bridgeHandoff.reason, restartedContainers: 0 }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
