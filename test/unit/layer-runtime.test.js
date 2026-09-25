'use strict';
const assert = require('assert/strict');
const ain = require('@ainblockchain/ain-util');
const Node = require('../../node');
const Transaction = require('../../tx-pool/transaction');
const CommonUtil = require('../../common/common-util');
const Runtime = require('../../layer2/runtime');
const inbox = require('../../layer2/inbox');
const { attestationBody, statementHash } = require('../../layer2/anchor');
const { setNodeForTesting } = require('../test-util');
const { getBlockchainConfig, BlockchainParams } = require('../../common/constants');
const owner = getBlockchainConfig('genesis_accounts.json').owner;
const keys = Array.from({ length: 5 }, () => ain.createAccount());
const hash = n => '0x' + n.toString(16).padStart(64, '0');
const marker = '0x4c31494e' + '1'.repeat(56);
const cfg = { version: 1, role: 'L1', chainId: 103, parentChainId: BlockchainParams.genesis.chain_id,
  parentGenesisHash: hash(1), validators: keys.map(k => k.address), threshold: 4, genesisHash: null };
const body = (ref, value, extra = {}) => ({ operation: { type: 'SET_VALUE', ref, value },
  timestamp: 1790312000000, nonce: -1, gas_price: 0, ...extra });
const signed = (b, key = owner.private_key, id = cfg.parentChainId) => Transaction.fromTxBody(b, key, id);

describe('L1 custody and L2 inbox consensus policy', () => {
  let node, db;
  beforeEach(async () => { node = new Node(owner); await setNodeForTesting(node, 0, true); db = node.db; });
  const execute = tx => db.executeTransaction(tx, false, true, 100, tx.tx_body.timestamp);
  const success = result => assert.equal(CommonUtil.isFailedTx(result), false, JSON.stringify(result));
  const failure = result => assert.equal(result.code, Runtime.CODE, JSON.stringify(result));
  function freeze() { success(execute(signed(body('/layer2/control/freeze', cfg)))); }
  function bind() { success(execute(signed(body('/layer2/control/bind', {
    genesis_hash: hash(2), source_state_root: hash(3), source_block_hash: hash(4), source_height: 100,
  })))); }

  it('locks L1 spending and app mutations at consensus while preserving balances', () => {
    const balances = db.getProofHash('/values/accounts'), services = db.getProofHash('/values/service_accounts');
    freeze();
    assert.equal(db.getProofHash('/values/accounts'), balances);
    assert.equal(db.getProofHash('/values/service_accounts'), services);
    assert.equal(db.getValue('/blockchain_params/reward/annual_rate'), 0);
    for (const ref of ['/transfer/a/b/1/value', '/apps/example/x', '/accounts/' + owner.address + '/balance', '/']) {
      const before = db.getProofHash('/'); failure(execute(signed(body(ref, 1)))); assert.equal(db.getProofHash('/'), before);
    }
    const mixed = signed(body('/unused', null, { operation: { type: 'SET', op_list: [
      { type: 'SET_VALUE', ref: '/layer2/control/bind', value: {} },
      { type: 'SET_VALUE', ref: '/apps/example/x', value: 1 },
    ] } }));
    failure(execute(mixed));
  });

  it('rejects unauthorized, repeated or mutable custody initialization', () => {
    failure(execute(signed(body('/layer2/control/freeze', cfg), keys[0].private_key)));
    assert.equal(db.getValue(Runtime.CONFIG), null);
    freeze(); failure(execute(signed(body('/layer2/control/freeze', cfg))));
    bind(); failure(execute(signed(body('/layer2/control/bind', { genesis_hash: hash(9) }))));
  });

  it('stores only matching-user, valid L2 signed inbox messages once', () => {
    freeze(); bind();
    const inner = signed(body('/apps/example/x', 1, { parent_tx_hash: marker }), owner.private_key, 103);
    const payload = { tx_body: inner.tx_body, signature: inner.signature };
    failure(execute(signed(body('/layer2/inbox/' + marker, payload), keys[0].private_key)));
    success(execute(signed(body('/layer2/inbox/' + marker, payload))));
    assert.equal(db.getValue('/layer2/inbox/' + marker + '/inner_hash'), inner.hash);
    failure(execute(signed(body('/layer2/inbox/' + marker, payload))));
  });

  it('requires 4-of-5 authenticated checkpoints and ordered ancestry on L1', () => {
    freeze(); bind();
    const statement = { version: 1, chain_id: 103, parent_chain_id: cfg.parentChainId, genesis_hash: hash(2),
      height: 10, block_hash: hash(10), state_root: hash(11), transaction_root: hash(12), previous_anchor: hash(0), timestamp: 1000 };
    const signatures = keys.slice(0, 4).map(k => ({ address: k.address,
      signature: ain.ecSignTransaction(attestationBody(statement), Buffer.from(k.private_key, 'hex'), cfg.parentChainId) }));
    failure(execute(signed(body('/layer2/checkpoints/10', { statement, signatures: signatures.slice(0, 3) }))));
    assert.equal(db.getValue('/layer2/latest_checkpoint'), null);
    success(execute(signed(body('/layer2/checkpoints/10', { statement, signatures }))));
    assert.equal(db.getValue('/layer2/latest_checkpoint/commitment_hash'), statementHash(statement));
    failure(execute(signed(body('/layer2/checkpoints/10', { statement, signatures }))));
  });

  it('L2 cannot run an inbox payload before parent quorum or run it twice', () => {
    db.writeDatabase(['values', 'blockchain_params', 'layer2'], { version: 1, role: 'L2', chainId: 103,
      parentChainId: cfg.parentChainId, parentGenesisHash: hash(1), parentValidators: keys.map(k => k.address) });
    const inner = signed(body('/blockchain_params/deployment_verification/inbox', 'executed', { parent_tx_hash: marker }), owner.private_key, 103);
    failure(execute(inner));
    const statement = { version: 1, marker, parent_chain_id: cfg.parentChainId, child_chain_id: 103,
      parent_genesis: hash(1), parent_height: 100, parent_block_hash: hash(15), parent_tx_hash: hash(16),
      inner_hash: inner.hash, timestamp: 1000 };
    const signatures = keys.slice(0, 4).map(k => ({ address: k.address,
      signature: ain.ecSignTransaction(inbox.body(statement), Buffer.from(k.private_key, 'hex'), 103) }));
    failure(execute(signed(body('/layer2/inbox_authorizations/' + marker, { statement, signatures: signatures.slice(0, 3) }))));
    success(execute(signed(body('/layer2/inbox_authorizations/' + marker, { statement, signatures }))));
    success(execute(inner));
    assert.equal(db.getValue('/blockchain_params/deployment_verification/inbox'), 'executed');
    assert.equal(db.getValue('/layer2/inbox_authorizations/' + marker + '/consumed'), true);
    failure(execute(inner));
    for (const ref of ['/', '/blockchain_params', '/blockchain_params//layer2', '//layer2/latest_checkpoint']) {
      failure(execute(signed(body(ref, {}))));
    }
  });
});
