const assert = require('assert/strict');
const { test } = require('node:test');
const { Block } = require('../../blockchain/block');
const Transaction = require('../../tx-pool/transaction');
const { verify } = require('./verify-pending-chain');
const accounts = require('../../blockchain-configs/base/genesis_accounts.json').others.slice(0, 10);

function fixture() {
  const validators = Object.fromEntries(accounts.map((account) =>
    [account.address, { stake: 1, proposal_right: true }]));
  const finalized = Block.create('', [], {}, [], [], 10, 10, 'final-state', accounts[0].address,
      validators, 0, 0, 1789138000000);
  const block = Block.create(finalized.hash, [], {}, [], [], 11, 11, 'next-state',
      accounts[0].address, validators, 0, 0, 1789138001000);
  const sign = (operation, account) => Transaction.toJsObject(Transaction.fromTxBody({
    operation, nonce: -1, timestamp: 1789138001000, gas_price: 0,
  }, account.private_key, 0));
  const proposal = sign({ type: 'SET', op_list: [{ type: 'SET_VALUE',
    ref: '/consensus/number/11/propose',
    value: { block_hash: block.hash, validators } }] }, accounts[0]);
  const votes = accounts.slice(0, 7).map((account) => sign({ type: 'SET_VALUE',
    ref: `/consensus/number/11/${block.hash}/vote/${account.address}`,
    value: { block_hash: block.hash, stake: 1, is_against: false } }, account));
  return { plan: { snapshotNumber: 10, originalFinalHash: finalized.hash },
    capture: { at: new Date().toISOString(), address: accounts[0].address, finalized,
      tips: [block.hash], pendingChain: [{ block, proposal, votes, notarized: true }] } };
}

test('audits a signed extension with seven distinct voters, without DB/finality claims', () => {
  const { capture, plan } = fixture();
  const result = verify(capture, plan);
  assert.equal(result.pass, true);
  assert.equal(result.records[0].uniqueVoters, 7);
  assert.equal(result.signatureChecks, 8);
  assert.match(result.scope, /not DB replay/);
});

const failures = ['duplicate-voters', 'not-notarized', 'body', 'proposal', 'tip', 'finalized'];
for (const failure of failures) {
  test(`rejects ${failure} in a pending bridge capture`, () => {
    const { capture, plan } = fixture();
    const entry = capture.pendingChain[0];
    if (failure === 'duplicate-voters') entry.votes = Array(10).fill(entry.votes[0]);
    if (failure === 'not-notarized') entry.notarized = false;
    if (failure === 'body') entry.votes[0].tx_body.operation.value.stake = 100;
    if (failure === 'proposal') entry.proposal.address = accounts[1].address;
    if (failure === 'tip') capture.tips = ['wrong'];
    if (failure === 'finalized') plan.originalFinalHash = 'wrong';
    assert.throws(() => verify(capture, plan));
  });
}
