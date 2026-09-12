// M1 스케일 스윕 요약: results/m1-<prefix>_sweep_<N>.json 들에서 통과한 최대 파이프라인 수를 집계 → results/m1-sweep-summary-<prefix>.json
// 실행: PREFIX=c5_m1 node m1-sweep-summary.js
const fs = require('fs');
const { RESULTS_DIR } = require('./common');
const PREFIX = process.env.PREFIX || 'c5_m1';
const files = fs.readdirSync(RESULTS_DIR).filter(f => f.startsWith(`m1-${PREFIX}_`) && f.endsWith('.json'));
const runs = files.map(f => { const d = JSON.parse(fs.readFileSync(`${RESULTS_DIR}/${f}`)); return { file: f, pipelines: d.pipelines, shards: d.shards, pass: d.pass, txsFinalized: d.txsFinalized, txsInBlockOnNode9: d.txsInBlockOnNode9, totalMs: d.totalMs, distinctBlocks: d.distinctBlocks, genesis: d.env && d.env.chain && d.env.chain.genesisHash }; })
  .sort((a, b) => a.pipelines - b.pipelines || a.file.localeCompare(b.file));
const maxPassing = Math.max(...runs.filter(r => r.pass).map(r => r.pipelines));
const out = { metric: 'M1_parallel_pipelines_sweep', prefix: PREFIX, target: 70, runs,
  targetRuns: runs.filter(r => r.pipelines === 70).length, targetRunsPassed: runs.filter(r => r.pipelines === 70 && r.pass).length,
  maxPassingPipelines: maxPassing, note: 'maximum passing scale observed in this environment (all txs FINALIZED + node5 is_final byte-identical + node9 block inclusion); larger scales were not attempted' };
fs.writeFileSync(`${RESULTS_DIR}/m1-sweep-summary-${PREFIX}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ...out, runs: runs.length }, null, 2));
