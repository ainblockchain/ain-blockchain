const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 16 * 1024 ** 2 });
const inspect = name => JSON.parse(docker('inspect', name))[0];
const save = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const brief = container => ({ id: container.Id, image: container.Image, state: container.State, mounts: container.Mounts });
const retainedMounts = container => container.Mounts.map(mount => [mount.Type, mount.Name, mount.Source, mount.Destination, mount.RW]).sort((left, right) => left[3].localeCompare(right[3]));

async function request(endpoint, route) {
  const response = await fetch(endpoint + route, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.code, 0);
  return body.result;
}

function validateTarget(manifest, compose, service, current, image, testedImage, audit, exitCode) {
  const chain = manifest.chains.find(entry => entry.nodes.some(node => node.service === service));
  assert.ok(chain, 'target is not a manifest validator');
  assert.match(image, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(current.Image, image, 'target already runs the selected image');
  assert.equal(testedImage.trim(), image, 'test image differs');
  assert.equal(audit.pass, true, 'runtime source audit failed');
  assert.equal(exitCode.trim(), '0', 'image regression tests failed');
  assert.equal(current.Config.Labels['com.docker.compose.project'], compose.name);
  assert.equal(current.Config.Labels['com.docker.compose.service'], service);
  assert.equal(current.Config.Labels['org.ain.cert.run'], manifest.runId);
  assert.ok(current.Config.Env.includes('ENABLE_TX_SIG_VERIF_WORKAROUND=false'));
  assert.equal(current.HostConfig.CpuQuota, 3200000);
  assert.equal(current.HostConfig.CpusetCpus, '0-7');
  assert.equal(current.HostConfig.Memory, 128 * 1024 ** 3);
  assert.equal(current.HostConfig.MemorySwap, 128 * 1024 ** 3);
  assert.ok(current.State.Running || current.State.Status === 'exited' && current.State.ExitCode >= 128,
      'only a running known instance or a confirmed crashed validator can be refreshed');
  const volumes = current.Mounts.filter(mount => mount.Destination === '/data');
  assert.equal(volumes.length, 1);
  assert.equal(volumes[0].Type, 'volume');
  assert.equal(volumes[0].Name, `${compose.name}_data-${service}`);
  return chain;
}

async function main(manifestFile, service, image, tests, output, backup) {
  assert.ok(backup, 'manifest service immutable-image tests NEW-output NEW-private-backup required');
  const directory = path.dirname(path.resolve(manifestFile));
  const manifest = JSON.parse(fs.readFileSync(manifestFile));
  const originalFile = path.join(directory, 'compose.json');
  const compose = JSON.parse(fs.readFileSync(originalFile));
  const name = `${compose.name}-${service}-1`;
  const current = inspect(name);
  const chain = validateTarget(manifest, compose, service, current, image,
      fs.readFileSync(path.join(tests, 'image-id.txt'), 'utf8'),
      JSON.parse(fs.readFileSync(path.join(tests, 'runtime-source.json'))),
      fs.readFileSync(path.join(tests, 'exit-code.txt'), 'utf8'));
  fs.mkdirSync(output, { mode: 0o700 });
  fs.mkdirSync(backup, { mode: 0o700 });
  const protectedNames = ['flashnext', 'flashtrain', 'ain-cert-ainize-node-1',
    ...chain.nodes.filter(node => node.service !== service).map(node => `${compose.name}-${node.service}-1`)];
  const protectedBefore = protectedNames.map(name => ({ name, ...brief(inspect(name)) }));
  const assertProtected = () => {
    for (const previous of protectedBefore) {
      const actual = inspect(previous.name);
      assert.equal(actual.Id, previous.id, `protected container replaced: ${previous.name}`);
      assert.equal(actual.State.Pid, previous.state.Pid, `protected process changed: ${previous.name}`);
      assert.equal(actual.State.StartedAt, previous.state.StartedAt);
      assert.equal(actual.State.Running, true, `protected process stopped: ${previous.name}`);
    }
  };
  assertProtected();
  const witnesses = await Promise.all(chain.nodes.filter(node => node.service !== service).map(async node => {
    const [status, block] = await Promise.all([request(node.endpoint, '/node_status'), request(node.endpoint, '/last_block')]);
    assert.equal(status.state, 'SERVING');
    assert.equal(status.address, node.validator);
    return { ...node, height: block.number, health: status.health };
  }));
  assert.ok(witnesses.length >= 2, 'two live same-chain witnesses required');
  witnesses.sort((left, right) => right.height - left.height);
  const bridges = witnesses.slice(0, 2);
  const checkpoint = Math.min(...bridges.map(node => node.height)) - 2;
  assert.ok(Number.isSafeInteger(checkpoint) && checkpoint > 1);
  const checkpoints = await Promise.all(bridges.map(node => request(node.endpoint, `/get_block_by_number?number=${checkpoint}`)));
  assert.ok(checkpoints.every(block => block.number === checkpoint && block.hash === checkpoints[0].hash), 'live bridges disagree on final checkpoint');
  const genesis = await Promise.all(bridges.map(node => request(node.endpoint, '/get_block_by_number?number=0')));
  assert.equal(genesis[0].hash, genesis[1].hash);
  save(path.join(output, 'before.json'), { at: new Date().toISOString(), service, chain: chain.name,
    current: brief(current), protected: protectedBefore, bridges, checkpoints, genesisHash: genesis[0].hash,
    reason: 'Deploy tested snapshot, bounded consensus gossip and verified sync fixes to the retained native-shard ledger; not a timeout-triggered reset' });
  fs.writeFileSync(path.join(output, 'terminal-or-before.log'), docker('logs', '--tail', '40', name));
  save(path.join(backup, 'original-inspect.json'), current);
  const override = path.join(path.resolve(output), 'override.json');
  save(override, { services: { [service]: { image, healthcheck: { test: ['CMD', 'node', '-e',
    "fetch('http://127.0.0.1:8081/node_status').then(response=>response.json()).then(body=>process.exit(body.result?.state==='SERVING' && body.result?.health===true?0:1)).catch(()=>process.exit(1))"] } } } });
  const composeArgs = ['compose', '-f', originalFile, '-f', override];
  docker(...composeArgs, 'config', '-q');
  assert.equal(inspect(name).Id, current.Id);
  assertProtected();
  if (current.State.Running) docker('stop', '--time', '60', name);
  const stopped = inspect(name);
  assert.equal(stopped.Id, current.Id);
  assert.equal(stopped.State.Running, false);
  save(path.join(output, 'stopped.json'), brief(stopped));
  const archive = path.join(path.resolve(backup), 'volume.tar');
  const descriptor = fs.openSync(archive, 'wx', 0o600);
  try {
    execFileSync('docker', ['run', '--rm', '--network', 'none', '--cpus', '1', '--cpuset-cpus', '0-7',
      '--memory', '1g', '--memory-swap', '1g', '--read-only', '--mount',
      `type=volume,src=${compose.name}_data-${service},dst=/original,readonly`,
      '--entrypoint', 'tar', image, '-C', '/original', '-cf', '-', '.'], { stdio: ['ignore', descriptor, 'pipe'] });
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
  execFileSync('tar', ['-tf', archive], { stdio: 'ignore' });
  save(path.join(output, 'backup.json'), { bytes: fs.statSync(archive).size, sha256: hash.digest('hex'), privateBackup: true });
  assertProtected();
  const started = docker(...composeArgs, 'up', '-d', '--no-deps', service);
  fs.writeFileSync(path.join(output, 'start.log'), started);
  const replacement = inspect(name);
  assert.equal(replacement.Image, image);
  assert.deepEqual(retainedMounts(replacement), retainedMounts(current));
  save(path.join(output, 'replacement.json'), brief(replacement));
  const target = chain.nodes.find(node => node.service === service);
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const instance = inspect(name);
    assert.equal(instance.Id, replacement.Id);
    assert.equal(instance.State.Running, true, 'replacement exited; preserve logs and inspect this instance');
    assertProtected();
    let sample;
    try {
      const [status, block] = await Promise.all([request(target.endpoint, '/node_status'), request(target.endpoint, '/last_block')]);
      sample = { at: new Date().toISOString(), state: status.state, health: status.health, address: status.address,
        height: block?.number, versions: status.stateVersionStatus?.numVersions };
      if (status.state === 'SERVING' && status.health && status.address === target.validator && block?.number > checkpoint) {
        const retained = await request(target.endpoint, `/get_block_by_number?number=${checkpoint}`);
        assert.equal(retained.hash, checkpoints[0].hash);
        const actualGenesis = await request(target.endpoint, '/get_block_by_number?number=0');
        assert.equal(actualGenesis.hash, genesis[0].hash);
        const proof = JSON.parse(fs.readFileSync(path.join(directory, 'probe-control.json')));
        for (const control of proof.results.filter(result => result.chain === chain.name)) {
          assert.deepEqual(await request(target.endpoint, `/get_value?ref=${encodeURIComponent(control.reference)}&is_final=true`), control.payload);
        }
        save(path.join(output, 'result.json'), { pass: true, sample, retainedCheckpoint: checkpoint,
          retainedHash: retained.hash, genesisHash: actualGenesis.hash, protectedUnchanged: true,
          scope: 'single-node native-shard source refresh and final checkpoint/control preservation; not full network or M1 certification' });
        console.log(JSON.stringify({ output, ...sample, preserved: true }));
        return;
      }
    } catch (error) { sample = { at: new Date().toISOString(), error: error.message }; }
    fs.appendFileSync(path.join(output, 'observations.jsonl'), JSON.stringify(sample) + '\n');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error('observation expired; inspect this same replacement and its peers, do not restart automatically');
}

if (require.main === module) main(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateTarget, retainedMounts };
