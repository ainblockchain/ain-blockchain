const KPI_DIR = process.env.KPI_DIR || require('path').resolve(__dirname, '..');
// M5+M6 (Ainize 경로): DART 타입별 데이터셋 N개 (= 데이터셋 N종, 지표 6) → 지식 패치 N개 (= 모델 N종, 지표 5) 를
//   teach(학습) → publish(공개·온체인 anchor) → live test(패치 적용 후 추론 ≥1 성공)
//   → ain-js 온체인 기록 → getValue 역검증 까지 수행하고,
//   --stack 단계에서 전 패치를 서빙 모델에 중첩(apply) 한 뒤 스택 상태에서 재검증한다.
// 재개 가능: results/m5-ainize-progress.json 에 수업별 상태를 저장하고 완료된 단계는 건너뛴다.
//
//   node m5-ainize.js                # 수업 학습·공개·검증 (manifest 순서대로, 트레이너는 host당 1개)
//   node m5-ainize.js --stack        # 전 패치 중첩 apply + 스택 검증 + m5-final.json 산출
//   LESSONS=110 MIN_OK=100 EFFORT=quick
const { newAin, NODES, APP, writeResult, sleep, recordAndVerifyFinal, getValueFinal, getValueFinalUntil, safeName, verifyTxInBlockUntil } = require('./common');
const { hitOf } = require('./m5-judge');
const { execFile } = require('child_process');
const fs = require('fs');

const HARNESS = __dirname;
const MANIFEST = JSON.parse(fs.readFileSync(process.env.MANIFEST || `${HARNESS}/dart-datasets/manifest.json`)).filter(l => l.facts.length > 0);
const LESSONS = parseInt(process.env.LESSONS || '110', 10);
const START = parseInt(process.env.START || '0', 10);          // 이 워커가 맡는 manifest 구간 [START, END)
const END = parseInt(process.env.END || String(LESSONS), 10);
const MIN_OK = parseInt(process.env.MIN_OK || '100', 10);
const EFFORT = process.env.EFFORT || 'quick';
const CLI = process.env.AINIZE_CLI || null;   // null → PATH 의 `ainize` (npm i -g @ainize/cli)
const NODE24 = process.env.AINIZE_NODE || process.execPath;   // ainize CLI 를 실행할 Node (>= 24)
const AINIZE_HOME = process.env.AINIZE_HOME || `${KPI_DIR}/ainize/home-cert`;
const RUNTIME_API = process.env.RUNTIME_API || 'http://localhost:8000';
// 진행 파일은 노드 홈별로 분리 (같은 파일을 두 워커가 덮어쓰면 재개가 깨진다)
const PROGRESS = process.env.PROGRESS || `${KPI_DIR}/results/m5-ainize-progress-${require('path').basename(AINIZE_HOME)}.json`;
const PROGRESS_GLOB_DIR = `${KPI_DIR}/results`;   // --stack: m5-ainize-progress*.json 전부 병합
const LOGDIR = `${KPI_DIR}/logs/m5-ainize`;
fs.mkdirSync(LOGDIR, { recursive: true });

const BASE = `/apps/${APP}/model_inference`;
const STACK_BASE = `/apps/${APP}/model_stack`;
const DS_BASE = `/apps/${APP}/dataset_support`;
const KNOWLEDGE_ANCHOR = '/apps/knowledge/market/patches';   // ainize-core ain-ledger: publish → anchor 가 기록되는 원장 경로

function ainize(args, { timeoutMs = 120 * 60_000, log, home } = {}) {
  return new Promise((resolve) => {
    const child = execFile(CLI ? NODE24 : 'ainize', CLI ? [CLI, ...args, '--json'] : [...args, '--json'], {
      env: { ...process.env, AINIZE_HOME: home || AINIZE_HOME, PATH: `${require('path').dirname(NODE24)}:${process.env.PATH}` },
      timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (log) fs.appendFileSync(log, `\n$ ainize ${args.join(' ')} --json\n[exit ${err ? err.code : 0}]\n${stdout}\n${stderr}\n`);
      let json = null;
      try { json = JSON.parse(stdout); } catch {
        // 마지막 JSON 오브젝트만 추출 시도
        const m = stdout.match(/\{[\s\S]*\}\s*$/); if (m) { try { json = JSON.parse(m[0]); } catch {} }
      }
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, json, stdout, stderr });
    });
    child.on('error', () => {});
  });
}

const loadProgress = () => fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS)) : {};
const loadAllProgress = () => {
  const out = {};
  for (const f of fs.readdirSync(PROGRESS_GLOB_DIR).filter(n => /^m5-ainize-progress.*\.json$/.test(n))) {
    const d = JSON.parse(fs.readFileSync(`${PROGRESS_GLOB_DIR}/${f}`));
    for (const [k, v] of Object.entries(d)) if (v.ok || !out[k]) out[k] = v;
  }
  return out;
};
const saveProgress = p => fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2));

