// M2: 레이어2 스테이트 채널 TPS — 목표 최대 7,000 TPS (1초 윈도우, 1단계 '최대 TPS' 판정 방식 승계; 지속 TPS 병기)
// 채널 tx = 참가자 ed25519 서명(헤더 24B ‖ sha256(payload)) → 채널의 참가자 등록 확인·seq 검사·서명 검증 → 상태 전이(sha256 루트)
// 온체인(10노드 인증망): 채널 open(참가자 공개키 등록) / 앵커(채널당 10,000 tx 마다 루트) / 정산(settle) — 전부 FINALIZED 영수증 + is_final 일치 + 블록 재검증
// 재현 가능성: payload 는 (RUN_ID, WID) 시드의 결정적 바이트열, 워커별 tx 로그(헤더·서명·참가자·payload 길이)를 results/m2_txlog_<run>/ 에 보존
//   → m2-replay-verify.js 가 로그를 재생해 온체인 앵커·정산 루트를 재계산 대조한다.
// 구성: 채널 엔진 워커 5 프로세스(각 채널 4·참가자 40), 워커 k 는 node k 로 앵커 제출. 서명·검증·전이는 워커 프로세스 안의 폐루프(1단계와 동일 방법론)이며
//   네트워크 전송을 포함하지 않는다(결과 JSON latencyDefinition/engineDefinition 에 명시).
const cluster = require('cluster');
const crypto = require('crypto');
const fs = require('fs');
const { newAin, NODES, APP, RESULTS_DIR, writeResult, envSnapshot, percentile, sleep, waitFinalized, getValueFinalUntil, assertResultFree, assertChainPathFree, verifyTxInBlockUntil } = require('./common');

const W = parseInt(process.env.W || '5', 10);
const CHANNELS_PER_W = parseInt(process.env.CPW || '4', 10);   // 총 20 채널
const USERS_PER_W = parseInt(process.env.UPW || '40', 10);     // 총 200 참가자
const DURATION_MS = parseInt(process.env.DUR || '60000', 10);
const ANCHOR_EVERY = parseInt(process.env.ANCHOR_EVERY || '10000', 10);   // 채널당 앵커 주기(tx). 60초 본시험 10,000; 짧은 샘플링 실행은 2,000 권장
const TARGET = 7000;
const BASE = `/apps/${APP}/state_channels`;
const RUN_ID = process.env.RUN_ID || `run_${Date.now()}`;
const BLOCK_VERIFY_NODE = NODES[9];
const TXLOG_DIR = `${RESULTS_DIR}/m2_txlog_${RUN_ID}`;
const REC = 24 + 64 + 2;   // tx 로그 레코드: header(24) + sig(64) + userIdx(u16)
const LATENCY_DEFINITION =
  'per-tx closed-loop service time inside the channel engine process: ed25519 sign -> participant/seq check -> signature verify -> state-transition apply; excludes network transport';
const ENGINE_DEFINITION =
  'off-chain state channel engine running in 5 worker processes (no socket transport between participant and channel; same in-process methodology as the Stage-1 accepted test); on-chain = open/anchor/settle records on the 10-validator certification chain';

// 결정적 payload 풀: sha256(seed ‖ counter) 스트림 (재생 검증용)
function makePool(seed, bytes) {
  const chunks = []; let n = 0, i = 0;
  while (n < bytes) { const c = crypto.createHash('sha256').update(`${seed}:${i++}`).digest(); chunks.push(c); n += c.length; }
  return Buffer.concat(chunks).subarray(0, bytes);
}

class StateChannel {
  constructor(gid, participants) {
    this.gid = gid; this.seq = 0; this.root = Buffer.alloc(32);
    this.participants = participants;     // Map<pubKeyHex, KeyObject>
    this.sinceAnchor = 0; this.anchorsOk = 0; this.rejected = 0; this.anchorTxs = []; this.anchors = [];
  }
  // 채널 tx: 참가자 등록 확인 → seq 검사 → 서명 검증(헤더‖payloadHash) → 상태 전이
  send(header, payloadHash, sig, pubHex) {
    const key = this.participants.get(pubHex);
    if (!key || header.readUInt32LE(4) !== this.seq) { this.rejected++; return -1; }
    const msg = Buffer.concat([header, payloadHash]);
    if (!crypto.verify(null, msg, key, sig)) { this.rejected++; return -1; }
    this.seq++;
    this.root = crypto.createHash('sha256').update(this.root).update(header).update(payloadHash).digest();
    this.sinceAnchor++;
    return this.seq;
  }
}

