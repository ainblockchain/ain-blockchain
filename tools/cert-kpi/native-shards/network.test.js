const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planNetwork } = require('./create-network');
const { resolveSeeds } = require('./resolve-seeds');
const { confirmedBlockNumber, containsTransaction } = require('./record-probe');
const { progressByChain } = require('./fault-observe');
const { nodesAdvanced, chainsCaughtUp } = require('./verify-network');

const accounts = { others: Array.from({ length: 20 }, (_, index) => ({ address: `test-address-${index}` })) };

test('native topology has four parent validators and two disjoint three-validator shards', () => {
  const { manifest, compose } = planNetwork(accounts, 'native_test', 'sha256:test', '/tmp/native-test');
  assert.equal(manifest.totalValidators, 10);
  assert.deepEqual(manifest.chains.map(chain => chain.nodes.length), [4, 3, 3]);
  assert.deepEqual(manifest.chains.map(chain => chain.protocol), ['NONE', 'POA', 'POA']);
  assert.equal(new Set(manifest.chains.flatMap(chain => chain.nodes.map(node => node.validator))).size, 10);
  assert.equal(Object.keys(compose.volumes).length, 10);
  assert.equal(Object.values(compose.services).filter(service => service.labels['org.ain.cert.role'] === 'tracker').length, 3);
});

test('each node has an explicit shared-host CPU and memory ceiling and loopback-only RPC publishing', () => {
  const { compose } = planNetwork(accounts, 'native_test', 'sha256:test', '/tmp/native-test');
  const nodes = Object.values(compose.services).filter(service => service.labels['org.ain.cert.role'] === 'blockchain');
  for (const node of nodes) {
    assert.equal(node.cpu_quota / node.cpu_period, 32);
    assert.equal(node.cpuset, '0-7');
    assert.equal(node.mem_limit, '128g');
    assert.equal(node.memswap_limit, node.mem_limit);
    assert.equal(node.network_mode, undefined);
    assert.match(node.ports[0], /^127\.0\.0\.1:/);
    assert.equal(node.environment.ENABLE_TX_SIG_VERIF_WORKAROUND, 'false');
    assert.equal(node.environment.ENABLE_DEV_CLIENT_SET_API, 'false');
    assert.equal(node.restart, 'no');
  }
});

test('trackers and P2P seeds remain chain-specific', () => {
  const { compose, manifest } = planNetwork(accounts, 'native_test', 'sha256:test', '/tmp/native-test');
  for (const chain of manifest.chains) {
    for (const node of chain.nodes) {
      const environment = compose.services[node.service].environment;
      assert.equal(environment.TRACKER_UPDATE_JSON_RPC_URL, `http://${chain.name}-tracker:8080/json-rpc`);
      assert.equal(environment.PEER_CANDIDATE_JSON_RPC_URL, `http://${chain.name}0:8081/json-rpc`);
    }
  }
});

test('unsafe names and relative output mounts are rejected', () => {
  assert.throws(() => planNetwork(accounts, '../existing', 'image', '/tmp/test'));
  assert.throws(() => planNetwork(accounts, 'valid', 'image', 'relative'));
});

test('Docker DNS seeds become literal addresses before the first-node identity check', async () => {
  const environment = { PEER_CANDIDATE_JSON_RPC_URL: 'http://root0:8081/json-rpc', TRACKER_UPDATE_JSON_RPC_URL: 'http://root-tracker:8080/json-rpc' };
  const addresses = { root0: '172.19.0.2', 'root-tracker': '172.19.0.3' };
  await resolveSeeds(environment, async hostname => ({ address: addresses[hostname] }));
  assert.equal(environment.PEER_CANDIDATE_JSON_RPC_URL, 'http://172.19.0.2:8081/json-rpc');
  assert.equal(environment.TRACKER_UPDATE_JSON_RPC_URL, 'http://172.19.0.3:8080/json-rpc');
});

