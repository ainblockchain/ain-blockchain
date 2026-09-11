// M4 검증·최종 리포트 — 입력은 모두 M4_RUN 에 바인딩된 산출물만 사용한다.
//   TPS:   Locust 워커 60개가 각자 덤프한 자체 통계(m4_ts_<run>/locust_worker_<pid>.json, 초 단위 성공 요청 수)를 합산 → 1초 윈도우 최대/지속 TPS
//          워커 덤프 파일 수 == 60, 배정 유저 합 == 240 을 계획서 측정법 준수 증거로 삼는다 (마스터 병합본은 백분위·교차검증용)
//   기록:  recorder 배치 파일(results/m4_batches_<run>_{0,1}) → requestId 가 run 에 속하는지, 중복 없음, 건수 ≥ Locust 성공 건수의 99%
//   온체인: 배치별 머클루트 재계산 == 온체인 루트(is_final 읽기) ∧ count 일치 ∧ 앵커 tx 영수증 state==='FINALIZED'
//   포함증명: 무작위 100건 레코드 → 머클 포함 증명(형제 해시 경로) 을 온체인 루트에 대해 검증 (배치 내 존재 여부가 아닌 실제 증명)
//   규정준수: users==240 ∧ workers==60 (계획서 측정법) 를 pass 조건에 포함
// 실행: M4_RUN=<run> node m4-verify-merkle.js
const fs = require('fs');
const { newAin, APP, RESULTS_DIR, writeResult, waitFinalized, getValueFinal, httpJson } = require('./common');
const { leafHash, merkleRoot, merkleProof, verifyProof } = require('./m4-merkle');

const RUN = process.env.M4_RUN;
if (!RUN) { console.error('M4_RUN is required'); process.exit(2); }
const BASE = `/apps/${APP}/inference_results_v2/${RUN}`;
const TARGET = 1000;

