const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

function planNetwork(accounts, runId, image, hostOutput) {
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(runId)) throw new Error('run ID must be a short lowercase identifier');
  if (!path.isAbsolute(hostOutput)) throw new Error('host output directory must be absolute');
  const groups = [
    { name: 'root', indexes: [0, 1, 2, 3], port: 18201, shardPath: null },
    { name: 'shard1', indexes: [4, 5, 6], port: 18301, shardPath: '/apps/year3_shard1' },
    { name: 'shard2', indexes: [7, 8, 9], port: 18401, shardPath: '/apps/year3_shard2' },
  ];
  const compose = { name: `ain-cert-shards-${runId.replaceAll('_', '-')}`, services: {}, volumes: {} };
  const chains = groups.map(group => {
    const tracker = `${group.name}-tracker`;
    compose.services[tracker] = {
      image, pull_policy: 'never', cpuset: '0-7', cpu_period: 100000, cpu_quota: 25000,
      mem_limit: '1g', memswap_limit: '1g', restart: 'no',
      environment: { PORT: '8080', CONSOLE_LOG: 'false' }, command: ['tracker-server/index.js'],
      labels: { 'org.ain.cert.run': runId, 'org.ain.cert.role': 'tracker' },
    };
    const nodes = group.indexes.map((accountIndex, nodeIndex) => {
      const service = `${group.name}${nodeIndex}`;
      const volume = `data-${service}`;
      compose.volumes[volume] = {};
      compose.services[service] = {
        image, pull_policy: 'never', cpuset: '0-7', cpu_period: 100000, cpu_quota: 3200000,
        mem_limit: '128g', memswap_limit: '128g', restart: 'no',
        ports: [`127.0.0.1:${group.port + nodeIndex}:8081`],
        environment: {
          BLOCKCHAIN_CONFIGS_DIR: `/network/configs/${group.name}`, BLOCKCHAIN_DATA_DIR: '/data',
          NODE_INDEX: String(nodeIndex), PORT: '8081', P2P_PORT: '5001', HOSTING_ENV: 'local', CONSOLE_LOG: 'false',
          TRACKER_UPDATE_JSON_RPC_URL: `http://${tracker}:8080/json-rpc`,
          PEER_CANDIDATE_JSON_RPC_URL: `http://${group.name}0:8081/json-rpc`,
          ENABLE_EXPRESS_RATE_LIMIT: 'false', ENABLE_DEV_CLIENT_SET_API: 'false',
          ENABLE_EARLY_TX_SIG_VERIF: 'true', ENABLE_TX_SIG_VERIF_WORKAROUND: 'false',
          ENABLE_GAS_FEE_WORKAROUND: 'true', ENABLE_REST_FUNCTION_CALL: 'false',
          MAX_NUM_INBOUND_CONNECTION: '8', TARGET_NUM_OUTBOUND_CONNECTION: String(group.indexes.length - 1),
          PEER_CANDIDATES_CONNECTION_INTERVAL_MS: '2000', TX_POOL_SIZE_LIMIT: '100000', TX_POOL_SIZE_LIMIT_PER_ACCOUNT: '20000',
        },
        command: ['--max-old-space-size=8192', '/network/scripts/node-client.js'],
        volumes: [`${hostOutput}:/network:ro`, `${volume}:/data`],
        labels: { 'org.ain.cert.run': runId, 'org.ain.cert.role': 'blockchain', 'org.ain.cert.chain': group.name, 'org.ain.cert.allocation': 'shared-host-oversubscribed-ceilings' },
        healthcheck: {
          test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:8081/node_status').then(response=>response.json()).then(body=>process.exit(body.result?.state==='SERVING'?0:1)).catch(()=>process.exit(1))"],
          interval: '10s', timeout: '5s', retries: 30, start_period: '60s',
        },
        logging: { driver: 'json-file', options: { 'max-size': '20m', 'max-file': '3' } },
      };
      return { service, endpoint: `http://127.0.0.1:${group.port + nodeIndex}`, validator: accounts.others[accountIndex].address, accountIndex };
    });
    return { ...group, nodes, protocol: group.shardPath ? 'POA' : 'NONE' };
  });
  return { compose, manifest: { runId, image, chains, totalValidators: 10, cpuCeilingPerNode: 32, memoryGiBPerNode: 128, sharedHost: true, physicalHardwareEquivalent: false, chainId: 0 } };
}