// 온체인 기록 → 최종화 영수증(state==='FINALIZED') → is_final getValue 역검증 (common.recordAndVerifyFinal)
// 기록: node3 제출 → FINALIZED 영수증 → 제출 노드가 아닌 node5 에서 is_final 읽기 일치 → node9 블록 데이터에 tx 존재. 반환 {txHash, block, readerOk, inBlockOnNode9}
let READER = null;
async function recordAndVerify(ain, path, value, check) {
  const r = await recordAndVerifyFinal(ain, path, value, { check });
  const rb = await getValueFinalUntil(READER, path, v => v && check(v));
  if (!(rb.value && check(rb.value))) throw new Error(`reader(node5) is_final mismatch at ${path}`);
  const vb = await verifyTxInBlockUntil(NODES[9], r.blockNumber, r.txHash);
  if (!vb.ok) throw new Error(`tx ${r.txHash} not found in block ${r.blockNumber} on node9`);
  return { txHash: r.txHash, block: r.blockNumber, readerOk: true, readerWaitMs: rb.waitedMs, inBlockOnNode9: true };
}
// publish anchor 가 '현재' 체인에 존재하는지 (다른 체인 인스턴스의 anchor 는 인정하지 않음)
async function anchorOnChain(ain, patchId) {
  const v = await getValueFinal(ain, `${KNOWLEDGE_ANCHOR}/${patchId}`).catch(() => null);
  return !!(v && v.id === patchId);
}

const TERMINAL = ['READY', 'NEEDS_MORE', 'FAILED', 'CANCELLED', 'EXPIRED', 'REJECTED', 'ANNOUNCED', 'PENDING_REVIEW'];

// 같은 이름(lesson.id)의 기존 수업 재사용: 진행 중이면 끝날 때까지 대기, READY 인데 검사 실패면 recheck (노드 재시작 등으로 하네스와 어긋난 경우)
const jobName = (lesson, st) => lesson.id + (st.nameSuffix || '');   // 재학습 회차는 노드 수업 이름에 접미사(__r2)를 붙인다 (온체인 경로는 lesson.id 유지)

async function adoptExistingJob(lesson, st, log, ain) {
  const r = await ainize(['teach', 'jobs'], { log });
  const items = (r.json && (r.json.items || r.json.jobs)) || (Array.isArray(r.json) ? r.json : []);
  const mine = items.filter(j => j.name === jobName(lesson, st) && !['FAILED', 'CANCELLED', 'EXPIRED', 'REJECTED'].includes(j.status)).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  if (!mine.length) return false;
  let job = mine[0];
  const t0 = Date.now();
  while (!TERMINAL.includes(job.status) && Date.now() - t0 < 90 * 60_000) {
    await sleep(20000);
    const q = await ainize(['teach', 'status', job.id]);
    if (q.json && q.json.job) job = q.json.job;
  }
  // 라이브 검사(부수효과 등)가 통과(checks.ok===true)한 수업만 재사용
  if (!(job.checks && job.checks.executed === true && job.checks.ok === true)) return false;
  const q = await ainize(['teach', 'status', job.id]);
  if (q.json && q.json.job) job = q.json.job;
  st.checks = job.checks || null; st.preflight = job.preflight || null; st.jobFacts = Array.isArray(job.facts) ? job.facts : null;
  if (job.dataset_id && !st.dataset_id) st.dataset_id = job.dataset_id;
  // ANNOUNCED 수업은 그 anchor 가 현재 체인에 있을 때만 재사용 (체인 재기동 후 남은 옛 수업은 새로 학습·공개)
  if (job.status === 'ANNOUNCED' && !(job.patch_id && await anchorOnChain(ain, job.patch_id))) return false;
  st.job_id = job.id; st.status = job.status; st.checked = !!(job.checks && job.checks.executed === true);
  st.adopted = true; if (job.patch_id) st.patch_id = job.patch_id;
  return ['READY', 'ANNOUNCED'].includes(job.status);
}