(async () => {
  // 1) Locust 자체 통계 → 1초 윈도우 TPS. 판정은 워커 60개의 자체 덤프(locust_worker_<pid>.json) 합산으로 한다
  //    (마스터 병합본 m4_<run>_locust_persec.json 은 응답시간 백분위와 교차검증에 사용)
  const lc = JSON.parse(fs.readFileSync(`${RESULTS_DIR}/m4_${RUN}_locust_persec.json`));
  const tsDir = `${RESULTS_DIR}/m4_ts_${RUN}`;
  const workerDumps = fs.readdirSync(tsDir).filter(f => f.startsWith('locust_worker_')).map(f => JSON.parse(fs.readFileSync(`${tsDir}/${f}`)));
  if (workerDumps.some(w => w.run !== RUN)) throw new Error('worker dump from another run');
  const perSec = {};
  let wReq = 0, wFail = 0, usersTotal = 0;
  for (const w of workerDumps) {
    for (const [k, v] of Object.entries(w.num_reqs_per_sec)) perSec[k] = (perSec[k] || 0) + v;
    wReq += w.num_requests; wFail += w.num_failures; usersTotal += w.users;
  }
  const secs = Object.keys(perSec).map(Number).sort((a, b) => a - b);
  const t0 = secs[0], t1 = secs[secs.length - 1];
  const tpsPerSecond = [];
  for (let s = t0; s <= t1; s++) tpsPerSecond.push(perSec[String(s)] || 0);
  const maxTPS = Math.max(...tpsPerSecond);
  const mid = tpsPerSecond.length > 6 ? tpsPerSecond.slice(2, -2) : tpsPerSecond;
  const sustainedTPS = Math.round(mid.reduce((a, b) => a + b, 0) / mid.length);
  const succeeded = wReq - wFail;
  const failRate = wFail / Math.max(1, wReq);

  // 1b) 교차검증: 워커 self-report 타임스탬프 건수 (판정 미사용)
  let selfReportCount = null, recorderClientSent = 0;
  try {
    const dir = `${RESULTS_DIR}/m4_ts_${RUN}`;
    selfReportCount = 0;
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('ts_')) selfReportCount += fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter(l => /^\d+$/.test(l)).length;
      if (f.startsWith('recorder_client_')) recorderClientSent += JSON.parse(fs.readFileSync(`${dir}/${f}`)).sent;
    }
  } catch {}

  // 2) 배치 파일 (run 바인딩)
  const batches = [];
  for (const rid of [0, 1]) {
    const dir = `${RESULTS_DIR}/m4_batches_${RUN}_${rid}`;
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      const b = JSON.parse(fs.readFileSync(`${dir}/${f}`));
      if (b.run !== RUN) throw new Error(`batch ${f} belongs to run ${b.run}`);
      batches.push(b);
    }
  }
  if (batches.length === 0) throw new Error(`no batches for run ${RUN}`);
  const allIds = new Set();
  let foreign = 0, dup = 0, totalRecords = 0;
  for (const b of batches) for (const r of b.records) {
    totalRecords++;
    if (!String(r.requestId).startsWith(`${RUN}-`)) foreign++;
    if (allIds.has(r.requestId)) dup++; else allIds.add(r.requestId);
  }

  // 3) 앵커 tx 최종화 영수증(state==='FINALIZED') 을 먼저 기다린 뒤, 온체인 루트를 제3 노드(node4)에서 is_final 로 대조
  const ain = newAin(4, null, 16);
  const txHashes = batches.map(b => b.txHash);
  const fin = await waitFinalized(ain, txHashes, 180000, 2000);
  let rootsVerified = 0;
  const onchainRoot = new Map();
  for (const b of batches) {
    const v = await getValueFinal(ain, `${BASE}/batches/${b.batch}`).catch(() => null);
    const recomputed = merkleRoot(b.records.map(leafHash)).toString('hex');
    if (v && v.merkleRoot === b.merkleRoot && recomputed === b.merkleRoot && v.count === b.records.length) {
      rootsVerified++; onchainRoot.set(b.batch, v.merkleRoot);
    } else console.error(`batch ${b.batch}: onchain=${v && v.merkleRoot} file=${b.merkleRoot} recomputed=${recomputed}`);
  }

  // 4) 무작위 100건 머클 포함 증명 (온체인 루트 기준)
  const SAMPLE = 100;
  let sampleVerified = 0;
  const sampled = [];
  for (let i = 0; i < SAMPLE; i++) {
    const b = batches[(Math.random() * batches.length) | 0];
    const idx = (Math.random() * b.records.length) | 0;
    const leaves = b.records.map(leafHash);
    const proof = merkleProof(leaves, idx);
    const root = onchainRoot.get(b.batch);
    const ok = !!root && verifyProof(leaves[idx], proof, root);
    if (ok) sampleVerified++;
    if (sampled.length < 5) sampled.push({ batch: b.batch, requestId: b.records[idx].requestId, proofLen: proof.length, ok });
  }

  // 5) recorder 상태: 실행 스크립트가 drain 직후 저장한 스냅샷(m4_<run>_recorder<i>_stats.json); 없으면 살아있는 recorder 에서 조회
  const recorderStats = [];
  for (const i of [0, 1]) {
    const f = `${RESULTS_DIR}/m4_${RUN}_recorder${i}_stats.json`;
    if (fs.existsSync(f)) { recorderStats.push(JSON.parse(fs.readFileSync(f))); continue; }
    try { recorderStats.push(await httpJson(`http://localhost:${9100 + i}/stats`, 2000)); } catch { recorderStats.push(null); }
  }

  const users = usersTotal, workers = workerDumps.length;   // 워커 덤프 파일 수 = 참여 워커 수, 배정 유저 합 = 동시 사용자 수
  const report = {
    metric: 'M4_inference_tps', runId: RUN, target: TARGET,
    methodology: `Locust ${users} users / ${workers} workers (FastHttpUser, headless), client-side round-robin over ${lc.vllm_servers.length} vLLM servers (${lc.model}, one A100 per server, TP=1), /v1/completions max_tokens=512 stop=["\\n","."]; TPS from Locust's own per-second success counts; async on-chain recording via Merkle-batch anchoring (500 records/anchor tx) on the certification chain; verification = per-batch root recomputation vs on-chain root (is_final) + 100 random Merkle inclusion proofs + anchor tx FINALIZED receipts`,
    planRequirement: 'Locust command, 240 users distributed over 60 workers',
    methodologyCompliant: users === 240 && workers === 60,
    users, workers, vllmServers: lc.vllm_servers.length,
    locust: { numRequests: wReq, numFailures: wFail, succeeded, failRatePct: +(failRate * 100).toFixed(2),
      avgResponseMs: Math.round(lc.avg_response_time_ms), medianResponseMs: lc.median_response_time_ms, p99ResponseMs: lc.p99_response_time_ms,
      windowSeconds: tpsPerSecond.length, masterMergedRequests: lc.num_requests, masterTargetUsers: lc.users },
    maxTPS_1sWindow: maxTPS, sustainedTPS,
    crossCheck: { selfReportCompleted: selfReportCount, recorderClientSent },
    recordsInBatches: totalRecords, uniqueRequestIds: allIds.size, foreignIds: foreign, duplicateIds: dup,
    batchCount: batches.length,
    rootsVerifiedOnChain: `${rootsVerified}/${batches.length}`,
    anchorsFinalized: `${fin.finalizedCount}/${txHashes.length}`,
    sampleInclusionProofs: `${sampleVerified}/${SAMPLE}`, sampleExamples: sampled,
    recorderStats,
    pass: maxTPS >= TARGET && failRate < 0.05
      && users === 240 && workers === 60
      && rootsVerified === batches.length && fin.allFinalized
      && sampleVerified === SAMPLE
      && foreign === 0 && dup === 0
      && totalRecords >= succeeded * 0.99,
  };
  await writeResult(`m4-final-${RUN}`, { ...report, tpsPerSecond });
  const { sampleExamples: _s, ...brief } = report;
  console.log(JSON.stringify(brief, null, 2));
  process.exit(report.pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
