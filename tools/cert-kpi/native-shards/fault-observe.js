const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { get, value, snapshot, verifyNetwork } = require('./verify-network');

function progressByChain(manifest, samples) {
  return manifest.chains.map(chain => {
    const endpoint = chain.nodes[0].endpoint;
    const numbers = samples.map(sample => sample.nodes.find(node => node.endpoint === endpoint)?.number);
    return { chain: chain.name, first: numbers[0], last: numbers.at(-1), advancing: Number.isInteger(numbers[0]) && Number.isInteger(numbers.at(-1)) && numbers.at(-1) > numbers[0] };
  });
}

async function observe(manifestPath, directory, phase, probeLabel) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const target = manifest.chains[1].nodes.at(-1);
  const output = path.join(directory, `${phase}.json`);
  const log = path.join(directory, `${phase}.jsonl`);
  if (fs.existsSync(output) || fs.existsSync(log)) throw new Error('fault observation already exists');
  if (phase === 'stopped') {
    const nodes = manifest.chains.flatMap(chain => chain.nodes).filter(node => node.service !== target.service);
    const samples = [];
    for (let index = 0; index < 7; index++) {
      const sample = { at: new Date().toISOString(), nodes: await snapshot(nodes) };
      samples.push(sample);
      fs.appendFileSync(log, JSON.stringify(sample) + '\n');
      if (index < 6) await new Promise(resolve => setTimeout(resolve, 5000));
    }
    const progress = progressByChain(manifest, samples);
    const pass = [progress[0], progress[2]].every(chain => chain.advancing);
    const report = { target: target.service, phase, samples, progress, scope: 'one stopped child validator; parent and the other shard must advance, affected-shard liveness is measured rather than assumed', pass };
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output, progress, pass }));
    if (!pass) process.exitCode = 1;
    return;
  }
  if (phase !== 'recovered') throw new Error('invalid phase');
  const label = path.basename(directory);
  await verifyNetwork(manifestPath, 'all', `${label}-recovered`);
  const verification = JSON.parse(fs.readFileSync(path.join(path.dirname(manifestPath), `verify-${label}-recovered.json`)));
  assert.equal(verification.pass, true);
  const probe = JSON.parse(fs.readFileSync(path.join(path.dirname(manifestPath), `probe-${probeLabel}.json`)));
  assert.equal(probe.pass, true);
  const preserved = [];
  for (const record of probe.results) {
    const chain = manifest.chains.find(candidate => candidate.name === record.chain);
    const independent = chain.nodes.at(-1).endpoint;
    const payload = await value(independent, record.reference);
    const block = await get(independent, `/get_block_by_number?number=${record.block.number}`);
    const proof = await value(manifest.chains[0].nodes.at(-1).endpoint, record.parentReference);
    assert.deepEqual(payload, record.payload);
    assert.equal(block.hash, record.block.hash);
    assert.equal(proof, block.state_proof_hash);
    preserved.push({ chain: chain.name, payload, block, parentProof: proof });
  }
  const report = { completedAt: new Date().toISOString(), target: target.service, phase, preserved, pass: true, scope: 'same-container restart, chain catch-up and pre-fault control-state preservation; not training-job or arbitrary network-fault coverage' };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output, pass: true }));
}

if (require.main === module) observe(...process.argv.slice(2)).catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { progressByChain, observe };
