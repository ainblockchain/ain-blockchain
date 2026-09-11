// M5: 모델 100종 구동 + 추론 3회 + 온체인 기록·역검증
// GPU 풀(기본 6 동시) 오케스트레이터. 이미 온체인 검증된 모델은 스킵(재개 가능).
// 실행: CONC=6 node m5-models.js
const { newAin, APP, writeResult, sleep } = require('./common');
const { spawn, execSync } = require('child_process');
const fs = require('fs');

const MODELS = JSON.parse(fs.readFileSync(`${__dirname}/models100.json`));
const BASE = `/apps/${APP}/model_inference`;
const CONC = parseInt(process.env.CONC || '6', 10);
const { RESULTS_DIR, KPI_DIR } = require('./common');
const VLLM = process.env.VLLM || 'vllm';
const HF_HOME = process.env.HF_HOME || `${KPI_DIR}/hf-home`;
const LOGDIR = `${KPI_DIR}/logs/m5`;
fs.mkdirSync(LOGDIR, { recursive: true });

// AIN DB 경로 라벨은 '.' 불허 (setValue code 10102 Invalid value path) → 영숫자/_/- 만 허용
const safeName = id => id.replace(/^\//, 'local_').replace(/[^A-Za-z0-9_\-]/g, '_');
const ains = Array.from({ length: 8 }, (_, i) => newAin(i % 10, null, 12 + (i % 8)));

// 모델 config.json 에서 컨텍스트 상한을 읽어 max-model-len 을 결정 (gpt2 계열 1024 등)
function derivedMaxLen(id) {
  const cands = [];
  if (id.startsWith('/')) cands.push(`${id}/config.json`);
  else {
    const snap = `${HF_HOME}/hub/models--${id.replace('/', '--')}/snapshots`;
    try { for (const d of fs.readdirSync(snap)) cands.push(`${snap}/${d}/config.json`); } catch {}
  }
  for (const f of cands) {
    try {
      const c = JSON.parse(fs.readFileSync(f));
      const v = c.max_position_embeddings || c.n_positions || c.max_sequence_length || c.seq_length || c.max_seq_len;
      if (v) return Math.floor(Number(v));
    } catch {}
  }
  return null;
}

// GPU 에 남은 컴퓨트 프로세스(EngineCore 등 고아) 정리 후 메모리 해제 대기
function gpuPids(gpu) {
  try {
    return execSync(`nvidia-smi --id=${gpu} --query-compute-apps=pid --format=csv,noheader`).toString()
      .split('\n').map(x => parseInt(x, 10)).filter(x => x > 0);
  } catch { return []; }
}
async function cleanupGpu(gpu) {
  for (let i = 0; i < 15; i++) {
    const pids = gpuPids(gpu);
    if (pids.length === 0) return;
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    await sleep(2000);
  }
}

async function healthUp(port, proc, timeoutMs = 1200 * 1000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (proc.exitCode !== null) return false;          // 서버 조기 종료
    try {
      const r = await fetch(`http://localhost:${port}/v1/models`);
      if (r.ok) return true;
    } catch {}
    await sleep(4000);
  }
  return false;
}

async function alreadyVerified(ain, m) {
  const v = await ain.db.ref(`${BASE}/${safeName(m.id)}/iteration_3`).getValue().catch(() => null);
  return v && v.modelName === m.id;
}

async function runModel(m, gpu) {
  const ain = ains[gpu];
  if (await alreadyVerified(ain, m)) return { model: m.id, ok: true, skipped: true };

  const port = 8100 + gpu;
  const t0 = Date.now();
  const logf = fs.openSync(`${LOGDIR}/${safeName(m.id)}.log`, 'w');
  const maxLen = Math.min(2048, derivedMaxLen(m.id) || 2048);
  const args = ['serve', m.id, '--port', String(port), '--host', '127.0.0.1',
    '--max-model-len', String(maxLen), '--gpu-memory-utilization', '0.9',
    '--served-model-name', 'target', '--enforce-eager'];
  if (m.trc) args.push('--trust-remote-code');
  const proc = spawn(VLLM, args, {
    env: { ...process.env, CUDA_VISIBLE_DEVICES: String(gpu), HF_HOME, HF_HUB_DISABLE_XET: '1', VLLM_LOGGING_LEVEL: 'WARNING' },
    stdio: ['ignore', logf, logf], detached: true,
  });
  try {
    if (!(await healthUp(port, proc))) throw new Error('serve failed/timeout');
    const results = [];
    for (let it = 1; it <= 3; it++) {
      const r = await fetch(`http://localhost:${port}/v1/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'target', prompt: `Q: What is ${it} plus ${it}? A:`, max_tokens: 16, temperature: 0.7 }),
        signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error(`inference HTTP ${r.status}`);
      const j = await r.json();
      results.push({ iteration: it, tokensGenerated: j.usage.completion_tokens, inferenceOk: true });
    }
    for (const rr of results) {
      const res = await ain.db.ref(`${BASE}/${safeName(m.id)}/iteration_${rr.iteration}`).setValue({
        value: { modelName: m.id, iteration: rr.iteration, tokensGenerated: rr.tokensGenerated, timestamp: Date.now() },
        gas_price: 1, nonce: -1,
      });
      if (!res.tx_hash || res.result.code !== 0) throw new Error('onchain record failed');
    }
    await sleep(3000);
    for (const rr of results) {
      const v = await ain.db.ref(`${BASE}/${safeName(m.id)}/iteration_${rr.iteration}`).getValue();
      if (!v || v.modelName !== m.id) throw new Error('onchain verify failed');
    }
    return { model: m.id, ok: true, elapsedS: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    return { model: m.id, ok: false, error: String(e.message).slice(0, 200), elapsedS: Math.round((Date.now() - t0) / 1000) };
  } finally {
    try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
    fs.closeSync(logf);
    await sleep(3000);
    await cleanupGpu(gpu);   // EngineCore 고아 프로세스 정리 + GPU 메모리 해제 대기
  }
}

(async () => {
  const queue = [...MODELS];
  const report = [];
  const outFile = `${RESULTS_DIR}/m5-progress.json`;
  let done = 0;
  async function slot(gpu) {
    while (queue.length > 0) {
      const m = queue.shift();
      const r = await runModel(m, gpu);
      report.push(r); done++;
      console.log(`[${done}/${MODELS.length}] gpu${gpu} ${r.ok ? 'OK ' : 'FAIL'} ${m.id}${r.skipped ? ' (skip)' : ''}${r.error ? ' :: ' + r.error : ''}`);
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    }
  }
  // CONC개 GPU 슬롯만 사용 (0..CONC-1)
  await Promise.all(Array.from({ length: CONC }, (_, g) => slot(g)));
  const ok = report.filter(r => r.ok).length;
  const final = {
    metric: 'M5_model_support', target: 100, attempted: MODELS.length,
    supported: ok, failed: report.filter(r => !r.ok).map(r => ({ model: r.model, error: r.error })),
    pass: ok >= 100,
  };
  writeResult('m5-final', final);
  console.log(JSON.stringify({ ...final, failed: final.failed.length }, null, 2));
  process.exit(final.pass ? 0 : 1);
})();
