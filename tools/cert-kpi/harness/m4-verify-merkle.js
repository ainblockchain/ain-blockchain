// M4 검증·최종 리포트 — 입력은 모두 M4_RUN 에 바인딩된 산출물만 사용한다.
//   TPS(판정):  Locust 워커 60개의 자체 초당 성공 카운트(request 이벤트, m4_ts_<run>/locust_worker_<pid>.json) 합산 → 1초 윈도우 최댓값
//              (1단계 입회평가와 같은 '최대 TPS' 통계량). 함께 보고: 지속 TPS(중앙부 평균), 60초 평균, Locust 자체 요약 Requests/s(stats.csv),
//              Locust current_rps 최댓값(stats_history.csv, 10초 슬라이딩), 표준편차, ≥1,000 윈도우 수 — 판정 통계량 선택을 검증기관이 볼 수 있게
//   규정준수:  워커 덤프 파일 수 == 60 ∧ 배정 유저 합 == 240 ∧ 마스터 스폰 완료 시점 worker_count 60 / target 240
//   기록:      배치 파일(run 바인딩) requestId 접두사·중복 검사, 건수 ≥ 성공 요청의 99%
//   온체인:    배치별 머클루트 재계산 == 온체인 루트(is_final) ∧ count ∧ 앵커 tx 영수증 FINALIZED ∧ node9 블록 데이터에 tx 존재(영수증 트래커 무관)
//   포함증명:  시드 PRNG(run id) 로 100건 선택, 증명(형제 해시 경로)을 결과 JSON 에 전부 보존 → 제3자가 m4-merkle.js verifyProof 로 재검증
// 실행: M4_RUN=<run> node m4-verify-merkle.js
const fs = require('fs');
const crypto = require('crypto');
const { newAin, NODES, APP, RESULTS_DIR, writeResult, waitFinalized, getValueFinal, httpJson, verifyTxInBlockUntil } = require('./common');
const { leafHash, merkleRoot, merkleProof, verifyProof } = require('./m4-merkle');

const RUN = process.env.M4_RUN;
if (!RUN) { console.error('M4_RUN is required'); process.exit(2); }
const BASE = `/apps/${APP}/inference_results_v2/${RUN}`;
const TARGET = 1000;
const BLOCK_VERIFY_NODE = NODES[9];

// 시드 PRNG (xorshift32 over sha256(run))
function seededRng(seed) {
  let x = crypto.createHash('sha256').update(seed).digest().readUInt32LE(0) || 0x9e3779b9;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 0x100000000; };
}
function parseCsv(file) {
  const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => l.split(','));
  const head = rows[0]; return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

