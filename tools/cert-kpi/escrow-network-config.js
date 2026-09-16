const assert = require('assert/strict');

function parameters(template, accounts, timestamp) {
  assert.equal(accounts.others.length, 20);
  const validators = accounts.others.slice(0, 10);
  const addresses = [accounts.owner, ...accounts.others].map((account) => account.address);
  assert.equal(new Set(addresses).size, 21);
  assert.ok(Number.isSafeInteger(timestamp) && timestamp > 0);
  const result = structuredClone(template);
  result._description = 'Separate ten-validator native micro-unit escrow experiment; ' +
    'not migration of the existing failed channel';
  Object.assign(result.genesis, {
    genesis_addr: accounts.owner.address, genesis_timestamp: timestamp,
    num_genesis_accounts: 20, epoch_ms: 1000, chain_id: 0, network_id: 20260911 });
  Object.assign(result.consensus, { min_num_validators: 5, max_num_validators: 10,
    min_stake_for_proposer: 1000000, max_stake_for_proposer: 10000000,
    genesis_proposer_whitelist: {}, genesis_validator_whitelist: {}, genesis_validators: {} });
  for (const validator of validators) {
    result.consensus.genesis_proposer_whitelist[validator.address] = true;
    result.consensus.genesis_validator_whitelist[validator.address] = true;
    result.consensus.genesis_validators[validator.address] = {
      stake: 1000000, proposal_right: true,
    };
  }
  result.resource.bandwidth_budget_per_block = 1000000;
  result.resource.min_gas_price = 1;
  return result;
}

function timerFlags(base) {
  assert.ok(base.allow_up_to_6_decimal_transfer_value_only?.has_bandage);
  return {
    ...structuredClone(base), native_escrow_micro_units: { enabled_block: 2, has_bandage: false },
  };
}

function compose(plan, privateDirectory, sourceDirectory) {
  const p2pPortBase = plan.p2pPortBase ?? 21501;
  const trackerPort = plan.trackerPort ?? 21079;
  assert.match(plan.project, /^ain-units-[a-z0-9-]{1,40}$/);
  assert.match(plan.chainImage, /^sha256:[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(plan.rpcPortBase) && plan.rpcPortBase >= 1024 && plan.rpcPortBase + 9 <= 65535);
  assert.ok(Number.isInteger(plan.peerPort) && plan.peerPort >= 1024);
  assert.ok(Number.isInteger(p2pPortBase) && p2pPortBase >= 1024 && p2pPortBase + 9 <= 65535);
  assert.ok(Number.isInteger(trackerPort) && trackerPort >= 1024 && trackerPort <= 65535);
  assert.ok(Number.isSafeInteger(plan.uid) && plan.uid > 0);
  assert.ok(Number.isSafeInteger(plan.gid) && plan.gid > 0);
  const common = { image: plan.chainImage, network_mode: 'host', runtime: 'runc', cpuset: '0-7',
    cpu_period: 100000, cpu_quota: 3200000, mem_limit: '128g', memswap_limit: '128g',
    user: `${plan.uid}:${plan.gid}`, read_only: true,
    tmpfs: ['/tmp:rw,size=256m'], cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'], pids_limit: 256, restart: 'no',
    logging: { driver: 'json-file', options: { 'max-size': '20m', 'max-file': '3' } } };
  const services = { tracker: { ...common, cpu_quota: 25000, mem_limit: '1g', memswap_limit: '1g',
    environment: { PORT: String(trackerPort), BLOCKCHAIN_DATA_DIR: '/tmp/tracker',
      CONSOLE_LOG: 'false', NVIDIA_VISIBLE_DEVICES: 'void' },
    command: ['tracker-server/index.js'] } };
  for (let index = 0; index < 10; index++) {
    services[`node${index}`] = { ...common,
      environment: { NODE_INDEX: String(index),
        BLOCKCHAIN_CONFIGS_DIR: '/network', BLOCKCHAIN_DATA_DIR: '/data',
        PORT: String(plan.rpcPortBase + index), P2P_PORT: String(p2pPortBase + index),
        TRACKER_UPDATE_JSON_RPC_URL: `http://127.0.0.1:${trackerPort}/json-rpc`,
        PEER_CANDIDATE_JSON_RPC_URL: `http://127.0.0.1:${plan.rpcPortBase}/json-rpc`, HOSTING_ENV: 'local',
        CONSOLE_LOG: 'false', ENABLE_EXPRESS_RATE_LIMIT: 'false', ENABLE_GAS_FEE_WORKAROUND: 'true',
        ENABLE_TX_SIG_VERIF_WORKAROUND: 'false', ENABLE_REST_FUNCTION_CALL: 'true',
        TX_POOL_SIZE_LIMIT: '1000000', TX_POOL_SIZE_LIMIT_PER_ACCOUNT: '200000',
        MAX_NUM_INBOUND_CONNECTION: '12', TARGET_NUM_OUTBOUND_CONNECTION: '9',
        NVIDIA_VISIBLE_DEVICES: 'void' },
      command: ['--max-old-space-size=8192', '/experiment/escrow-network-client.js'],
      volumes: [`${privateDirectory}/data/node${index}:/data`,
        `${privateDirectory}/config:/network:ro`,
        `${sourceDirectory}:/experiment:ro`], depends_on: ['tracker'],
      labels: { 'org.ain.cert.role': 'blockchain',
        'org.ain.cert.allocation': 'shared-host-oversubscribed-ceilings' },
      healthcheck: { test: ['CMD', 'node', '-e',
        'fetch("http://127.0.0.1:"+process.env.PORT+"/node_status",' +
        '{signal:AbortSignal.timeout(4000)}).then(response=>response.json())' +
        '.then(body=>process.exit(body.code===0&&body.result?.state==="SERVING"&&' +
        'body.result?.health===true?0:1)).catch(()=>process.exit(1))'],
        interval: '10s', timeout: '5s', retries: 18, start_period: '60s' } };
  }
  return { name: plan.project, services };
}

module.exports = { parameters, timerFlags, compose };
