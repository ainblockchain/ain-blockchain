// M4 run C 검증: recorder 큐 드레인 대기 → id 덤프 → 온체인 샘플 역검증 → 최종 리포트
const fs = require('fs');
const { newAin, APP, writeResult, sleep, RESULTS_DIR } = require('./common');

const RUN = process.env.M4_RUN || 'cert';
const PROBE_JSON = process.argv[2];   // m4-lightclient-<tag>.json
const BASE = `/apps/${APP}/inference_results_v2/${RUN}`;

function shardOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h >>> 0) % 512;
}

(async () => {
  // 1) recorder 큐 드레인 대기 (최대 10분)
  for (let i = 0; i < 120; i++) {
    let queued = 0;
    for (const p of [9100, 9101]) {
      try { queued += (await (await fetch(`http://localhost:${p}/stats`)).json()).queued; } catch {}
    }
    if (queued === 0) break;
    if (i % 10 === 0) console.log(`draining... queued=${queued}`);
    await sleep(5000);
  }
  const stats = [];
  for (const p of [9100, 9101]) {
    stats.push(await (await fetch(`http://localhost:${p}/stats`)).json());
    await fetch(`http://localhost:${p}/dump`);
  }
  // 제출 완료 ≠ 최종화: 수신 노드 tx 풀 소진 + 3블록 추가 확정까지 대기 (최대 10분)
  for (let i = 0; i < 120; i++) {
    let pool = 0;
    for (const port of [8082, 8083]) {
      try {
        const r = await (await fetch(`http://localhost:${port}/tx_pool_size_util`)).json();
        pool += r.result.used;
      } catch {}
    }
    if (pool === 0) break;
    if (i % 6 === 0) console.log(`pool draining... ${pool}`);
    await sleep(5000);
  }
  const b0 = (await (await fetch('http://localhost:8081/last_block_number')).json()).result;
  for (let i = 0; i < 60; i++) {
    const b = (await (await fetch('http://localhost:8081/last_block_number')).json()).result;
    if (b >= b0 + 3) break;
    await sleep(3000);
  }

  // 2) 온체인 샘플 100건 역검증
  const ain = newAin(3, null, 16);
  let verified = 0, sampled = 0;
  for (const rid of [0, 1]) {
    const ids = JSON.parse(fs.readFileSync(`${RESULTS_DIR}/recorded_ids_${rid}.json`));
    const step = Math.max(1, Math.floor(ids.length / 50));
    const sample = ids.filter((_, i) => i % step === 0).slice(0, 50);
    for (const id of sample) {
      sampled++;
      const v = await ain.db.ref(`${BASE}/s${shardOf(id)}/${id}`).getValue().catch(() => null);
      if (v && v.t) verified++;
    }
  }

  const probe = JSON.parse(fs.readFileSync(PROBE_JSON));
  const totalRecorded = stats.reduce((a, s) => a + (s ? s.recorded : 0), 0);
  const report = {
    metric: 'M4_inference_tps', target: 1000,
    methodology: 'closed-loop light client (single-process, Node) round-robin over 8 vLLM servers (gpt-oss-20b, A100x8), max_tokens=512 stop=["\\n","."], async on-chain recording via 512-way sharded multi-op SET batches; chain(10 validators, epoch 1s) pinned cores 0-2',
    concurrency: probe.conc, durationS: probe.secs,
    totalCompleted: probe.done, clientFails: probe.fail,
    maxTPS_1sWindow: probe.maxRPS_1s, sustainedTPS: probe.sustainedRPS,
    p50ms: probe.p50ms, p99ms: probe.p99ms,
    avgCompletionTokens: probe.avgCompletionTokens,
    onchainRecorded: totalRecorded, recorderFailed: stats.reduce((a, s) => a + (s ? s.failed : 0), 0),
    onchainSampleVerified: `${verified}/${sampled}`,
    pass: probe.maxRPS_1s >= 1000
      && probe.fail / Math.max(1, probe.done + probe.fail) < 0.05
      && sampled > 0 && verified === sampled,
  };
  writeResult(`m4-final-${RUN}`, { ...report, tpsPerSecond: probe.tpsPerSecond });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
})();
