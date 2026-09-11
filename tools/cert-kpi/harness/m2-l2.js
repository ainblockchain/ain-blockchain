// M2: 레이어2 스테이트 채널 TPS — 목표 최대 7,000 TPS (1초 윈도우)
// 채널 tx = ed25519 사용자 서명 → 채널 서명 검증 → sha256 상태 전이 (오프체인 실서명 채널)
// 온체인: 채널 open / 주기적 앵커 / 정산(settle) 기록 + 최종화 영수증 + 앵커 수 교차 검증
// 역검증은 최종화 상태(is_final) 읽기 + state==='FINALIZED' 영수증만 인정
const cluster = require('cluster');
const crypto = require('crypto');
const { newAin, APP, writeResult, percentile, sleep, waitFinalized, getValueFinalUntil } = require('./common');

const W = parseInt(process.env.W || '5', 10);
const CHANNELS_PER_W = parseInt(process.env.CPW || '4', 10);   // 총 20 채널
const USERS_PER_W = parseInt(process.env.UPW || '40', 10);     // 총 200 유저
const DURATION_MS = parseInt(process.env.DUR || '60000', 10);
const ANCHOR_EVERY = 10000;
const BASE = `/apps/${APP}/state_channels`;
const RUN_ID = process.env.RUN_ID || `run_${Date.now()}`;
const LATENCY_DEFINITION =
  'per-tx closed-loop service time inside channel engine: ed25519 sign -> signature verify -> state-transition apply; client-side, excludes network transport';

class StateChannel {
  constructor(gid) {
    this.gid = gid; this.seq = 0; this.root = Buffer.alloc(32);
    this.sinceAnchor = 0; this.anchorsOk = 0; this.rejected = 0; this.anchorTxs = []; this.anchors = [];   // anchors: {seq, root, txHash, err}
  }
  // 채널 tx: 사용자 서명 검증 후 상태 전이
  send(payload, header, sig, pubKey) {
    if (!crypto.verify(null, header, pubKey, sig)) { this.rejected++; return -1; }
    this.seq++;
    const h = crypto.createHash('sha256');
    h.update(this.root); h.update(header); h.update(payload);
    this.root = h.digest();
    this.sinceAnchor++;
    return this.seq;
  }
}

