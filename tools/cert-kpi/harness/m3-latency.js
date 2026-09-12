// M3: 작업 기록 블록체인 레이턴시 — 오프체인 GPU 노드 역할 5 프로세스 → 온체인 10노드
// 측정 정의(계획서): 트랜잭션 제출 시각 → 블록 포함 시각.
//   inclusionMs  = 제출(setValue 호출 직전 시각) → 이벤트 노드(node8)의 VALUE_CHANGED(event_source BLOCK) 수신 시각
//                  (= 해당 tx 를 담은 제안 블록이 이벤트 노드에서 검증·실행된 시점 = 블록 포함) ← 판정값
//   finalizedMs  = 제출 → 영수증 state==='FINALIZED' 최초 관측(250ms 폴링, 확정 시각 상한) — 참고값(3-epoch 확정 규칙상 ≥ 2s)
//   판정 통계량 = 25건 산술평균(1단계 평가와 동일: '평균 2.273초'); p95·최대·1,500ms 초과 건수를 함께 보고
// 구성: 관측 프로세스 1 + GPU 노드 역할 워커 5 (각각 체인 노드 node1..5 로 제출, 1단계 방법론과 같은 200ms 간격 순차 제출)
// 증빙: 표본별 절대 시각(submitTs/ackTs/eventTs/finalizedTs), 이벤트 페이로드의 tx 해시 일치, 블록 번호, node9 블록 데이터 재검증, is_final 읽기 결과
// 실패 회차도 결과 JSON(pass=false)으로 남긴다(§1.3). 결과 파일·온체인 경로 가드(RUN_ID 재사용 금지).
const cluster = require('cluster');
const { newAin, NODES, APP, writeResult, envSnapshot, sleep, getValueFinalUntil, assertResultFree, assertChainPathFree, verifyTxInBlockUntil, percentile } = require('./common');

const NUM_NODES = 5;
const ROUNDS = parseInt(process.env.ROUNDS || '5', 10);
const TIMEOUT_MS = 30000;
const FINAL_TIMEOUT_MS = 60000;
const STAGGER_MS = 200;
const TARGET_MS = 1500;
const BASE = `/apps/${APP}/gpu_node_states`;
const RUN_ID = process.env.RUN_ID || `m3_${Date.now()}`;
const BLOCK_VERIFY_NODE = NODES[9];

