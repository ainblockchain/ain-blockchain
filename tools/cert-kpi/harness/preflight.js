const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { NODES, KPI_DIR, NET_MANIFEST, httpJson, sleep } = require('./common');

async function inspectNode(url) {
  const result = { url, state: null, address: null, genesis: null, height: null, error: null };
  try {
    const [status, genesis, block] = await Promise.all([
      httpJson(`${url}/node_status`),
      httpJson(`${url}/get_block_by_number?number=0`),
      httpJson(`${url}/last_block`),
    ]);
    result.state = status.result?.state ?? null;
    result.address = status.result?.address ?? null;
    result.genesis = genesis.result?.hash ?? null;
    result.height = block.result?.number ?? null;
  } catch (error) { result.error = error.message; }
  return result;
}

async function main() {
  const runId = process.env.RUN_ID || `preflight_${Date.now()}`;
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('invalid RUN_ID');
  const output = path.join(KPI_DIR, 'evidence', `${runId}.json`);
  if (fs.existsSync(output)) throw new Error(`evidence already exists: ${output}`);
  const before = await Promise.all(NODES.map(inspectNode));
  await sleep(5000);
  const after = await Promise.all(NODES.map(inspectNode));
  const heights = before.map(node => node.height).filter(Number.isInteger);
  const checkpoint = heights.length ? Math.max(0, Math.min(...heights) - 5) : null;
  const blocks = await Promise.all(NODES.map(async url => {
    try {
      if (checkpoint === null) throw new Error('no checkpoint');
      const response = await httpJson(`${url}/get_block_by_number?number=${checkpoint}`);
      return { url, number: response.result?.number ?? null, hash: response.result?.hash ?? null };
    } catch (error) { return { url, number: null, hash: null, error: error.message }; }
  }));
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(NET_MANIFEST, 'utf8')); } catch {}
  const processes = (manifest?.pids || []).map(pid => {
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      return { pid, cwd: fs.readlinkSync(`/proc/${pid}/cwd`),
        state: status.match(/^State:\s*(.*)$/m)?.[1] ?? null,
        cpus: status.match(/^Cpus_allowed_list:\s*(.*)$/m)?.[1] ?? null,
        rss: status.match(/^VmRSS:\s*(.*)$/m)?.[1] ?? null };
    } catch { return { pid, missing: true }; }
  });
  const checks = {
    tenServing: after.every(node => node.state === 'SERVING'),
    tenDistinctIdentities: after.every(node => node.address) && new Set(after.map(node => node.address)).size === 10,
    sameGenesis: after.every(node => node.genesis) && new Set(after.map(node => node.genesis)).size === 1,
    allAdvancing: after.every((node, index) => Number.isInteger(node.height) && Number.isInteger(before[index].height) && node.height > before[index].height),
    checkpointAgreement: blocks.every(block => block.hash && block.number === checkpoint) && new Set(blocks.map(block => block.hash)).size === 1,
    manifestGenesisMatches: !!manifest?.genesisHash && after.every(node => node.genesis === manifest.genesisHash),
    manifestProcessesAlive: processes.length === 11 && processes.every(process => !process.missing && !process.state?.startsWith('Z')),
  };
  const codeHashes = {};
  for (const name of fs.readdirSync(__dirname).filter(name => /\.(js|py|sh)$/.test(name))) {
    codeHashes[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex');
  }
  const report = { runId, measuredAt: new Date().toISOString(), scope: 'live ten-node chain readiness; not full KPI or GPU environment certification',
    host: { hostname: os.hostname(), availableParallelism: os.availableParallelism(), memoryBytes: os.totalmem() },
    checks, pass: Object.values(checks).every(Boolean), before, after, checkpoint, blocks, processes, codeHashes };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, checks, pass: report.pass }, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
