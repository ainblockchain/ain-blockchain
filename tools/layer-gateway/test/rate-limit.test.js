'use strict';
// 2026-10-29: the L2 validators rate-limit JSON-RPC reads per source IP (10/s). Every pass re-read
// genesis/chainId from all five nodes and every proxied request went to one node, so that node
// answered 429, the pass found "fewer than two healthy witnesses" and the whole layer refused
// requests (AINspace storage could not load maps). These tests pin the load-spreading behaviour.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IndexStore } = require('../index-store');
const { createGateway, UpstreamError } = require('../server');
const hash = n => '0x' + n.toString(16).padStart(64, '0');
const endpoints = ['http://a/json-rpc', 'http://b/json-rpc', 'http://c/json-rpc'];
const config = { network: 'mainnet', defaultLayer: 'L2', layers: {
  L1: { chainId: 101, genesisHash: hash(1), endpoints: ['http://l1a/json-rpc', 'http://l1b/json-rpc'] },
  L2: { chainId: 1, genesisHash: hash(2), endpoints },
} };
const blockAt = n => ({ number: n, hash: n === 0 ? hash(2) : hash(1000 + n), last_hash: n === 0 ? hash(0) : (n === 1 ? hash(2) : hash(999 + n)), transactions: [] });

function chain({ height = 3, limited = new Set() } = {}) {
  const calls = [];
  const reader = async (endpoint, method, params = {}) => {
    calls.push([endpoint, method]);
    if (limited.has(endpoint)) throw new UpstreamError(429);
    if (method === 'ain_getBlockByNumber') return blockAt(params.number);
    if (method === 'net_getChainId') return 1;
    if (method === 'ain_getLastBlockNumber') return height;
    if (method === 'net_consensusStatus') return { health: true };
    throw Error('unexpected ' + method);
  };
  return { calls, reader };
}

test('genesis and chain id are verified once per endpoint, not on every pass', async () => {
  const store = new IndexStore(':memory:'); const { calls, reader } = chain();
  const gateway = createGateway(config, store, undefined, reader);
  await gateway.indexLayer('L2'); await gateway.indexLayer('L2'); await gateway.indexLayer('L2');
  assert.equal(gateway.readiness.L2.healthy, true);
  for (const endpoint of endpoints) {
    assert.equal(calls.filter(([e, m]) => e === endpoint && m === 'net_getChainId').length, 1);
  }
  store.close();
});

test('proxied requests are spread over the healthy witnesses and a rate-limited one fails over', async () => {
  const store = new IndexStore(':memory:'); const { reader } = chain();
  const sent = [];
  const transport = async (endpoint, request) => {
    sent.push(endpoint);
    if (endpoint === 'http://a/json-rpc') throw new UpstreamError(429);
    return { jsonrpc: '2.0', id: request.id, result: { result: 7 } };
  };
  const gateway = createGateway(config, store, transport, reader);
  await gateway.indexLayer('L2');
  const read = { jsonrpc: '2.0', id: 1, method: 'ain_get', params: { type: 'GET_VALUE', ref: '/apps/x' } };
  for (let i = 0; i < 6; i++) assert.equal((await gateway.handle(read)).result.result, 7);
  const used = new Set(sent.filter(e => e !== 'http://a/json-rpc'));
  assert.ok(used.size >= 2, 'more than one witness serves requests: ' + [...used]);
  store.close();
});

test('a pass that is only rate limited keeps the last verified readiness until it expires', async () => {
  const store = new IndexStore(':memory:'); const limited = new Set();
  const { reader } = chain({ limited });
  const gateway = createGateway(config, store, undefined, reader);
  await gateway.indexLayer('L2');
  assert.equal(gateway.readiness.L2.healthy, true);
  endpoints.forEach(e => limited.add(e));
  await gateway.indexLayer('L2');
  assert.equal(gateway.readiness.L2.healthy, true, 'transient 429s do not take the layer down');
  // Expired verification still refuses requests: the 60 s bound in handle() is unchanged.
  gateway.readiness.L2.checked_at = Date.now() - 61000;
  await assert.rejects(gateway.handle({ jsonrpc: '2.0', id: 1, method: 'ain_get', params: { type: 'GET_VALUE', ref: '/apps/x' } }), /not ready/);
  store.close();
});

test('a real disagreement still takes the layer down at once', async () => {
  const store = new IndexStore(':memory:'); const { reader } = chain();
  const gateway = createGateway(config, store, undefined, reader);
  await gateway.indexLayer('L2');
  const forked = async (endpoint, method, params) => method === 'ain_getBlockByNumber' && params.number > 0
    ? { ...blockAt(params.number), hash: hash(5000 + params.number + endpoint.length) } : reader(endpoint, method, params);
  const gateway2 = createGateway(config, store, undefined, forked);
  await gateway2.indexLayer('L2');
  assert.equal(gateway2.readiness.L2.healthy, false);
  store.close();
});