test('literal seeds are unchanged and DNS failures are not silently treated as bootstrap success', async () => {
  const environment = { PEER_CANDIDATE_JSON_RPC_URL: 'http://127.0.0.1:8081/json-rpc', TRACKER_UPDATE_JSON_RPC_URL: 'http://127.0.0.1:8080/json-rpc' };
  await resolveSeeds(environment, async () => { throw new Error('must not resolve a literal'); });
  environment.PEER_CANDIDATE_JSON_RPC_URL = 'http://missing:8081/json-rpc';
  await assert.rejects(resolveSeeds(environment, async () => { throw new Error('DNS unavailable'); }), /DNS unavailable/);
});

test('ain-js finalized receipts use number, never an invented block_number field', () => {
  const transaction = { is_finalized: true, number: 16, exec_result: { code: 0 } };
  assert.equal(confirmedBlockNumber(transaction), 16);
  assert.throws(() => confirmedBlockNumber({ ...transaction, number: undefined, block_number: 16 }));
  assert.throws(() => confirmedBlockNumber({ ...transaction, number: -1 }));
  assert.throws(() => confirmedBlockNumber({ ...transaction, is_finalized: false }));
  assert.throws(() => confirmedBlockNumber({ ...transaction, exec_result: { code: 1 } }));
});

test('independent membership tolerates a lagging replica without declaring it verified', () => {
  assert.equal(containsTransaction(null, 16, 'tx'), false);
  assert.equal(containsTransaction({ number: 16 }, 16, 'tx'), false);
  assert.equal(containsTransaction({ number: 15, transactions: ['tx'] }, 16, 'tx'), false);
  assert.equal(containsTransaction({ number: 16, transactions: [{ hash: 'other' }] }, 16, 'tx'), false);
  assert.equal(containsTransaction({ number: 16, transactions: [{ hash: 'tx' }] }, 16, 'tx'), true);
  assert.equal(containsTransaction({ number: 16, transactions: ['tx'] }, 16, 'tx'), true);
});

test('fault progress requires measured growth, not a SERVING state or missing endpoint', () => {
  const { manifest } = planNetwork(accounts, 'native_test', 'sha256:test', '/tmp/native-test');
  const samples = [0, 1].map(index => ({ nodes: manifest.chains.map((chain, chainIndex) => ({ endpoint: chain.nodes[0].endpoint, number: 10 + (chainIndex === 1 ? 0 : index) })) }));
  assert.deepEqual(progressByChain(manifest, samples).map(chain => chain.advancing), [true, false, true]);
  samples[1].nodes.pop();
  assert.equal(progressByChain(manifest, samples)[2].advancing, false);
});

test('a temporarily stalled recovery peer is not accepted before every expected identity advances', () => {
  const nodes = [{ validator: 'first' }, { validator: 'second' }];
  const before = [{ number: 10 }, { number: 9 }];
  const states = [{ address: 'first', state: 'SERVING', number: 11 }, { address: 'second', state: 'SERVING', number: 9 }];
  assert.equal(nodesAdvanced(states, before, nodes), false);
  states[1].number = 12;
  assert.equal(nodesAdvanced(states, before, nodes), true);
  assert.equal(nodesAdvanced(states.slice(0, 1), before, nodes), false);
  states[1].address = 'unexpected';
  assert.equal(nodesAdvanced(states, before, nodes), false);
});

test('recovery also requires chain-local tips to catch up, not merely old common blocks', () => {
  const chains = [{ nodes: [{ service: 'first' }, { service: 'second' }] }];
  const states = [{ service: 'first', number: 100 }, { service: 'second', number: 80 }];
  assert.equal(chainsCaughtUp(chains, states), false);
  states[1].number = 98;
  assert.equal(chainsCaughtUp(chains, states), true);
  assert.equal(chainsCaughtUp(chains, states.slice(0, 1)), false);
});
