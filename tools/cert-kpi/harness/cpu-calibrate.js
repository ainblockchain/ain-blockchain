const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

if (!isMainThread) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const payload = Buffer.alloc(4096, 42);
  const message = Buffer.concat([Buffer.alloc(24), crypto.createHash('sha256').update(payload).digest()]);
  parentPort.postMessage({ ready: true });
  parentPort.once('message', ({ startAt, durationMs }) => {
    setTimeout(() => {
      const startedAt = performance.now();
      let operations = 0;
      do {
        for (let iteration = 0; iteration < 32; iteration++) {
          const signature = crypto.sign(null, message, privateKey);
          if (!crypto.verify(null, message, publicKey, signature)) throw new Error('signature verification failed');
          crypto.createHash('sha256').update(message).update(signature).digest();
          operations++;
        }
      } while (performance.now() - startedAt < durationMs);
      parentPort.postMessage({ worker: workerData.index, operations, elapsedMs: performance.now() - startedAt });
      parentPort.close();
    }, Math.max(0, startAt - Date.now()));
  });
} else {
  async function measure(workers, durationMs) {
    const pool = Array.from({ length: workers }, (_, index) => new Worker(__filename, { workerData: { index } }));
    try {
      await Promise.all(pool.map(worker => new Promise((resolve, reject) => {
        worker.once('message', resolve); worker.once('error', reject);
      })));
      const responses = pool.map(worker => new Promise((resolve, reject) => {
        worker.once('message', resolve); worker.once('error', reject);
      }));
      const startAt = Date.now() + 100;
      for (const worker of pool) worker.postMessage({ startAt, durationMs });
      const results = await Promise.all(responses);
      const elapsedMs = Math.max(...results.map(result => result.elapsedMs));
      const operations = results.reduce((total, result) => total + result.operations, 0);
      return { workers, operations, elapsedMs, operationsPerSecond: operations * 1000 / elapsedMs, results };
    } finally { await Promise.all(pool.map(worker => worker.terminate())); }
  }
  async function main() {
    const seconds = Number(process.env.CPU_SECONDS || 5);
    const workers = Number(process.env.CPU_WORKERS || os.availableParallelism());
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300 || !Number.isInteger(workers) || workers < 1 || workers > 320) throw new Error('invalid calibration parameters');
    const cgroup = {};
    for (const name of ['cpu.max', 'cpuset.cpus.effective', 'memory.max', 'cpu.stat']) {
      try { cgroup[name] = fs.readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim(); } catch { cgroup[name] = null; }
    }
    const report = { schema: 1, workload: 'Ed25519 sign+verify of 24B header and SHA256(4KiB payload), then SHA256 state update; CPU calibration only, not KPI TPS',
      sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
      measuredAt: new Date().toISOString(), node: process.version, openssl: process.versions.openssl,
      cpu: os.cpus()[0].model, exposedCpus: os.cpus().length, affinityCpus: os.availableParallelism(),
      cgroup, loadBefore: os.loadavg(), runs: [], awsReferenceMeasured: false, performanceConversionFactor: null };
    for (let repeat = 0; repeat < 3; repeat++) {
      report.runs.push({ repeat, ...await measure(1, seconds * 1000) });
      if (workers !== 1) report.runs.push({ repeat, ...await measure(workers, seconds * 1000) });
    }
    report.loadAfter = os.loadavg();
    console.log(JSON.stringify(report, null, 2));
  }
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
