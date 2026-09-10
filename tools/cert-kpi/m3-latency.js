// M3: 작업기록 블록체인 레이턴시 — 제출→VALUE_CHANGED(BLOCK, 확정) 이벤트 수신
// GPU 노드 5개 역할의 상태 제출 × ROUNDS회 반복 → 평균 ≤ 1500ms 판정
const { newAin, APP, writeResult, sleep } = require('./common');

const NUM_NODES = 5;
const ROUNDS = parseInt(process.env.ROUNDS || '5', 10);
const TIMEOUT_MS = 30000;
const BASE = `/apps/${APP}/gpu_node_states`;

async function runRound(ain, round) {
  const TEST_ID = `test_${Date.now()}_${round}`;
  const submits = new Map();
  const confirmations = [];
  const pending = new Set();
  const filterIds = [];

  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${[...pending].join(',')}`)), TIMEOUT_MS);
    for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
      pending.add(nodeId);
      const path = `${BASE}/${TEST_ID}/node_${nodeId}`;
      const fid = ain.em.subscribe('VALUE_CHANGED', { path, event_source: 'BLOCK' },
        (event) => {
          const latency = Date.now() - submits.get(nodeId);
          confirmations.push({ nodeId, latency });
          pending.delete(nodeId);
          if (pending.size === 0) { clearTimeout(timer); resolve(); }
        },
        (err) => { clearTimeout(timer); reject(new Error(`filter error: ${err.message}`)); });
      filterIds.push(fid);
    }
  });

  for (let nodeId = 1; nodeId <= NUM_NODES; nodeId++) {
    const gpuState = {
      nodeId, status: 'COMPLETED',
      computationResult: { type: 'TRAINING', epoch: nodeId, loss: Math.random() },
      gpuMetrics: { utilization: 90, memoryUsedMB: 40000, temperature: 65 },
    };
    submits.set(nodeId, Date.now());
    // await 하지 않고 즉시 다음 제출? — 1단계 방법론은 순차 제출(200ms 간격). 동일하게 순차.
    await ain.db.ref(`${BASE}/${TEST_ID}/node_${nodeId}`).setValue({
      value: gpuState, gas_price: 1, nonce: -1,
    });
    if (nodeId < NUM_NODES) await sleep(200);
  }

  await done;
  for (const fid of filterIds) { try { ain.em.unsubscribe(fid, () => {}); } catch {} }

  // 온체인 데이터 일치 역검증
  for (const c of confirmations) {
    const v = await ain.db.ref(`${BASE}/${TEST_ID}/node_${c.nodeId}`).getValue();
    if (!v || v.nodeId !== c.nodeId || v.status !== 'COMPLETED') {
      throw new Error(`onchain mismatch node ${c.nodeId}`);
    }
  }
  return confirmations;
}

async function main() {
  const ain = newAin(0, 0, 11);      // 제출: node0, 이벤트: node8(ws:5100)
  await ain.em.connect();

  const all = [];
  const perRound = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const conf = await runRound(ain, r);
    const ls = conf.map(c => c.latency);
    const avg = Math.round(ls.reduce((a, b) => a + b, 0) / ls.length);
    perRound.push({ round: r, avgMs: avg, minMs: Math.min(...ls), maxMs: Math.max(...ls) });
    console.log(`round ${r}: avg=${avg}ms min=${Math.min(...ls)} max=${Math.max(...ls)} (${conf.length}/${NUM_NODES})`);
    all.push(...ls);
    await sleep(1500);
  }
  ain.em.disconnect();

  const avgMs = Math.round(all.reduce((a, b) => a + b, 0) / all.length);
  const report = {
    metric: 'M3_record_latency', targetMs: 1500,
    samples: all.length, avgMs, minMs: Math.min(...all), maxMs: Math.max(...all),
    perRound, confirmedAll: all.length === NUM_NODES * ROUNDS,
    pass: avgMs <= 1500 && all.length === NUM_NODES * ROUNDS,
  };
  writeResult(`m3-${Date.now()}`, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
