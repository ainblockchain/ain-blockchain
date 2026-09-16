const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
process.env.CHAIN_PORT_BASE = '18081';
process.env.CHAIN_EVENT_URLS = JSON.stringify(['ws://localhost:15100', 'ws://localhost:15101']);
const { NODES, chainSnapshot, httpJson, sleep } = require('../harness/common');

async function main() {
  const runId = process.env.RUN_ID || `docker_chain_${Date.now()}`;
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('invalid RUN_ID');
  const output = path.join(root, 'evidence', `${runId}.json`);
  if (fs.existsSync(output)) throw new Error(`evidence exists: ${output}`);
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'resource-spec.json')));
  const info = JSON.parse(execFileSync('docker', ['info', '--format', '{{json .}}'], { encoding: 'utf8' }));
  const ids = execFileSync('docker', ['ps', '-aq', '--filter', 'label=com.docker.compose.project=ain-cert-docker'], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
  if (!ids.length) throw new Error('Docker chain containers are missing');
  const inspected = JSON.parse(execFileSync('docker', ['inspect', ...ids], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
  const containers = inspected.map(container => ({
    id: container.Id, name: container.Name, imageId: container.Image,
    service: container.Config.Labels['com.docker.compose.service'],
    state: container.State.Status, health: container.State.Health?.Status ?? null,
    pid: container.State.Pid, oomKilled: container.State.OOMKilled,
    cpuQuota: container.HostConfig.CpuQuota, cpuPeriod: container.HostConfig.CpuPeriod,
    cpuSet: container.HostConfig.CpusetCpus, memoryLimitBytes: container.HostConfig.Memory,
    memorySwapLimitBytes: container.HostConfig.MemorySwap,
    gpuDevices: container.HostConfig.DeviceRequests,
  }));
  const nodes = containers.filter(container => /^node\d+$/.test(container.service));
  const before = await chainSnapshot();
  await sleep(5000);
  const after = await chainSnapshot();
  const heights = after.nodes.map(node => node.lastBlockNumber).filter(Number.isInteger);
  const checkpoint = heights.length === 10 ? Math.max(0, Math.min(...heights) - 5) : null;
  const blocks = await Promise.all(NODES.map(async url => {
    try {
      if (checkpoint === null) throw new Error('missing node heights');
      const block = (await httpJson(`${url}/get_block_by_number?number=${checkpoint}`)).result;
      return { url, number: block?.number, hash: block?.hash };
    } catch (error) { return { url, error: error.message }; }
  }));
  const checks = {
    tenRunningHealthy: nodes.length === 10 && nodes.every(node => node.state === 'running' && node.health === 'healthy' && !node.oomKilled),
    cpuQuotaMatchesSpec: nodes.length === 10 && nodes.every(node => node.cpuPeriod > 0 && node.cpuQuota / node.cpuPeriod === spec.blockchain.vcpusPerNode),
    memoryLimitMatchesSpec: nodes.length === 10 && nodes.every(node => node.memoryLimitBytes === spec.blockchain.memoryGiBPerNode * 2 ** 30 && node.memorySwapLimitBytes === node.memoryLimitBytes),
    explicitCpuAffinity: nodes.every(node => node.cpuSet === '0-7'),
    tenLiveValidators: after.servingNodes === 10 && after.distinctValidatorAddrs === 10 && after.blockValidators === 10,
    chainAdvancing: after.lastBlockNumber > before.lastBlockNumber,
    checkpointAgreement: Number.isInteger(checkpoint) && blocks.every(block => block.number === checkpoint && block.hash) && new Set(blocks.map(block => block.hash)).size === 1,
  };
  const report = { runId, measuredAt: new Date().toISOString(), scope: 'Docker blockchain resources and live agreement; GPU nodes and KPI performance are verified separately',
    host: { cpus: info.NCPU, memoryBytes: info.MemTotal }, spec, containers, checks,
    allocation: { cpuCeilingToHostRatio: spec.blockchain.nodes * spec.blockchain.vcpusPerNode / info.NCPU,
      memoryCeilingToHostRatio: spec.blockchain.nodes * spec.blockchain.memoryGiBPerNode * 2 ** 30 / info.MemTotal,
      dedicatedHardwareEquivalent: false, lowerPerformanceAllowedByUser: true },
    before, after, checkpoint, blocks, pass: Object.values(checks).every(Boolean) };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, checks, pass: report.pass }, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
