'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IndexStore } = require('../index-store');
const { validateConfig, routeRequest } = require('../protocol');
const { createGateway } = require('../server');
const hash = n => '0x' + n.toString(16).padStart(64, '0');
const config = { network: 'mainnet', defaultLayer: 'L2', layers: {
  L1: { chainId: 101, genesisHash: hash(1), endpoints: ['http://l1a/json-rpc', 'http://l1b/json-rpc'] },
  L2: { chainId: 103, genesisHash: hash(2), endpoints: ['http://l2a/json-rpc', 'http://l2b/json-rpc'] },
} };
const request = params => ({ jsonrpc: '2.0', id: 1, method: 'ain_sendSignedTransaction', params });

test('default L2 and explicit L1 preserve signed bytes and never choose admin methods', () => {
  validateConfig(config);
  const body = { operation: { type: 'SET_VALUE', ref: '/apps/a/x', value: 1 }, nonce: -1, timestamp: 1 };
  const params = { tx_body: body, signature: 'unchanged' };
  assert.equal(routeRequest(config, request(params)).layer, 'L2');
  const l1 = routeRequest(config, request({ ...params, layer: 'L1' }));
  assert.equal(l1.layer, 'L1'); assert.deepEqual(l1.request.params, params);
  assert.throws(() => routeRequest(config, request({ layer: 'l2' })), /layer must/);
  assert.throws(() => routeRequest(config, { ...request({}), method: 'ain_injectAccountFromPrivateKey' }), /Unsupported/);
  assert.throws(() => validateConfig({ ...config, layers: { L1: config.layers.L1, L2: { ...config.layers.L2, chainId: 101 } } }), /distinct/);
});

test('L2 failure never resubmits a write to L1; unready layers reject requests', async () => {
  const store = new IndexStore(':memory:'); const called = [];
  const gateway = createGateway(config, store, async endpoint => { called.push(endpoint); throw Error('offline'); });
  await assert.rejects(gateway.handle(request({})), /not ready/);
  assert.equal(called.length, 0);
  gateway.readiness.L2 = { healthy: true, checked_at: Date.now() };
  await assert.rejects(gateway.handle(request({})), /offline/);
  assert.deepEqual(called, ['http://l2a/json-rpc']);
  store.close();
});

function block(number, h, previous, ids) {
  return { number, hash: hash(h), last_hash: hash(previous), transactions: ids.map(id => ({ hash: hash(id),
    tx_body: { nonce: -1 }, address: '0x' + 'a'.repeat(40) })) };
}

test('complete history pagination pins a snapshot and does not cross layers or chains', () => {
  const store = new IndexStore(':memory:'); store.bind('L1', hash(1)); store.bind('L2', hash(2));
  store.append('L2', block(0, 2, 0, [11, 12])); store.append('L2', block(1, 3, 2, [13, 14]));
  const first = store.list('L2', { limit: 2 }); assert.deepEqual(first.transactions.map(t => t.hash), [hash(14), hash(13)]);
  store.append('L2', block(2, 4, 3, [15]));
  const second = store.list('L2', { limit: 2, cursor: first.next_cursor });
  assert.deepEqual(second.transactions.map(t => t.hash), [hash(12), hash(11)]);
  assert.equal(second.snapshot_height, 1); assert.equal(second.next_cursor, null);
  store.append('L1', block(0, 1, 0, [99]));
  assert.throws(() => store.list('L1', { cursor: first.next_cursor }), /Invalid cursor/);
  assert.throws(() => store.list('L2', { cursor: first.next_cursor, address: '0x' + 'a'.repeat(40) }), /Invalid cursor/);
  assert.throws(() => store.bind('L2', hash(50)), /another genesis/);
  assert.equal(store.transaction('L1', hash(11)), null);
  store.close();
});

test('fork, gaps and malformed blocks fail atomically without advancing index', () => {
  const store = new IndexStore(':memory:'); store.bind('L2', hash(2)); store.append('L2', block(0, 2, 0, [11]));
  assert.throws(() => store.append('L2', block(2, 4, 3, [12])), /Noncontiguous/);
  assert.throws(() => store.append('L2', block(1, 3, 999, [12])), /fork/);
  const bad = block(1, 3, 2, [12]); bad.transactions.push({ hash: hash(13) });
  assert.throws(() => store.append('L2', bad), /Full transaction/);
  assert.equal(store.head('L2').height, 0); assert.equal(store.transaction('L2', hash(12)), null);
  store.close();
});

test('settlement requires a valid L1 quorum and matching indexed L2 checkpoint ancestry', () => {
  const ain = require('@ainblockchain/ain-util'), anchor = require('../../../layer2/anchor');
  const keys = Array.from({length: 5}, () => ain.createAccount());
  const store = new IndexStore(':memory:'); store.bind('L1', hash(1)); store.bind('L2', hash(2));
  store.configureSettlement({chainId:103,parentChainId:101,genesisHash:hash(2),threshold:4,validators:keys.map(k=>k.address)});
  store.append('L1',block(0,1,0,[]));store.append('L2',block(0,2,0,[11]));
  const statement={version:1,chain_id:103,parent_chain_id:101,genesis_hash:hash(2),height:1,block_hash:hash(3),
    state_root:hash(20),transaction_root:hash(21),previous_anchor:hash(0),timestamp:1000};
  const signatures=keys.slice(0,4).map(k=>({address:k.address,signature:ain.ecSignTransaction(anchor.attestationBody(statement),Buffer.from(k.private_key,'hex'),101)}));
  const l1=block(1,4,1,[99]);l1.transactions[0].tx_body.operation={type:'SET_VALUE',ref:'/layer2/checkpoints/1',value:{statement,signatures}};l1.receipts=[{code:0}];
  const invalid=structuredClone(l1);invalid.transactions[0].tx_body.operation.value.signatures.pop();
  assert.throws(()=>store.append('L1',invalid),/quorum/);assert.equal(store.head('L1').height,0);
  store.append('L1',l1);assert.equal(store.transaction('L2',hash(11)).settlement.status,'AWAITING_L1_CHECKPOINT');
  const l2=block(1,3,2,[12]);l2.state_proof_hash=hash(20);store.append('L2',l2);
  const found=store.transaction('L2',hash(11));assert.equal(found.settlement.status,'OPERATOR_ATTESTED_ON_L1');
  assert.equal(found.settlement.l1_tx_hash,hash(99));store.close();
});
