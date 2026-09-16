const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { entriesFrom, sha256, selectJob, assertOwnedStack, summarize } = require('../ainize-lifecycle-state');
const { runAudit, saveJson, assertIdle } = require('../ainize-inference-audit');

function registrationFixture() {
  const datasets = Array.from({ length: 100 }, (_, index) => ({ ok: true, datasetId: `dataset-${index}`, lessonId: `dart-${index}`, canonicalSha256: sha256(String(index)), rows: 8, checks: { preserved: true } }));
  const bytes = Buffer.from(JSON.stringify({ datasets }));
  const manifest = { registrationSha256: sha256(bytes), datasets: datasets.map(dataset => ({ config: dataset.lessonId, ainizeDatasetId: dataset.datasetId, sha256: dataset.canonicalSha256, rows: dataset.rows })) };
  return { bytes, manifest };
}

const entry = { datasetId: 'dataset-1', name: 'run-001', sha256: sha256('rows'), rows: 2 };
const job = { id: 'job-1', name: entry.name, dataset: { id: entry.datasetId, sha256: entry.sha256, rows: 2 }, mode: 'scratch', context_patch_ids: [], training: { effort: 'balanced' }, status: 'TRAINING' };

test('100 registered datasets require no Hugging Face publication or remote manifest', () => {
  const fixture = registrationFixture();
  assert.equal(entriesFrom(fixture.bytes).length, 100);
  const registration = JSON.parse(fixture.bytes);
  registration.datasets[1].datasetId = registration.datasets[0].datasetId;
  assert.throws(() => entriesFrom(Buffer.from(JSON.stringify(registration))), /duplicate datasetId/);
});

test('exactly 100 unique registered configurations bind to the published hashes', () => {
  const fixture = registrationFixture();
  assert.equal(entriesFrom(fixture.bytes, fixture.manifest).length, 100);
  fixture.manifest.datasets[0].sha256 = sha256('changed');
  assert.throws(() => entriesFrom(fixture.bytes, fixture.manifest), /strictly equal/);
  const duplicate = registrationFixture();
  duplicate.manifest.datasets[1] = duplicate.manifest.datasets[0];
  assert.throws(() => entriesFrom(duplicate.bytes, duplicate.manifest), /duplicate HF config/);
});

test('existing jobs are adopted, including after an uncertain submission', () => {
  assert.equal(selectJob(entry, []), null);
  assert.equal(selectJob(entry, [job]), job);
  assert.equal(selectJob({ ...entry, submissionIntent: {} }, [job]), job);
  assert.equal(selectJob({ ...entry, jobId: job.id }, [job]), job);
  assert.throws(() => selectJob({ ...entry, submissionIntent: {} }, []), /outcome unknown/);
  assert.throws(() => selectJob({ ...entry, jobId: job.id }, []), /saved job is missing/);
});

test('hash mismatches, ambiguous jobs and unknown statuses never authorize submission', () => {
  assert.throws(() => selectJob(entry, [{ ...job, dataset: { ...job.dataset, sha256: sha256('changed') } }]), /hash mismatch/);
  assert.throws(() => selectJob(entry, [job, { ...job, id: 'job-2' }]), /ambiguous/);
  assert.throws(() => selectJob(entry, [{ ...job, status: 'NEW_UNKNOWN_STATE' }]), /unknown job status/);
});

test('only the owned hash with a journal can be unloaded', () => {
  const patch = { id: 'own', sha256: sha256('patch') };
  assertOwnedStack([], patch);
  assertOwnedStack([{ patch_id: patch.id, sha256: patch.sha256, journal: true }], patch);
  assert.throws(() => assertOwnedStack([{ patch_id: 'someone-else' }], patch), /unowned/);
  assert.throws(() => assertOwnedStack([{ patch_id: patch.id, sha256: patch.sha256, journal: false }], patch), /journal/);
  assert.throws(() => assertIdle({ available: true, queue: { running: { label: 'other' }, waiting: 0, lock: null } }), /busy/);
});

function auditFixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ainize-audit-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registrationFolder = path.join(root, 'evidence', 'registration');
  const output = path.join(root, 'evidence', 'audit');
  fs.mkdirSync(registrationFolder, { recursive: true });
  fs.mkdirSync(output);
  const facts = [{ prompt: '대표자는?', answer: '조원국', alt_prompt: '대표자 이름?' }, { prompt: '종목코드는?', answer: '001740' }];
  const canonical = facts.map(fact => JSON.stringify(fact)).join('\n') + '\n';
  const dataset = { id: 'dataset-1', sha256: sha256(canonical), rows: 2, revision: 1, job_ids: ['job-1'] };
  const checkedJob = { ...job, status: 'READY', dataset, draft_id: 'patch-1', result: { sha256: sha256('patch') }, facts, checks: { executed: true }, publish_status: 'none' };
  saveJson(path.join(registrationFolder, 'progress.json'), { datasets: [{ datasetId: dataset.id, canonicalSha256: dataset.sha256, lessonId: 'dart-1', rows: 2, ok: true }] });
  fs.writeFileSync(path.join(registrationFolder, 'dart-1-canonical.jsonl'), canonical);
  const state = { chats: 0, removes: 0, stack: [], failAt: null, runtime: { available: true, queue: { running: null, waiting: 0, lock: null } } };
  const cli = async (args, name) => {
    let result;
    if (args[0] === 'teach' && args[1] === 'status') result = { job: checkedJob };
    else if (args[0] === 'teach' && args[1] === 'dataset') result = { dataset };
    else if (args[0] === 'patch' && args[1] === 'stack') result = state.stack;
    else if (args[0] === 'patch' && args[1] === 'remove') { state.stack = []; state.removes++; result = { applied: [] }; }
    else if (args[0] === 'chat') {
      state.chats++;
      if (state.chats === state.failAt) throw new Error('simulated interrupted observation');
      const answer = { content: '조원국', usage: { completion_tokens: 3 }, finish_reason: 'stop', truncated: null };
      result = { patch_id: checkedJob.draft_id, mode: 'compare', dirty: [], base: answer, patched: answer, model: 'fixture' };
      state.stack = [{ patch_id: checkedJob.draft_id, sha256: checkedJob.result.sha256, journal: true }];
    } else throw new Error(`unexpected command ${args}`);
    fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(result), { flag: 'wx' });
    return result;
  };
  return { state, checkedJob, output, options: { root, output, runId: 'audit', jobId: 'job-1', registrationRun: 'registration', cli, getRuntime: async () => state.runtime } };
}

test('interrupted audit resumes saved samples without duplicate chat and records accuracy separately', async context => {
  const fixture = auditFixture(context);
  fixture.state.failAt = 2;
  await assert.rejects(runAudit(fixture.options), /interrupted/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.output, 'progress.json'))).samples.length, 1);
  const result = await runAudit(fixture.options);
  assert.equal(fixture.state.chats, 4);
  assert.equal(result.complete, true);
  assert.equal(result.pass, false);
  assert.deepEqual(result.primary, { hits: 1, total: 2 });
  assert.deepEqual(result.heldout, { hits: 1, total: 1 });
  assert.deepEqual(fixture.state.stack, []);
  await runAudit(fixture.options);
  assert.equal(fixture.state.chats, 4);
  const summary = summarize([{ jobId: 'job-1', status: 'READY', audit: result }]);
  assert.equal(summary.inferenceComplete, 1);
  assert.equal(summary.allAnswersCorrect, 0);
});

test('legacy evidence cannot be overwritten by a failed retry', async context => {
  const fixture = auditFixture(context);
  const filename = path.join(fixture.output, 'progress.json');
  const original = JSON.stringify({ runId: 'legacy', complete: true });
  fs.writeFileSync(filename, original);
  await assert.rejects(runAudit(fixture.options), /legacy evidence/);
  assert.equal(fs.readFileSync(filename, 'utf8'), original);
});

test('an unowned stack halts before any inference or unload', async context => {
  const fixture = auditFixture(context);
  fixture.state.stack = [{ patch_id: 'another-user' }];
  await assert.rejects(runAudit(fixture.options), /unowned/);
  assert.equal(fixture.state.chats, 0);
  assert.equal(fixture.state.removes, 0);
});

test('tampered raw responses fail even when the saved report claimed success', async context => {
  const fixture = auditFixture(context);
  await runAudit(fixture.options);
  fs.appendFileSync(path.join(fixture.output, 'fact-0-primary.json'), ' ');
  await assert.rejects(runAudit(fixture.options), /changed raw inference/);
  assert.equal(fixture.state.chats, 3);
});

test('canonical rows dropped during training remain in the inference denominator', async context => {
  const fixture = auditFixture(context);
  fixture.checkedJob.facts = fixture.checkedJob.facts.slice(0, 1);
  const result = await runAudit(fixture.options);
  assert.equal(result.primary.total, 2);
  assert.equal(result.samples.length, 3);
});
