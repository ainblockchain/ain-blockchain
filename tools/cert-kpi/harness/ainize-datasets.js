const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execute = promisify(execFile);
const runId = process.env.RUN_ID;
if (!runId || !/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('valid RUN_ID required');
const root = process.env.KPI_DIR || require('path').resolve(__dirname, '..');
const output = path.join(root, 'evidence', runId);
const limit = Number(process.env.DATASET_LIMIT || 100);
if (!Number.isInteger(limit) || limit < 1 || limit > 108) throw new Error('DATASET_LIMIT must be 1..108');
const manifest = JSON.parse(fs.readFileSync('/datasets/manifest.json', 'utf8')).filter(lesson => lesson.facts.length > 0).slice(0, limit);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const report = { runId, scope: 'Ainize teach dataset upload, authenticated lookup and canonical download; no training or inference claimed',
  target: limit, startedAt: new Date().toISOString(), clientCgroup: {}, datasets: [], completed: false, pass: false };
for (const name of ['cpu.max', 'cpuset.cpus.effective', 'memory.max', 'memory.swap.max']) {
  report.clientCgroup[name] = fs.readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim();
}
if (report.clientCgroup['cpu.max'].startsWith('max ') || report.clientCgroup['memory.max'] === 'max') throw new Error('limited Docker CPU and memory required');

function save() {
  fs.writeFileSync(path.join(output, 'progress.json.tmp'), JSON.stringify(report, null, 2) + '\n');
  fs.renameSync(path.join(output, 'progress.json.tmp'), path.join(output, 'progress.json'));
}

async function cli(args, name) {
  const result = await execute(process.execPath, ['/opt/ainize/ainize-cli/dist/bin.js', ...args, '--json'],
    { timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
  fs.writeFileSync(path.join(output, `${name}.json`), result.stdout, { flag: 'wx' });
  return JSON.parse(result.stdout);
}

async function main() {
  if (fs.existsSync(path.join(output, 'progress.json'))) throw new Error('progress already exists; use a new RUN_ID');
  save();
  for (const lesson of manifest) {
    if (!/^[A-Za-z0-9_-]+$/.test(lesson.id)) throw new Error('invalid lesson ID');
    const record = { lessonId: lesson.id, ok: false, error: null };
    try {
      const source = fs.readFileSync(path.join('/datasets', path.basename(lesson.file)));
      record.sourceSha256 = hash(source);
      const uploaded = await cli(['teach', 'dataset', `/datasets/${path.basename(lesson.file)}`, '--name', lesson.id, '--retention', 'keep'], `${lesson.id}-upload`);
      record.datasetId = uploaded.dataset?.id;
      if (!record.datasetId) throw new Error('upload returned no dataset ID');
      const downloadedFile = path.join(output, `${lesson.id}-canonical.jsonl`);
      const queried = await cli(['teach', 'dataset', 'get', record.datasetId, '-o', downloadedFile], `${lesson.id}-get`);
      const canonical = fs.readFileSync(downloadedFile);
      const actual = canonical.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
      const expected = source.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
      record.canonicalSha256 = hash(canonical);
      record.rows = actual.length;
      record.checks = {
        uploadedSourceHash: uploaded.sha256 === record.sourceSha256,
        sameDataset: queried.dataset?.id === record.datasetId && queried.dataset?.sha256 === uploaded.dataset.sha256,
        verifiedDownload: queried.saved?.verified === true && record.canonicalSha256 === queried.dataset?.sha256,
        allRowsAccepted: uploaded.dataset.invalid_rows === 0 && actual.length === lesson.facts.length && uploaded.dataset.rows === actual.length,
        factsPreserved: actual.length === expected.length && actual.every((row, index) => row.prompt === expected[index].prompt && row.answer === expected[index].answer),
      };
      record.ok = Object.values(record.checks).every(Boolean);
    } catch (error) { record.error = error.message; }
    report.datasets.push(record);
    save();
    console.log(JSON.stringify({ finished: report.datasets.length, target: limit, lesson: lesson.id, ok: record.ok, error: record.error }));
    if (!record.ok) throw new Error(`dataset verification failed: ${lesson.id}`);
    if (report.datasets.length < manifest.length) await wait(6500);
  }
  report.completed = true;
  report.finishedAt = new Date().toISOString();
  report.pass = report.datasets.length === limit && report.datasets.every(dataset => dataset.ok)
    && new Set(report.datasets.map(dataset => dataset.datasetId)).size === limit
    && new Set(report.datasets.map(dataset => dataset.canonicalSha256)).size === limit;
  save();
  process.exitCode = report.pass ? 0 : 1;
}

main().catch(error => { report.error = error.message; save(); console.error(error.message); process.exitCode = 1; });
