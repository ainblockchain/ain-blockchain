const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyImport } = require('../import-hf-dart100');

function fixture() {
  const entry = { lessonId: 'dart-001-company_ceo_nm', datasetId: 'dataset-1', sha256: '1'.repeat(64), rows: 8 };
  const result = { source: { repository: 'owner/data', revision: '2'.repeat(40), file: `data/${entry.lessonId}.jsonl`, inputSha256: entry.sha256, sha256: entry.sha256 }, dataset_id: entry.datasetId, dataset: { id: entry.datasetId, sha256: entry.sha256, rows: entry.rows }, created: false };
  return { entry, result };
}

test('native import must reuse the exact existing dataset without training', () => {
  const { entry, result } = fixture();
  verifyImport(entry, result, 'owner/data', '2'.repeat(40));
});

test('different sources, hashes, IDs, row counts and accidental training fail', () => {
  for (const mutate of [result => { result.source.revision = '3'.repeat(40); }, result => { result.source.inputSha256 = '0'.repeat(64); }, result => { result.dataset_id = 'wrong'; }, result => { result.dataset.rows = 7; }, result => { result.created = true; }, result => { result.job = { id: 'new-job' }; }]) {
    const { entry, result } = fixture();
    mutate(result);
    assert.throws(() => verifyImport(entry, result, 'owner/data', '2'.repeat(40)));
  }
});
