// M1: 온체인 병렬 파이프라인 (기본 샤드 14 × 에이전트 5 = 70; NUM_SHARDS / AGENTS_PER_SHARD env 로 스케일 스윕)
// 제출은 리더 노드(node5)를 제외한 9개 노드에 분산, nonce -1 무순서 병렬. 완료 후:
//   (1) 전 tx(에이전트 N + 샤드 집계 S + 최종 1) 영수증 state==='FINALIZED'
//   (2) 제출을 전혀 받지 않은 node5 에서 is_final 로 읽어 제출값 전체(id/shard/task/status/loss/node) 일치
//   (3) 제3 노드(node9)의 블록 데이터로 tx 포함 재검증(영수증 트래커와 무관한 영구 증빙)
// 가드: 결과 파일·온체인 경로가 이미 있으면 거부(RUN_ID 재사용 금지)
const crypto = require('crypto');
const { newAin, NODES, APP, writeResult, envSnapshot, waitFinalized, getValueFinalUntil, assertResultFree, assertChainPathFree, verifyTxInBlock } = require('./common');

const NUM_SHARDS = parseInt(process.env.NUM_SHARDS || '14', 10);
const AGENTS_PER_SHARD = parseInt(process.env.AGENTS_PER_SHARD || '5', 10);
const NUM_AGENTS = NUM_SHARDS * AGENTS_PER_SHARD;
const TARGET = 70;
const READER = 5;                                  // 역검증 노드: 제출을 받지 않음
const BLOCK_VERIFY_NODE = 'http://localhost:8090'; // 블록 재검증 노드(node9)
const BASE = `/apps/${APP}/sharding_test`;
const RUN_ID = process.env.RUN_ID || `run_${Date.now()}`;
const SUBMIT_NODES = NODES.map((_, i) => i).filter(i => i !== READER);   // 0..4,6..9

