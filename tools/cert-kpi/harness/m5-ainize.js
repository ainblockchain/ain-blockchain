// M5+M6 (Ainize 경로): DART 타입별 데이터셋 N개 (= 데이터셋 N종, 지표 6) → 지식 패치 N개 (= 모델 N종, 지표 5) 를
//   teach(학습) → publish(공개·온체인 anchor) → live test(패치 적용 후 추론 ≥1 성공)
//   → ain-js 온체인 기록 → getValue 역검증 까지 수행하고,
//   --stack 단계에서 전 패치를 서빙 모델에 중첩(apply) 한 뒤 스택 상태에서 재검증한다.
// 재개 가능: results/m5-ainize-progress.json 에 수업별 상태를 저장하고 완료된 단계는 건너뛴다.
//
//   node m5-ainize.js                # 수업 학습·공개·검증 (manifest 순서대로, 트레이너는 host당 1개)
//   node m5-ainize.js --stack        # 전 패치 중첩 apply + 스택 검증 + m5-final.json 산출
//   LESSONS=110 MIN_OK=100 EFFORT=quick
const { newAin, APP, writeResult, sleep, recordAndVerifyFinal, getValueFinal, safeName } = require('./common');
const { execFile } = require('child_process');
const fs = require('fs');

const HARNESS = __dirname;
const MANIFEST = JSON.parse(fs.readFileSync(process.env.MANIFEST || `${HARNESS}/dart-datasets/manifest.json`)).filter(l => l.facts.length > 0);
const LESSONS = parseInt(process.env.LESSONS || '110', 10);
const START = parseInt(process.env.START || '0', 10);          // 이 워커가 맡는 manifest 구간 [START, END)
const END = parseInt(process.env.END || String(LESSONS), 10);
const MIN_OK = parseInt(process.env.MIN_OK || '100', 10);
const EFFORT = process.env.EFFORT || 'quick';
const { RESULTS_DIR, KPI_DIR } = require('./common');
// ainize CLI: 기본은 PATH 의 `ainize`(npm i -g @ainize/cli). 소스 빌드를 쓰려면 AINIZE_CLI=<ainize-cli>/dist/bin.js 와 AINIZE_NODE=<node24> 지정.
const CLI = process.env.AINIZE_CLI || null;
const NODE24 = process.env.AINIZE_NODE || process.execPath;
const AINIZE_HOME = process.env.AINIZE_HOME || `${KPI_DIR}/ainize/home-cert`;
const RUNTIME_API = process.env.RUNTIME_API || 'http://localhost:8000';
// 진행 파일은 노드 홈별로 분리 (같은 파일을 두 워커가 덮어쓰면 재개가 깨진다)
const PROGRESS = process.env.PROGRESS || `${RESULTS_DIR}/m5-ainize-progress-${require('path').basename(AINIZE_HOME)}.json`;
const PROGRESS_GLOB_DIR = RESULTS_DIR;   // --stack: m5-ainize-progress*.json 전부 병합
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

