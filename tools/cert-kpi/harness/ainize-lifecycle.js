const KPI_DIR = process.env.KPI_DIR || require('path').resolve(__dirname, '..');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { entriesFrom, sha256, selectJob, validateJob, activeStatuses, summarize } = require('./ainize-lifecycle-state');
const { runAudit, makeCli, saveJson, runtimeStatus, assertIdle } = require('./ainize-inference-audit');

async function main() {
  const root = KPI_DIR;
  const runId = process.env.RUN_ID;
  assert.ok(runId && /^[A-Za-z0-9_-]{1,40}$/.test(runId), 'RUN_ID must be 1-40 safe characters');
  const output = path.join(root, 'evidence', runId);
  const registrationRun = process.env.AINIZE_REGISTRATION_RUN || 'ainize_datasets100_20260911';
  assert.ok(/^[A-Za-z0-9_-]+$/.test(registrationRun));
  const registrationBytes = fs.readFileSync(path.join(root, 'evidence', registrationRun, 'progress.json'));
  const entries = entriesFrom(registrationBytes);
  for (const entry of entries) {
    assert.equal(sha256(fs.readFileSync(path.join(root, 'evidence', registrationRun, `${entry.lessonId}-canonical.jsonl`))), entry.sha256);
  }
  const identity = { runId, registrationRun, registrationSha256: sha256(registrationBytes) };
  const filename = path.join(output, 'progress.json');
  let state = { version: 1, identity, startedAt: new Date().toISOString(), attempts: 0, complete: false, entries: entries.map((entry, index) => ({ ...entry, name: `${runId}-${String(index + 1).padStart(3, '0')}`, status: 'PENDING' })) };
  if (fs.existsSync(filename)) {
    state = JSON.parse(fs.readFileSync(filename));
    assert.equal(state.version, 1);
    for (const [key, value] of Object.entries(identity)) assert.equal(state.identity[key], value, 'resume registration inputs changed');
    assert.deepEqual(state.entries.map(({ lessonId, datasetId, sha256: hash, rows }) => ({ lessonId, datasetId, sha256: hash, rows })), entries);
  }
  state.attempts++;
  const attempt = `attempt-${state.attempts}`;
  fs.mkdirSync(path.join(output, attempt));
  let command = 0;
  const cli = makeCli(output);
  const call = (args, name) => cli(args, `${attempt}/${String(++command).padStart(5, '0')}-${name}`);
  const save = () => {
    state.updatedAt = new Date().toISOString();
    state.summary = summarize(state.entries);
    saveJson(filename, state);
  };
  save();
  try {
    for (const entry of state.entries) {
      if (entry.done) {
        if (entry.audit) {
          assert.equal(entry.audit.file, `${entry.lessonId}/progress.json`);
          const auditFolder = path.join(output, entry.lessonId);
          const auditBytes = fs.readFileSync(path.join(auditFolder, 'progress.json'));
          assert.equal(sha256(auditBytes), entry.audit.sha256, 'completed audit changed');
          const audit = JSON.parse(auditBytes);
          assert.equal(audit.complete, true);
          assert.equal(audit.jobId, entry.jobId);
          assert.equal(audit.dataset.sha256, entry.sha256);
          for (const sample of audit.samples) {
            assert.ok(/^fact-[0-9]+-(primary|heldout)\.json$/.test(sample.rawFile));
            assert.equal(sha256(fs.readFileSync(path.join(auditFolder, sample.rawFile))), sample.sha256, 'completed raw inference changed');
          }
        }
        continue;
      }
      const { items } = await call(['teach', 'jobs'], 'jobs');
      assert.ok(Array.isArray(items) && items.length < 500, 'job list may be truncated');
      let job = selectJob(entry, items);
      const foreign = items.filter(item => activeStatuses.has(item.status) && item.id !== job?.id);
      assert.equal(foreign.length, 0, 'another lesson is active; do not queue duplicate work');
      if (!job) {
        assertIdle(await runtimeStatus());
        assert.deepEqual(await call(['patch', 'stack'], 'stack-before-submit'), [], 'scratch training requires an empty stack');
        entry.submissionIntent = { at: new Date().toISOString(), datasetId: entry.datasetId, sha256: entry.sha256, name: entry.name, effort: 'balanced' };
        save();
        const response = await call(['teach', 'train', entry.datasetId, '--name', entry.name, '--effort', 'balanced'], 'submitted');
        job = validateJob(entry, response.job);
        entry.submitted = true;
      } else { entry.adopted = !entry.submitted; }
      entry.jobId = job.id;
      entry.status = job.status;
      save();
      while (activeStatuses.has(job.status)) {
        await new Promise(resolve => setTimeout(resolve, 30000));
        job = validateJob(entry, (await call(['teach', 'status', entry.jobId], 'status')).job);
        entry.status = job.status;
        entry.progress = job.progress;
        entry.blocked = job.blocked;
        save();
        console.log(JSON.stringify({ at: state.updatedAt, lessonId: entry.lessonId, jobId: job.id, status: job.status, progress: job.progress, blocked: job.blocked }));
      }
      job = validateJob(entry, (await call(['teach', 'status', entry.jobId], 'terminal')).job);
      entry.status = job.status;
      entry.terminal = { draftId: job.draft_id, patchSha256: job.result?.sha256, checks: job.checks, publishStatus: job.publish_status, error: job.error };
      save();
      if (['READY', 'NEEDS_MORE'].includes(job.status) && job.checks?.executed && job.draft_id) {
        const auditFolder = path.join(output, entry.lessonId);
        const audit = await runAudit({ runId: `${runId}-${entry.lessonId}`, jobId: job.id, root, registrationRun, output: auditFolder });
        entry.audit = { complete: audit.complete, pass: audit.pass, primary: audit.primary, heldout: audit.heldout, file: `${entry.lessonId}/progress.json`, sha256: sha256(fs.readFileSync(path.join(auditFolder, 'progress.json'))) };
      } else { entry.inferenceUnavailable = `terminal status ${job.status}; checked draft ${Boolean(job.checks?.executed && job.draft_id)}`; }
      entry.done = true;
      save();
      console.log(JSON.stringify({ lessonId: entry.lessonId, summary: state.summary }));
    }
    state.complete = true;
    state.finishedAt = new Date().toISOString();
    state.executionComplete = state.entries.every(entry => entry.audit?.complete);
    state.allAnswersCorrect = state.entries.every(entry => entry.audit?.pass);
    state.scope = '100 dataset lifecycle observations on one base model; neither 100 distinct models nor public Ainize listing nor HF model deployment';
    state.error = null;
    save();
    process.exitCode = state.executionComplete ? 0 : 1;
  } catch (error) {
    state.error = error.message;
    save();
    throw error;
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
