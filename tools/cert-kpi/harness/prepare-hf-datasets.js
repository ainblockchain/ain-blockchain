const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');

function main() {
  const runId = process.argv[2];
  const registrationRun = process.argv[3] || 'ainize_datasets100_20260911';
  for (const value of [runId, registrationRun]) assert.ok(value && /^[A-Za-z0-9_-]+$/.test(value));
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'evidence', registrationRun);
  const registrationBytes = fs.readFileSync(path.join(source, 'progress.json'));
  const registration = JSON.parse(registrationBytes);
  assert.equal(registration.datasets.length, 100);
  const output = path.join(root, 'artifacts', runId);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output);
  fs.mkdirSync(path.join(output, 'data'));
  const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const manifest = { createdAt: new Date().toISOString(), registrationRun, registrationSha256: sha256(registrationBytes),
    scope: '100 DART task configurations in one Hugging Face dataset repository; not 100 models, not proof of teach/inference success',
    hubPublished: false, datasets: [] };
  for (const entry of registration.datasets) {
    assert.ok(entry.ok && Object.values(entry.checks).every(value => value === true));
    assert.ok(/^dart-[0-9]+-[A-Za-z0-9_-]+$/.test(entry.lessonId));
    const bytes = fs.readFileSync(path.join(source, `${entry.lessonId}-canonical.jsonl`));
    assert.equal(sha256(bytes), entry.canonicalSha256);
    const rows = bytes.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, entry.rows);
    assert.ok(rows.every(row => typeof row.prompt === 'string' && row.prompt.trim() && typeof row.answer === 'string' && row.answer.trim()));
    assert.ok(!/crtfc_key|BEGIN [A-Z ]*PRIVATE KEY|hf_[A-Za-z0-9]{20,}/i.test(bytes.toString('utf8')), 'possible credential in data');
    const name = `data/${entry.lessonId}.jsonl`;
    fs.writeFileSync(path.join(output, name), bytes, { flag: 'wx' });
    manifest.datasets.push({ config: entry.lessonId, file: name, rows: rows.length, sha256: entry.canonicalSha256,
      ainizeDatasetId: entry.datasetId, sourceSha256: entry.sourceSha256 });
  }
  for (const field of ['config', 'sha256', 'ainizeDatasetId']) assert.equal(new Set(manifest.datasets.map(entry => entry[field])).size, 100);
  const configs = manifest.datasets.map(entry => `- config_name: ${entry.config}\n  data_files:\n  - split: train\n    path: ${entry.file}`).join('\n');
  const card = `---\nlanguage:\n- ko\ntags:\n- dart\n- ainize\n- question-answering\nconfigs:\n${configs}\n---\n\n# DART task datasets for Ainize reproduction\n\nThis bundle preserves 100 distinct task configurations from the existing DART-derived datasets. Each JSONL file is byte-identical to its authenticated Ainize canonical download. The manifest links configuration names, row counts, SHA256 values and Ainize dataset IDs.\n\nSource: Financial Supervisory Service Open DART, https://opendart.fss.or.kr/. These are historical disclosure-derived answers, not a promise of current company information or financial advice. Source reuse terms and publisher rights must be confirmed before public upload; no new license is asserted by this packaging step.\n\nThe train split contains the question/answer records used by Ainize. alt_prompt, where present, is an alternate question for the same fact and is not an independent dataset. A dataset ID is not a trained model ID. Uploading this repository does not demonstrate 100 successful teach jobs, inference support, a model deployment or a public Ainize listing.\n\nLocal preparation only. After upload, verify the Hub commit and every configuration by downloading at that exact revision. Do not treat this README or the local manifest as proof of remote publication.\n\nFormat reference: https://huggingface.co/docs/datasets/en/repository_structure\n`;
  fs.writeFileSync(path.join(output, 'README.md'), card, { flag: 'wx' });
  manifest.cardSha256 = sha256(Buffer.from(card));
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, configs: manifest.datasets.length, rows: manifest.datasets.reduce((total, entry) => total + entry.rows, 0), hubPublished: false }));
}

main();