// 정답 판정 (리뷰 반영: 단순 부분문자열 → 경계 일치). 공백·마크다운 기호 제거 후 정답이 응답 안에 '온전한 토큰'으로 나타나야 한다:
//   정답 앞뒤 문자가 영숫자·숫자 구분자(, . -)가 아니어야 함 → '352' vs '35203' / '1,352,000' / '352.7' 은 불일치.
//   정답·응답 양쪽에서 천단위 콤마는 제거해 비교한다('1,200억원' == '1200억원'). 에러 본문(JSON)은 항상 불일치.
const norm = x => String(x ?? '').replace(/\s+/g, '').replace(/[*_`]/g, '').replace(/(\d),(?=\d{3})/g, '$1');
function hitOf(content, answer) {
  if (typeof content !== 'string' || content.trim().startsWith('{')) return false;
  const c = norm(content), a = norm(answer);
  if (!a) return false;
  let from = 0;
  while (true) {
    const i = c.indexOf(a, from);
    if (i < 0) return false;
    const before = i > 0 ? c[i - 1] : '', before2 = i > 1 ? c[i - 2] : '';
    const after = c[i + a.length] || '', after2 = c[i + a.length + 1] || '';
    // 경계 위반: 인접 문자가 영숫자이거나, 숫자 구분자(. , -)가 숫자와 이어져 더 긴 숫자를 이루는 경우 ('352.7', '0.352', '1,352,000', '12-352')
    const badBefore = /[A-Za-z0-9]/.test(before) || (/[.,\-]/.test(before) && /[0-9]/.test(before2));
    const badAfter = /[A-Za-z0-9]/.test(after) || (/[.,\-]/.test(after) && /[0-9]/.test(after2));
    if (!badBefore && !badAfter) return true;
    from = i + 1;
  }
}

// 온체인 기록 → 최종화 영수증(state==='FINALIZED') → is_final getValue 역검증 (common.recordAndVerifyFinal)
async function recordAndVerify(ain, path, value, check) {
  const r = await recordAndVerifyFinal(ain, path, value, { check });
  return r.txHash;
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
  // READY 지만 라이브 검사(부수효과 등)에 실패한 수업은 재사용 불가 (recheck 는 미측정 수업 전용) → 새로 학습
  if (job.status === 'READY' && job.checks && job.checks.executed && job.checks.ok === false) return false;
  // ANNOUNCED 수업은 그 anchor 가 현재 체인에 있을 때만 재사용 (체인 재기동 후 남은 옛 수업은 새로 학습·공개)
  if (job.status === 'ANNOUNCED' && !(job.patch_id && await anchorOnChain(ain, job.patch_id))) return false;
  st.job_id = job.id; st.status = job.status; st.checked = !!(job.checks && job.checks.executed === true);
  st.adopted = true; if (job.patch_id) st.patch_id = job.patch_id;
  return ['READY', 'ANNOUNCED'].includes(job.status);
}

async function runLesson(lesson, st, ain) {
  const log = `${LOGDIR}/${lesson.id}.log`;
  // 0) 노드에 같은 이름의 수업이 이미 있으면 재사용
  if (!st.job_id || !['READY', 'ANNOUNCED'].includes(st.status)) await adoptExistingJob(lesson, st, log, ain);
  // 1) 학습 (파일 업로드 + 수업 생성 + 완료 대기)
  if (!st.job_id || !['READY', 'ANNOUNCED'].includes(st.status)) {
    const t0 = Date.now();
    let r;
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
      const job2 = r2.json && r2.json.job;
      if (job2) { st.job_id = job2.id; st.status = job2.status; st.checked = !!(job2.checks && job2.checks.executed === true); if (job2.progress) st.progress = job2.progress; }
      st.train_exit = r2.code; st.train_s = Math.round((Date.now() - t0) / 1000);
    }
    if (!(st.status === 'READY' && st.checked)) { st.error = `train: status=${st.status} exit=${r.code} checked=${st.checked}`; return false; }
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
  // 3) live test: 패치를 서빙 모델에 적용(patch apply) → 학습 렌더링(Q:/A:)으로 추론 3회 + 채팅 형식 1회 → 패치 제거
  //    (노드의 READY 검증과 같은 원문 형식; 채팅 답은 장황해 max_tokens 안에 답이 안 나올 수 있다)
  if (!st.chat || st.chat.filter(c => c.hit).length < 1) {
    st.chat = [];
    const ap = await ainize(['patch', 'apply', st.patch_id], { log, timeoutMs: 20 * 60_000 });
    if (ap.code !== 0) { st.error = `patch apply failed: ${(ap.stdout + ap.stderr).slice(0, 200)}`; return false; }
    try {
      for (const [i, f] of lesson.facts.slice(0, 3).entries()) {
        const t0 = Date.now();
        let got = null, tokens = null, err = null;
        try {
          const r = await fetch(`${RUNTIME_API}/v1/completions`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'Qwen3.8-Flash-Next', prompt: `Q: ${f.prompt}\nA:`, max_tokens: 24, temperature: 0, stop: ['\n'] }),
            signal: AbortSignal.timeout(120000),
          });
          const j = await r.json();
          if (j.choices && j.choices[0]) { got = j.choices[0].text; tokens = j.usage ? j.usage.completion_tokens : null; }
          else err = `no choices: ${JSON.stringify(j).slice(0, 200)}`;
        } catch (e) { err = String(e.message); }
        st.chat.push({ format: 'qa', prompt: f.prompt, expect: f.answer, got, hit: hitOf(got, f.answer), latency_ms: Date.now() - t0, tokens, err });
      }
      // 채팅 형식 1회 (증빙용; 판정에는 qa 형식 3회를 사용)
      const f = lesson.facts[0]; const t0 = Date.now();
      try {
        const r = await fetch(`${RUNTIME_API}/v1/chat/completions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'Qwen3.8-Flash-Next', messages: [{ role: 'user', content: f.prompt }], max_tokens: 64, temperature: 0, chat_template_kwargs: { enable_thinking: false } }),
          signal: AbortSignal.timeout(120000),
        });
        const j = await r.json(); const got = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : null;
        st.chat_form = { prompt: f.prompt, expect: f.answer, got, hit: hitOf(got, f.answer), latency_ms: Date.now() - t0 };
      } catch (e) { st.chat_form = { err: String(e.message) }; }
    } finally {
      await ainize(['patch', 'remove', st.patch_id], { log, timeoutMs: 20 * 60_000 });
    }
    if (st.chat.filter(c => c.hit).length < 1) { st.error = 'inference: no correct answer with the patch applied'; return false; }
  }
  // 4) ain-js 온체인 기록 + 역검증
  if (!st.onchain_verified) {
    st.tx = [];
    for (let i = 0; i < st.chat.length; i++) {
      const c = st.chat[i];
      const tx = await recordAndVerify(ain, `${BASE}/${safeName(st.patch_id)}/iteration_${i + 1}`, {
        modelName: st.patch_id, lesson: lesson.id, iteration: i + 1, prompt: c.prompt, expect: c.expect, got: c.got,
        inferenceOk: c.hit, tokensGenerated: c.tokens, timestamp: Date.now(),
      }, v => v.modelName === st.patch_id && v.iteration === i + 1);
      st.tx.push(tx);
    }
    st.onchain_verified = true;    // 각 tx: FINALIZED 영수증 + is_final getValue 일치
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
  fs.writeFileSync(`${RESULTS_DIR}/m5-ainize-stack.json`, JSON.stringify({ applies, applyExit, stacks }, null, 2));
  // 스택에 실린 패치 id 집합 (정확 일치; 부분 문자열 비교 금지)
  const stackIdSet = new Set();
  const collect = (o) => { if (Array.isArray(o)) o.forEach(collect); else if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) { if ((k === 'patch_id' || k === 'id') && typeof v === 'string') stackIdSet.add(v); collect(v); } } };
  collect(stacks);
  const ap = { code: applyExit };
  // 스택 상태의 서빙 모델에 직접 질의 (OpenAI 호환 API)
  const checks = [];
  for (const l of MANIFEST.slice(0, LESSONS)) {
    const st = progress[l.id]; if (!st || !st.ok) continue;
    const f = l.facts[0];
    let got = null, err = null;
    try {
      const r = await fetch(`${RUNTIME_API}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'Qwen3.8-Flash-Next', messages: [{ role: 'user', content: f.prompt }], max_tokens: 48, temperature: 0, chat_template_kwargs: { enable_thinking: false } }),
        signal: AbortSignal.timeout(120000),
      });
      const j = await r.json(); got = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : JSON.stringify(j).slice(0, 200);
    } catch (e) { err = String(e.message); }
    const hit = hitOf(got, f.answer);
    const inStack = stackIdSet.has(st.patch_id);
    let tx = null, verified = false;
    try {
      tx = await recordAndVerify(ain, `${STACK_BASE}/${safeName(st.patch_id)}/check`, {
        modelName: st.patch_id, lesson: l.id, stackSize: ids.length, inStack, prompt: f.prompt, expect: f.answer, got, hit, timestamp: Date.now(),
      }, v => v.modelName === st.patch_id);
      verified = true;
    } catch (e) { err = (err ? err + '; ' : '') + e.message; }
    checks.push({ lesson: l.id, patch_id: st.patch_id, inStack, hit, got, err, tx, verified });
    console.log(`[stack] ${l.id} ${st.patch_id} inStack=${inStack} hit=${hit}${err ? ' err=' + err : ''}`);
  }
  const verified = checks.filter(c => c.verified).length;
  return { stackSize: ids.length, applyExit: ap.code, checks, stackInStack: checks.filter(c => c.inStack).length, stackHits: checks.filter(c => c.hit && c.inStack).length, stackOnchainVerified: verified };
}

(async () => {
  const ain = newAin(3, null, parseInt(process.env.ACCOUNT_IDX || '16', 10));
  if (process.argv.includes('--stack')) {
    const progress = loadAllProgress();
    // 판정 일관성: 저장된 응답(got)에 최종 hitOf 를 다시 적용해 정답 수를 재계산하고, 정답 0 이거나 anchor·데이터셋 조회가 없는 수업은 supported 에서 제외
    for (const [id, st] of Object.entries(progress)) {
      if (!st.chat) continue;
      for (const c of st.chat) c.hit = hitOf(c.got, c.expect);
      if (st.ok && (st.chat.filter(c => c.hit).length < 1 || !st.anchor_onchain || !(st.dataset_get && st.dataset_get.ok))) { st.ok = false; st.error = (st.error || '') + ' [rejudged: hit/anchor/dataset gate]'; }
    }
    const s = await stackPhase(progress, ain);
    const okLessons = MANIFEST.slice(0, LESSONS).filter(l => progress[l.id] && progress[l.id].ok);
    const final = {
      metric: 'M5_model_support', method: 'Ainize teach: one knowledge patch (lesson) = one model; each patch trained on Qwen3.8-Flash-Next PLE table, published (on-chain anchor via AIN ledger), live-tested with the patch applied (>=1 correct inference), recorded via ain-js and getValue-verified; then all patches stacked (patch apply) and re-checked on the stacked serving model',
      target: MIN_OK, attempted: Math.min(LESSONS, MANIFEST.length), supported: okLessons.length,
      inferenceOk: okLessons.reduce((a, l) => a + progress[l.id].chat.filter(c => c.hit).length, 0),
      inferenceTotal: okLessons.reduce((a, l) => a + progress[l.id].chat.length, 0),
      onchainVerified: okLessons.filter(l => progress[l.id].onchain_verified).length,
      anchorsOnChain: okLessons.filter(l => progress[l.id].anchor_onchain).length,
      verification: 'every on-chain record: tx receipt state===FINALIZED + getValue(is_final) match; publish anchor checked at /apps/knowledge/market/patches/<patch_id> (is_final) on the same chain',
      stack: { size: s.stackSize, applyExit: s.applyExit, inStack: s.stackInStack, hits: s.stackHits, onchainVerified: s.stackOnchainVerified },
      failed: MANIFEST.slice(0, LESSONS).filter(l => progress[l.id] && !progress[l.id].ok).map(l => ({ lesson: l.id, error: progress[l.id].error })),
      patches: okLessons.map(l => ({ lesson: l.id, patch_id: progress[l.id].patch_id, train_s: progress[l.id].train_s, hits: progress[l.id].chat.filter(c => c.hit).length })),
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
      datasets: okLessons.map(l => ({ dataset: l.id, title: l.title, api: l.api, rows: l.facts.length, ainizeDatasetId: (progress[l.id].dataset || {}).id || progress[l.id].dataset_id, patch_id: progress[l.id].patch_id })),
      verification: 'dataset record tx receipt state===FINALIZED + getValue(is_final) match',
      pass: okLessons.filter(l => progress[l.id].dataset_verified && progress[l.id].dataset_get && progress[l.id].dataset_get.ok).length >= MIN_OK,
    };
    await writeResult('m6-final', m6);
    console.log(JSON.stringify({ ...m6, datasets: m6.datasets.length }, null, 2));
    fs.writeFileSync(`${RESULTS_DIR}/m5-ainize-stack-checks.json`, JSON.stringify(s, null, 2));
    console.log(JSON.stringify({ ...final, patches: final.patches.length, failed: final.failed.length }, null, 2));
    process.exit(final.pass && m6.pass ? 0 : 1);
  }
  const progress = loadProgress();
  let ok = 0, done = 0;
  for (const lesson of MANIFEST.slice(START, Math.min(END, LESSONS))) {
    const st = progress[lesson.id] || {};
    if (st.ok) { ok++; done++; console.log(`[${done}] ${lesson.id} OK (skip) ${st.patch_id}`); continue; }
    const t0 = Date.now();
    try { st.ok = await runLesson(lesson, st, ain); } catch (e) { st.ok = false; st.error = String(e.message).slice(0, 300); }
    // 2차 시도: 학습·공개·추론 단계 실패(anchor 유실·정답 0·NEEDS_MORE 등)는 새 수업 이름(__r2)·effort balanced 로 1회 재학습
    if (!st.ok && !st.attempt2 && !/dataset get failed|onchain|verify/.test(st.error || '')) {
      st.attempt2 = { error: st.error, job_id: st.job_id, patch_id: st.patch_id };
      for (const k of ['job_id', 'status', 'checked', 'patch_id', 'anchor_onchain', 'chat', 'chat_form', 'tx', 'onchain_verified', 'dataset_get', 'dataset_tx', 'dataset_verified', 'error', 'adopted']) delete st[k];
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
