const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { newAin, APP, KPI_DIR, envSnapshot, recordAndVerifyFinal, assertChainPathFree,
  assertResultFree, writeResult } = require('./common');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
  const runId = process.env.RUN_ID;
  const uploadRun = process.argv[2];
  if (![runId, uploadRun].every(value => value && /^[A-Za-z0-9_-]+$/.test(value))) throw new Error('RUN_ID and upload run required');
  assertResultFree(`ainize-datasets-${runId}`);
  const directory = path.join(KPI_DIR, 'evidence', uploadRun);
  const progress = JSON.parse(fs.readFileSync(path.join(directory, 'progress.json'), 'utf8'));
  if (!progress.completed || !progress.pass || progress.datasets.length !== 100) throw new Error('100 completed dataset checks required');
  const evidence = [];
  for (const dataset of progress.datasets) {
    if (!/^[A-Za-z0-9_-]+$/.test(dataset.lessonId)) throw new Error('invalid lesson ID');
    const canonical = fs.readFileSync(path.join(directory, `${dataset.lessonId}-canonical.jsonl`));
    const source = fs.readFileSync(path.join(__dirname, 'dart-datasets', `${dataset.lessonId}.jsonl`));
    const uploaded = JSON.parse(fs.readFileSync(path.join(directory, `${dataset.lessonId}-upload.json`), 'utf8'));
    const queried = JSON.parse(fs.readFileSync(path.join(directory, `${dataset.lessonId}-get.json`), 'utf8'));
    const actual = canonical.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    const expected = source.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    if (sha256(source) !== uploaded.sha256 || sha256(canonical) !== uploaded.dataset.sha256
      || queried.dataset.sha256 !== uploaded.dataset.sha256 || queried.dataset.id !== uploaded.dataset.id
      || dataset.datasetId !== uploaded.dataset.id || queried.saved?.verified !== true
      || uploaded.dataset.invalid_rows !== 0 || actual.length !== expected.length || actual.length !== uploaded.dataset.rows
      || !actual.every((row, index) => row.prompt === expected[index].prompt && row.answer === expected[index].answer)) {
      throw new Error(`evidence recheck failed: ${dataset.lessonId}`);
    }
    evidence.push({ lessonId: dataset.lessonId, datasetId: uploaded.dataset.id, rows: actual.length,
      sourceSha256: sha256(source), canonicalSha256: sha256(canonical) });
  }
  if (new Set(evidence.map(item => item.datasetId)).size !== 100 || new Set(evidence.map(item => item.canonicalSha256)).size !== 100) {
    throw new Error('dataset IDs and contents must be unique');
  }
  const environment = await envSnapshot();
  const ain = newAin(3, null, 13);
  const target = `/apps/${APP}/dataset_inventory/${runId}`;
  await assertChainPathFree(ain, target);
  const manifestBytes = Buffer.from(JSON.stringify(evidence));
  fs.writeFileSync(path.join(KPI_DIR, 'evidence', runId, 'manifest.json'), manifestBytes, { flag: 'wx' });
  const value = { uploadRun, count: 100, manifestSha256: sha256(manifestBytes),
    scope: 'Ainize authenticated dataset upload and download only; teach and inference are not yet certified' };
  const verified = await recordAndVerifyFinal(ain, target, value);
  await writeResult(`ainize-datasets-${runId}`, { runId, target, value, verified, datasets: evidence, pass: true }, environment);
  console.log(JSON.stringify({ count: 100, txHash: verified.txHash, block: verified.blockNumber, scope: value.scope, pass: true }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
