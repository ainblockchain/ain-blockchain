// M6 보조 증빙: lm-eval 결과 100 태스크 온체인 기록·역검증 (절차서 §9.4 / 부록 G)
// 리뷰 반영: lm_eval 0.4.x 결과 파일 구조 대응 — 'n-samples' 키, 그룹 태스크는 그룹 집계(results[task]) 사용,
//            메트릭 키는 'metric,filter' 형식이며 name/alias/sample_len/sample_count 는 메트릭이 아님.
//            온체인 역검증은 FINALIZED 영수증 + is_final getValue (common.recordAndVerifyFinal).
const { newAin, APP, writeResult, recordAndVerifyFinal, safeName } = require('./common');
const fs = require('fs');
const path = require('path');

const OUT = process.env.EVAL_RESULTS || `${require('./common').KPI_DIR}/eval_results`;
const BASE = `/apps/${APP}/model_evaluation`;
const MODEL_TAG = safeName(process.env.M6_MODEL || 'Qwen/Qwen2.5-1.5B-Instruct');

function findResultsFile(dir) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/^results.*\.json$/.test(e.name)) return p;
    }
  }
  return null;
}

// lm_eval 결과에서 (task 또는 그룹) 메트릭·샘플 수 추출. 반환 { metrics: {name: value}, samples }
function extractMetrics(results, task) {
  const entry = results.results[task];          // 요청한 태스크(또는 그룹) 키가 없으면 다른 태스크로 대체하지 않는다
  if (!entry) return null;
  const metrics = {};
  for (const [k, v] of Object.entries(entry)) {
    if (['name', 'alias', 'sample_len', 'sample_count'].includes(k) || k.includes('_stderr')) continue;
    if (typeof v === 'number') metrics[k] = v;
  }
  const ns = results['n-samples'] || results.n_samples || {};
  let samples = 0;
  if (ns[task]) samples = ns[task].effective ?? ns[task].original ?? 0;
  else if (results.group_subtasks && results.group_subtasks[task]) {
    // 그룹: 하위 태스크 샘플 합 (하위 그룹 재귀)
    const walk = t => (results.group_subtasks[t] || []).reduce((a, s) => a + (ns[s] ? (ns[s].effective ?? ns[s].original ?? 0) : walk(s)), 0);
    samples = walk(task);
  }
  if (!samples && typeof entry.sample_len === 'number') samples = entry.sample_len;
  return { metrics, samples };
}

(async () => {
  const tasks = fs.readFileSync(`${__dirname}/datasets100.txt`, 'utf8').split('\n').filter(Boolean);
  const ain = newAin(2, null, 13);
  let recorded = 0, verified = 0;
  const details = [];
  for (const t of tasks) {
    const dir = path.join(OUT, t);
    if (!fs.existsSync(dir)) { details.push({ task: t, ok: false, error: 'no output dir' }); continue; }
    const file = findResultsFile(dir);
    if (!file) { details.push({ task: t, ok: false, error: 'no results json' }); continue; }
    try {
      const results = JSON.parse(fs.readFileSync(file));
      const ex = extractMetrics(results, t);
      if (!ex) { details.push({ task: t, ok: false, error: 'task not in results' }); continue; }
      const { metrics, samples } = ex;
      // 메트릭 유효성: 샘플 > 0 ∧ 유한 수치 메트릭 ≥ 1 ∧ 정확도 계열(acc*/exact_match*/mc1/mc2) 은 [0,1] ∧ perplexity 계열 > 0
      //   (squadv2 exact/f1 는 0~100 척도, bleu/rouge/likelihood_diff 는 범위 제약 없음 → 유한성만 검사)
      const nums = Object.entries(metrics);
      const accLike = nums.filter(([k]) => /^(acc|exact_match|mc1|mc2)/.test(k));
      const pplLike = nums.filter(([k]) => /perplexity|bits_per_byte/.test(k));
      const valid = samples > 0 && nums.length > 0 && nums.every(([, v]) => Number.isFinite(v))
        && accLike.every(([, v]) => v >= 0 && v <= 1) && pplLike.every(([, v]) => v > 0);
      if (!valid) { details.push({ task: t, ok: false, error: `invalid metrics: samples=${samples} metrics=${JSON.stringify(metrics).slice(0, 120)}` }); continue; }
      const r = await recordAndVerifyFinal(ain, `${BASE}/${MODEL_TAG}/${safeName(t)}`, {
        modelName: MODEL_TAG, dataset: t, timestamp: Date.now(), samples, metrics, metricsValid: true,
        lmEvalGitHash: results.git_hash || null,
      }, v => v.dataset === t && v.metrics !== undefined);
      recorded++; verified++;
      details.push({ task: t, ok: true, samples, metrics, txHash: r.txHash, block: r.blockNumber });
    } catch (e) { details.push({ task: t, ok: false, error: String(e.message).slice(0, 160) }); }
  }
  const final = {
    metric: 'M6_dataset_support_lmeval_aux', target: 100, tasks: tasks.length, model: MODEL_TAG,
    recorded, verifiedOnChain: verified,
    verification: 'each record: tx receipt state===FINALIZED + getValue(is_final) match',
    details,
    failures: details.filter(d => !d.ok),
    pass: verified >= 100,
  };
  await writeResult('m6-lmeval-final', final);
  console.log(JSON.stringify({ ...final, details: final.details.length, failures: final.failures.length }, null, 2));
  process.exit(final.pass ? 0 : 1);
})();
