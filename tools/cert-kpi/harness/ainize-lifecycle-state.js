const assert = require('assert/strict');
const crypto = require('crypto');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const activeStatuses = new Set(['QUEUED', 'PREFLIGHT', 'LOADING', 'TRAINING', 'EXPORTED', 'CHECKING']);
const terminalStatuses = new Set(['READY', 'NEEDS_MORE', 'FAILED', 'CANCELLED', 'PENDING_REVIEW', 'REJECTED', 'ANNOUNCED', 'EXPIRED']);

function entriesFrom(registrationBytes, manifest) {
  const registration = JSON.parse(registrationBytes);
  assert.equal(registration.datasets.length, 100);
  if (manifest) {
    assert.equal(manifest.registrationSha256, sha256(registrationBytes), 'registration hash changed');
    assert.equal(manifest.datasets.length, 100);
    assert.equal(new Set(manifest.datasets.map(dataset => dataset.config)).size, 100, 'duplicate HF config');
  }
  for (const key of ['datasetId', 'lessonId', 'canonicalSha256']) {
    assert.equal(new Set(registration.datasets.map(dataset => dataset[key])).size, 100, `duplicate ${key}`);
  }
  return registration.datasets.map(dataset => {
    assert.equal(dataset.ok, true);
    assert.ok(Object.keys(dataset.checks).length > 0 && Object.values(dataset.checks).every(value => value === true));
    assert.ok(/^[A-Za-z0-9_-]+$/.test(dataset.lessonId));
    assert.ok(/^[A-Za-z0-9_-]+$/.test(dataset.datasetId));
    assert.ok(/^[a-f0-9]{64}$/.test(dataset.canonicalSha256));
    assert.ok(Number.isInteger(dataset.rows) && dataset.rows > 0);
    if (manifest) {
      const configured = manifest.datasets.find(entry => entry.config === dataset.lessonId);
      assert.ok(configured, 'missing HF config');
      assert.equal(configured.ainizeDatasetId, dataset.datasetId);
      assert.equal(configured.sha256, dataset.canonicalSha256);
      assert.equal(configured.rows, dataset.rows);
    }
    return { lessonId: dataset.lessonId, datasetId: dataset.datasetId, sha256: dataset.canonicalSha256, rows: dataset.rows };
  });
}

function validateJob(entry, job) {
  assert.ok(job?.id, 'missing job');
  assert.equal(job.dataset?.id, entry.datasetId, 'job dataset ID mismatch');
  assert.equal(job.dataset.sha256, entry.sha256, 'job dataset hash mismatch');
  assert.equal(job.dataset.rows, entry.rows, 'job dataset rows mismatch');
  assert.equal(job.mode, 'scratch', 'only independent scratch lessons are supported');
  assert.deepEqual(job.context_patch_ids, []);
  assert.equal(job.training?.effort, 'balanced');
  assert.ok(activeStatuses.has(job.status) || terminalStatuses.has(job.status), `unknown job status ${job.status}`);
  return job;
}

function selectJob(entry, jobs) {
  assert.ok(Array.isArray(jobs));
  const sameName = jobs.filter(job => job.name === entry.name);
  assert.ok(sameName.length <= 1, 'ambiguous job name; inspect jobs without resubmitting');
  if (sameName.length) validateJob(entry, sameName[0]);
  if (entry.jobId) {
    const existing = jobs.filter(job => job.id === entry.jobId);
    assert.equal(existing.length, 1, 'saved job is missing; do not resubmit');
    return validateJob(entry, existing[0]);
  }
  if (sameName.length) return sameName[0];
  assert.ok(!entry.submissionIntent, 'submission outcome unknown; inspect jobs without resubmitting');
  const sameDataset = jobs.filter(job => job.dataset?.id === entry.datasetId);
  assert.ok(sameDataset.length <= 1, 'multiple existing lessons for this dataset; explicit reconciliation required');
  return sameDataset.length ? validateJob(entry, sameDataset[0]) : null;
}

function assertOwnedStack(stack, patch) {
  assert.ok(Array.isArray(stack), 'stack response is not an array');
  assert.ok(stack.length <= 1, 'other patches are loaded; not removing them');
  for (const layer of stack) {
    assert.equal(layer.patch_id, patch.id, 'unowned patch loaded; not removing it');
    assert.equal(layer.sha256, patch.sha256, 'loaded patch hash changed');
    assert.equal(layer.journal, true, 'missing restoration journal');
  }
}

function summarize(entries) {
  const audited = entries.filter(entry => entry.audit?.complete);
  return {
    target: entries.length,
    jobs: entries.filter(entry => entry.jobId).length,
    ready: entries.filter(entry => entry.status === 'READY').length,
    needsMore: entries.filter(entry => entry.status === 'NEEDS_MORE').length,
    terminal: entries.filter(entry => terminalStatuses.has(entry.status)).length,
    inferenceComplete: audited.length,
    allAnswersCorrect: audited.filter(entry => entry.audit.pass).length,
    primary: { hits: audited.reduce((total, entry) => total + entry.audit.primary.hits, 0), total: audited.reduce((total, entry) => total + entry.audit.primary.total, 0) },
    heldout: { hits: audited.reduce((total, entry) => total + entry.audit.heldout.hits, 0), total: audited.reduce((total, entry) => total + entry.audit.heldout.total, 0) }
  };
}

module.exports = { sha256, activeStatuses, terminalStatuses, entriesFrom, validateJob, selectJob, assertOwnedStack, summarize };
