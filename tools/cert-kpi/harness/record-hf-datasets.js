const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { KPI_DIR, APP, newAin, envSnapshot, assertResultFree, assertChainPathFree, recordAndVerifyFinal, writeResult } = require('./common');

async function main() {
  const publicationRun = process.argv[2];
  assert.ok(publicationRun && /^[A-Za-z0-9_-]+$/.test(publicationRun));
  const directory = path.join(KPI_DIR, 'evidence', publicationRun);
  const publication = JSON.parse(fs.readFileSync(path.join(directory, 'publication.json')));
  assert.equal(publication.pass, true);
  assert.equal(publication.verifiedFiles, 202);
  assert.match(publication.commit, /^[a-f0-9]{40}$/);
  assert.match(publication.repoId, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  const manifestBytes = fs.readFileSync(path.join(directory, 'download', 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.datasets.length, 100);
  const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const response = await fetch(`https://huggingface.co/datasets/${publication.repoId}/resolve/${publication.commit}/manifest.json`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), sha256(manifestBytes));
  for (const entry of manifest.datasets) {
    assert.equal(sha256(fs.readFileSync(path.join(directory, 'download', entry.file))), entry.sha256);
    assert.equal(sha256(fs.readFileSync(path.join(directory, 'download', entry.loaderFile))), entry.loaderSha256);
  }
  const environment = await envSnapshot();
  const ain = newAin(3, null, 13);
  const target = `/apps/${APP}/hf_dataset_publications/${publicationRun}`;
  assertResultFree(`hf-datasets-${publicationRun}`);
  await assertChainPathFree(ain, target);
  const value = { repository: publication.repoId, revision: publication.commit, configurations: 100,
    rows: manifest.datasets.reduce((total, entry) => total + entry.rows, 0), manifestSha256: sha256(manifestBytes),
    ainizeRegistrationRun: manifest.registrationRun, scope: 'HF dataset publication only; not model deployment or teach/inference100' };
  const verified = await recordAndVerifyFinal(ain, target, value);
  await writeResult(`hf-datasets-${publicationRun}`, { value, verified, pass: true }, environment);
  console.log(JSON.stringify({ ...value, txHash: verified.txHash }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
