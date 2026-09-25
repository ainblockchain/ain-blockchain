const KPI_DIR = process.env.KPI_DIR || require('path').resolve(__dirname, '..');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execute = promisify(execFile);
const { hitOf } = require('./m5-judge');
const { sha256, assertOwnedStack } = require('./ainize-lifecycle-state');

function saveJson(filename, value) {
  const temporary = `${filename}.tmp`;
  const descriptor = fs.openSync(temporary, 'w');
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n');
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, filename);
  const directory = fs.openSync(path.dirname(filename), 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

function makeCli(output) {
  return async (args, name) => {
    const filename = path.join(output, `${name}.json`);
    assert.ok(!fs.existsSync(filename), `raw response already exists: ${name}`);
    try {
      const result = await execute(process.execPath, ['/opt/ainize/ainize-cli/dist/bin.js', ...args, '--json'], { timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
      fs.writeFileSync(filename, result.stdout, { flag: 'wx' });
      return JSON.parse(result.stdout);
    } catch (error) {
      fs.writeFileSync(`${filename}.error-${Date.now()}-${process.pid}.json`, JSON.stringify({ message: error.message, stdout: error.stdout, stderr: error.stderr }), { flag: 'wx' });
      throw error;
    }
  };
}

async function runtimeStatus() {
  const response = await fetch('http://localhost:3410/api/info', { signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, 'runtime info HTTP error');
  return (await response.json()).runtime;
}

function assertIdle(runtime) {
  assert.equal(runtime.available, true, 'runtime unavailable');
  assert.equal(runtime.queue?.running, null, 'runtime busy; leave current operation intact');
  assert.equal(runtime.queue.waiting, 0, 'runtime queue is not empty');
  assert.equal(runtime.queue.lock, null, 'runtime is locked');
}

function score(inference, fact, index, kind, rawFile) {
  const valid = answer => typeof answer?.content === 'string' && answer.content.trim().length > 0 &&
    Number.isInteger(answer.usage?.completion_tokens) && answer.usage.completion_tokens > 0 && answer.usage.completion_tokens <= 256 &&
    answer.finish_reason === 'stop' && !answer.truncated;
  return { index, kind, prompt: kind === 'primary' ? fact.prompt : fact.alt_prompt, expected: fact.answer, model: inference.model,
    baseValid: valid(inference.base), patchedValid: valid(inference.patched),
    baseHit: valid(inference.base) && hitOf(inference.base.content, fact.answer),
    patchedHit: valid(inference.patched) && hitOf(inference.patched.content, fact.answer),
    nodeBenchmarkHit: inference.benchmark_hit, baseTokens: inference.base?.usage?.completion_tokens,
    patchedTokens: inference.patched?.usage?.completion_tokens, rawFile };
}

async function runAudit({ runId, jobId, registrationRun = 'ainize_datasets100_20260911', root = KPI_DIR, output, cli, getRuntime = runtimeStatus }) {
  for (const value of [runId, jobId, registrationRun]) assert.ok(value && /^[A-Za-z0-9_-]+$/.test(value), 'valid run and job IDs required');
  output ||= path.join(root, 'evidence', runId);
  fs.mkdirSync(output, { recursive: true });
  const progressFile = path.join(output, 'progress.json');
  let progress = { version: 2, runId, jobId, registrationRun, startedAt: new Date().toISOString(), complete: false, attempts: 0, samples: [], failures: [] };
  if (fs.existsSync(progressFile)) {
    progress = JSON.parse(fs.readFileSync(progressFile));
    assert.equal(progress.version, 2, 'legacy evidence is immutable; use a new audit directory');
    assert.equal(progress.runId, runId);
    assert.equal(progress.jobId, jobId);
    assert.equal(progress.registrationRun, registrationRun);
  }
  progress.attempts++;
  const attempt = `attempt-${progress.attempts}`;
  fs.mkdirSync(path.join(output, attempt));
  cli ||= makeCli(output);
  const fresh = (args, name) => cli(args, `${attempt}/${name}`);
  const save = () => saveJson(progressFile, progress);
  save();
  try {
    const registration = JSON.parse(fs.readFileSync(path.join(root, 'evidence', registrationRun, 'progress.json')));
    const { job } = await fresh(['teach', 'status', jobId], 'job-before');
    assert.equal(job.id, jobId);
    assert.ok(['READY', 'NEEDS_MORE'].includes(job.status), 'no checked draft to audit');
    assert.equal(job.checks.executed, true);
    assert.ok(job.draft_id && /^[a-f0-9]{64}$/.test(job.result?.sha256));
    assert.equal(job.mode, 'scratch');
    assert.deepEqual(job.context_patch_ids, []);
    const dataset = registration.datasets.find(entry => entry.datasetId === job.dataset.id);
    assert.ok(dataset?.ok);
    assert.equal(dataset.canonicalSha256, job.dataset.sha256);
    assert.equal(dataset.rows, job.dataset.rows);
    const downloaded = await fresh(['teach', 'dataset', 'get', dataset.datasetId], 'dataset');
    assert.equal(downloaded.dataset.id, dataset.datasetId);
    assert.equal(downloaded.dataset.sha256, dataset.canonicalSha256);
    assert.equal(downloaded.dataset.rows, dataset.rows);
    assert.equal(downloaded.dataset.revision, job.dataset.revision);
    assert.ok(downloaded.dataset.job_ids.includes(jobId));
    const canonical = fs.readFileSync(path.join(root, 'evidence', registrationRun, `${dataset.lessonId}-canonical.jsonl`));
    assert.equal(sha256(canonical), dataset.canonicalSha256);
    const facts = canonical.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(facts.length, dataset.rows);
    const content = fact => ({ prompt: fact.prompt, answer: fact.answer, alt_prompt: fact.alt_prompt || null });
    for (const fact of job.facts) assert.ok(facts.some(original => JSON.stringify(content(original)) === JSON.stringify(content(fact))), 'trained fact differs from canonical dataset');
    const patch = { id: job.draft_id, sha256: job.result.sha256 };
    if (progress.patch) assert.deepEqual(progress.patch, patch);
    progress.dataset = { id: dataset.datasetId, sha256: dataset.canonicalSha256, rows: dataset.rows, lessonId: dataset.lessonId };
    progress.patch = patch;
    progress.publishStatus = job.publish_status;
    progress.scope = 'All canonical dataset rows through Ainize compare inference; answer accuracy is separate from execution, public listing and distinct model count';
    const cleanStack = async name => {
      const runtime = await getRuntime();
      saveJson(path.join(output, attempt, `${name}-runtime.json`), runtime);
      assertIdle(runtime);
      const stack = await fresh(['patch', 'stack'], `${name}-before`);
      assertOwnedStack(stack, patch);
      if (stack.length) await fresh(['patch', 'remove', patch.id], `${name}-remove`);
      assert.deepEqual(await fresh(['patch', 'stack'], `${name}-after`), []);
    };
    await cleanStack('baseline');
    const samples = new Map(progress.samples.map(sample => [sample.rawFile, sample]));
    assert.equal(samples.size, progress.samples.length, 'duplicate saved sample');
    progress.complete = false;
    save();
    let expectedSamples = 0;
    for (const [index, fact] of facts.entries()) {
      for (const [kind, prompt] of [['primary', fact.prompt], ['heldout', fact.alt_prompt]]) {
        if (!prompt) continue;
        expectedSamples++;
        const name = `fact-${index}-${kind}`;
        const rawFile = `${name}.json`;
        const filename = path.join(output, rawFile);
        let inference;
        if (fs.existsSync(filename)) {
          const bytes = fs.readFileSync(filename);
          assert.equal(samples.get(rawFile)?.sha256, sha256(bytes), 'uncheckpointed or changed raw inference; inspect before retry');
          inference = JSON.parse(bytes);
        } else {
          assert.ok(!samples.has(rawFile), 'checkpointed raw inference is missing');
          const stack = await fresh(['patch', 'stack'], `${name}-stack`);
          assertOwnedStack(stack, patch);
          inference = await cli(['chat', patch.id, prompt, '--mode', 'compare', '--max-tokens', '256'], name);
        }
        assert.equal(inference.patch_id, patch.id);
        assert.equal(inference.mode, 'compare');
        assert.deepEqual(inference.dirty, []);
        samples.set(rawFile, { ...score(inference, fact, index, kind, rawFile), sha256: sha256(fs.readFileSync(filename)) });
        progress.samples = [...samples.values()];
        save();
      }
    }
    assert.equal(progress.samples.length, expectedSamples, 'unexpected saved samples');
    await cleanStack('finished');
    const final = await fresh(['teach', 'status', jobId], 'job-after');
    assert.equal(final.job.result.sha256, patch.sha256);
    assert.equal(final.job.dataset.sha256, dataset.canonicalSha256);
    progress.complete = true;
    progress.finishedAt = new Date().toISOString();
    progress.primary = { total: facts.length, hits: progress.samples.filter(sample => sample.kind === 'primary' && sample.patchedHit).length };
    progress.heldout = { total: facts.filter(fact => fact.alt_prompt).length, hits: progress.samples.filter(sample => sample.kind === 'heldout' && sample.patchedHit).length };
    progress.pass = progress.primary.hits === progress.primary.total && progress.heldout.hits === progress.heldout.total;
    progress.error = null;
    save();
    return progress;
  } catch (error) {
    progress.complete = false;
    progress.error = error.message;
    progress.failures.push({ at: new Date().toISOString(), attempt, message: error.message });
    save();
    throw error;
  }
}

if (require.main === module) runAudit({ runId: process.env.RUN_ID, jobId: process.env.AINIZE_JOB_ID, registrationRun: process.env.AINIZE_REGISTRATION_RUN })
  .then(progress => { console.log(JSON.stringify({ runId: progress.runId, dataset: progress.dataset, primary: progress.primary, heldout: progress.heldout, pass: progress.pass })); process.exitCode = progress.pass ? 0 : 1; })
  .catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { runAudit, saveJson, makeCli, score, runtimeStatus, assertIdle };
