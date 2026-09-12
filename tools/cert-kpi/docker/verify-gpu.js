const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execute = promisify(execFile);
const root = path.resolve(__dirname, '..');

async function command(binary, args) {
  return (await execute(binary, args, { timeout: 30000, maxBuffer: 8 * 1024 * 1024 })).stdout;
}

async function main() {
  const runId = process.env.RUN_ID || `gpu_environment_${Date.now()}`;
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('invalid RUN_ID');
  const output = path.join(root, 'evidence', `${runId}.json`);
  if (fs.existsSync(output)) throw new Error('evidence exists; use a new RUN_ID');
  const ids = (await command('docker', ['ps', '-aq', '--filter', 'label=com.docker.compose.project=ain-cert-gpu'])).trim().split(/\s+/).filter(Boolean);
  if (!ids.length) throw new Error('no GPU containers found');
  const inspected = JSON.parse(await command('docker', ['inspect', ...ids]));
  const containers = await Promise.all(inspected.map(async container => {
    const service = container.Config.Labels['com.docker.compose.service'];
    const index = Number(service.replace('gpu', ''));
    const record = { id: container.Id, imageId: container.Image, service,
      state: container.State.Status, health: container.State.Health?.Status ?? null,
      cpuSet: container.HostConfig.CpusetCpus, nanoCpus: container.HostConfig.NanoCpus,
      memoryLimitBytes: container.HostConfig.Memory, memorySwapLimitBytes: container.HostConfig.MemorySwap,
      requestedDevices: container.HostConfig.DeviceRequests, devices: [], cgroup: null, inference: null, error: null };
    try {
      if (container.State.Status !== 'running' || container.State.Health?.Status !== 'healthy') throw new Error('server not healthy yet');
      const gpu = await command('docker', ['exec', container.Id, 'nvidia-smi', '--query-gpu=uuid,name,memory.total,memory.used', '--format=csv,noheader,nounits']);
      record.devices = gpu.trim().split('\n').map(line => {
        const [uuid, name, memoryMiB, usedMiB] = line.split(',').map(value => value.trim());
        return { uuid, name, memoryMiB: Number(memoryMiB), usedMiB: Number(usedMiB) };
      });
      const sample = "import json,pathlib; print(json.dumps({name:pathlib.Path('/sys/fs/cgroup',name).read_text().strip() for name in ['cpu.max','cpuset.cpus.effective','memory.max','memory.swap.max']}))";
      record.cgroup = JSON.parse(await command('docker', ['exec', container.Id, 'python3', '-c', sample]));
      const endpoint = `http://localhost:${18001 + index}`;
      record.models = await (await fetch(`${endpoint}/v1/models`, { signal: AbortSignal.timeout(5000) })).json();
      const request = { model: 'gpt-oss-20b', prompt: 'Q: 2+2=? Reply with only the number.\nAnswer:', max_tokens: 128, temperature: 0 };
      const startedAt = Date.now();
      const response = await fetch(`${endpoint}/v1/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(120000),
      });
      const result = await response.json();
      record.inference = { endpoint, request, httpStatus: response.status, response: result, elapsedMs: Date.now() - startedAt,
        ok: response.ok && !result.error && result.usage?.completion_tokens > 0 && !!result.choices?.[0]?.text?.trim() };
    } catch (error) { record.error = error.message; }
    return record;
  }));
  const uuids = containers.flatMap(container => container.devices.map(device => device.uuid));
  const checks = {
    fiveHealthy: containers.length === 5 && containers.every(container => container.state === 'running' && container.health === 'healthy'),
    fiveDistinctGpuDevices: containers.every(container => container.devices.length === 1) && new Set(uuids).size === 5,
    minimum48GiBPerNode: containers.every(container => container.devices.length === 1 && container.devices[0].memoryMiB >= 48 * 1024),
    cpuAndMemoryControlled: containers.every(container => container.nanoCpus === 2e9 && container.cpuSet === '0-7' && container.memoryLimitBytes === 128 * 2 ** 30 && container.memorySwapLimitBytes === container.memoryLimitBytes),
    cgroupLimitsApplied: containers.every(container => container.cgroup?.['cpu.max'] === '200000 100000' && container.cgroup?.['memory.max'] === String(128 * 2 ** 30) && container.cgroup?.['memory.swap.max'] === '0'),
    allFiveExecuteInference: containers.every(container => container.inference?.ok && container.error === null),
    sameImage: new Set(containers.map(container => container.imageId)).size === 1,
  };
  const report = { runId, measuredAt: new Date().toISOString(), scope: 'five GPU container resources and real inference readiness; not M4 throughput or M5/M6 support count',
    countingRule: 'one container with one distinct A100 80GB GPU per offchain node; A100 substitutes L40S by the permitted GPU-memory criterion',
    checks, containers, pass: Object.values(checks).every(Boolean) };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, checks, pass: report.pass }, null, 2));
  process.exitCode = report.pass ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
