const assert = require('assert/strict');
const { dockerSnapshot, validateDockerChain } = require('../docker-snapshot');

async function main() {
  const fixtures = Array.from({ length: 10 }, (_, index) => ({
    Id: `container-${index}`, Image: 'sha256:test', Name: `node${index}`,
    Config: { Env: [`PORT=${18081 + index}`, 'BLOCKCHAIN_CONFIGS_DIR=cert', 'SECRET=must-not-appear'],
      Labels: { 'com.docker.compose.service': `node${index}` } },
    State: { Status: 'running', Health: { Status: 'healthy' }, OOMKilled: false },
    HostConfig: { CpuQuota: 3200000, CpuPeriod: 100000, CpusetCpus: '0-7', Memory: 128 * 2 ** 30, NetworkMode: 'host' },
  }));
  const snapshot = await dockerSnapshot('fixture', async route => {
    if (route === '/info') return { NCPU: 8, MemTotal: 755 * 2 ** 30 };
    if (route.startsWith('/containers/json')) return fixtures.map(container => ({ Id: container.Id }));
    return fixtures.find(container => route === `/containers/${container.Id}/json`);
  });
  const urls = fixtures.map((container, index) => `http://localhost:${18081 + index}`);
  assert.equal(validateDockerChain(snapshot, urls).ok, true);
  assert.equal(JSON.stringify(snapshot).includes('must-not-appear'), false);
  assert.equal(validateDockerChain(snapshot, urls.map(url => url.replace('180', '80'))).ok, false);
  assert.equal(validateDockerChain(snapshot, urls.map(url => url.replace('localhost', 'other-host'))).ok, false);
  snapshot.containers[3].status = 'exited';
  assert.equal(validateDockerChain(snapshot, urls).ok, false);
  snapshot.containers.pop();
  assert.equal(validateDockerChain(snapshot, urls).ok, false);
  await assert.rejects(dockerSnapshot('fixture', async () => { throw new Error('offline'); }), /offline/);
  console.log('docker-snapshot: endpoint binding, liveness, resource limits and secret filtering ok');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
