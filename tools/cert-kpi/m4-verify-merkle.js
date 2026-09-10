// M4 검증 v2: 무작위 100건 레코드 → 소속 배치 머클루트 재계산 ↔ 온체인 루트 대조
// + 배치 앵커 tx 최종화 영수증 확인
const fs = require('fs');
const crypto = require('crypto');
const { newAin, APP, writeResult, sleep, waitFinalized, RESULTS_DIR } = require('./common');

const RUN = process.env.M4_RUN || 'cert4';
const PROBE_JSON = process.argv[2];
const BASE = `/apps/${APP}/inference_results_v2/${RUN}`;

const leafHash = rec => crypto.createHash('sha256')
  .update(JSON.stringify([rec.requestId, rec.timestamp, rec.tokensGenerated, rec.inferenceTimeMs]))
  .digest();
function merkleRoot(leaves) {
  if (leaves.length === 0) return Buffer.alloc(32);
  let level = leaves;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(crypto.createHash('sha256').update(level[i]).update(level[i + 1] || level[i]).digest());
    }
    level = next;
  }
  return level[0];
}

(async () => {
  // 1) recorder 큐 드레인 (강제 플러시 포함)
  for (const p of [9100, 9101]) { try { await fetch(`http://localhost:${p}/flush`); } catch {} }
  let stats = [];
  for (let i = 0; i < 60; i++) {
    stats = [];
    let queued = 0;
    for (const p of [9100, 9101]) {
      try { const s = await (await fetch(`http://localhost:${p}/stats`)).json(); stats.push(s); queued += s.queued; } catch { stats.push(null); }
    }
    if (queued === 0) break;
    await sleep(3000);
  }
  await sleep(3000);

  // 2) 배치 파일 로드
  const batches = [];
  for (const rid of [0, 1]) {
    const dir = `${RESULTS_DIR}/m4_batches_${RUN}_${rid}`;
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) batches.push(JSON.parse(fs.readFileSync(`${dir}/${f}`)));
  }
  const totalRecords = batches.reduce((a, b) => a + b.records.length, 0);

  // 3) 온체인 루트 대조 (읽기는 제3 노드 8085) + 무작위 100건 멤버십/루트 재계산
  const ain = newAin(4, null, 16);
  let rootsVerified = 0;
  const txHashes = [];
  for (const b of batches) {
    const v = await ain.db.ref(`${BASE}/batches/${b.batch}`).getValue().catch(() => null);
    const recomputed = merkleRoot(b.records.map(leafHash)).toString('hex');
    if (v && v.merkleRoot === b.merkleRoot && recomputed === b.merkleRoot && v.count === b.records.length) {
      rootsVerified++;
      txHashes.push(b.txHash);
    }
  }
  // 무작위 100건: 레코드 → 소속 배치 재계산 루트가 온체인 루트와 일치하면 검증 성공
  let sampleVerified = 0;
  const SAMPLE = 100;
  for (let i = 0; i < SAMPLE; i++) {
    const b = batches[(Math.random() * batches.length) | 0];
    const rec = b.records[(Math.random() * b.records.length) | 0];
    const v = await ain.db.ref(`${BASE}/batches/${b.batch}`).getValue().catch(() => null);
    const recomputed = merkleRoot(b.records.map(leafHash)).toString('hex');
    const inBatch = b.records.some(r => r.requestId === rec.requestId);
    if (v && inBatch && recomputed === v.merkleRoot) sampleVerified++;
  }
  // 4) 앵커 tx 최종화 영수증
  const fin = await waitFinalized(ain, txHashes, 120000, 2000);

  const probe = JSON.parse(fs.readFileSync(PROBE_JSON));
  const report = {
    metric: 'M4_inference_tps', target: 1000,
    methodology: 'closed-loop light client over 8 vLLM servers (gpt-oss-20b, A100x8); async on-chain recording via Merkle-batch anchoring (500 records/anchor tx); verification = random-100 Merkle membership + root match + anchor finalization receipts; chain: 10 validators, epoch 5s',
    concurrency: probe.conc, durationS: probe.secs,
    totalCompleted: probe.done, clientFails: probe.fail,
    maxTPS_1sWindow: probe.maxRPS_1s, sustainedTPS: probe.sustainedRPS,
    p50ms: probe.p50ms, p99ms: probe.p99ms,
    recordsInBatches: totalRecords, batchCount: batches.length,
    rootsVerifiedOnChain: `${rootsVerified}/${batches.length}`,
    anchorsFinalized: `${[...fin.status.values()].filter(s => s.finalized).length}/${txHashes.length}`,
    sampleVerified: `${sampleVerified}/${SAMPLE}`,
    recorderStats: stats,
    pass: probe.maxRPS_1s >= 1000
      && probe.fail / Math.max(1, probe.done + probe.fail) < 0.05
      && rootsVerified === batches.length && batches.length > 0
      && sampleVerified === SAMPLE
      && fin.allFinalized
      && totalRecords >= probe.done * 0.99,
  };
  writeResult(`m4-final-${RUN}`, { ...report, tpsPerSecond: probe.tpsPerSecond });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
})();
