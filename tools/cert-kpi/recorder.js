// M4 온체인 비동기 기록 사이드카 v4 — 머클 배치 앵커링
// 설계 근거: 개별 레코드를 초당 수백 건 온체인 기록하면 블록 실행이 epoch을 초과해
// 합의 포크/정지를 유발함을 실측으로 확인(1s/5s epoch 공통). 표준 해법: 배치당
// 머클루트 1건만 앵커, 원본 배치는 증빙 파일로 보존, 검증은 머클 재계산 대조.
// 실행: M4_RUN=<run> RID=0 PORT=9100 node recorder.js
const { newAin, APP, RESULTS_DIR } = require('./common');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');

const RID = parseInt(process.env.RID || '0', 10);
const PORT = parseInt(process.env.PORT || '9100', 10);
const RUN = process.env.M4_RUN || 'run0';
const BATCH_SIZE = 500;
const BASE = `/apps/${APP}/inference_results_v2/${RUN}`;
const BATCH_DIR = `${RESULTS_DIR}/m4_batches_${RUN}_${RID}`;
fs.mkdirSync(BATCH_DIR, { recursive: true });

const ain = newAin(1 + RID, null, 14 + RID);

const queue = [];
let recorded = 0, failed = 0, inflight = 0, batchNo = 0;
let paused = process.env.START_PAUSED === '1';

const leafHash = rec => crypto.createHash('sha256')
  .update(JSON.stringify([rec.requestId, rec.timestamp, rec.tokensGenerated, rec.inferenceTimeMs]))
  .digest();

function merkleRoot(leaves) {
  if (leaves.length === 0) return Buffer.alloc(32);
  let level = leaves;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[i + 1] || level[i];
      next.push(crypto.createHash('sha256').update(a).update(b).digest());
    }
    level = next;
  }
  return level[0];
}

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
    if (res && res.tx_hash && res.result.code === 0) {
      fs.writeFileSync(`${BATCH_DIR}/batch_${n}.json`,
        JSON.stringify({ batch: `r${RID}_b${n}`, merkleRoot: root, txHash: res.tx_hash, records: batch }));
      recorded += batch.length;
    } else failed += batch.length;
  } catch (e) { failed += batch.length; }
  inflight--;
}
setInterval(() => flush(false), 50);

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/record') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const j = JSON.parse(body);
        if (Array.isArray(j)) queue.push(...j); else queue.push(j);
      } catch {}
      res.writeHead(200); res.end('{"queued":true}');
    });
  } else if (req.url === '/pause') { paused = true; res.writeHead(200); res.end('{"paused":true}');
  } else if (req.url === '/resume') { paused = false; res.writeHead(200); res.end('{"paused":false}');
  } else if (req.url === '/flush') {
    (async () => { while (queue.length > 0) { await flush(true); await new Promise(r => setTimeout(r, 50)); } })();
    res.writeHead(200); res.end('{"flushing":true}');
  } else if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ recorded, failed, queued: queue.length, batches: batchNo }));
  } else { res.writeHead(404); res.end(); }
});
server.listen(PORT, () => console.log(`recorder v4(merkle) ${RID} on :${PORT} run=${RUN}`));
