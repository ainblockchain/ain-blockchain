'use strict';
const assert = require('assert/strict');
const Node = require('../../node');
const Transaction = require('../../tx-pool/transaction');
const Runtime = require('../../layer2/runtime');
const domain = require('../../layer2/domain');
const { setNodeForTesting } = require('../test-util');
const { getBlockchainConfig } = require('../../common/constants');
const owner = getBlockchainConfig('genesis_accounts.json').owner;
const ain = require('@ainblockchain/ain-util');
const cutoff = 1790312000000;
const body = (ref, value, timestamp = cutoff) => ({ operation: { type: 'SET_VALUE', ref, value }, timestamp, nonce: -1, gas_price: 0 });
const sign = (b, id, key = owner.private_key) => Transaction.fromTxBody(b, key, id);
const plain = tx => ({ tx_body: tx.tx_body, signature: tx.signature });

describe('Execution signing domain transition', () => {
  let node, db;
  beforeEach(async () => {
    node = new Node(owner); await setNodeForTesting(node, 0, true); db = node.db;
    db.writeDatabase(['values', 'blockchain_params', 'genesis', 'chain_id'], 103);
    db.writeDatabase(['values', 'blockchain_params', 'layer2'], { role: 'L2', chainId: 103, parentChainId: 101 });
  });
  function transition(id) {
    const tx = sign(body('/layer2/control/execution_domain', { chainId: id, minTimestamp: cutoff }), 103);
    const results = db.executeTransactionList([plain(tx)], false, true, 100, cutoff);
    assert.equal(results[0].code, 0, JSON.stringify(results));
    return tx;
  }
  for (const id of [0, 1]) it(`replays old state, activates chain ${id}, and preserves consensus domain`, () => {
    const ref = '/blockchain_params/deployment_verification/domain';
    const old = sign(body(ref, 'before', cutoff - 1), 103);
    assert.equal(db.getTransactionChainId(old.tx_body), 103);
    assert.equal(db.executeTransactionList([plain(old)], false, true, 99, cutoff - 1)[0].code, 0);
    transition(id);
    assert.equal(db.getValue(ref), 'before');
    assert.equal(db.getTransactionChainId(body(ref, 'after')), id);
    assert.equal(db.getTransactionChainId(body('/consensus/number/101/propose', {})), 103);
    const next = sign(body(ref, 'after', cutoff + 1), id);
    assert.equal(db.executeTransactionList([plain(next)], false, true, 101, cutoff + 1)[0].code, 0);
    assert.equal(db.getValue(ref), 'after');
    for (const invalid of [sign(body(ref, 'wrong', cutoff + 2), 103), sign(body(ref, 'replay', cutoff - 1), id)]) {
      assert.equal(Runtime.precheck(db, invalid, 101).code, Runtime.CODE);
    }
    const result = db.executeTransaction(sign(body('/layer2/control/execution_domain', { chainId: 2, minTimestamp: cutoff }), id), false, true, 102, cutoff);
    assert.equal(result.code, Runtime.CODE);
  });
  it('requires the governor and leaves state intact on rejection', () => {
    const previous = db.getProofHash('/');
    const tx = sign(body('/layer2/control/execution_domain', { chainId: 1, minTimestamp: cutoff }), 103, ain.createAccount().private_key);
    assert.equal(db.executeTransaction(tx, false, true, 100, cutoff).code, Runtime.CODE);
    assert.equal(db.getProofHash('/'), previous);
  });
  it('does not exempt batched or global consensus-looking app transactions', () => {
    const op = body('/consensus/number/1/propose', {}).operation;
    assert.equal(domain.isConsensusBody({ operation: { type: 'SET', op_list: [op] } }), false);
    assert.equal(domain.isConsensusBody({ operation: { ...op, is_global: true } }), false);
  });
});
