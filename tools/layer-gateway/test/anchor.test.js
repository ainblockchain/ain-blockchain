'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ainUtil = require('@ainblockchain/ain-util');
const { attestationBody, statementHash, verifyCertificate } = require('../../../layer2/anchor');
const hash = n => '0x' + n.toString(16).padStart(64, '0');
const accounts = Array.from({ length: 5 }, () => ainUtil.createAccount());
const configuration = { chainId: 103, parentChainId: 101, genesisHash: hash(1),
  validators: accounts.map(a => a.address), threshold: 4 };
const value = { version: 1, chain_id: 103, parent_chain_id: 101, genesis_hash: hash(1), height: 10,
  block_hash: hash(2), state_root: hash(3), transaction_root: hash(4), previous_anchor: hash(0), timestamp: 1000 };
function signed(statement, count = 4) {
  return { statement, signatures: accounts.slice(0, count).map(a => ({ address: a.address,
    signature: ainUtil.ecSignTransaction(attestationBody(statement), Buffer.from(a.private_key, 'hex'), 101) })) };
}

test('four distinct committee signatures attest a domain-separated checkpoint', () => {
  const result = verifyCertificate(signed(value), configuration);
  assert.equal(result.hash, statementHash(value)); assert.equal(result.signers.length, 4);
  assert.equal(result.trust_model, 'operator-validated');
});

test('quorum, duplicate, tampered root, foreign chain and replay are rejected', () => {
  assert.throws(() => verifyCertificate(signed(value, 3), configuration), /quorum/);
  const duplicate = signed(value); duplicate.signatures[3] = duplicate.signatures[0];
  assert.throws(() => verifyCertificate(duplicate, configuration), /duplicate/);
  const tampered = signed(value); tampered.statement = { ...value, state_root: hash(999) };
  assert.throws(() => verifyCertificate(tampered, configuration), /signature/);
  assert.throws(() => verifyCertificate(signed({ ...value, chain_id: 104 }), configuration), /domain/);
  assert.throws(() => verifyCertificate(signed(value), configuration, value), /advance/);
  const next = { ...value, height: 20, previous_anchor: statementHash(value), timestamp: 2000 };
  assert.equal(verifyCertificate(signed(next), configuration, value).statement.height, 20);
  assert.throws(() => verifyCertificate(signed({ ...next, previous_anchor: hash(999) }), configuration, value), /ancestry/);
});
