const KPI_DIR = process.env.KPI_DIR || require('path').resolve(__dirname, '..');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execute = promisify(execFile);
const runId = process.env.RUN_ID;
if (!runId || !/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('valid RUN_ID required');
const output = `${KPI_DIR}/evidence/${runId}`;
const datasetId = process.env.AINIZE_DATASET_ID;
if (!datasetId || !/^[A-Za-z0-9_-]+$/.test(datasetId)) throw new Error('AINIZE_DATASET_ID required');
const state = { runId, datasetId, startedAt: new Date().toISOString(), probes: [], submitted: false, jobId: null };
const save = () => {
  fs.writeFileSync(path.join(output, 'state.tmp'), JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(path.join(output, 'state.tmp'), path.join(output, 'state.json'));
};

async function cli(args, filename) {
  try {
    const result = await execute(process.execPath, ['/opt/ainize/ainize-cli/dist/bin.js', ...args, '--json'],
      { timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
    fs.writeFileSync(path.join(output, filename), result.stdout, { flag: 'wx' });
    return JSON.parse(result.stdout);
  } catch (error) {
    fs.writeFileSync(path.join(output, `${filename}.error`), JSON.stringify({ message: error.message, stdout: error.stdout, stderr: error.stderr }), { flag: 'wx' });
    throw error;
  }
}

async function main() {
  if (fs.existsSync(path.join(output, 'state.json'))) throw new Error('existing observation; inspect its job instead of resubmitting');
  const deadline = Date.now() + 15 * 60 * 1000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    try {
      const response = await fetch('http://localhost:3410/readyz', { signal: AbortSignal.timeout(20000) });
      const body = await response.json();
      ready = response.ok && body.ok === true && body.checks?.runtime?.available === true;
      state.probes.push({ at: new Date().toISOString(), httpStatus: response.status, ready, body });
    } catch (error) { state.probes.push({ at: new Date().toISOString(), ready: false, error: error.message }); }
    save();
    if (!ready) await new Promise(resolve => setTimeout(resolve, 10000));
  }
  if (!ready) throw new Error('runtime readiness observation expired; no lesson submitted');
  const jobs = await cli(['teach', 'jobs'], 'jobs-before.json');
  const items = jobs.items || jobs.jobs || (Array.isArray(jobs) ? jobs : []);
  const existing = items.find(job => job.name === runId);
  if (existing) {
    state.jobId = existing.id;
    state.adopted = true;
    state.job = existing;
  } else {
    state.submissionStartedAt = new Date().toISOString();
    save();
    const result = await cli(['teach', 'train', datasetId, '--name', runId, '--effort', 'balanced'], 'submitted.json');
    state.job = result.job;
    state.jobId = result.job?.id;
    state.submitted = true;
    if (!state.jobId) throw new Error('submission response has no job ID; inspect teach jobs before any retry');
  }
  save();
  console.log(JSON.stringify({ jobId: state.jobId, status: state.job.status, scope: 'submission only; inspect terminal checks, publish and inference separately' }));
}

main().catch(error => { state.error = error.message; save(); console.error(error.message); process.exitCode = 1; });
