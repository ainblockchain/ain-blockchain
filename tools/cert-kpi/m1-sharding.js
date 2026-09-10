// M1: 온체인 병렬 파이프라인 70개 (샤드 14 × 에이전트 5)
// 제출은 10개 노드에 분산, nonce -1 무순서 병렬. 완료 후 온체인 역검증 70/70.
const { newAin, NODES, APP, writeResult, sleep, waitFinalized } = require('./common');

const NUM_SHARDS = 14;
const AGENTS_PER_SHARD = 5;
const NUM_AGENTS = NUM_SHARDS * AGENTS_PER_SHARD; // 70
const BASE = `/apps/${APP}/sharding_test`;
const RUN_ID = process.env.RUN_ID || `run_${Date.now()}`;

async function main() {
  // 노드별 Ain 인스턴스 (제출 분산). 계정은 노드별로 분리해 계정 풀 경합 제거.
  const ains = NODES.map((_, i) => newAin(i, null, 10 + (i % 5)));
  const t0 = Date.now();

  // Step 1: 70개 에이전트 병렬 실행 (에이전트 i → 노드 i%10 로 제출)
  const results = await Promise.all(Array.from({ length: NUM_AGENTS }, async (_, agentId) => {
    const shardId = agentId % NUM_SHARDS;
    const ain = ains[agentId % NODES.length];
    const res = await ain.db.ref(`${BASE}/${RUN_ID}/shard_${shardId}/agent_${agentId}`).setValue({
      value: {
        id: agentId, shard: `shard_${shardId}`, task: 'training',
        status: 'completed', loss: Math.random(), node: agentId % NODES.length,
      },
      gas_price: 1, nonce: -1,
    });
    if (!res || !res.tx_hash || res.result.code !== 0) {
      throw new Error(`agent ${agentId} failed: ${JSON.stringify(res && res.result)}`);
    }
    return { agentId, shardId, txHash: res.tx_hash };
  }));
  const submitDoneMs = Date.now() - t0;

  // Step 2: 샤드별 집계 (14) — 병렬
  await Promise.all(Array.from({ length: NUM_SHARDS }, (_, s) => {
    const agents = results.filter(r => r.shardId === s);
    return ains[s % NODES.length].db.ref(`${BASE}/${RUN_ID}/shard_${s}/aggregated`).setValue({
      value: { totalAgents: agents.length, completedTasks: agents.length },
      gas_price: 1, nonce: -1,
    });
  }));

  // Step 3: 최종 집계
  const finalAggregation = {
    totalShards: NUM_SHARDS, totalAgents: NUM_AGENTS,
    successfulAgents: results.length, completionTimeMs: Date.now() - t0,
  };
  const fres = await ains[0].db.ref(`${BASE}/${RUN_ID}/final_result`).setValue({
    value: finalAggregation, gas_price: 1, nonce: -1,
  });
  const totalMs = Date.now() - t0;

  // Step 4a: 리뷰 반영 — 70개 에이전트 tx + final tx 전부 '최종화 영수증'으로 증명
  const allHashes = [...results.map(r => r.txHash), fres.tx_hash];
  const fin = await waitFinalized(ains[0], allHashes, 90000);
  const finalizedCount = [...fin.status.values()].filter(s => s.finalized).length;

  // Step 4b: 온체인 데이터 역검증 (다른 노드에서 읽어 전파도 검증)
  const reader = ains[5];
  let verified = 0;
  for (let i = 0; i < NUM_AGENTS; i++) {
    const v = await reader.db.ref(`${BASE}/${RUN_ID}/shard_${i % NUM_SHARDS}/agent_${i}`).getValue();
    if (v && v.status === 'completed' && v.id === i) verified++;
  }
  let shardsVerified = 0;
  for (let s = 0; s < NUM_SHARDS; s++) {
    const v = await reader.db.ref(`${BASE}/${RUN_ID}/shard_${s}/aggregated`).getValue();
    if (v && v.totalAgents === AGENTS_PER_SHARD) shardsVerified++;
  }
  const final = await reader.db.ref(`${BASE}/${RUN_ID}/final_result`).getValue();

  const report = {
    metric: 'M1_parallel_pipelines', runId: RUN_ID, target: 70,
    pipelines: NUM_AGENTS, verifiedOnChain: verified, shardsVerified,
    txsFinalized: `${finalizedCount}/${allHashes.length}`,
    successRatePct: +(verified / NUM_AGENTS * 100).toFixed(1),
    submitDoneMs, totalMs,
    agentsPerSec: +(NUM_AGENTS / (totalMs / 1000)).toFixed(2),
    finalTxHash: fres.tx_hash,
    pass: verified === NUM_AGENTS && shardsVerified === NUM_SHARDS
      && fin.allFinalized
      && final && final.totalAgents === NUM_AGENTS,
  };
  writeResult(`m1-${RUN_ID}`, {
    ...report,
    txReceipts: Object.fromEntries([...fin.status].map(([h, s]) => [h, s.blockNumber])),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