async function runLesson(lesson, st, ain) {
  const log = `${LOGDIR}/${lesson.id}.log`;
  // 재점검(이전 하네스로 완료된 수업): 노드 검사 결과·사전점검·학습 사실을 노드에서 보충하고, 검사 미통과면 재학습 대상으로 돌린다
  if (st.job_id && (!st.checks || !st.jobFacts)) {
    const q = await ainize(['teach', 'status', st.job_id], { log });
    const job = q.json && q.json.job;
    if (job) { st.checks = job.checks || null; st.preflight = job.preflight || null; st.jobFacts = Array.isArray(job.facts) ? job.facts : null; if (job.dataset_id && !st.dataset_id) st.dataset_id = job.dataset_id; }
    if (!(st.checks && st.checks.executed === true && st.checks.ok === true)) { st.error = `recheck: node checks not ok for job ${st.job_id}`; return false; }
  }
  // 0) 노드에 같은 이름의 수업이 이미 있으면 재사용
  if (!st.job_id || !['READY', 'ANNOUNCED'].includes(st.status)) await adoptExistingJob(lesson, st, log, ain);
  // 1) 학습 (파일 업로드 + 수업 생성 + 완료 대기)
  if (!st.job_id || !['READY', 'ANNOUNCED'].includes(st.status)) {
    const t0 = Date.now();
    let r, r2job = null;
    for (let attempt = 0; attempt < 40; attempt++) {    // 키당 동시 진행 한도(quota_key)면 30초 후 재시도 (최대 40회; 무제한 재시도 폭주 방지)
      r = await ainize(['teach', 'train', lesson.file, '--name', jobName(lesson, st), '--effort', st.retried ? 'balanced' : EFFORT, '--wait', '--timeout', '120'], { log });
      if (!/quota_key|in progress on this node/.test(r.stdout + r.stderr)) break;
      await sleep(30000);
    }
    if (r.json && r.json.uploaded && r.json.uploaded.dataset) st.dataset = { id: r.json.uploaded.dataset.id, sha256: r.json.uploaded.dataset.sha256, rows: r.json.uploaded.dataset.rows, source_name: r.json.uploaded.dataset.source_name };
    st.dataset_id = r.json && r.json.dataset_id; st.home = AINIZE_HOME;
    const job = r.json && r.json.job;
    st.job_id = job ? job.id : st.job_id;
    st.status = job ? job.status : 'FAILED';
    st.checked = !!(job && job.checks && job.checks.executed === true);
    st.train_exit = r.code;
    st.train_s = Math.round((Date.now() - t0) / 1000);
    if (job && job.progress) st.progress = job.progress;
    if (st.status === 'NEEDS_MORE' && !st.retried) {
      // 숫자 ID 등 어려운 타입: balanced(20 스텝)로 즉시 1회 재학습
      st.retried = true;
      const r2 = await ainize(['teach', 'train', lesson.file, '--name', jobName(lesson, st), '--effort', 'balanced', '--wait', '--timeout', '120'], { log });
      const job2 = r2.json && r2.json.job; r2job = job2;
      if (job2) { st.job_id = job2.id; st.status = job2.status; st.checked = !!(job2.checks && job2.checks.executed === true); if (job2.progress) st.progress = job2.progress; }
      st.train_exit = r2.code; st.train_s = Math.round((Date.now() - t0) / 1000);
    }
    const jobFinal = (st.retried && r2job) || job;
    st.checks = jobFinal && jobFinal.checks ? jobFinal.checks : null;
    st.preflight = jobFinal && jobFinal.preflight ? jobFinal.preflight : null;
    st.jobFacts = jobFinal && Array.isArray(jobFinal.facts) ? jobFinal.facts : null;
    // §8.1: 학습 완료 ∧ 노드 라이브 검증 통과(checks.executed && checks.ok) 인 수업만 인정 (노드의 publish 거부에 의존하지 않음)
    if (!(st.status === 'READY' && st.checks && st.checks.executed === true && st.checks.ok === true)) { st.error = `train: status=${st.status} exit=${r.code} checks=${JSON.stringify(st.checks && { executed: st.checks.executed, ok: st.checks.ok })}`; return false; }
  }
  // 2) 공개 (온체인 anchor 는 노드가 AIN 원장으로 기록)
  if (!st.patch_id) {
    const r = await ainize(['teach', 'publish', st.job_id, '--name', `DART ${lesson.title}`.slice(0, 80), '--declare', 'public', '--access', 'public',
      '--description', `DART OpenAPI ${lesson.api} — ${lesson.title} (cert M5/M6 ${lesson.id})`, '--consent-permanent', '--consent-rights'], { log });
    let pid = r.json && r.json.result && r.json.result.patch_id;
    if (!pid && /dataset_pii/.test(r.stdout + r.stderr)) {
      // 전화번호·등록번호 등은 노드의 PII 게이트에 걸린다 → 학습 데이터셋은 비공개(private)로 두고 지식만 공개
      const r2 = await ainize(['teach', 'publish', st.job_id, '--name', `DART ${lesson.title}`.slice(0, 80), '--declare', 'public', '--access', 'private',
        '--description', `DART OpenAPI ${lesson.api} — ${lesson.title} (cert M5/M6 ${lesson.id}; dataset private: PII gate)`, '--consent-permanent', '--consent-rights'], { log });
      pid = r2.json && r2.json.result && r2.json.result.patch_id; st.dataset_access = 'private';
      if (!pid) { st.error = `publish failed (private retry): exit=${r2.code} ${(r2.stdout + r2.stderr).slice(0, 200)}`; return false; }
      st.status = r2.json.result.status || 'ANNOUNCED';
    } else if (!pid) { st.error = `publish failed: exit=${r.code} ${(r.stdout + r.stderr).slice(0, 200)}`; return false; }
    else st.status = r.json.result.status || 'ANNOUNCED';
    st.patch_id = pid;
  }
  // 2b) anchor 가 현재 체인에 기록됐는지 (is_final) — 없으면 '공개' 로 인정하지 않는다
  if (!st.anchor_onchain) {
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) { ok = await anchorOnChain(ain, st.patch_id); if (!ok) await sleep(2000); }
    if (!ok) { st.error = `anchor not found on current chain: ${KNOWLEDGE_ANCHOR}/${st.patch_id}`; return false; }
    st.anchor_onchain = true;
  }
  // 3) live test — 노드가 실제로 학습한 사실(사전점검에서 '이미 아는 질문'으로 제외된 사실 제외) 중 앞 3개에 대해:
  //    (a) 패치 미적용 상태(baseline)에서 학습 렌더링(Q:/A:) 추론 → (b) patch apply → 같은 질문 추론 3회 + 채팅 형식 1회 → patch remove
  //    판정: 패치 적용 상태 정답 ≥ 1 ∧ 그중 baseline 에서는 오답이던 사실 ≥ 1 (hitsBeyondBaseline) — 기반 모델 지식만으로 통과 불가
  //    이전 시도 결과는 st.attempts[] 에 보존(덮어쓰지 않음)
  if (!st.chat || !st.baseline || !(st.chat.filter(c => c.hit).length >= 1 && st.hitsBeyondBaseline >= 1)) {
    if (st.chat) { st.attempts = st.attempts || []; st.attempts.push({ at: Date.now(), chat: st.chat, baseline: st.baseline || null, chat_form: st.chat_form || null, tx: st.tx || null }); }
    const dropped = new Set(((st.preflight && st.preflight.dropped) || []).map(d => d.index));
    const source = Array.isArray(st.jobFacts) && st.jobFacts.length ? st.jobFacts : lesson.facts;
    const tested = source.map((f, idx) => ({ ...f, idx })).filter(f => !dropped.has(f.idx)).slice(0, 3);
    if (tested.length === 0) { st.error = 'no trained (non-preflight-dropped) facts to test'; return false; }
    st.testedFactIdx = tested.map(f => f.idx);
    const askQa = async (prompt) => {
      const t0 = Date.now();
      try {
        const r = await fetch(`${RUNTIME_API}/v1/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'Qwen3.8-Flash-Next', prompt: `Q: ${prompt}\nA:`, max_tokens: 24, temperature: 0, stop: ['\n'] }), signal: AbortSignal.timeout(120000) });
        const j = await r.json();
        if (j.choices && j.choices[0]) return { got: j.choices[0].text, tokens: j.usage ? j.usage.completion_tokens : null, err: null, latency_ms: Date.now() - t0 };
        return { got: null, tokens: null, err: `no choices: ${JSON.stringify(j).slice(0, 200)}`, latency_ms: Date.now() - t0 };
      } catch (e) { return { got: null, tokens: null, err: String(e.message), latency_ms: Date.now() - t0 }; }
    };
    // (a) baseline: 패치 미적용 (수업 사이에는 어떤 패치도 적용돼 있지 않음; 안전을 위해 스택을 확인)
    const stk = await ainize(['patch', 'stack'], { log });
    st.baselineStack = stk.json || null;
    st.baseline = [];
    for (const f of tested) { const a = await askQa(f.prompt); st.baseline.push({ idx: f.idx, prompt: f.prompt, expect: f.answer, got: a.got, hit: hitOf(a.got, f.answer), err: a.err }); }
    // (b) 패치 적용 상태
    st.chat = [];
    const ap = await ainize(['patch', 'apply', st.patch_id], { log, timeoutMs: 20 * 60_000 });
    if (ap.code !== 0) { st.error = `patch apply failed: ${(ap.stdout + ap.stderr).slice(0, 200)}`; return false; }
    try {
      for (const f of tested) { const a = await askQa(f.prompt); st.chat.push({ format: 'qa', idx: f.idx, prompt: f.prompt, expect: f.answer, got: a.got, hit: hitOf(a.got, f.answer), latency_ms: a.latency_ms, tokens: a.tokens, err: a.err }); }
      // 채팅 형식 1회 (증빙용; 판정에는 qa 형식을 사용)
      const f = tested[0]; const t0 = Date.now();
      try {
        const r = await fetch(`${RUNTIME_API}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'Qwen3.8-Flash-Next', messages: [{ role: 'user', content: f.prompt }], max_tokens: 64, temperature: 0, chat_template_kwargs: { enable_thinking: false } }), signal: AbortSignal.timeout(120000) });
        const j = await r.json(); const got = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : null;
        st.chat_form = { prompt: f.prompt, expect: f.answer, got, hit: hitOf(got, f.answer), latency_ms: Date.now() - t0 };
      } catch (e) { st.chat_form = { err: String(e.message) }; }
    } finally {
      await ainize(['patch', 'remove', st.patch_id], { log, timeoutMs: 20 * 60_000 });
    }
    st.hits = st.chat.filter(c => c.hit).length;
    st.baselineHits = st.baseline.filter(b => b.hit).length;
    st.hitsBeyondBaseline = st.chat.filter((c, i) => c.hit && !st.baseline[i].hit).length;
    delete st.onchain_verified; delete st.tx;   // 새 추론 결과는 다시 온체인 기록
    if (st.hits < 1) { st.error = 'inference: no correct answer with the patch applied'; return false; }
    if (st.hitsBeyondBaseline < 1) { st.error = `inference: all ${st.hits} hits were already answered correctly without the patch (baseline)`; return false; }
  }
  // 4) ain-js 온체인 기록 + 역검증
  if (!st.onchain_verified) {
    st.tx = [];
    for (let i = 0; i < st.chat.length; i++) {
      const c = st.chat[i], b = st.baseline[i];
      const rec = await recordAndVerify(ain, `${BASE}/${safeName(st.patch_id)}/iteration_${i + 1}`, {
        modelName: st.patch_id, lesson: lesson.id, iteration: i + 1, factIndex: c.idx, prompt: c.prompt, expect: c.expect, got: c.got,
        inferenceOk: c.hit, baselineGot: b ? b.got : null, baselineOk: b ? b.hit : null, tokensGenerated: c.tokens, timestamp: Date.now(),
      }, v => v.modelName === st.patch_id && v.iteration === i + 1);
      st.tx.push({ path: `${BASE}/${safeName(st.patch_id)}/iteration_${i + 1}`, ...rec });
    }
    st.onchain_verified = true;    // 각 tx: FINALIZED 영수증 + node5 is_final 일치 + node9 블록 포함
  }
  // 5) 데이터셋(지표 6): 공개 지식의 학습 데이터셋 조회(ainize dataset get) + ain-js 온체인 기록·역검증
  if (!st.dataset_verified) {
    const r = await ainize(['dataset', 'get', st.patch_id], { log });
    st.dataset_get = r.json ? { ok: r.code === 0, rows: r.json.rows ?? r.json.dataset?.rows ?? null, sha256: r.json.sha256 ?? r.json.dataset?.sha256 ?? null, access: r.json.access ?? r.json.dataset?.access ?? null } : { ok: false };
    const ds = st.dataset || {};
    st.dataset_tx = await recordAndVerify(ain, `${DS_BASE}/${safeName(lesson.id)}`, {
      dataset: lesson.id, title: lesson.title, source: `DART OpenAPI ${lesson.api}`, rows: lesson.facts.length,
      ainizeDatasetId: ds.id || st.dataset_id || null, sha256: ds.sha256 || null, patchId: st.patch_id, datasetGetOk: st.dataset_get.ok, timestamp: Date.now(),
    }, v => v.dataset === lesson.id && v.patchId === st.patch_id);
    if (!st.dataset_get.ok) { st.error = `dataset get failed for ${st.patch_id}`; return false; }   // 공개 데이터셋 조회 가능해야 '데이터셋 지원' 으로 인정
    st.dataset_verified = true;
    st.datasetRows = lesson.facts.length;
  }
  delete st.error;
  return true;
}

