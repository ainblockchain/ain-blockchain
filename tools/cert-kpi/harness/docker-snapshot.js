const http = require('http');
const fs = require('fs');

function dockerJson(route, socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock') {
  return new Promise((resolve, reject) => {
    const request = http.get({ socketPath, path: route, timeout: 5000 }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) request.destroy(new Error('Docker response exceeds size limit'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) return reject(new Error(`Docker HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Docker API timed out')));
    request.on('error', reject);
  });
}

function summarizeContainer(container) {
  const settings = Object.fromEntries((container.Config.Env || []).map(entry => {
    const separator = entry.indexOf('=');
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
  return {
    id: container.Id, imageId: container.Image, name: container.Name,
    service: container.Config.Labels?.['com.docker.compose.service'] ?? null,
    role: container.Config.Labels?.['org.ain.cert.role'] ?? null,
    sourceRevision: container.Config.Labels?.['org.opencontainers.image.revision'] ?? null,
    status: container.State.Status, health: container.State.Health?.Status ?? null,
    startedAt: container.State.StartedAt, oomKilled: container.State.OOMKilled,
    cpuQuota: container.HostConfig.CpuQuota, cpuPeriod: container.HostConfig.CpuPeriod,
    nanoCpus: container.HostConfig.NanoCpus, cpuSet: container.HostConfig.CpusetCpus,
    memoryLimitBytes: container.HostConfig.Memory, memorySwapLimitBytes: container.HostConfig.MemorySwap,
    networkMode: container.HostConfig.NetworkMode,
    gpuDevices: container.HostConfig.DeviceRequests,
    chainConfig: settings.BLOCKCHAIN_CONFIGS_DIR ?? null,
    rpcPort: settings.PORT === undefined ? null : Number(settings.PORT),
  };
}

function validateDockerChain(snapshot, urls) {
  const nodes = snapshot.containers.filter(container => /^node[0-9]$/.test(container.service || ''));
  const expected = urls.map(url => Number(new URL(url).port));
  const errors = [];
  if (urls.some(url => !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))) errors.push('this Docker host-network profile requires local RPC endpoints');
  if (nodes.length !== 10) errors.push('expected ten Docker chain nodes');
  if (new Set(nodes.map(node => node.service)).size !== 10) errors.push('duplicate or missing node service identities');
  for (let index = 0; index < 10; index++) {
    const node = nodes.find(container => container.service === `node${index}`);
    if (!node) continue;
    if (node.rpcPort !== expected[index]) errors.push(`node${index} RPC port does not match harness endpoint`);
    if (node.networkMode !== 'host') errors.push(`node${index} is not using the declared host network`);
    if (node.status !== 'running' || node.health !== 'healthy' || node.oomKilled) errors.push(`node${index} is not healthy`);
    if (!(node.cpuQuota > 0 && node.cpuPeriod > 0 && node.cpuSet && node.memoryLimitBytes > 0)) errors.push(`node${index} has incomplete resource limits`);
  }
  return { ok: errors.length === 0, errors };
}

async function dockerSnapshot(project, request = dockerJson) {
  const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.project=${project}`] }));
  const [info, listed] = await Promise.all([request('/info'), request(`/containers/json?all=1&filters=${filters}`)]);
  const containers = await Promise.all(listed.map(async container => summarizeContainer(await request(`/containers/${container.Id}/json`))));
  const cgroup = {};
  for (const name of ['cpu.max', 'cpuset.cpus.effective', 'memory.max', 'memory.swap.max', 'cpu.stat']) {
    try { cgroup[name] = fs.readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim(); } catch { cgroup[name] = null; }
  }
  return { measuredAt: new Date().toISOString(), project, host: { cpus: info.NCPU, memoryBytes: info.MemTotal },
    containers, clientCgroup: cgroup, dedicatedHardwareEquivalent: false };
}

module.exports = { dockerSnapshot, summarizeContainer, validateDockerChain };
