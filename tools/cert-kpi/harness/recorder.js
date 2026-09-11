// M4 온체인 비동기 기록 사이드카 (머클 배치 앵커링)
// 설계 근거: 개별 레코드를 초당 수백 건 온체인 기록하면 블록 실행이 epoch 을 초과해 합의가 흔들림을 실측(1s/5s 공통).
// 배치(≤500건)당 머클루트 1건만 앵커 tx 로 기록하고, 원본 배치는 증빙 파일로 보존한다.
// 검증(m4-verify-merkle.js): 배치 파일 → 루트 재계산 ↔ 온체인 루트(is_final) 대조 + 레코드 포함 증명 + 앵커 tx 최종화 영수증.
// 실행: M4_RUN=<run> RID=0 PORT=9100 node recorder.js   (M4_RUN 필수 — 배치 파일·온체인 경로가 run 에 바인딩됨)
// 리뷰 반영: M4_RUN 기본값 제거, /stats 에 inflight 포함, /drain(큐+inflight 완전 소진까지 대기) 추가, 머클 유틸 공용화.
const { newAin, APP, RESULTS_DIR } = require('./common');
const { leafHash, merkleRoot } = require('./m4-merkle');
const http = require('http');
const fs = require('fs');

const RID = parseInt(process.env.RID || '0', 10);
const PORT = parseInt(process.env.PORT || String(9100 + RID), 10);
const RUN = process.env.M4_RUN;
if (!RUN) { console.error('M4_RUN is required'); process.exit(2); }
const BATCH_SIZE = 500;
const BASE = `/apps/${APP}/inference_results_v2/${RUN}`;
const BATCH_DIR = `${RESULTS_DIR}/m4_batches_${RUN}_${RID}`;
if (fs.existsSync(BATCH_DIR) && fs.readdirSync(BATCH_DIR).length > 0) {
  console.error(`${BATCH_DIR} already has batches — use a new M4_RUN`); process.exit(2);
}
fs.mkdirSync(BATCH_DIR, { recursive: true });

const ain = newAin(1 + RID, null, 14 + RID);      // 기록 노드 node1/node2, 계정 14/15

const queue = [];
let recorded = 0, failed = 0, inflight = 0, batchNo = 0, received = 0;
let paused = process.env.START_PAUSED === '1';

async function flush(force = false) {
  if (paused || inflight >= 2) return;
  if (queue.length < BATCH_SIZE && !(force && queue.length > 0)) return;
  const batch = queue.splice(0, BATCH_SIZE);
  const n = batchNo++;
  inflight++;
  try {
    const root = merkleRoot(batch.map(leafHash)).toString('hex');
    const res = await ain.db.ref(`${BASE}/batches/r${RID}_b${n}`).setValue({
      value: { merkleRoot: root, count: batch.length, ts: Date.now() },
      gas_price: 1, nonce: -1,
    });
    if (res && res.tx_hash && res.result && res.result.code === 0) {
      fs.writeFileSync(`${BATCH_DIR}/batch_${n}.json`,
        JSON.stringify({ run: RUN, batch: `r${RID}_b${n}`, merkleRoot: root, txHash: res.tx_hash, records: batch }));
      recorded += batch.length;
    } else { failed += batch.length; console.error(`batch ${n} rejected:`, JSON.stringify(res && res.result).slice(0, 200)); }
  } catch (e) { failed += batch.length; console.error(`batch ${n} error:`, e.message); }
  inflight--;
}
setInterval(() => flush(false), 50);

const stats = () => ({ run: RUN, rid: RID, received, recorded, failed, queued: queue.length, inflight, batches: batchNo });

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/record') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      let n = 0;
      try {
        const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));   // 멀티바이트 경계 안전
        const items = Array.isArray(j) ? j : [j];
        for (const it of items) if (it && typeof it.requestId === 'string') { queue.push(it); received++; n++; }
      } catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      res.writeHead(200); res.end(JSON.stringify({ queued: n }));
    });
  } else if (req.url === '/pause') { paused = true; res.writeHead(200); res.end('{"paused":true}');
  } else if (req.url === '/resume') { paused = false; res.writeHead(200); res.end('{"paused":false}');
  } else if (req.url === '/drain') {
    // 큐와 inflight 가 모두 0이 될 때까지 강제 플러시 후 응답 (검증 전 호출)
    (async () => {
      paused = false;
      while (queue.length > 0 || inflight > 0) { await flush(true); await new Promise(r => setTimeout(r, 50)); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(stats()));
    })();
  } else if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(stats()));
  } else { res.writeHead(404); res.end(); }
});
server.listen(PORT, () => console.log(`recorder(merkle) ${RID} on :${PORT} run=${RUN} node=${1 + RID}`));