if (cluster.isPrimary) {
  (async () => {
    assertResultFree(`m2-${RUN_ID}`);
    const ain = newAin(0, null, 11);
    await assertChainPathFree(ain, `${BASE}/${RUN_ID}`);
    if (fs.existsSync(TXLOG_DIR)) throw new Error(`${TXLOG_DIR} exists — use a new RUN_ID`);
    fs.mkdirSync(TXLOG_DIR, { recursive: true });
    const envBefore = await envSnapshot();
    const totalCh = W * CHANNELS_PER_W;

    // 참가자 키쌍은 워커가 생성하므로, 먼저 워커를 띄워 공개키 목록을 받고 → 채널 open(참가자 등록) → 시작 신호
    const reports = [], exitCodes = [], keysByWid = new Map();
    const workers = [];
    for (let w = 0; w < W; w++) {
      const wk = cluster.fork({ WID: String(w), RUN_ID });
      wk.on('message', (m) => { if (m.type === 'keys') keysByWid.set(m.wid, m.pubKeys); if (m.type === 'report') reports.push(m); });
      workers.push(wk);
    }
    for (let i = 0; i < 300 && keysByWid.size < W; i++) await sleep(100);
    if (keysByWid.size !== W) { console.error('workers did not report keys'); process.exit(1); }

    // Step 1: 채널 open — 참가자 공개키 등록 (채널 g 의 참가자 = 워커 w 의 유저 중 u % CPW === i)
    const openRes = [];
    for (let g = 0; g < totalCh; g++) {
      const w = Math.floor(g / CHANNELS_PER_W), i = g % CHANNELS_PER_W;
      const pubs = keysByWid.get(w).filter((_, u) => u % CHANNELS_PER_W === i);
      // AIN DB 는 배열 값을 허용하지 않으므로 참가자 공개키를 {pubKeyHex: index} 맵으로 등록
      const r = await ain.db.ref(`${BASE}/${RUN_ID}/channel_${g}/open`).setValue({
        value: { participants: Object.fromEntries(pubs.map((p, i) => [p, i])), count: pubs.length, ts: Date.now() }, gas_price: 1, nonce: -1,
      });
      if (!r || !r.tx_hash || r.result.code !== 0) { console.error(`channel ${g} open failed`); process.exit(1); }
      openRes.push({ gid: g, txHash: r.tx_hash, participants: pubs });
    }
    const openFin = await waitFinalized(ain, openRes.map(r => r.txHash), 120000);
    if (!openFin.allFinalized) { console.error('channel open txs not finalized'); process.exit(1); }
    console.log(`[master] ${totalCh} channels opened + finalized on-chain (run=${RUN_ID})`);

    const t0 = Date.now() + 1500;
    for (const wk of workers) wk.send({ type: 'start', t0 });
    await new Promise((resolve) => { let exited = 0; cluster.on('exit', (worker, code) => { exitCodes.push(code); if (++exited === W) resolve(); }); });
    for (let i = 0; i < 50 && reports.length < W; i++) await sleep(100);
    if (reports.length !== W || exitCodes.some(c => c !== 0)) { console.error(`incomplete run: reports=${reports.length}/${W} exitCodes=${exitCodes}`); process.exit(1); }

    const seconds = Math.ceil(DURATION_MS / 1000);
    const tpsPerSecond = new Array(seconds).fill(0);
    let totalTx = 0, totalRejected = 0; const latSamples = []; const settles = [];
    for (const r of reports) {
      r.perSecond.forEach((c, s) => { if (s < seconds) tpsPerSecond[s] += c; });
      totalTx += r.txCount; totalRejected += r.rejected; latSamples.push(...r.latSampleUs); settles.push(...r.channels);
    }
    if (settles.length !== totalCh) { console.error(`channel report incomplete: ${settles.length}/${totalCh}`); process.exit(1); }

    // 앵커 tx 최종화 영수증
    const anchorHashes = settles.flatMap(c => c.anchorTxs || []);
    const anchorFin = await waitFinalized(ain, anchorHashes, 180000, 2000);
    // 정산 기록 + 영수증
    const settleRes = await Promise.all(settles.map(c =>
      ain.db.ref(`${BASE}/${RUN_ID}/channel_${c.gid}/settle`).setValue({
        value: { finalRoot: c.root, totalSeq: c.seq, anchors: c.anchors.length, ts: Date.now() }, gas_price: 1, nonce: -1,
      }).then(r => ({ gid: c.gid, txHash: r && r.tx_hash, code: r && r.result && r.result.code }))));
    if (settleRes.some(r => !r.txHash || r.code !== 0)) { console.error('settle failed'); process.exit(1); }
    const fin = await waitFinalized(ain, settleRes.map(r => r.txHash), 120000);

    // 역검증 1: settle 값 (is_final, 재시도)  2: 앵커 seq·root 집합 + 개수 == floor(seq/ANCHOR_EVERY)  3: open 참가자 목록
    let settledOk = 0, anchorsConsistent = 0, anchorsAttempted = 0, anchorsMatched = 0, opensOk = 0, readerWaitMs = 0;
    for (const c of settles) {
      const s = await getValueFinalUntil(ain, `${BASE}/${RUN_ID}/channel_${c.gid}/settle`, x => x && x.finalRoot === c.root && x.totalSeq === c.seq);
      readerWaitMs += s.waitedMs;
      if (s.value && s.value.finalRoot === c.root && s.value.totalSeq === c.seq) settledOk++;
      const expected = Math.floor(c.seq / ANCHOR_EVERY);
      // 제출 자체가 실패한 앵커(txHash 없음)는 기다리지 않고 즉시 불일치로 계산; 제출된 앵커만 is_final 로 재시도 대기
      const submittedAnchors = c.anchors.filter(r => r.txHash);
      const a = submittedAnchors.length === 0 ? {} :
        (await getValueFinalUntil(ain, `${BASE}/${RUN_ID}/channel_${c.gid}/anchors`, x => !!x && submittedAnchors.every(r => x[String(r.seq)] && x[String(r.seq)].root === r.root))).value || {};
      let ok = c.anchors.length === expected;
      for (const r of c.anchors) { anchorsAttempted++; const v = a[String(r.seq)]; if (v && v.root === r.root) anchorsMatched++; else { ok = false; console.error(`channel ${c.gid}: anchor seq ${r.seq} missing/mismatch (err=${r.err})`); } }
      if (ok) anchorsConsistent++;
      const reg = openRes.find(r => r.gid === c.gid).participants;
      const o = (await getValueFinalUntil(ain, `${BASE}/${RUN_ID}/channel_${c.gid}/open`, x => !!x && x.participants && Object.keys(x.participants).length === reg.length)).value;
      if (o && o.participants && reg.every((p, i) => o.participants[p] === i) && Object.keys(o.participants).length === reg.length) opensOk++;
    }
    // 블록 재검증 (node9): open + anchor + settle 전 tx
    const allTx = [...openRes.map(r => ({ kind: 'open', gid: r.gid, txHash: r.txHash, fin: openFin.status.get(r.txHash) })),
                   ...settles.flatMap(c => c.anchors.filter(a => a.txHash).map(a => ({ kind: 'anchor', gid: c.gid, seq: a.seq, txHash: a.txHash, fin: anchorFin.status.get(a.txHash) }))),
                   ...settleRes.map(r => ({ kind: 'settle', gid: r.gid, txHash: r.txHash, fin: fin.status.get(r.txHash) }))];
    let inBlockOk = 0; const txReceipts = {};
    for (const t of allTx) {
      const vb = t.fin && t.fin.finalized ? await verifyTxInBlockUntil(BLOCK_VERIFY_NODE, t.fin.blockNumber, t.txHash) : { ok: false };
      if (vb.ok) inBlockOk++;
      txReceipts[t.txHash] = { kind: t.kind, gid: t.gid, seq: t.seq, state: t.fin ? t.fin.state : null, block: t.fin ? t.fin.blockNumber : null, inBlockOnNode9: vb.ok };
    }

    const maxTPS = Math.max(...tpsPerSecond);
    const midSlice = tpsPerSecond.slice(1, seconds - 1);
    const sustainedTPS = Math.round(midSlice.reduce((a, b) => a + b, 0) / midSlice.length);
    const avgTPS = Math.round(totalTx / (DURATION_MS / 1000));
    const p50us = percentile(latSamples, 0.5), p99us = percentile(latSamples, 0.99);
    const windowsBelowTarget = tpsPerSecond.filter(x => x < TARGET).length;

    const report = {
      metric: 'M2_l2_state_channel_tps', runId: RUN_ID, target: TARGET,
      judgedStatistic: 'maxTPS (1-second window maximum; Stage-1 accepted statistic). sustainedTPS (mid-window mean) and avgTPS (60 s mean) reported alongside',
      workers: W, channels: settles.length, users: W * USERS_PER_W, durationMs: DURATION_MS,
      totalTx, totalRejectedSigs: totalRejected,
      txDefinition: 'ed25519-signed channel tx over header(24B: user, seq, size, ts) || sha256(payload 1-100KB); channel verifies participant registration (on-chain open record), seq, signature before state transition',
      engineDefinition: ENGINE_DEFINITION, latencyDefinition: LATENCY_DEFINITION,
      maxTPS, sustainedTPS, avgTPS, windowsBelowTarget,
      latencySamples: latSamples.length, p50LatencyMs: +(p50us / 1000).toFixed(3), p99LatencyMs: +(p99us / 1000).toFixed(3),
      channelsOpenedOnChain: `${opensOk}/${totalCh}`, openTxsFinalized: `${openFin.finalizedCount}/${totalCh}`,
      channelsSettledOnChain: `${settledOk}/${totalCh}`, settleTxsFinalized: `${fin.finalizedCount}/${totalCh}`,
      anchorsConsistent: `${anchorsConsistent}/${totalCh}`, anchorsOnChain: `${anchorsMatched}/${anchorsAttempted}`, anchorTxsFinalized: `${anchorFin.finalizedCount}/${anchorHashes.length}`,
      txsInBlockOnNode9: `${inBlockOk}/${allTx.length}`, readerFinalizationWaitMs: readerWaitMs,
      anchorEvery: ANCHOR_EVERY, txLogDir: TXLOG_DIR, replayVerifier: 'm2-replay-verify.js',
      channelsFinal: settles.map(c => ({ gid: c.gid, seq: c.seq, root: c.root, anchors: c.anchors.map(a => ({ seq: a.seq, root: a.root, txHash: a.txHash })) })),
      tpsPerSecond,
      pass: maxTPS >= TARGET && latSamples.length >= 100 && (p50us / 1000) < 50 && (p99us / 1000) < 500
        && opensOk === totalCh && openFin.allFinalized
        && settledOk === totalCh && fin.allFinalized
        && anchorsAttempted > 0 && anchorsMatched === anchorsAttempted && anchorsConsistent === totalCh && anchorFin.allFinalized
        && inBlockOk === allTx.length && totalRejected === 0,
    };
    await writeResult(`m2-${RUN_ID}`, { ...report, txReceipts }, envBefore);
    const { tpsPerSecond: _t, channelsFinal: _c, txReceipts: _r, ...brief } = report;
    console.log(JSON.stringify(brief, null, 2));
    process.exit(report.pass ? 0 : 1);
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  (async () => {
    const WID = parseInt(process.env.WID, 10);
    if (!process.env.RUN_ID) throw new Error('RUN_ID not propagated');
    const ain = newAin(WID % 10, null, 12 + (WID % 8));
    // 참가자 키쌍 (워커 시작 시 생성 → 공개키를 마스터에 보고 → 온체인 open 에 등록)
    const users = Array.from({ length: USERS_PER_W }, () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
      return { publicKey, privateKey, hex: raw };
    });
    const channels = Array.from({ length: CHANNELS_PER_W }, (_, i) => {
      const parts = new Map(users.filter((_, u) => u % CHANNELS_PER_W === i).map(u => [u.hex, u.publicKey]));
      return new StateChannel(WID * CHANNELS_PER_W + i, parts);
    });
    process.send({ type: 'keys', wid: WID, pubKeys: users.map(u => u.hex) });
    const T0 = await new Promise(res => process.on('message', m => { if (m.type === 'start') res(m.t0); }));

    const POOL = makePool(`${RUN_ID}:${WID}`, 100 * 1024);
    const log = fs.openSync(`${TXLOG_DIR}/w${WID}.bin`, 'w');
    fs.writeFileSync(`${TXLOG_DIR}/w${WID}.json`, JSON.stringify({ wid: WID, run: RUN_ID, poolSeed: `${RUN_ID}:${WID}`, poolBytes: 100 * 1024, record: 'header24|sig64|userIdx u16', users: users.map(u => u.hex), channels: channels.map(c => c.gid) }));
    let logBuf = Buffer.alloc(REC * 4096), logOff = 0;
    const flushLog = () => { if (logOff) { fs.writeSync(log, logBuf, 0, logOff); logOff = 0; } };

    const perSecond = new Array(Math.ceil(DURATION_MS / 1000) + 2).fill(0);
    const latSampleUs = [];
    let txCount = 0, rejected = 0;
    const anchorPromises = [];
    // 결정적 크기 시퀀스 (재생용): 1KB ~ 100KB
    let sizeState = 0x9e3779b9 ^ WID;
    const nextSize = () => { sizeState = (Math.imul(sizeState, 1664525) + 1013904223) >>> 0; return 1024 + (sizeState % (99 * 1024)); };

    if (Date.now() < T0) await sleep(T0 - Date.now());
    const start = T0;
    let u = 0;
    while (true) {
      const now = Date.now();
      if (now - start >= DURATION_MS) break;
      u = (u + 1) % USERS_PER_W;
      const user = users[u];
      const ch = channels[u % CHANNELS_PER_W];
      const size = nextSize();
      const payload = POOL.subarray(0, size);
      const header = Buffer.alloc(24);
      header.writeUInt32LE(u, 0); header.writeUInt32LE(ch.seq, 4); header.writeUInt32LE(size, 8); header.writeBigUInt64LE(BigInt(now), 12);

      const tStart = process.hrtime.bigint();
      const payloadHash = crypto.createHash('sha256').update(payload).digest();          // 참가자 측: payload 해시
      const sig = crypto.sign(null, Buffer.concat([header, payloadHash]), user.privateKey); // 참가자 서명 (헤더‖payloadHash)
      const seq = ch.send(header, payloadHash, sig, user.hex);                              // 채널: 등록·seq·서명 검증 + 전이
      const tEnd = process.hrtime.bigint();
      if (seq < 0) { rejected++; continue; }
      txCount++;
      header.copy(logBuf, logOff); sig.copy(logBuf, logOff + 24); logBuf.writeUInt16LE(u, logOff + 88); logOff += REC;
      if (logOff >= logBuf.length) flushLog();
      const sec = ((now - start) / 1000) | 0;
      perSecond[sec]++;
      if (txCount % 97 === 0) latSampleUs.push(Number(tEnd - tStart) / 1000);
      if (ch.sinceAnchor >= ANCHOR_EVERY) {
        ch.sinceAnchor = 0;
        const gid = ch.gid, seqNow = ch.seq, rootNow = ch.root.toString('hex');
        const rec = { seq: seqNow, root: rootNow, txHash: null, err: null };
        ch.anchors.push(rec);
        anchorPromises.push(
          ain.db.ref(`${BASE}/${RUN_ID}/channel_${gid}/anchors/${seqNow}`).setValue({ value: { root: rootNow, seq: seqNow, ts: Date.now() }, gas_price: 1, nonce: -1 })
            .then(r => { if (r && r.tx_hash && r.result.code === 0) { ch.anchorsOk++; ch.anchorTxs.push(r.tx_hash); rec.txHash = r.tx_hash; } else rec.err = JSON.stringify(r && r.result).slice(0, 120); })
            .catch(e => { rec.err = String(e.message).slice(0, 120); }));
      }
      if ((txCount & 1023) === 0) await new Promise(r => setImmediate(r));
    }
    flushLog(); fs.closeSync(log);
    await Promise.allSettled(anchorPromises);
    const msg = {
      type: 'report', wid: WID, txCount, rejected, perSecond, latSampleUs,
      channels: channels.map(c => ({ gid: c.gid, seq: c.seq, root: c.root.toString('hex'), anchorsOk: c.anchorsOk, anchorTxs: c.anchorTxs, anchors: c.anchors })),
    };
    process.send(msg, (err) => process.exit(err ? 1 : 0));
  })().catch(e => { console.error('worker error', e); process.exit(1); });
}