(async () => {
  // 1) 워커 덤프 합산 → 1초 윈도우
  const lc = JSON.parse(fs.readFileSync(`${RESULTS_DIR}/m4_${RUN}_locust_persec.json`));
  if (lc.run !== RUN) throw new Error('master statistics from another run');
  const tsDir = `${RESULTS_DIR}/m4_ts_${RUN}`;
  const workerDumps = fs.readdirSync(tsDir).filter(f => f.startsWith('locust_worker_')).map(f => JSON.parse(fs.readFileSync(`${tsDir}/${f}`)));
  if (workerDumps.some(w => w.run !== RUN)) throw new Error('worker dump from another run');
  const perSec = {}; let wReq = 0, wFail = 0, usersTotal = 0;
  for (const w of workerDumps) { for (const [k, v] of Object.entries(w.num_reqs_per_sec)) perSec[k] = (perSec[k] || 0) + v; wReq += w.num_requests; wFail += w.num_failures; usersTotal += w.users; }
  const secs = Object.keys(perSec).map(Number).sort((a, b) => a - b);
  const tpsPerSecond = []; for (let s = secs[0]; s <= secs[secs.length - 1]; s++) tpsPerSecond.push(perSec[String(s)] || 0);
  const maxTPS = Math.max(0, ...tpsPerSecond);
  const mid = tpsPerSecond.length > 6 ? tpsPerSecond.slice(2, -2) : tpsPerSecond;
  const sustainedTPS = Math.round(mid.reduce((a, b) => a + b, 0) / Math.max(1, mid.length));
  const sd = Math.round(Math.sqrt(mid.reduce((a, b) => a + (b - sustainedTPS) ** 2, 0) / Math.max(1, mid.length)));
  const windowsAtOrAboveTarget = tpsPerSecond.filter(x => x >= TARGET).length;
  const succeeded = wReq - wFail, failRate = wFail / Math.max(1, wReq);
  const avgTPS60 = +(succeeded / Math.max(1, tpsPerSecond.length)).toFixed(1);

  // 1b) Locust 자체 요약·이력 (판정 통계량 대조용)
  let locustSummaryRps = null, locustCurrentRpsPeak = null, locustHistoryRows = null;
  try { const agg = parseCsv(`${RESULTS_DIR}/m4_${RUN}_locust_stats.csv`).find(r => r.Name === 'Aggregated'); locustSummaryRps = agg ? +(+agg['Requests/s']).toFixed(1) : null; } catch {}
  try { const h = parseCsv(`${RESULTS_DIR}/m4_${RUN}_locust_stats_history.csv`).filter(r => r.Name === 'Aggregated'); locustHistoryRows = h.length; locustCurrentRpsPeak = +Math.max(...h.map(r => +r['Requests/s'] || 0)).toFixed(1); } catch {}
  // 1c) 교차검증: self-report 타임스탬프, recorder client 카운터
  let selfReportCompleted = null, recorderClientSent = 0, recorderClientEnqueued = 0;
  try { selfReportCompleted = 0; for (const f of fs.readdirSync(tsDir)) { if (f.startsWith('ts_')) selfReportCompleted += fs.readFileSync(`${tsDir}/${f}`, 'utf8').split('\n').filter(l => /^\d+$/.test(l)).length; if (f.startsWith('recorder_client_')) { const c = JSON.parse(fs.readFileSync(`${tsDir}/${f}`)); recorderClientSent += c.sent; recorderClientEnqueued += c.enqueued || 0; } } } catch {}

  // 2) 배치 파일 (run 바인딩)
  const batches = [];
  for (const rid of [0, 1]) { const dir = `${RESULTS_DIR}/m4_batches_${RUN}_${rid}`; if (!fs.existsSync(dir)) continue; for (const f of fs.readdirSync(dir).sort()) { const b = JSON.parse(fs.readFileSync(`${dir}/${f}`)); if (b.run !== RUN) throw new Error(`batch ${f} belongs to run ${b.run}`); b._file = `${dir}/${f}`; batches.push(b); } }
  if (batches.length === 0) throw new Error(`no batches for run ${RUN}`);
  const allIds = new Set(); let foreign = 0, dup = 0, totalRecords = 0;
  for (const b of batches) for (const r of b.records) { totalRecords++; if (!String(r.requestId).startsWith(`${RUN}-`)) foreign++; if (allIds.has(r.requestId)) dup++; else allIds.add(r.requestId); }

  // 3) 앵커 tx 영수증(FINALIZED) → node9 블록 재검증 → 온체인 루트(is_final, node4) 대조
  const ain = newAin(4, null, 16);
  const txHashes = batches.map(b => b.txHash);
  const fin = await waitFinalized(ain, txHashes, 180000, 2000);
  let rootsVerified = 0, inBlockOk = 0; const onchainRoot = new Map(); const anchors = [];
  for (const b of batches) {
    const st = fin.status.get(b.txHash);
    const vb = st.finalized ? await verifyTxInBlockUntil(BLOCK_VERIFY_NODE, st.blockNumber, b.txHash) : { ok: false };
    if (vb.ok) inBlockOk++;
    const v = await getValueFinal(ain, `${BASE}/batches/${b.batch}`).catch(() => null);
    const recomputed = merkleRoot(b.records.map(leafHash)).toString('hex');
    const rootOk = !!(v && v.merkleRoot === b.merkleRoot && recomputed === b.merkleRoot && v.count === b.records.length);
    if (rootOk) { rootsVerified++; onchainRoot.set(b.batch, v.merkleRoot); } else console.error(`batch ${b.batch}: onchain=${v && v.merkleRoot} file=${b.merkleRoot} recomputed=${recomputed}`);
    anchors.push({ batch: b.batch, txHash: b.txHash, records: b.records.length, state: st.state, block: st.blockNumber, inBlockOnNode9: vb.ok, blockHash: vb.blockHash || null, rootOnChain: v ? v.merkleRoot : null, rootMatch: rootOk });
    // 배치 파일에도 영수증(블록 번호)을 기록해 둔다
    try { fs.writeFileSync(b._file, JSON.stringify({ run: b.run, batch: b.batch, merkleRoot: b.merkleRoot, txHash: b.txHash, receipt: { state: st.state, block: st.blockNumber, blockHash: vb.blockHash || null }, records: b.records })); } catch {}
  }

  // 4) 시드 PRNG 로 100건 포함 증명 (증명 전부 보존)
  const rng = seededRng(RUN); const SAMPLE = 100; let sampleVerified = 0; const proofs = [];
  for (let i = 0; i < SAMPLE; i++) {
    const b = batches[Math.floor(rng() * batches.length)]; const idx = Math.floor(rng() * b.records.length);
    const leaves = b.records.map(leafHash); const proof = merkleProof(leaves, idx); const root = onchainRoot.get(b.batch);
    const ok = !!root && verifyProof(leaves[idx], proof, root); if (ok) sampleVerified++;
    proofs.push({ batch: b.batch, index: idx, requestId: b.records[idx].requestId, leaf: leaves[idx].toString('hex'), proof, rootOnChain: root || null, ok });
  }

  // 5) recorder 상태 스냅샷
  const recorderStats = [];
  for (const i of [0, 1]) { const f = `${RESULTS_DIR}/m4_${RUN}_recorder${i}_stats.json`; if (fs.existsSync(f)) { recorderStats.push(JSON.parse(fs.readFileSync(f))); continue; } try { recorderStats.push(await httpJson(`http://localhost:${9100 + i}/stats`, 2000)); } catch { recorderStats.push(null); } }

  const users = usersTotal, workers = workerDumps.length;
  const spawn = lc.at_spawning_complete || null;
  const methodologyCompliant = users === 240 && workers === 60 && spawn?.worker_count === 60 && spawn?.target_user_count === 240 && spawn?.spawning_complete_user_count === 240;
  const recordersDrained = recorderStats.length === 2 && recorderStats.every((stats, index) => stats?.run === RUN && stats.rid === index && stats.failed === 0 && stats.queued === 0 && stats.inflight === 0);
  const report = {
    metric: 'M4_inference_tps', runId: RUN, target: TARGET,
    methodology: `Locust ${users} users / ${workers} workers (FastHttpUser, headless), client-side round-robin over ${lc.vllm_servers.length} vLLM servers (${lc.model}, one A100 per server, TP=1), /v1/completions max_tokens=512 stop=["\\n","."]; TPS = per-second success counts from Locust's request event in each worker, summed over the 60 worker dumps; async on-chain recording via Merkle-batch anchoring (500 records/anchor tx) on the certification chain; verification = per-batch root recomputation vs on-chain root (is_final) + anchor tx FINALIZED receipt + tx present in block on node9 + 100 seeded Merkle inclusion proofs (persisted)`,
    judgedStatistic: 'maxTPS_1sWindow (maximum of the per-second success counts; same "최대 TPS" statistic as the Stage-1 expert evaluation). Reported alongside: sustainedTPS (mid-window mean), avgTPS (whole-run mean), Locust summary Requests/s and Locust current_rps peak (10 s sliding) — a certifier applying the whole-run mean must use avgTPS/locustSummaryRps',
    planRequirement: 'Locust command, 240 users distributed over 60 workers', methodologyCompliant, recordersDrained,
    users, sumWorkerPeakUsers: users, targetUsers: lc.users,
    userCountInterpretation: 'users is the sum of per-worker maxima, not simultaneous users when workers rebalance; inspect membershipSamples for actual concurrent counts',
    membershipSamples: lc.membership_samples || [],
    workers, masterAtSpawningComplete: spawn, vllmServers: lc.vllm_servers.length,
    locust: { numRequests: wReq, numFailures: wFail, succeeded, failRatePct: +(failRate * 100).toFixed(2), avgResponseMs: Math.round(lc.avg_response_time_ms), medianResponseMs: lc.median_response_time_ms, p99ResponseMs: lc.p99_response_time_ms,
      windowSeconds: tpsPerSecond.length, masterMergedRequests: lc.num_requests, masterTargetUsers: lc.users, summaryRequestsPerSec: locustSummaryRps, currentRpsPeak10s: locustCurrentRpsPeak, historyRows: locustHistoryRows },
    maxTPS_1sWindow: maxTPS, sustainedTPS, avgTPS: avgTPS60, tpsStdDev: sd, windowsAtOrAboveTarget: `${windowsAtOrAboveTarget}/${tpsPerSecond.length}`,
    crossCheck: { selfReportCompleted, recorderClientEnqueued, recorderClientSent, recordsNotAnchored: Math.max(0, succeeded - totalRecords) },
    recordsInBatches: totalRecords, uniqueRequestIds: allIds.size, foreignIds: foreign, duplicateIds: dup, batchCount: batches.length,
    rootsVerifiedOnChain: `${rootsVerified}/${batches.length}`, anchorsFinalized: `${fin.finalizedCount}/${txHashes.length}`, anchorsInBlockOnNode9: `${inBlockOk}/${batches.length}`,
    sampleInclusionProofs: `${sampleVerified}/${SAMPLE}`, proofSeed: RUN,
    recorderStats,
    pass: maxTPS >= TARGET && failRate < 0.05 && methodologyCompliant && recordersDrained
      && rootsVerified === batches.length && fin.allFinalized && inBlockOk === batches.length && sampleVerified === SAMPLE
      && foreign === 0 && dup === 0 && totalRecords >= succeeded * 0.99,
  };
  await writeResult(`m4-final-${RUN}`, { ...report, tpsPerSecond, anchors, inclusionProofs: proofs });
  const { anchors: _a, inclusionProofs: _p, ...brief } = report;
  console.log(JSON.stringify(brief, null, 2));
  process.exit(report.pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
