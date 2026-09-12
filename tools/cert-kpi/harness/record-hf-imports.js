const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { entriesFrom, sha256 } = require('./ainize-lifecycle-state');
const { verifyImport } = require('./import-hf-dart100');
const { KPI_DIR, APP, newAin, envSnapshot, assertResultFree, assertChainPathFree, recordAndVerifyFinal, writeResult } = require('./common');

async function main() {
  const runId = process.env.RUN_ID;
  const [importRun, registrationRun = 'ainize_datasets100_20260911'] = process.argv.slice(2);
  for (const value of [runId, importRun, registrationRun]) assert.ok(value && /^[A-Za-z0-9_-]+$/.test(value));
  assertResultFree(`hf-imports-${runId}`);
  const root = path.join(KPI_DIR, 'evidence', importRun);
  const registrationBytes = fs.readFileSync(path.join(KPI_DIR, 'evidence', registrationRun, 'progress.json'));
  const expected = entriesFrom(registrationBytes);
  const progressBytes = fs.readFileSync(path.join(root, 'progress.json'));
  const progress = JSON.parse(progressBytes);
  assert.equal(progress.registrationSha256, sha256(registrationBytes));
  assert.equal(progress.complete, true);
  assert.equal(progress.entries.length, 100);
  const manifest = expected.map((entry, index) => {
    const saved = progress.entries[index];
    for (const key of ['lessonId', 'datasetId', 'sha256', 'rows']) assert.equal(saved[key], entry[key]);
    const rawBytes = fs.readFileSync(path.join(root, `${entry.lessonId}.json`));
    assert.equal(sha256(rawBytes), saved.rawSha256);
    verifyImport(entry, JSON.parse(rawBytes), progress.repository, progress.revision);
    const canonical = fs.readFileSync(path.join(KPI_DIR, 'evidence', registrationRun, `${entry.lessonId}-canonical.jsonl`));
    assert.equal(sha256(canonical), entry.sha256);
    return { ...entry, importEvidenceSha256: saved.rawSha256 };
  });
  const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json')));
  assert.equal(state.Running, false);
  assert.equal(state.ExitCode, 0);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  fs.writeFileSync(path.join(KPI_DIR, 'evidence', runId, 'manifest.json'), manifestBytes, { flag: 'wx' });
  const environment = await envSnapshot();
  const ain = newAin(3, null, 13);
  const target = `/apps/${APP}/hf_dataset_integrations/${runId}`;
  await assertChainPathFree(ain, target);
  const value = { repository: progress.repository, revision: progress.revision, datasets: 100, rows: manifest.reduce((total, entry) => total + entry.rows, 0),
    importRun, registrationRun, registrationSha256: sha256(registrationBytes), progressSha256: sha256(progressBytes), manifestSha256: sha256(manifestBytes),
    scope: 'Existing HF data imported by the native Ainize CLI and bound to 100 existing dataset IDs; no Hub publication, no claim of 100 completed teach/inference jobs or public marketplace sales' };
  const verified = await recordAndVerifyFinal(ain, target, value);
  await writeResult(`hf-imports-${runId}`, { value, target, verified, pass: true }, environment);
  console.log(JSON.stringify({ ...value, txHash: verified.txHash, block: verified.blockNumber }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