async function main() {
  assertResultFree(`m1-${RUN_ID}`);
  const ains = NODES.map((_, i) => newAin(i, null, 10 + (i % 5)));      // 노드별 인스턴스, 계정 5개 순환
  await assertChainPathFree(ains[0], `${BASE}/${RUN_ID}`);
  const envBefore = await envSnapshot();
  const t0 = Date.now();

  // Step 1: N 에이전트 병렬 실행 (에이전트 i → SUBMIT_NODES[i % 9])
  const submitted = new Map();   // path -> value
  const results = await Promise.all(Array.from({ length: NUM_AGENTS }, async (_, agentId) => {
    const shardId = agentId % NUM_SHARDS;
    const nodeIdx = SUBMIT_NODES[agentId % SUBMIT_NODES.length];
    const path = `${BASE}/${RUN_ID}/shard_${shardId}/agent_${agentId}`;
    const value = { id: agentId, shard: `shard_${shardId}`, task: 'training', status: 'completed', loss: Math.random(), node: nodeIdx };
    submitted.set(path, value);
    const res = await ains[nodeIdx].db.ref(path).setValue({ value, gas_price: 1, nonce: -1 });
    if (!res || !res.tx_hash || res.result.code !== 0) throw new Error(`agent ${agentId} failed: ${JSON.stringify(res && res.result)}`);
    return { agentId, shardId, nodeIdx, path, txHash: res.tx_hash };
  }));
  const submitDoneMs = Date.now() - t0;

  // Step 2: 샤드별 집계 — 병렬, 응답 코드 확인
  const shardRes = await Promise.all(Array.from({ length: NUM_SHARDS }, (_, s) => {
    const agents = results.filter(r => r.shardId === s);
    const nodeIdx = SUBMIT_NODES[s % SUBMIT_NODES.length];
    const path = `${BASE}/${RUN_ID}/shard_${s}/aggregated`;
    const value = { totalAgents: agents.length, completedTasks: agents.length };
    submitted.set(path, value);
    return ains[nodeIdx].db.ref(path).setValue({ value, gas_price: 1, nonce: -1 }).then(r => ({ ...r, path, nodeIdx }));
  }));
  shardRes.forEach((r, s) => { if (!r || !r.tx_hash || r.result.code !== 0) throw new Error(`shard ${s} aggregation failed: ${JSON.stringify(r && r.result)}`); });

  // Step 3: 최종 집계
  const finalPath = `${BASE}/${RUN_ID}/final_result`;
  const finalAggregation = { totalShards: NUM_SHARDS, totalAgents: NUM_AGENTS, successfulAgents: results.length, completionTimeMs: Date.now() - t0 };
  submitted.set(finalPath, finalAggregation);
  const fres = await ains[0].db.ref(finalPath).setValue({ value: finalAggregation, gas_price: 1, nonce: -1 });
  if (!fres || !fres.tx_hash || fres.result.code !== 0) throw new Error(`final aggregation failed: ${JSON.stringify(fres && fres.result)}`);
  const totalMs = Date.now() - t0;

  // Step 4a: 전 tx 최종화 영수증 (node0 트래커) — state==='FINALIZED' 만 인정
  const allTx = [...results.map(r => ({ path: r.path, txHash: r.txHash, submitNode: r.nodeIdx })),
                 ...shardRes.map(r => ({ path: r.path, txHash: r.tx_hash, submitNode: r.nodeIdx })),
                 { path: finalPath, txHash: fres.tx_hash, submitNode: 0 }];
  const fin = await waitFinalized(ains[0], allTx.map(t => t.txHash), 120000);

  // Step 4b: 블록 데이터 재검증 — node9 의 블록에 tx 가 들어 있는지 (블록 번호는 영수증에서)
  let inBlockOk = 0;
  const receipts = {};
  for (const t of allTx) {
    const st = fin.status.get(t.txHash);
    const vb = st.finalized ? await verifyTxInBlock(BLOCK_VERIFY_NODE, st.blockNumber, t.txHash) : { ok: false, reason: st.state };
    if (vb.ok) inBlockOk++;
    receipts[t.txHash] = { path: t.path, submitNode: t.submitNode, state: st.state, block: st.blockNumber, inBlockOnNode9: vb.ok, blockHash: vb.blockHash || null };
  }

  // Step 4c: node5(제출 없음) 에서 is_final 로 읽어 제출값 전체 일치 (최종화 지연 최대 30초 재시도)
  const reader = ains[READER];
  let verified = 0, readerWaitMs = 0;
  const readback = {};
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const [path, value] of submitted) {
    const r = await getValueFinalUntil(reader, path, v => same(v, value));
    readerWaitMs += r.waitedMs;
    const ok = same(r.value, value);
    if (ok) verified++;
    readback[path] = { ok, sha256: r.value == null ? null : crypto.createHash('sha256').update(JSON.stringify(r.value)).digest('hex').slice(0, 16) };
  }
  const agentsVerified = results.filter(r => readback[r.path].ok).length;
  const shardsVerified = shardRes.filter(r => readback[r.path].ok).length;
  const finalVerified = readback[finalPath].ok;

  const report = {
    metric: 'M1_parallel_pipelines', runId: RUN_ID, target: TARGET,
    shards: NUM_SHARDS, agentsPerShard: AGENTS_PER_SHARD, pipelines: NUM_AGENTS,
    definition: 'pipeline = one independent on-chain training-state path /sharding_test/<run>/shard_<s>/agent_<a> written concurrently (logical path sharding on one chain, sharding_protocol NONE — same method as the Stage-1 accepted 35-pipeline test); pass = every agent/shard/final tx FINALIZED + read back byte-identical from a validator that received no submissions (node5, is_final) + tx present in the block on node9',
    verifiedOnChain: agentsVerified, shardsVerified, finalVerified,
    txsFinalized: `${fin.finalizedCount}/${allTx.length}`, txsInBlockOnNode9: `${inBlockOk}/${allTx.length}`,
    submitNodes: SUBMIT_NODES, readerNode: READER, blockVerifyNode: BLOCK_VERIFY_NODE, readerFinalizationWaitMs: readerWaitMs,
    successRatePct: +(agentsVerified / NUM_AGENTS * 100).toFixed(1),
    submitDoneMs, totalMs, agentsPerSec: +(NUM_AGENTS / (totalMs / 1000)).toFixed(2),
    distinctBlocks: new Set(Object.values(receipts).map(r => r.block)).size,
    pass: NUM_AGENTS >= TARGET && agentsVerified === NUM_AGENTS && shardsVerified === NUM_SHARDS && finalVerified
      && fin.allFinalized && inBlockOk === allTx.length,
  };
  await writeResult(`m1-${RUN_ID}`, { ...report, txReceipts: receipts, readback }, envBefore);
  const { txReceipts: _a, readback: _b, ...brief } = report;
  console.log(JSON.stringify(brief, null, 2));
  if (!report.pass) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
