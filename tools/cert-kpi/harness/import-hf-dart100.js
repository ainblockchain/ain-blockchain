const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { entriesFrom, sha256 } = require('./ainize-lifecycle-state');

function verifyImport(entry, result, repository, revision) {
  assert.equal(result.source.repository, repository);
  assert.equal(result.source.revision, revision);
  assert.equal(result.source.file, `data/${entry.lessonId}.jsonl`);
  assert.equal(result.source.inputSha256, entry.sha256);
  assert.equal(result.source.sha256, entry.sha256);
  assert.equal(result.dataset_id, entry.datasetId);
  assert.equal(result.dataset.id, entry.datasetId);
  assert.equal(result.dataset.sha256, entry.sha256);
  assert.equal(result.dataset.rows, entry.rows);
  assert.equal(result.created, false, 'expected reuse of the existing DART dataset');
  assert.equal(result.job, undefined, 'import must not train');
}

async function main() {
  const [repository, revision] = process.argv.slice(2);
  assert.ok(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || ''));
  assert.ok(/^[a-f0-9]{40}$/.test(revision || ''), 'pass an immutable HF commit SHA');
  const registrationBytes = fs.readFileSync('/registration/progress.json');
  const entries = entriesFrom(registrationBytes);
  const output = '/evidence';
  const filename = path.join(output, 'progress.json');
  assert.ok(!fs.existsSync(filename), 'use a new RUN_ID; preserve previous observations');
  const state = { repository, revision, registrationSha256: sha256(registrationBytes), startedAt: new Date().toISOString(), target: entries.length, complete: false, entries: [] };
  const save = () => {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(`${filename}.tmp`, JSON.stringify(state, null, 2) + '\n');
    fs.renameSync(`${filename}.tmp`, filename);
  };
  save();
  try {
    for (const entry of entries) {
      const canonical = fs.readFileSync(`/registration/${entry.lessonId}-canonical.jsonl`);
      assert.equal(sha256(canonical), entry.sha256);
      const args = ['/opt/ainize/ainize-cli/dist/bin.js', 'dataset', `https://huggingface.co/datasets/${repository}`, '--revision', revision, '--file', `data/${entry.lessonId}.jsonl`, '--node', 'http://localhost:3410', '--json'];
      const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 180000 });
      fs.writeFileSync(path.join(output, `${entry.lessonId}.json`), result.stdout || '', { flag: 'wx' });
      fs.writeFileSync(path.join(output, `${entry.lessonId}.stderr.log`), result.stderr || '', { flag: 'wx' });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `CLI import failed: ${entry.lessonId}`);
      const imported = JSON.parse(result.stdout);
      verifyImport(entry, imported, repository, revision);
      state.entries.push({ ...entry, rawSha256: sha256(result.stdout), reused: true });
      save();
      process.stdout.write(`${state.entries.length}/${state.target} ${entry.lessonId}\n`);
      if (state.entries.length < entries.length) await new Promise(resolve => setTimeout(resolve, 6500));
    }
    state.complete = true;
    state.scope = '100 existing HF files imported through the native Ainize CLI and bound to existing DART dataset IDs; no Hub publication, no training, no marketplace listing';
    save();
  } catch (error) {
    state.error = error.message;
    save();
    throw error;
  }
}

if (require.main === module) main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
module.exports = { verifyImport };