if (cluster.isPrimary) {
  (async () => {
    assertResultFree(`m3-${RUN_ID}`);
    const ain = newAin(0, 0, 11);          // 읽기: node0, 이벤트: node8 (ws:5100)
    await assertChainPathFree(ain, `${BASE}/${RUN_ID}_r1`);
    const envBefore = await envSnapshot();
    await ain.em.connect();
    const workers = new Map();
    const inbox = new Map();
    for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
      const wk = cluster.fork({ GPU_NODE_ID: String(nodeId), RUN_ID });
      wk.on('message', (m) => { if (m.type === 'submitted') { const k = `${m.round}:${m.nodeId}`; if (inbox.has(k)) inbox.get(k)(m); } });
      workers.set(nodeId, wk);
    }
    await sleep(1500);

    const samples = [];
    const perRound = [];
    let failure = null;
    try {
      for (let round = 1; round <= ROUNDS; round++) {
        const TEST_ID = `${RUN_ID}_r${round}`;
        const included = new Map();          // nodeId -> {eventTs, txHashInEvent}
        const pending = new Set();
        const filterIds = [];
        const submits = new Map();

        const allIncluded = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`round ${round} timeout: pending nodes ${[...pending].join(',')}`)), TIMEOUT_MS);
          for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
            pending.add(nodeId);
            const path = `${BASE}/${TEST_ID}/node_${nodeId}`;
            const fid = ain.em.subscribe('VALUE_CHANGED', { path, event_source: 'BLOCK' },
              (event) => {
                if (included.has(nodeId)) return;
                const p = (event && (event.payload || event)) || {};
                const tx = p.transaction || {};
                included.set(nodeId, { eventTs: Date.now(), txHashInEvent: tx.hash || null, eventSource: p.event_source || null });
                pending.delete(nodeId);
                if (pending.size === 0) { clearTimeout(timer); resolve(); }
              },
              (err) => { clearTimeout(timer); reject(new Error(`filter error: ${err.message}`)); },
              (ev) => { if (pending.has(nodeId)) { clearTimeout(timer); reject(new Error(`filter deleted before event: node ${nodeId} ${JSON.stringify(ev).slice(0, 120)}`)); } });
            filterIds.push(fid);
          }
        });
        await sleep(1200);   // 필터 등록 전파 대기(ack 없음) — 1 epoch 이상

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

        // 확정 시각: tx 별 영수증 폴링 (FINALIZED 최초 관측)
        const finAt = new Map();
        {
          let remaining = [...submits.values()].map(s => s.txHash);
          const tPoll0 = Date.now();
          while (remaining.length && Date.now() - tPoll0 < FINAL_TIMEOUT_MS) {
            const rs = await Promise.all(remaining.map(h => ain.getTransactionByHash(h).catch(() => null)));
            const now = Date.now();
            remaining = remaining.filter((h, i) => { const r = rs[i]; if (r && (r.state === 'FINALIZED' || r.state === 'REVERTED')) { finAt.set(h, { ts: now, state: r.state, block: r.number ?? null }); return false; } return true; });
            if (remaining.length) await sleep(250);
          }
        }
        for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
          const s = submits.get(nodeId);
          const inc = included.get(nodeId);
          const st = finAt.get(s.txHash) || { ts: null, state: 'PENDING_OR_UNKNOWN', block: null };
          // is_final 읽기 결과(재시도 포함) + node9 블록 데이터 재검증
          const rb = await getValueFinalUntil(ain, `${BASE}/${TEST_ID}/node_${nodeId}`, x => x && x.nodeId === nodeId && x.status === 'COMPLETED' && x.round === round);
          const readOk = !!(rb.value && rb.value.nodeId === nodeId && rb.value.status === 'COMPLETED' && rb.value.round === round);
          const vb = st.state === 'FINALIZED' ? await verifyTxInBlockUntil(BLOCK_VERIFY_NODE, st.block, s.txHash) : { ok: false };
          samples.push({
            round, nodeId, txHash: s.txHash, submitNode: s.submitNode,
            submitTs: s.submitTs, ackTs: s.ackTs, eventTs: inc.eventTs, finalizedTs: st.ts,
            inclusionMs: inc.eventTs - s.submitTs, ackMs: s.ackTs - s.submitTs, finalizedMs: st.state === 'FINALIZED' ? st.ts - s.submitTs : null,
            eventTxHashMatch: inc.txHashInEvent === s.txHash, eventTxHash: inc.txHashInEvent,
            finalState: st.state, block: st.block, inBlockOnNode9: vb.ok, blockTimestamp: vb.blockTimestamp || null,
            isFinalReadOk: readOk, isFinalReadWaitMs: rb.waitedMs,
          });
        }
        const rs = samples.filter(s => s.round === round);
        const inc = rs.map(s => s.inclusionMs);
        const r = { round, avgMs: Math.round(inc.reduce((a, b) => a + b, 0) / inc.length), minMs: Math.min(...inc), maxMs: Math.max(...inc),
          finalizedAll: rs.every(s => s.finalizedMs !== null), distinctBlocks: new Set(rs.map(s => s.block)).size };
        perRound.push(r);
        console.log(`round ${round}: inclusion avg=${r.avgMs}ms min=${r.minMs} max=${r.maxMs} finalized=${r.finalizedAll} blocks=${r.distinctBlocks} (${rs.length}/${NUM_NODES})`);
        await sleep(1500);
      }
    } catch (e) { failure = String(e.message); console.error('RUN FAILED:', failure); }
    for (const wk of workers.values()) { try { wk.send({ type: 'quit' }); } catch {} }
    try { ain.em.disconnect(); } catch {}

    const inc = samples.map(s => s.inclusionMs);
    const finl = samples.map(s => s.finalizedMs).filter(x => x !== null);
    const avgMs = inc.length ? Math.round(inc.reduce((a, b) => a + b, 0) / inc.length) : null;
    const expected = NUM_NODES * ROUNDS;
    const report = {
      metric: 'M3_record_latency', runId: RUN_ID, targetMs: TARGET_MS,
      definition: 'inclusionMs = submit (client, just before setValue) -> VALUE_CHANGED(event_source=BLOCK) received from event node node8 (the block containing the tx was validated+executed on that node = block inclusion); judged statistic = arithmetic mean of all samples (Stage-1 convention); finalizedMs = submit -> receipt state FINALIZED first observed (250 ms polling; 3-epoch finality rule => >= ~2 s) reported as secondary',
      gpuNodes: NUM_NODES, rounds: ROUNDS, samples: inc.length, expectedSamples: expected,
      avgMs, minMs: inc.length ? Math.min(...inc) : null, maxMs: inc.length ? Math.max(...inc) : null,
      p95Ms: inc.length ? percentile(inc, 0.95) : null, samplesOverTarget: inc.filter(x => x > TARGET_MS).length,
      distinctBlocks: new Set(samples.map(s => s.block)).size,
      finalized: { count: finl.length, avgMs: finl.length ? Math.round(finl.reduce((a, b) => a + b, 0) / finl.length) : null, maxMs: finl.length ? Math.max(...finl) : null },
      eventTxHashMatched: samples.filter(s => s.eventTxHashMatch).length,
      inBlockOnNode9: samples.filter(s => s.inBlockOnNode9).length,
      isFinalReadOk: samples.filter(s => s.isFinalReadOk).length,
      perRound, failure,
      confirmedAll: inc.length === expected,
      pass: failure === null && avgMs !== null && avgMs <= TARGET_MS && inc.length === expected && finl.length === expected
        && samples.every(s => s.eventTxHashMatch && s.inBlockOnNode9 && s.isFinalReadOk),
    };
    await writeResult(`m3-${RUN_ID}`, { ...report, sampleDetails: samples }, envBefore);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.pass ? 0 : 1);
  })().catch(e => { console.error(e); process.exit(1); });
} else {
  const nodeId = parseInt(process.env.GPU_NODE_ID, 10);
  const ain = newAin(nodeId, null, 11 + nodeId);      // 제출 노드 node1..5, 계정 12..16
  process.on('message', async (m) => {
    if (m.type === 'quit') process.exit(0);
    if (m.type !== 'submit') return;
    const gpuState = {
      nodeId, status: 'COMPLETED', round: m.round,
      computationResult: { type: 'TRAINING', epoch: m.round, loss: Math.random() },
      gpuMetrics: { utilization: 90, memoryUsedMB: 40000, temperature: 65 },   // 시뮬레이션 값(리허설): 실 GPU 노드 배치 시 nvidia-smi 샘플로 대체
    };
    const submitTs = Date.now();
    try {
      const res = await ain.db.ref(`${BASE}/${m.testId}/node_${nodeId}`).setValue({ value: gpuState, gas_price: 1, nonce: -1 });
      const ok = res && res.tx_hash && res.result && res.result.code === 0;
      process.send({ type: 'submitted', round: m.round, nodeId, submitTs, ackTs: Date.now(), submitNode: nodeId, txHash: ok ? res.tx_hash : null, error: ok ? null : JSON.stringify(res && res.result).slice(0, 200) });
    } catch (e) {
      process.send({ type: 'submitted', round: m.round, nodeId, submitTs, ackTs: Date.now(), submitNode: nodeId, txHash: null, error: String(e.message) });
    }
  });
}