function createNetwork(output, runId, hostOutput, image) {
  const repository = process.cwd();
  const accounts = JSON.parse(fs.readFileSync(path.join(repository, 'blockchain-configs/base/genesis_accounts.json')));
  const template = JSON.parse(fs.readFileSync(path.join(repository, 'blockchain-configs/3-nodes/blockchain_params.json')));
  const { compose, manifest } = planNetwork(accounts, runId, image, hostOutput);
  const configs = path.join(output, 'configs');
  fs.mkdirSync(configs);
  fs.mkdirSync(path.join(output, 'scripts'));
  const hashes = {};
  for (const filename of ['create-network.js', 'node-client.js', 'resolve-seeds.js', 'verify-network.js', 'record-probe.js', 'run.sh', 'fault.sh', 'fault-observe.js', 'audit-image.js']) {
    const bytes = fs.readFileSync(path.join(__dirname, filename));
    fs.writeFileSync(path.join(output, 'scripts', filename), bytes, { flag: 'wx' });
    hashes[filename] = createHash('sha256').update(bytes).digest('hex');
  }
  fs.writeFileSync(path.join(output, 'source-sha256.json'), JSON.stringify(hashes, null, 2) + '\n', { flag: 'wx' });
  for (const chain of manifest.chains) {
    const directory = path.join(configs, chain.name);
    fs.mkdirSync(directory);
    const selected = chain.indexes.map(index => accounts.others[index]);
    const reordered = { ...accounts, others: [...selected, ...accounts.others.filter((account, index) => !chain.indexes.includes(index))] };
    const params = structuredClone(template);
    params._description = `${runId}: ${chain.name} native ${chain.protocol} chain; isolated consensus, test-only genesis accounts`;
    params.consensus.min_num_validators = 3;
    params.consensus.max_num_validators = selected.length;
    params.consensus.min_stake_for_proposer = 1000000;
    params.consensus.max_stake_for_proposer = 10000000;
    params.consensus.genesis_validator_whitelist = Object.fromEntries(selected.map(account => [account.address, true]));
    params.consensus.genesis_proposer_whitelist = { ...params.consensus.genesis_validator_whitelist };
    params.consensus.genesis_validators = Object.fromEntries(selected.map(account => [account.address, { stake: 1000000, proposal_right: true }]));
    params.genesis.num_genesis_accounts = 20;
    params.genesis.epoch_ms = 1000;
    params.genesis.chain_id = 0;
    params.resource.bandwidth_budget_per_block = 1000000;
    params.sharding = chain.shardPath ? {
      sharding_protocol: 'POA', sharding_path: chain.shardPath, shard_owner: accounts.owner.address,
      shard_reporter: selected[0].address, parent_chain_poc: 'http://root0:8081',
      reporting_period: 5, max_shard_report: 10000, num_shard_report_deleted: 100,
    } : { ...params.sharding, sharding_protocol: 'NONE' };
    fs.writeFileSync(path.join(directory, 'genesis_accounts.json'), JSON.stringify(reordered, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(directory, 'blockchain_params.json'), JSON.stringify(params, null, 2) + '\n', { flag: 'wx' });
    const log = execFileSync(process.execPath, ['tools/genesis-file/createGenesisBlock.js'], {
      cwd: repository, env: { ...process.env, BLOCKCHAIN_CONFIGS_DIR: directory }, encoding: 'utf8', maxBuffer: 16 * 1024 ** 2,
    });
    fs.writeFileSync(path.join(output, `genesis-${chain.name}.log`), log, { flag: 'wx' });
    const genesis = fs.readFileSync(path.join(directory, 'genesis_block.json.gz'));
    chain.genesisFileSha256 = createHash('sha256').update(genesis).digest('hex');
  }
  fs.writeFileSync(path.join(output, 'compose.json'), JSON.stringify(compose, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'network.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ runId, chains: manifest.chains.map(chain => ({ name: chain.name, validators: chain.nodes.length, protocol: chain.protocol })), output }));
}

if (require.main === module) createNetwork(...process.argv.slice(2));
module.exports = { planNetwork, createNetwork };
