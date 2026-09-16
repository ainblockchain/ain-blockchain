const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert/strict');
const { PaymentChannel } = require('/opt/ain-js/lib/state-channel');
const { createPaymentPeer, postPayment } = require('/opt/ain-js/lib/state-channel/http-peer');
const mode = process.argv[2];
const directory = '/evidence';
const runId = process.env.RUN_ID;
const basePort = Number(process.env.CHANNEL_PORT || 19095);
const count = Number(process.env.CHANNELS || 20);
const durationMs = Number(process.env.DURATION_MS || 60000);
const cgroup = () => Object.fromEntries(['cpu.max', 'cpuset.cpus.effective', 'memory.max', 'memory.swap.max'].map(name =>
  [name, fs.readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim()]));

async function stateAt(index) {
  const response = await fetch(`http://127.0.0.1:${basePort + index}/state`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`channel ${index} unavailable`);
  return response.json();
}

async function main() {
  if (!runId || !/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('valid RUN_ID required');
  if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(durationMs) || durationMs < 1000) throw new Error('invalid load parameters');
  if (mode === 'init') {
    const openings = [];
    for (let index = 0; index < count; index++) {
      const keys = [crypto.generateKeyPairSync('ed25519'), crypto.generateKeyPairSync('ed25519')];
      for (const [participant, role] of ['client', 'server'].entries()) {
        fs.writeFileSync(`/secrets/${role}/${index}.pem`, keys[participant].privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600, flag: 'wx' });
      }
      openings.push({ channelId: `${runId}_${index}`, balances: ['10000000', '10000000'],
        publicKeys: keys.map(key => key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')) });
    }
    fs.writeFileSync(`${directory}/initial.json`, JSON.stringify({ runId, openings }), { flag: 'wx' });
    return;
  }
  const prepared = JSON.parse(fs.readFileSync(`${directory}/prepared.json`));
  assert.equal(prepared.runId, runId);
  assert.equal(prepared.openings.length, count);
  if (mode === 'server') {
    const current = await (await fetch(`http://127.0.0.1:18086/get_value?ref=${encodeURIComponent(prepared.path)}&is_final=true`)).json();
    assert.deepEqual(current.result, prepared.value);
    const block = await (await fetch(`http://127.0.0.1:18090/get_block_by_number?number=${prepared.verified.blockNumber}`)).json();
    assert.ok(block.result?.transactions?.some(transaction => transaction.hash === prepared.verified.txHash));
    fs.writeFileSync(`${directory}/server-opening-check.json`, JSON.stringify({ pass: true, cgroup: cgroup(),
      independentReader: 'node5', blockReader: 'node9', txHash: prepared.verified.txHash, block: prepared.verified.blockNumber }));
    for (const [index, opening] of prepared.openings.entries()) {
      const channel = new PaymentChannel(opening);
      const file = `${directory}/journal-${index}.jsonl`;
      if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) channel.commit(JSON.parse(line));
      const descriptor = fs.openSync(file, 'a');
      const key = crypto.createPrivateKey(fs.readFileSync(`/private/${index}.pem`));
      createPaymentPeer(channel, key, async receipt => {
        fs.writeSync(descriptor, JSON.stringify(receipt) + '\n');
        fs.fsyncSync(descriptor);
      }).listen(basePort + index, '127.0.0.1', () => console.log(`channel ${index} ready`));
    }
    return;
  }
  if (mode !== 'client') throw new Error('mode must be init, server or client');
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await Promise.all(prepared.openings.map((opening, index) => stateAt(index))); break; }
    catch (error) { if (attempt === 99) throw error; await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  const startedMs = Date.now();
  const deadline = performance.now() + durationMs;
  const perSecond = Array(Math.ceil(durationMs / 1000)).fill(0);
  const latenciesMs = [];
  let acknowledged = 0;
  let failures = 0;
  let drainAcknowledged = 0;
  const channels = await Promise.all(prepared.openings.map(async (opening, index) => {
    const channel = new PaymentChannel(opening);
    const key = crypto.createPrivateKey(fs.readFileSync(`/private/${index}.pem`));
    const errors = [];
    while (performance.now() < deadline) {
      const proposal = channel.propose(0, '1', key);
      const started = performance.now();
      try {
        const receipt = await postPayment(`http://127.0.0.1:${basePort + index}`, proposal);
        channel.commit(receipt);
        const completed = performance.now();
        latenciesMs.push(completed - started);
        acknowledged++;
        if (completed < deadline) perSecond[Math.floor((completed - (deadline - durationMs)) / 1000)]++;
        else drainAcknowledged++;
      } catch (error) {
        failures++;
        errors.push({ sequence: proposal.state.sequence, message: error.message });
        break;
      }
    }
    const remote = await stateAt(index);
    const local = channel.snapshot();
    return { index, openingHash: local.openingHash, state: local, remote,
      agrees: JSON.stringify(local) === JSON.stringify(remote), errors };
  }));
  const elapsedMs = Date.now() - startedMs;
  const sorted = [...latenciesMs].sort((left, right) => left - right);
  const percentile = fraction => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : null;
  const measured = perSecond.reduce((total, value) => total + value, 0);
  const report = { runId, targetTPS: 7000, requestedDurationMs: durationMs, elapsedIncludingDrainMs: elapsedMs,
    channelCount: count, participants: count * 2, clientCgroup: cgroup(), acknowledged, measured, drainAcknowledged, failures,
    perSecond, averageTPS: measured / (durationMs / 1000), peakTPS: Math.max(0, ...perSecond),
    latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) }, channels,
    correctness: failures === 0 && channels.every(channel => channel.agrees),
    performancePass: measured / (durationMs / 1000) >= 7000 && failures === 0,
    scope: 'separate Docker sender/receiver, signed integer credit simulation, fsync before every acknowledgement; opening and final checkpoint onchain, not AIN escrow or dispute adjudication' };
  fs.writeFileSync(`${directory}/load-result.json`, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ runId, acknowledged, averageTPS: report.averageTPS, peakTPS: report.peakTPS,
    correctness: report.correctness, performancePass: report.performancePass }));
  process.exitCode = report.correctness ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