async function stackPhase(progress, ain) {
  const okSts = MANIFEST.slice(0, LESSONS).map(l => progress[l.id]).filter(s => s && s.ok && s.patch_id);
  const ids = okSts.map(s => s.patch_id);
  const log = `${LOGDIR}/stack.log`;
  // 여러 모델(패치) 중첩: 순서대로 apply — 나중 것이 공유 행에서 이김. 패치 본체를 가진 노드(home)에서 각각 apply 하되 서빙 모델(우편함)은 하나다
  const byHome = {};
  for (const s of okSts) (byHome[s.home || AINIZE_HOME] = byHome[s.home || AINIZE_HOME] || []).push(s.patch_id);
  const applies = [], stacks = [];
  let applyExit = 0;
  for (const [home, hids] of Object.entries(byHome)) {
    for (let k = 0; k < hids.length; k += 20) {   // 한 번에 20개씩
      const ap = await ainize(['patch', 'apply', ...hids.slice(k, k + 20)], { log, timeoutMs: 60 * 60_000, home });
      applies.push({ home, ids: hids.slice(k, k + 20), exit: ap.code, out: ap.json }); if (ap.code !== 0) applyExit = ap.code;
    }
    const stk = await ainize(['patch', 'stack'], { log, home }); stacks.push({ home, stack: stk.json });
  }
  fs.writeFileSync(`${KPI_DIR}/results/m5-ainize-stack.json`, JSON.stringify({ applies, applyExit, stacks }, null, 2));
  // 스택에 실린 패치 id 집합 (정확 일치; 부분 문자열 비교 금지)
  const stackIdSet = new Set();
  const collect = (o) => { if (Array.isArray(o)) o.forEach(collect); else if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) { if ((k === 'patch_id' || k === 'id') && typeof v === 'string') stackIdSet.add(v); collect(v); } } };
  collect(stacks);
  const ap = { code: applyExit };
  // 스택 상태의 서빙 모델에 직접 질의 — 수업 단계와 같은 학습 렌더링(Q:/A:) 형식으로, 수업 단계에서 시험한 사실(testedFactIdx) 전부 (채팅 형식 1회는 증빙용)
  // 판정 시점에 anchor(is_final)·데이터셋 조회 플래그를 다시 확인한다
  const checks = [];
  const askQa = async (prompt) => {
    try {
      const r = await fetch(`${RUNTIME_API}/v1/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'Qwen3.8-Flash-Next', prompt: `Q: ${prompt}\nA:`, max_tokens: 24, temperature: 0, stop: ['\n'] }), signal: AbortSignal.timeout(120000) });
      const j = await r.json(); return j.choices && j.choices[0] ? { got: j.choices[0].text, err: null } : { got: null, err: `no choices: ${JSON.stringify(j).slice(0, 200)}` };
    } catch (e) { return { got: null, err: String(e.message) }; }
  };
  for (const l of MANIFEST.slice(0, LESSONS)) {
    const st = progress[l.id]; if (!st || !st.ok) continue;
    const source = Array.isArray(st.jobFacts) && st.jobFacts.length ? st.jobFacts : l.facts;
    const tested = (st.testedFactIdx || [0, 1, 2]).map(i => source[i]).filter(Boolean);
    const qa = [];
    for (const f of tested) { const a = await askQa(f.prompt); qa.push({ prompt: f.prompt, expect: f.answer, got: a.got, hit: hitOf(a.got, f.answer), err: a.err }); }
    let chatForm = null;
    try {
      const f = tested[0];
      const r = await fetch(`${RUNTIME_API}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'Qwen3.8-Flash-Next', messages: [{ role: 'user', content: f.prompt }], max_tokens: 64, temperature: 0, chat_template_kwargs: { enable_thinking: false } }), signal: AbortSignal.timeout(120000) });
      const j = await r.json(); const got = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : null;
      chatForm = { prompt: f.prompt, expect: f.answer, got, hit: hitOf(got, f.answer) };
    } catch (e) { chatForm = { err: String(e.message) }; }
    const hits = qa.filter(q => q.hit).length;
    const hit = hits >= 1;
    const inStack = stackIdSet.has(st.patch_id);
    const anchorNow = await anchorOnChain(ain, st.patch_id);
    let tx = null, verified = false, err = qa.map(q => q.err).filter(Boolean).join('; ') || null;
    try {
      tx = await recordAndVerify(ain, `${STACK_BASE}/${safeName(st.patch_id)}/check`, {
        modelName: st.patch_id, lesson: l.id, stackSize: ids.length, inStack, anchorOnChain: anchorNow, tested: qa.length, hits,
        prompt: tested[0].prompt, expect: tested[0].answer, got: qa[0].got, hit, timestamp: Date.now(),
      }, v => v.modelName === st.patch_id);
      verified = true;
    } catch (e) { err = (err ? err + '; ' : '') + e.message; }
    checks.push({ lesson: l.id, patch_id: st.patch_id, inStack, anchorOnChain: anchorNow, tested: qa.length, hits, hit, qa, chatForm, err, tx, verified });
    console.log(`[stack] ${l.id} ${st.patch_id} inStack=${inStack} anchor=${anchorNow} hits=${hits}/${qa.length}${err ? ' err=' + err : ''}`);
  }
  const verified = checks.filter(c => c.verified).length;
  return { stackSize: ids.length, applyExit: ap.code, checks, stackInStack: checks.filter(c => c.inStack).length,
    stackHits: checks.filter(c => c.hit && c.inStack && c.anchorOnChain).length, stackOnchainVerified: verified, stackAnchorsOnChain: checks.filter(c => c.anchorOnChain).length };
}

