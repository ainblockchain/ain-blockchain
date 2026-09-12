const assert = require('assert/strict');
const fs = require('fs');
const { execFileSync } = require('child_process');

async function request(port, endpoint) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/${endpoint}`, {
      signal: AbortSignal.timeout(15000),
    });
    assert.ok(response.ok, `HTTP ${response.status}`);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      assert.ok(bytes <= 1024 * 1024, 'status response too large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch (error) {
    return { error: error.message };
  }
}

async function main() {
  const [planPath, output] = process.argv.slice(2);
  assert.ok(output && !fs.existsSync(output), 'pass a plan and NEW output file');
  const plan = JSON.parse(fs.readFileSync(planPath));
  assert.ok(Number.isSafeInteger(plan.snapshotNumber));
  assert.match(plan.originalFinalHash, /^0x[a-f0-9]{64}$/);
  const names = Array.from({ length: 10 }, (_, index) => `ain-cert-docker-node${index}-1`);
  const inspected = JSON.parse(execFileSync('docker', ['inspect', ...names], {
    maxBuffer: 4 * 1024 * 1024,
  }));
  const startedAt = new Date().toISOString();
  const nodes = await Promise.all(inspected.map(async (container, index) => {
    const port = 18081 + index;
    const [health, status, height, original] = container.State.Running ? await Promise.all([
      request(port, 'health_check'), request(port, 'node_status'),
      request(port, 'last_block_number'),
      request(port, `get_block_by_number?number=${plan.snapshotNumber}`),
    ]) : [];
    const errors = [health, status, height, original].map(value => value?.error).filter(Boolean);
    return { index, name: container.Name, id: container.Id, image: container.Image,
      pid: container.State.Pid, startedAt: container.State.StartedAt,
      running: container.State.Running, exitCode: container.State.ExitCode,
      dockerHealth: container.State.Health?.Status, nativeHealth: health === true,
      state: status?.result?.state || null, lastNumber: height?.result ?? null,
      originalHash: original?.result?.hash || null,
      originalPreserved: original?.result?.hash === plan.originalFinalHash,
      stagedImage: container.Image === plan.image,
      signatureBypassDisabled: container.Config.Env.includes('ENABLE_TX_SIG_VERIF_WORKAROUND=false'),
      errors };
  }));
  const nativeAllHealthy = nodes.every(node => node.running && node.nativeHealth &&
    node.state === 'SERVING' && node.originalPreserved && node.signatureBypassDisabled);
  const result = { startedAt, completedAt: new Date().toISOString(),
    scope: 'read-only operator observation; not a performance test or proof of block advancement',
    nativeAllHealthy, nodes };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, nativeAllHealthy,
    nodes: nodes.map(({ index, running, state, nativeHealth, lastNumber }) =>
      ({ index, running, state, nativeHealth, lastNumber })) }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
