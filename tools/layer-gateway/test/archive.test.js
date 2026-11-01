'use strict';
// Bounded block history (BLOCK_HISTORY_RETENTION) lets validators prune old blocks. A gateway
// reindex or a historical read must then use archive nodes only, and fail with a clear error.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IndexStore } = require('../index-store');
const { validateConfig } = require('../protocol');
const { createGateway } = require('../server');
const hash = n => '0x' + n.toString(16).padStart(64, '0');
const endpoints = ['http://a/json-rpc', 'http://b/json-rpc', 'http://c/json-rpc'];
const layers = archiveEndpoints => ({
  L1: { chainId: 101, genesisHash: hash(1), endpoints: ['http://l1a/json-rpc', 'http://l1b/json-rpc'] },
  L2: { chainId: 1, genesisHash: hash(2), endpoints, ...(archiveEndpoints ? { archiveEndpoints } : {}) },
});
const config = archive => ({ network: 'mainnet', defaultLayer: 'L2', layers: layers(archive) });
const blockAt = n => ({ number: n, hash: n === 0 ? hash(2) : hash(1000 + n),
  last_hash: n === 0 ? hash(0) : (n === 1 ? hash(2) : hash(999 + n)), transactions: [] });

// 'a' pruned everything below 8 (except genesis); 'b' and 'c' are archive nodes.
function chain({ height = 10, prunedBelow = { 'http://a/json-rpc': 8 }, down = new Set() } = {}) {
  const calls = [];
  const reader = async (endpoint, method, params = {}) => {
    calls.push([endpoint, method, params.number]);
    if (down.has(endpoint)) throw Error('offline');
    if (method === 'ain_getBlockByNumber') {
      const floor = prunedBelow[endpoint];
      return floor && params.number > 0 && params.number < floor ? null : blockAt(params.number);
    }
    if (method === 'net_getChainId') return 1;
    if (method === 'ain_getLastBlockNumber') return height;
    if (method === 'net_consensusStatus') return { health: true };
    throw Error('unexpected ' + method);
  };
  return { calls, reader };
}

test('archiveEndpoints must be at least two distinct configured endpoints', () => {
  validateConfig(config(['http://b/json-rpc', 'http://c/json-rpc']));
  assert.throws(() => validateConfig(config(['http://b/json-rpc'])), /archiveEndpoints/);
  assert.throws(() => validateConfig(config(['http://b/json-rpc', 'http://x/json-rpc'])), /archiveEndpoints/);
  assert.throws(() => validateConfig(config(['http://b/json-rpc', 'http://b/json-rpc'])), /archiveEndpoints/);
});

test('without archiveEndpoints a pruned witness yields a clear error, not "witnesses disagree"', async () => {
  const store = new IndexStore(':memory:'); const { reader } = chain();
  const errors = []; const log = console.error; console.error = line => errors.push(line);
  try {
    const gateway = createGateway(config(), store, undefined, reader);
    await gateway.indexLayer('L2');
    assert.equal(gateway.readiness.L2.healthy, false);
    assert.match(errors.join('\n'), /Block 1 unavailable from http:\/\/a\/json-rpc \(pruned history\?\)/);
  } finally { console.error = log; store.close(); }
});

test('with archiveEndpoints the reindex reads history only from archive nodes', async () => {
  const store = new IndexStore(':memory:'); const { calls, reader } = chain();
  const gateway = createGateway(config(['http://b/json-rpc', 'http://c/json-rpc']), store, undefined, reader);
  await gateway.indexLayer('L2');
  assert.equal(gateway.readiness.L2.healthy, true);
  assert.equal(store.head('L2').height, 10);
  const historyReads = calls.filter(([, m, n]) => m === 'ain_getBlockByNumber' && n > 0 && n < 10);
  assert.ok(historyReads.length > 0);
  assert.ok(historyReads.every(([e]) => e !== 'http://a/json-rpc'), 'pruned node not used for history');
  store.close();
});

test('fewer than two available archive nodes fails with a clear error', async () => {
  const store = new IndexStore(':memory:'); const { reader } = chain({ down: new Set(['http://c/json-rpc']) });
  const errors = []; const log = console.error; console.error = line => errors.push(line);
  try {
    const gateway = createGateway(config(['http://b/json-rpc', 'http://c/json-rpc']), store, undefined, reader);
    await gateway.indexLayer('L2');
    assert.equal(gateway.readiness.L2.healthy, false);
    assert.match(errors.join('\n'), /Fewer than two configured archiveEndpoints/);
  } finally { console.error = log; store.close(); }
});

test('historical block reads go to archive nodes; other reads still spread over all witnesses', async () => {
  const store = new IndexStore(':memory:'); const { reader } = chain();
  const sent = [];
  const transport = async (endpoint, request) => { sent.push([endpoint, request.method]);
    return { jsonrpc: '2.0', id: request.id, result: { result: 1 } }; };
  const gateway = createGateway(config(['http://b/json-rpc', 'http://c/json-rpc']), store, transport, reader);
  await gateway.indexLayer('L2');
  for (let i = 0; i < 6; i++) {
    await gateway.handle({ jsonrpc: '2.0', id: i, method: 'ain_getBlockByNumber', params: { number: 3 } });
    await gateway.handle({ jsonrpc: '2.0', id: i, method: 'ain_get', params: { type: 'GET_VALUE', ref: '/x' } });
  }
  const blockReads = sent.filter(([, m]) => m === 'ain_getBlockByNumber').map(([e]) => e);
  assert.ok(blockReads.every(e => e !== 'http://a/json-rpc'));
  assert.ok(sent.some(([e, m]) => m === 'ain_get' && e === 'http://a/json-rpc'));
  store.close();
});