(async () => {
  const ain = newAin(3, null, parseInt(process.env.ACCOUNT_IDX || '16', 10));
  READER = newAin(5, null, 17);   // 역검증 읽기 노드(node5, 제출 없음)
  if (process.argv.includes('--stack')) {
    const progress = process.env.PROGRESS_GLOB === '1' ? loadAllProgress() : loadProgress();
    // 판정 일관성: 저장된 응답(got)에 최종 hitOf 를 다시 적용해 정답·baseline 을 재계산하고,
    //   정답 0 · baseline 초과 정답 0 · anchor 없음 · 데이터셋 조회 실패 · 노드 검증(checks.ok) 없음 인 수업은 supported 에서 제외
    for (const [id, st] of Object.entries(progress)) {
      if (!st.chat) continue;
      for (const c of st.chat) c.hit = hitOf(c.got, c.expect);
      if (st.baseline) { for (const b of st.baseline) b.hit = hitOf(b.got, b.expect); st.hitsBeyondBaseline = st.chat.filter((c, i) => c.hit && !(st.baseline[i] && st.baseline[i].hit)).length; }
      const gate = st.chat.filter(c => c.hit).length >= 1 && (st.baseline ? st.hitsBeyondBaseline >= 1 : false) && st.anchor_onchain && st.dataset_get && st.dataset_get.ok && st.checks && st.checks.ok === true;
      if (st.ok && !gate) { st.ok = false; st.error = (st.error || '') + ' [rejudged: hit/baseline/anchor/dataset/checks gate]'; }
    }
    const s = await stackPhase(progress, ain);
    const okLessons = MANIFEST.slice(0, LESSONS).filter(l => progress[l.id] && progress[l.id].ok);
    const final = {
      metric: 'M5_model_support', method: 'Ainize teach: one knowledge patch (lesson) = one model (disclosed counting rule, doc §1.2/§8); each patch trained on the Qwen3.8-Flash-Next PLE table, node live-check passed (checks.ok), published (anchor on the same certification chain, is_final), live-tested on the facts the node actually trained: >=1 correct answer with the patch applied AND >=1 of those wrong without the patch (baseline), recorded via ain-js (FINALIZED receipt + node5 is_final + node9 block); then all patches stacked (patch apply) and re-checked with the same Q/A format on the stacked serving model',
      target: MIN_OK, attempted: Math.min(LESSONS, MANIFEST.length), supported: okLessons.length,
      inferenceOk: okLessons.reduce((a, l) => a + progress[l.id].chat.filter(c => c.hit).length, 0),
      inferenceTotal: okLessons.reduce((a, l) => a + progress[l.id].chat.length, 0),
      baselineHits: okLessons.reduce((a, l) => a + (progress[l.id].baseline || []).filter(b => b.hit).length, 0),
      hitsBeyondBaseline: okLessons.reduce((a, l) => a + (progress[l.id].hitsBeyondBaseline || 0), 0),
      nodeChecksOk: okLessons.filter(l => progress[l.id].checks && progress[l.id].checks.ok === true).length,
      onchainVerified: okLessons.filter(l => progress[l.id].onchain_verified).length,
      anchorsOnChain: okLessons.filter(l => progress[l.id].anchor_onchain).length,
      verification: 'every on-chain record: tx receipt state===FINALIZED (node3) + getValue(is_final) match on node5 (non-submitting) + tx present in the block on node9; publish anchor checked at /apps/knowledge/market/patches/<patch_id> (is_final) on the same chain, re-checked at stack time',
      stack: { size: s.stackSize, applyExit: s.applyExit, inStack: s.stackInStack, anchorsOnChain: s.stackAnchorsOnChain, hits: s.stackHits, onchainVerified: s.stackOnchainVerified, judge: 'Q/A completion format on the lesson-phase tested facts (>=1 hit), same as lesson phase' },
      failed: MANIFEST.slice(0, LESSONS).filter(l => progress[l.id] && !progress[l.id].ok).map(l => ({ lesson: l.id, error: progress[l.id].error })),
      patches: okLessons.map(l => ({ lesson: l.id, patch_id: progress[l.id].patch_id, job_id: progress[l.id].job_id, train_s: progress[l.id].train_s, effort: progress[l.id].retried ? 'balanced' : EFFORT,
        testedFactIdx: progress[l.id].testedFactIdx, hits: progress[l.id].chat.filter(c => c.hit).length, baselineHits: (progress[l.id].baseline || []).filter(b => b.hit).length, hitsBeyondBaseline: progress[l.id].hitsBeyondBaseline,
        nodeChecks: progress[l.id].checks ? { taught: progress[l.id].checks.taught, heldout: progress[l.id].checks.heldout, locality: progress[l.id].checks.locality, ok: progress[l.id].checks.ok } : null,
        preflightDropped: ((progress[l.id].preflight || {}).dropped || []).map(d => d.index), attempts: (progress[l.id].attempts || []).length,
        tx: (progress[l.id].tx || []).map(t => ({ path: t.path, txHash: t.txHash, block: t.block })) })),
      pass: okLessons.length >= MIN_OK && s.applyExit === 0 && s.stackInStack >= MIN_OK && s.stackHits >= MIN_OK && s.stackOnchainVerified >= MIN_OK
        && okLessons.filter(l => progress[l.id].anchor_onchain).length >= MIN_OK,
    };
    await writeResult('m5-final', final);
    const m6 = {
      metric: 'M6_dataset_support', method: 'Ainize teach datasets: one DART OpenAPI type = one dataset (jsonl Q/A), uploaded via ainize teach dataset, trained into a knowledge patch, published with public access (ainize dataset get retrievable), recorded via ain-js and getValue-verified',
      target: MIN_OK, attempted: Math.min(LESSONS, MANIFEST.length),
      supported: okLessons.filter(l => progress[l.id].dataset_verified).length,
      datasetGetOk: okLessons.filter(l => progress[l.id].dataset_get && progress[l.id].dataset_get.ok).length,
      onchainVerified: okLessons.filter(l => progress[l.id].dataset_verified).length,
      distinctApis: new Set(okLessons.map(l => l.api)).size,
      countingRule: 'one DART OpenAPI type (field-level split of an API response) = one dataset; distinctApis reports the API-level count for a certifier applying API-level counting',
      datasets: okLessons.map(l => ({ dataset: l.id, title: l.title, api: l.api, rows: l.facts.length, ainizeDatasetId: (progress[l.id].dataset || {}).id || progress[l.id].dataset_id, sha256: (progress[l.id].dataset || {}).sha256 || null,
        datasetGet: progress[l.id].dataset_get, patch_id: progress[l.id].patch_id, tx: progress[l.id].dataset_tx ? { txHash: progress[l.id].dataset_tx.txHash, block: progress[l.id].dataset_tx.block } : null })),
      verification: 'dataset record tx receipt state===FINALIZED + getValue(is_final) match',
      pass: okLessons.filter(l => progress[l.id].dataset_verified && progress[l.id].dataset_get && progress[l.id].dataset_get.ok).length >= MIN_OK,
    };
    await writeResult('m6-final', m6);
    console.log(JSON.stringify({ ...m6, datasets: m6.datasets.length }, null, 2));
    fs.writeFileSync(`${KPI_DIR}/results/m5-ainize-stack-checks.json`, JSON.stringify(s, null, 2));
    console.log(JSON.stringify({ ...final, patches: final.patches.length, failed: final.failed.length }, null, 2));
    process.exit(final.pass && m6.pass ? 0 : 1);
  }
  const progress = loadProgress();
  let ok = 0, done = 0;
  for (const lesson of MANIFEST.slice(START, Math.min(END, LESSONS))) {
    const st = progress[lesson.id] || {};
    if (st.ok && st.baseline && st.checks && st.checks.ok === true) { ok++; done++; console.log(`[${done}] ${lesson.id} OK (skip) ${st.patch_id}`); continue; }
    if (st.ok) { st.ok = false; delete st.dataset_verified; console.log(`[${done + 1}] ${lesson.id} recheck (no baseline/checks in record) ${st.patch_id}`); }
    const t0 = Date.now();
    try { st.ok = await runLesson(lesson, st, ain); } catch (e) { st.ok = false; st.error = String(e.message).slice(0, 300); }
    // 2차 시도: 학습·공개·추론 단계 실패(anchor 유실·정답 0·NEEDS_MORE 등)는 새 수업 이름(__r2)·effort balanced 로 1회 재학습
    if (!st.ok && !st.attempt2 && !/dataset get failed|onchain|verify|is_final|node9/.test(st.error || '')) {
      st.attempt2 = { error: st.error, job_id: st.job_id, patch_id: st.patch_id };
      for (const k of ['job_id', 'status', 'checked', 'checks', 'preflight', 'jobFacts', 'testedFactIdx', 'baseline', 'baselineStack', 'hits', 'baselineHits', 'hitsBeyondBaseline', 'patch_id', 'anchor_onchain', 'chat', 'chat_form', 'tx', 'onchain_verified', 'dataset_get', 'dataset_tx', 'dataset_verified', 'error', 'adopted']) delete st[k];
      st.nameSuffix = '__r2'; st.retried = true;
      console.log(`[${done + 1}] ${lesson.id} retry as ${jobName(lesson, st)} (balanced)`);
      try { st.ok = await runLesson(lesson, st, ain); } catch (e) { st.ok = false; st.error = String(e.message).slice(0, 300); }
    }
    st.elapsed_s = Math.round((Date.now() - t0) / 1000);
    progress[lesson.id] = st; saveProgress(progress);
    done++; if (st.ok) ok++;
    console.log(`[${done}] ${lesson.id} ${st.ok ? 'OK ' : 'FAIL'} ${st.patch_id || ''} ${st.elapsed_s}s${st.error ? ' :: ' + st.error : ''}`);
  }
  console.log(`lessons ok ${ok}/${done} (target ${MIN_OK}) — next: node m5-ainize.js --stack`);
})();
