// M2 재생 검증: 워커 tx 로그(헤더·서명·참가자)를 재생해 서명을 재검증하고 채널 상태 루트를 재계산 → 온체인(is_final) 앵커·정산 루트와 대조
// 실행: RUN_ID=<run> node m2-replay-verify.js   → results/m2-replay-<run>.json
const crypto = require('crypto');
const fs = require('fs');
const { newAin, APP, RESULTS_DIR, writeResult, getValueFinal } = require('./common');

const RUN_ID = process.env.RUN_ID;
if (!RUN_ID) { console.error('RUN_ID required'); process.exit(2); }
const BASE = `/apps/${APP}/state_channels`;
const DIR = `${RESULTS_DIR}/m2_txlog_${RUN_ID}`;
const ANCHOR_EVERY = parseInt(process.env.ANCHOR_EVERY || '10000', 10);   // m2-l2.js 실행 때와 같은 값 (결과 JSON anchorEvery)
const REC = 90;

function makePool(seed, bytes) {
  const chunks = []; let n = 0, i = 0;
  while (n < bytes) { const c = crypto.createHash('sha256').update(`${seed}:${i++}`).digest(); chunks.push(c); n += c.length; }
  return Buffer.concat(chunks).subarray(0, bytes);
}
const keyFromHex = hex => crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(hex, 'hex')]), format: 'der', type: 'spki' });

(async () => {
  const ain = newAin(7, null, 16);   // 읽기 노드 node7
  const out = { metric: 'M2_replay_verification', runId: RUN_ID, workers: [], channels: [] };
  let sigOk = 0, sigBad = 0, txTotal = 0, rootsMatched = 0, rootsTotal = 0, settleMatched = 0;
  for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.json')).sort()) {
    const meta = JSON.parse(fs.readFileSync(`${DIR}/${f}`));
    const pool = makePool(meta.poolSeed, meta.poolBytes);
    const keys = meta.users.map(keyFromHex);
    const buf = fs.readFileSync(`${DIR}/w${meta.wid}.bin`);
    const n = Math.floor(buf.length / REC);
    const CPW = meta.channels.length;
    const chans = meta.channels.map(gid => ({ gid, seq: 0, root: Buffer.alloc(32), anchors: {}, sinceAnchor: 0 }));
    const hashCache = new Map();
    for (let i = 0; i < n; i++) {
      const off = i * REC;
      const header = buf.subarray(off, off + 24), sig = buf.subarray(off + 24, off + 88), u = buf.readUInt16LE(off + 88);
      const size = header.readUInt32LE(8);
      let ph = hashCache.get(size);
      if (!ph) { ph = crypto.createHash('sha256').update(pool.subarray(0, size)).digest(); hashCache.set(size, ph); }
      const ch = chans[u % CPW];
      const ok = header.readUInt32LE(0) === u && header.readUInt32LE(4) === ch.seq && crypto.verify(null, Buffer.concat([header, ph]), keys[u], sig);
      if (!ok) { sigBad++; continue; }
      sigOk++; txTotal++;
      ch.seq++; ch.root = crypto.createHash('sha256').update(ch.root).update(header).update(ph).digest(); ch.sinceAnchor++;
      if (ch.sinceAnchor >= ANCHOR_EVERY) { ch.sinceAnchor = 0; ch.anchors[ch.seq] = ch.root.toString('hex'); }
    }
    out.workers.push({ wid: meta.wid, records: n, sigOk, sigBad });
    for (const ch of chans) {
      const onAnch = (await getValueFinal(ain, `${BASE}/${RUN_ID}/channel_${ch.gid}/anchors`)) || {};
      const onSettle = await getValueFinal(ain, `${BASE}/${RUN_ID}/channel_${ch.gid}/settle`);
      const anchorCmp = Object.entries(ch.anchors).map(([seq, root]) => { rootsTotal++; const m = !!onAnch[seq] && onAnch[seq].root === root; if (m) rootsMatched++; return { seq: +seq, replayRoot: root, onchain: onAnch[seq] ? onAnch[seq].root : null, match: m }; });
      const sm = !!onSettle && onSettle.finalRoot === ch.root.toString('hex') && onSettle.totalSeq === ch.seq;
      if (sm) settleMatched++;
      out.channels.push({ gid: ch.gid, replaySeq: ch.seq, replayRoot: ch.root.toString('hex'), settleOnChain: onSettle, settleMatch: sm, anchors: anchorCmp });
    }
  }
  Object.assign(out, { txReplayed: txTotal, signaturesValid: sigOk, signaturesInvalid: sigBad, anchorRootsMatched: `${rootsMatched}/${rootsTotal}`, settleRootsMatched: `${settleMatched}/${out.channels.length}`,
    pass: sigBad === 0 && rootsMatched === rootsTotal && settleMatched === out.channels.length && out.channels.length > 0 });
  await writeResult(`m2-replay-${RUN_ID}`, out);
  const { channels: _c, ...brief } = out; console.log(JSON.stringify(brief, null, 2));
  process.exit(out.pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