if (cluster.isPrimary) {
  (async () => {
    const ain = newAin(0, null, 11);
    const totalCh = W * CHANNELS_PER_W;
    const openRes = await Promise.all(Array.from({ length: totalCh }, (_, g) =>
      ain.db.ref(`${BASE}/${RUN_ID}/channel_${g}/open`).setValue({
        value: { participants: (W * USERS_PER_W) / totalCh, ts: Date.now() },
        gas_price: 1, nonce: -1,
      })));
    if (openRes.some(r => !r.tx_hash || r.result.code !== 0)) {
      console.error('channel open failed'); process.exit(1);
    }
    console.log(`[master] ${totalCh} channels opened on-chain (run=${RUN_ID})`);

    const t0 = Date.now() + 1500;
    const reports = [];
    const exitCodes = [];
    for (let w = 0; w < W; w++) {
      const wk = cluster.fork({ WID: String(w), T0: String(t0), RUN_ID });  // RUN_ID 전파
      wk.on('message', (m) => { if (m.type === 'report') reports.push(m); });
    }
    await new Promise((resolve) => {
      let exited = 0;
      cluster.on('exit', (worker, code) => { exitCodes.push(code); if (++exited === W) resolve(); });
    });
    // 리포트 완전성 대기(IPC 순서 레이스 대비) 및 검증
    for (let i = 0; i < 50 && reports.length < W; i++) await sleep(100);
    if (reports.length !== W || exitCodes.some(c => c !== 0)) {
      console.error(`incomplete run: reports=${reports.length}/${W} exitCodes=${exitCodes}`);
      process.exit(1);
    }

    const seconds = Math.ceil(DURATION_MS / 1000);
    const tpsPerSecond = new Array(seconds).fill(0);
    let totalTx = 0, totalRejected = 0; const latSamples = [];
    const settles = [];
    for (const r of reports) {
      r.perSecond.forEach((c, s) => { if (s < seconds) tpsPerSecond[s] += c; });
      totalTx += r.txCount; totalRejected += r.rejected;
      latSamples.push(...r.latSampleUs);
      settles.push(...r.channels);
    }
    if (settles.length !== totalCh) {
      console.error(`channel report incomplete: ${settles.length}/${totalCh}`); process.exit(1);
    }

    // 앵커 tx 최종화 영수증 (워커가 제출한 앵커가 전부 FINALIZED 될 때까지 대기 — 정산보다 늦게 블록에 실릴 수 있음)
    const anchorHashes = settles.flatMap(c => c.anchorTxs || []);
    const anchorFin = await waitFinalized(ain, anchorHashes, 180000, 2000);
    // 정산 온체인 기록 (+ 최종화 영수증)
    const settleRes = await Promise.all(settles.map(c =>
      ain.db.ref(`${BASE}/${RUN_ID}/channel_${c.gid}/settle`).setValue({
        value: { finalRoot: c.root, totalSeq: c.seq, anchors: c.anchors.length, ts: Date.now() },
        gas_price: 1, nonce: -1,
      })));
    const fin = await waitFinalized(ain, settleRes.map(r => r.tx_hash), 90000);

    // 역검증 1: settle 데이터 일치
    let settledOk = 0;
    for (const c of settles) {
      const v = (await getValueFinalUntil(ain, `${BASE}/${RUN_ID}/channel_${c.gid}/settle`, x => x && x.finalRoot === c.root && x.totalSeq === c.seq)).value;
      if (v && v.finalRoot === c.root && v.totalSeq === c.seq) settledOk++;
    }
    // 역검증 2: 워커가 시도한 모든 앵커(seq)가 온체인(is_final)에 존재하고 루트가 일치해야 채널 consistent
    //   (응답 타임아웃으로 워커가 성공 집계를 못 해도 tx 는 포함될 수 있으므로 '개수' 가 아니라 seq·root 집합으로 대조)
    let anchorsConsistent = 0, anchorsAttempted = 0, anchorsMatched = 0;
    for (const c of settles) {
      const a = (await getValueFinalUntil(ain, `${BASE}/${RUN_ID}/channel_${c.gid}/anchors`, x => !!x && c.anchors.every(r => x[String(r.seq)] && x[String(r.seq)].root === r.root))).value || {};
      let ok = true;
      for (const r of c.anchors) {
        anchorsAttempted++;
        const v = a[String(r.seq)];
        if (v && v.root === r.root) anchorsMatched++; else { ok = false; console.error(`channel ${c.gid}: anchor seq ${r.seq} missing/mismatch onchain (err=${r.err})`); }
      }
      if (ok) anchorsConsistent++;
    }

    const maxTPS = Math.max(...tpsPerSecond);
    const midSlice = tpsPerSecond.slice(1, seconds - 1);
    const avgTPS = Math.round(midSlice.reduce((a, b) => a + b, 0) / midSlice.length);
    const p50us = percentile(latSamples, 0.5), p99us = percentile(latSamples, 0.99);

    const report = {
      metric: 'M2_l2_state_channel_tps', runId: RUN_ID, target: 7000,
      workers: W, channels: settles.length, users: W * USERS_PER_W,
      durationMs: DURATION_MS, totalTx, totalRejectedSigs: totalRejected,
      txDefinition: 'ed25519-signed channel tx, signature verified before state transition',
      latencyDefinition: LATENCY_DEFINITION,
      maxTPS, sustainedTPS: avgTPS,
      p50LatencyMs: +(p50us / 1000).toFixed(3), p99LatencyMs: +(p99us / 1000).toFixed(3),
      channelsSettledOnChain: `${settledOk}/${totalCh}`,
      settleTxsFinalized: `${fin.finalizedCount}/${totalCh}`,
      anchorsConsistent: `${anchorsConsistent}/${totalCh}`,
      anchorsOnChain: `${anchorsMatched}/${anchorsAttempted}`,
      anchorTxsFinalized: `${anchorFin.finalizedCount}/${anchorHashes.length}`,
      tpsPerSecond,
      latencySamples: latSamples.length,
      pass: maxTPS >= 7000 && latSamples.length >= 100 && (p50us / 1000) < 50 && (p99us / 1000) < 500
        && settledOk === totalCh && fin.allFinalized
        && anchorsAttempted > 0 && anchorsMatched === anchorsAttempted && anchorsConsistent === totalCh && anchorFin.allFinalized
        && totalRejected === 0,
    };
    await writeResult(`m2-${RUN_ID}`, report);
    const { tpsPerSecond: _, ...brief } = report;
    console.log(JSON.stringify(brief, null, 2));
    process.exit(report.pass ? 0 : 1);
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  (async () => {
    const WID = parseInt(process.env.WID, 10);
    const T0 = parseInt(process.env.T0, 10);
    if (!process.env.RUN_ID) throw new Error('RUN_ID not propagated');
    const ain = newAin(WID % 10, null, 12 + (WID % 8));
    const channels = Array.from({ length: CHANNELS_PER_W },
      (_, i) => new StateChannel(WID * CHANNELS_PER_W + i));
    // 유저별 ed25519 키쌍 (실서명 채널 참가자)
    const users = Array.from({ length: USERS_PER_W }, () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      return { publicKey, privateKey };
    });
    const POOL = crypto.randomBytes(100 * 1024);

    const perSecond = new Array(Math.ceil(DURATION_MS / 1000) + 2).fill(0);
    const latSampleUs = [];
    let txCount = 0, rejected = 0;
    const anchorPromises = [];

    // 동기 시작 대기 (리뷰 반영: busy-spin 대신 타이머 — 검증자와 코어를 공유하는 호스트)
    if (Date.now() < T0) await sleep(T0 - Date.now());
    const start = T0;
    let u = 0;
    while (true) {
      const now = Date.now();
      if (now - start >= DURATION_MS) break;
      u = (u + 1) % USERS_PER_W;
      const user = users[u];
      const ch = channels[u % CHANNELS_PER_W];
      const size = 1024 + ((Math.random() * 99 * 1024) | 0);
      const payload = POOL.subarray(0, size);
      const header = Buffer.alloc(24);
      header.writeUInt32LE(u, 0); header.writeUInt32LE(ch.seq, 4);
      header.writeUInt32LE(size, 8); header.writeBigUInt64LE(BigInt(now), 12);

      const tStart = process.hrtime.bigint();
      const sig = crypto.sign(null, header, user.privateKey);      // 사용자 서명
      const seq = ch.send(payload, header, sig, user.publicKey);   // 채널: 검증 + 상태전이
      const tEnd = process.hrtime.bigint();
      if (seq < 0) { rejected++; continue; }
      txCount++;
      const sec = ((now - start) / 1000) | 0;
      perSecond[sec]++;
      if (txCount % 97 === 0) latSampleUs.push(Number(tEnd - tStart) / 1000);
      if (ch.sinceAnchor >= ANCHOR_EVERY) {
        ch.sinceAnchor = 0;
        const gid = ch.gid, seqNow = ch.seq, rootNow = ch.root.toString('hex');
        const rec = { seq: seqNow, root: rootNow, txHash: null, err: null };
        ch.anchors.push(rec);
        anchorPromises.push(
          ain.db.ref(`${BASE}/${RUN_ID}/channel_${gid}/anchors/${seqNow}`).setValue({
            value: { root: rootNow, seq: seqNow, ts: Date.now() },
            gas_price: 1, nonce: -1,
          }).then(r => {
            if (r && r.tx_hash && r.result.code === 0) { ch.anchorsOk++; ch.anchorTxs.push(r.tx_hash); rec.txHash = r.tx_hash; }
            else rec.err = JSON.stringify(r && r.result).slice(0, 120);
          }).catch(e => { rec.err = String(e.message).slice(0, 120); }));   // HTTP 타임아웃 등: tx 는 노드에 도달해 포함될 수 있음 → 온체인 대조로 판정
      }
      if ((txCount & 1023) === 0) await new Promise(r => setImmediate(r));
    }
    await Promise.allSettled(anchorPromises);
    const msg = {
      type: 'report', wid: WID, txCount, rejected, perSecond, latSampleUs,
      channels: channels.map(c => ({ gid: c.gid, seq: c.seq, root: c.root.toString('hex'), anchorsOk: c.anchorsOk, anchorTxs: c.anchorTxs, anchors: c.anchors })),
    };
    // 리뷰 반영: IPC 플러시 완료 후 종료
    process.send(msg, (err) => process.exit(err ? 1 : 0));
  })().catch(e => { console.error('worker error', e); process.exit(1); });
}
