const fs = require('node:fs');
const path = require('node:path');

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function get(endpoint, route) {
  const response = await fetch(endpoint + route, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${endpoint}${route}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.code !== 0) throw new Error(`${endpoint}${route}: code ${body.code}`);
  return body.result;
}
const value = (endpoint, ref) => get(endpoint, `/get_value?ref=${encodeURIComponent(ref)}&is_final=true`);

async function snapshot(nodes) {
  return Promise.all(nodes.map(async node => {
    try {
      const [status, block] = await Promise.all([get(node.endpoint, '/node_status'), get(node.endpoint, '/last_block')]);
      return { service: node.service, endpoint: node.endpoint, address: status.address, state: status.state, number: block?.number ?? null, hash: block?.hash ?? null, validators: Object.keys(block?.validators ?? {}) };
    } catch (error) { return { service: node.service, endpoint: node.endpoint, error: error.message }; }
  }));
}

function nodesAdvanced(states, before, nodes) {
  return states.length === nodes.length && before.length === nodes.length && states.every((node, index) => node.state === 'SERVING' && node.address === nodes[index].validator && Number.isInteger(node.number) && node.number > before[index].number);
}

function chainsCaughtUp(chains, states) {
  return chains.every(chain => {
    const heights = chain.nodes.map(expected => states.find(node => node.service === expected.service)?.number);
    return heights.every(Number.isInteger) && Math.max(...heights) - Math.min(...heights) <= 2;
  });
}

async function waitFor(check, logPath, timeout = 240000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let sample;
    try { sample = await check(); } catch (error) { sample = { ready: false, error: error.message }; }
    fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), ...sample }) + '\n');
    if (sample.ready) return sample;
    await sleep(3000);
  }
  throw new Error('observation deadline expired; inspect the existing containers, do not infer that they stopped');
}

async function verifyNetwork(manifestPath, phase, label = phase) {
  if (!['parent', 'reporters', 'all'].includes(phase) || !/^[a-z0-9_-]+$/.test(label)) throw new Error('invalid observation phase or label');
  const directory = path.dirname(manifestPath);
  const reportPath = path.join(directory, `verify-${label}.json`);
  const logPath = path.join(directory, `verify-${label}.jsonl`);
  if (fs.existsSync(reportPath) || fs.existsSync(logPath)) throw new Error('observation evidence already exists; choose a new label');
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  const root = manifest.chains[0];
  const children = manifest.chains.slice(1);
  const startedAt = new Date().toISOString();
  try {
    if (phase === 'reporters') {
      const ready = await waitFor(async () => {
        const shards = await Promise.all(children.map(async chain => ({ chain: chain.name, state: await value(root.nodes[0].endpoint, `${chain.shardPath}/.shard`) })));
        return { shards, ready: shards.every(shard => shard.state?.sharding_enabled === true) };
      }, logPath);
      const report = { startedAt, finishedAt: new Date().toISOString(), phase, pass: true, ...ready };
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
      console.log(JSON.stringify(report)); return;
    }
    const chains = phase === 'parent' ? [root] : manifest.chains;
    const nodes = chains.flatMap(chain => chain.nodes);
    const first = await waitFor(async () => {
      const states = await snapshot(nodes);
      return { states, ready: states.every((state, index) => state.state === 'SERVING' && state.address === nodes[index].validator && state.number >= 3) };
    }, logPath);
    await sleep(6000);
    const progressed = await waitFor(async () => {
      const states = await snapshot(nodes);
      return { states, ready: nodesAdvanced(states, first.states, nodes) && chainsCaughtUp(chains, states) };
    }, logPath);
    const after = progressed.states;
    const chainReports = [];
    for (const chain of chains) {
      const states = after.filter(node => chain.nodes.some(expected => expected.service === node.service));
      const checkpoint = Math.min(...states.map(state => state.number)) - 2;
      if (!Number.isSafeInteger(checkpoint) || checkpoint < 1) throw new Error(`${chain.name} has no final checkpoint`);
      const blocks = await Promise.all(chain.nodes.map(node => get(node.endpoint, `/get_block_by_number?number=${checkpoint}`)));
      const genesis = await get(chain.nodes[0].endpoint, '/get_block_by_number?number=0');
      const sharding = await value(chain.nodes[0].endpoint, '/blockchain_params/sharding');
      chainReports.push({ name: chain.name, checkpoint, blocks, genesisHash: genesis.hash, sharding, agreement: blocks.every(block => block.number === checkpoint && block.hash === blocks[0].hash), validators: Object.keys(blocks[0].validators ?? {}) });
    }
    let proofs = [];
    if (phase === 'all') {
      const sampled = await waitFor(async () => {
        const reports = await Promise.all(children.map(async chain => {
          const prefix = `${chain.shardPath}/.shard`;
          const number = await value(root.nodes[0].endpoint, `${prefix}/latest_block_number`);
          if (!Number.isInteger(number) || number < 2) return { chain: chain.name, ready: false, number };
          const ref = `${prefix}/proof_hash_map/${number}/proof_hash`;
          const parentProofs = await Promise.all([root.nodes[0], root.nodes.at(-1)].map(node => value(node.endpoint, ref)));
          const childBlocks = await Promise.all([chain.nodes[0], chain.nodes.at(-1)].map(node => get(node.endpoint, `/get_block_by_number?number=${number}`)));
          return { chain: chain.name, number, ref, parentProofs, childBlocks, ready: parentProofs.every(proof => typeof proof === 'string' && childBlocks.every(block => block.number === number && block.state_proof_hash === proof && block.hash === childBlocks[0].hash)) };
        }));
        return { reports, ready: reports.every(report => report.ready) };
      }, logPath);
      proofs = sampled.reports;
    }
    const checks = {
      allServing: after.every(node => node.state === 'SERVING'),
      distinctValidators: new Set(after.map(node => node.address)).size === nodes.length,
      advancing: after.every((node, index) => node.number > first.states[index].number),
      tipHeightAgreement: chainsCaughtUp(chains, after),
      replicaAgreement: chainReports.every(chain => chain.agreement),
      expectedValidatorSets: chainReports.every((report, index) => report.validators.length === chains[index].nodes.length && report.validators.every(address => chains[index].nodes.some(node => node.validator === address))),
      distinctGenesis: new Set(chainReports.map(chain => chain.genesisHash)).size === chains.length,
      nativeProtocols: chainReports.every((report, index) => report.sharding.sharding_protocol === chains[index].protocol && (!chains[index].shardPath || report.sharding.sharding_path === chains[index].shardPath)),
      parentProofsMatch: phase !== 'all' || proofs.length === 2 && proofs.every(proof => proof.ready),
    };
    const report = { startedAt, finishedAt: new Date().toISOString(), phase, runId: manifest.runId, scope: 'Native chain topology and state-proof replication only; not 70 learning pipelines or large-data performance', before: first.states, after, chainReports, proofs, checks, pass: Object.values(checks).every(Boolean) };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ reportPath, checks, pass: report.pass }));
    if (!report.pass) process.exitCode = 1;
  } catch (error) {
    if (!fs.existsSync(reportPath)) fs.writeFileSync(reportPath, JSON.stringify({ startedAt, phase, pass: false, error: error.message }, null, 2) + '\n', { flag: 'wx' });
    throw error;
  }
}

if (require.main === module) verifyNetwork(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { get, value, snapshot, waitFor, verifyNetwork, nodesAdvanced, chainsCaughtUp };
