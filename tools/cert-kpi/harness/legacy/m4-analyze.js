// M4 결과 분석: 타임스탬프 로그 → 1초 윈도우 최대/지속 TPS + Locust CSV 요약 + 온체인 검증
const fs = require('fs');
const { newAin, APP, writeResult, sleep } = require('./common');

const TS_DIR = '/mnt/newdata/gov/kpi/results/m4_ts';
const CSV = process.argv[2] || '/mnt/newdata/gov/kpi/results/cert_inference_stats.csv';
const BASE = `/apps/${APP}/inference_results`;

(async () => {
  // 1) 1초 윈도우 TPS
  const ts = [];
  for (const f of fs.readdirSync(TS_DIR)) {
    for (const line of fs.readFileSync(`${TS_DIR}/${f}`, 'utf8').split('\n')) {
      const v = parseInt(line, 10);
      if (v > 0) ts.push(v);
    }
  }
  ts.sort((a, b) => a - b);
  const t0 = ts[0];
  const secs = Math.ceil((ts[ts.length - 1] - t0 + 1) / 1000);
  const perSec = new Array(secs).fill(0);
  for (const t of ts) perSec[((t - t0) / 1000) | 0]++;
  const maxTPS = Math.max(...perSec);
  const mid = perSec.slice(1, Math.max(2, secs - 1));
  const sustained = Math.round(mid.reduce((a, b) => a + b, 0) / mid.length);

  // 2) Locust CSV 요약 (실패 수)
  let failures = null, totalReq = null, avgMs = null;
  try {
    const rows = fs.readFileSync(CSV, 'utf8').split('\n');
    const agg = rows.find(r => r.includes('"Aggregated"') || r.startsWith('Aggregated') || r.includes(',Aggregated,'));
    const infRow = rows.find(r => r.includes('inference'));
    if (infRow) {
      const c = infRow.split(',');
      totalReq = parseInt(c[2], 10); failures = parseInt(c[3], 10); avgMs = parseFloat(c[5]);
    }
  } catch {}

  // 3) recorder 상태 + 온체인 샘플 100건 역검증
  let recStats = [];
  for (const port of [9100, 9101]) {
    try {
      recStats.push(await (await fetch(`http://localhost:${port}/stats`)).json());
      await fetch(`http://localhost:${port}/dump`);
    } catch { recStats.push(null); }
  }
  await sleep(4000);
  const ain = newAin(3, null, 16);
  let verified = 0, sampled = 0;
  for (const rid of [0, 1]) {
    try {
      const ids = JSON.parse(fs.readFileSync(`/mnt/newdata/gov/kpi/results/recorded_ids_${rid}.json`));
      const sample = ids.filter((_, i) => i % Math.max(1, Math.floor(ids.length / 50)) === 0).slice(0, 50);
      for (const id of sample) {
        sampled++;
        const v = await ain.db.ref(`${BASE}/${id}`).getValue().catch(() => null);
        if (v && v.t) verified++;
      }
    } catch {}
  }

  const report = {
    metric: 'M4_inference_tps', target: 1000,
    methodology: 'Locust 240 users / 60 workers (FastHttpUser), client-side round-robin over 6 vLLM servers (gpt-oss-20b, A100x6), max_tokens=512 stop=["\\n"], async on-chain recording via multi-op SET batches',
    totalCompleted: ts.length, maxTPS_1sWindow: maxTPS, sustainedTPS: sustained,
    locust: { totalReq, failures, avgLatencyMs: avgMs },
    recorders: recStats,
    onchainSampleVerified: `${verified}/${sampled}`,
    pass: maxTPS >= 1000 && (failures === null || failures / Math.max(1, totalReq) < 0.05) && verified === sampled && sampled > 0,
  };
  writeResult(`m4-${Date.now()}`, { ...report, tpsPerSecond: perSec });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
})();
