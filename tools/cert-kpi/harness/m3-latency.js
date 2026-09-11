// M3: 작업 기록 블록체인 레이턴시 — 오프체인 GPU 노드 5개(독립 제출 프로세스) → 온체인 10노드
// 측정 정의(계획서): 트랜잭션 제출 시각 → 블록 포함 시각.
//   inclusionMs  = 제출(setValue 호출 직전) → 이벤트 노드(node8)의 VALUE_CHANGED(event_source BLOCK) 수신
//                  (= 해당 tx 를 담은 블록이 체인에 추가·실행된 시점)  ← 판정값(≤ 1,500ms)
//   finalizedMs  = 제출 → 영수증 state==='FINALIZED' 관측(250ms 폴링, 확정 시각의 상한) — 병기 참고값
// 구성: 관측(primary) 프로세스 1 + GPU 노드 역할 워커 5 (각각 서로 다른 체인 노드 node1..5 로 제출).
//       전 프로세스가 동일 호스트 시계를 사용하므로 시계 오차 없음(분산 배치 시 NTP 필수).
// 리뷰 반영: (1) 단일 프로세스 5회 순차 제출 → 5개 독립 제출 프로세스, (2) '확정' 오표기 정정 + 확정 시간 병기,
//            (3) 온체인 역검증은 is_final 읽기, (4) env 는 라이브 체인 스냅샷.
const cluster = require('cluster');
const { newAin, APP, writeResult, sleep, getValueFinalUntil } = require('./common');

const NUM_NODES = 5;
const ROUNDS = parseInt(process.env.ROUNDS || '5', 10);
const TIMEOUT_MS = 30000;
const FINAL_TIMEOUT_MS = 60000;
const STAGGER_MS = 200;          // 1단계 방법론과 동일: 노드 간 200ms 간격 순차 제출
const BASE = `/apps/${APP}/gpu_node_states`;
const RUN_ID = process.env.RUN_ID || `m3_${Date.now()}`;

if (cluster.isPrimary) {
  (async () => {
    const ain = newAin(0, 0, 11);          // 읽기: node0, 이벤트: node8 (ws:5100)
    await ain.em.connect();
    const workers = new Map();             // nodeId -> worker
    const inbox = new Map();               // `${round}:${nodeId}` -> {resolve}
    for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
      const wk = cluster.fork({ GPU_NODE_ID: String(nodeId), RUN_ID });
      wk.on('message', (m) => {
        if (m.type === 'submitted') {
          const k = `${m.round}:${m.nodeId}`;
          if (inbox.has(k)) inbox.get(k)(m);
        }
      });
      workers.set(nodeId, wk);
    }
    await sleep(1500);                     // 워커 초기화(ain-js 로드) 대기

    const samples = [];
    const perRound = [];
    for (let round = 1; round <= ROUNDS; round++) {
      const TEST_ID = `${RUN_ID}_r${round}`;
      const included = new Map();          // nodeId -> eventTs
      const pending = new Set();
      const filterIds = [];
      const submits = new Map();           // nodeId -> {submitTs, txHash, ackTs}

      const allIncluded = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`round ${round} timeout: ${[...pending].join(',')}`)), TIMEOUT_MS);
        for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
          pending.add(nodeId);
          const path = `${BASE}/${TEST_ID}/node_${nodeId}`;
          const fid = ain.em.subscribe('VALUE_CHANGED', { path, event_source: 'BLOCK' },
            () => {
              if (included.has(nodeId)) return;
              included.set(nodeId, Date.now());
              pending.delete(nodeId);
              if (pending.size === 0) { clearTimeout(timer); resolve(); }
            },
            (err) => { clearTimeout(timer); reject(new Error(`filter error: ${err.message}`)); },
            (ev) => { if (pending.has(nodeId)) { clearTimeout(timer); reject(new Error(`filter deleted before event: node ${nodeId} ${JSON.stringify(ev).slice(0, 120)}`)); } });
          filterIds.push(fid);
        }
      });
      // 구독 등록은 ack 없이 WS 로 전송되므로, 제출 전에 1 epoch 이상 기다려 필터가 이벤트 노드에 등록되도록 한다
      await sleep(1200);

      // GPU 노드 워커에 순차(200ms 간격) 제출 지시; 워커는 제출 직전 시각·tx_hash 를 회신
      for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
        const reply = new Promise((resolve) => inbox.set(`${round}:${nodeId}`, resolve));
        workers.get(nodeId).send({ type: 'submit', round, testId: TEST_ID });
        const m = await reply;
        inbox.delete(`${round}:${nodeId}`);
        if (!m.txHash) throw new Error(`gpu node ${nodeId} submit failed: ${m.error}`);
        submits.set(nodeId, m);
        if (nodeId < NUM_NODES) await sleep(STAGGER_MS);
      }
      await allIncluded;
      for (const fid of filterIds) { try { ain.em.unsubscribe(fid, () => {}); } catch {} }

      // 확정(finalization) 시각: tx 별 영수증 폴링 (state === 'FINALIZED' 최초 관측 시각) — 병기 참고값
      const finAt = new Map();               // txHash -> {ts, state, block}
      {
        let remaining = [...submits.values()].map(s => s.txHash);
        const tPoll0 = Date.now();
        while (remaining.length && Date.now() - tPoll0 < FINAL_TIMEOUT_MS) {
          const rs = await Promise.all(remaining.map(h => ain.getTransactionByHash(h).catch(() => null)));
          const now = Date.now();
          remaining = remaining.filter((h, i) => {
            const r = rs[i];
            if (r && (r.state === 'FINALIZED' || r.state === 'REVERTED')) { finAt.set(h, { ts: now, state: r.state, block: r.number ?? null }); return false; }
            return true;
          });
          if (remaining.length) await sleep(250);
        }
      }

      // 온체인 데이터 일치 역검증 (최종화 상태 기준)
      for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
        const v = (await getValueFinalUntil(ain, `${BASE}/${TEST_ID}/node_${nodeId}`, x => x && x.nodeId === nodeId && x.status === 'COMPLETED')).value;
        if (!v || v.nodeId !== nodeId || v.status !== 'COMPLETED') throw new Error(`onchain mismatch node ${nodeId} (is_final)`);
      }

      const roundSamples = [];
      for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
        const s = submits.get(nodeId);
        const st = finAt.get(s.txHash) || { ts: null, state: 'PENDING_OR_UNKNOWN', block: null };
        roundSamples.push({
          round, nodeId, txHash: s.txHash, submitNode: s.submitNode,
          inclusionMs: included.get(nodeId) - s.submitTs,
          ackMs: s.ackTs - s.submitTs,
          finalizedMs: st.state === 'FINALIZED' ? st.ts - s.submitTs : null,
          finalState: st.state, block: st.block,
        });
      }
      samples.push(...roundSamples);
      const inc = roundSamples.map(s => s.inclusionMs);
      const r = { round, avgMs: Math.round(inc.reduce((a, b) => a + b, 0) / inc.length), minMs: Math.min(...inc), maxMs: Math.max(...inc),
        finalizedAll: roundSamples.every(s => s.finalizedMs !== null) };
      perRound.push(r);
      console.log(`round ${round}: inclusion avg=${r.avgMs}ms min=${r.minMs} max=${r.maxMs} finalized=${r.finalizedAll} (${roundSamples.length}/${NUM_NODES})`);
      await sleep(1500);
    }
    for (const wk of workers.values()) wk.send({ type: 'quit' });
    ain.em.disconnect();

    const inc = samples.map(s => s.inclusionMs);
    const finl = samples.map(s => s.finalizedMs).filter(x => x !== null);
    const avgMs = Math.round(inc.reduce((a, b) => a + b, 0) / inc.length);
    const report = {
      metric: 'M3_record_latency', runId: RUN_ID, targetMs: 1500,
      definition: 'inclusionMs = submit (client, just before setValue) -> VALUE_CHANGED(event_source=BLOCK) received from event node (tx included in an executed block); finalizedMs = submit -> receipt state FINALIZED (secondary, upper bound at 250ms polling)',
      gpuNodes: NUM_NODES, rounds: ROUNDS, samples: inc.length,
      avgMs, minMs: Math.min(...inc), maxMs: Math.max(...inc),
      finalized: { count: finl.length, avgMs: finl.length ? Math.round(finl.reduce((a, b) => a + b, 0) / finl.length) : null,
        maxMs: finl.length ? Math.max(...finl) : null },
      perRound,
      confirmedAll: inc.length === NUM_NODES * ROUNDS,
      pass: avgMs <= 1500 && inc.length === NUM_NODES * ROUNDS && finl.length === NUM_NODES * ROUNDS,
    };
    await writeResult(`m3-${RUN_ID}`, { ...report, sampleDetails: samples });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.pass ? 0 : 1);
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  // GPU 노드 역할 워커: 자기 체인 노드(node<k>)로 학습 상태를 제출한다.
  const nodeId = parseInt(process.env.GPU_NODE_ID, 10);
  const ain = newAin(nodeId, null, 11 + nodeId);      // 제출 노드 node1..5, 계정 12..16
  process.on('message', async (m) => {
    if (m.type === 'quit') process.exit(0);
    if (m.type !== 'submit') return;
    const gpuState = {
      nodeId, status: 'COMPLETED', round: m.round,
      computationResult: { type: 'TRAINING', epoch: m.round, loss: Math.random() },
      gpuMetrics: { utilization: 90, memoryUsedMB: 40000, temperature: 65 },
    };
    const submitTs = Date.now();
    try {
      const res = await ain.db.ref(`${BASE}/${m.testId}/node_${nodeId}`).setValue({ value: gpuState, gas_price: 1, nonce: -1 });
      const ok = res && res.tx_hash && res.result && res.result.code === 0;
      process.send({ type: 'submitted', round: m.round, nodeId, submitTs, ackTs: Date.now(), submitNode: nodeId,
        txHash: ok ? res.tx_hash : null, error: ok ? null : JSON.stringify(res && res.result).slice(0, 200) });
    } catch (e) {
      process.send({ type: 'submitted', round: m.round, nodeId, submitTs, ackTs: Date.now(), submitNode: nodeId, txHash: null, error: String(e.message) });
    }
  });
}
