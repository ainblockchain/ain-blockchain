const rimraf = require('rimraf');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const ainUtil = require('@ainblockchain/ain-util');
const { BLOCKCHAINS_DIR } = require('../common/constants');
const Transaction = require('../tx-pool/transaction');
const BlockchainNode = require('../node/');
const {setNodeForTesting, getTransaction} = require('./test-util');

describe('Transaction', () => {
  let node;
  let txBody;
  let tx;
  let txBodyCustomAddress;
  let txCustomAddress;
  let txBodyParentHash;
  let txParentHash;
  let txBodyForNode;
  let txForNode;

  beforeEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    txBody = {
      nonce: 10,
      timestamp: 1568798344000,
      operation: {
        type: 'SET_VALUE',
        ref: 'path',
        value: 'val',
      }
    };
    tx = Transaction.fromTxBody(txBody, node.account.private_key);

    txBodyCustomAddress = {
      nonce: 10,
      timestamp: 1568798344000,
      operation: {
        type: 'SET_VALUE',
        ref: 'path',
        value: 'val',
      },
      address: 'abcd',
    };
    txCustomAddress = Transaction.fromTxBody(txBodyCustomAddress, node.account.private_key);

    txBodyParentHash = {
      nonce: 10,
      timestamp: 1568798344000,
      operation: {
        type: 'SET_VALUE',
        ref: 'path',
        value: 'val',
      },
      parent_tx_hash: '0xd96c7966aa6e6155af3b0ac69ec180a905958919566e86c88aef12c94d936b5e',
    };
    txParentHash = Transaction.fromTxBody(txBodyParentHash, node.account.private_key);

    txBodyForNode = {
      operation: {
        type: 'SET_VALUE',
        ref: 'path',
        value: 'val'
      }
    };
    txForNode = getTransaction(node, txBodyForNode);
  });

  afterEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);
  });

  describe('fromTxBody', () => {
    it('succeed', () => {
      expect(tx).to.not.equal(null);
      expect(tx.tx_body.nonce).to.equal(txBody.nonce);
      expect(tx.tx_body.timestamp).to.equal(txBody.timestamp);
      expect(tx.hash).to.equal(
          '0x' + ainUtil.hashTransaction(txBody).toString('hex'));
      expect(tx.address).to.equal(node.account.address);
      expect(tx.extra.created_at).to.not.equal(undefined);
      expect(tx.extra.skip_verif).to.equal(undefined);

      expect(txCustomAddress).to.not.equal(null);
      expect(txCustomAddress.tx_body.address).to.equal(txBodyCustomAddress.address);
      expect(txCustomAddress.hash).to.equal(
          '0x' + ainUtil.hashTransaction(txBodyCustomAddress).toString('hex'));
      expect(txCustomAddress.address).to.equal(txBodyCustomAddress.address);
      expect(txCustomAddress.signature).to.equal('');
      expect(txCustomAddress.extra.created_at).to.not.equal(undefined);
      expect(txCustomAddress.extra.skip_verif).to.equal(true);

      expect(txParentHash).to.not.equal(null);
      expect(txParentHash.tx_body.parent_tx_hash).to.equal(txBodyParentHash.parent_tx_hash);
      expect(txParentHash.hash).to.equal(
          '0x' + ainUtil.hashTransaction(txBodyParentHash).toString('hex'));
      expect(txParentHash.address).to.equal(node.account.address);
      expect(txParentHash.extra.created_at).to.not.equal(undefined);
      expect(txParentHash.extra.skip_verif).to.equal(undefined);
    });

    it('fail with missing timestamp', () => {
      delete txBody.timestamp;
      tx2 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx2, null);
    });

    it('fail with missing nonce', () => {
      delete txBody.nonce;
      const tx2 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx2, null);
    });

    it('fail with missing operation', () => {
      delete txBody.operation;
      const tx2 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx2, null);
    });
  });

  describe('getTransaction', () => {
    it('construction', () => {
      expect(txForNode).to.not.equal(null);
      expect(txForNode.tx_body.operation.type).to.equal(txBodyForNode.operation.type);
      expect(txForNode.tx_body.operation.ref).to.equal(txBodyForNode.operation.ref);
      expect(txForNode.tx_body.operation.value).to.equal(txBodyForNode.operation.value);
      expect(txForNode.hash).to.equal(
          '0x' + ainUtil.hashTransaction(txForNode.tx_body).toString('hex'));
      expect(txForNode.address).to.equal(node.account.address);
    });

    it('assigns nonces correctly', () => {
      let tx2;
      let currentNonce;
      for (currentNonce = node.nonce - 1; currentNonce < 50; currentNonce++) {
        delete txBodyForNode.nonce;
        tx2 = getTransaction(node, txBodyForNode);
      }
      expect(tx2).to.not.equal(null);
      expect(tx2.tx_body.nonce).to.equal(currentNonce);
    });
  });

  describe('verifyTransaction', () => {
    it('succeed to verify a valid transaction', () => {
      expect(Transaction.verifyTransaction(tx)).to.equal(true);
      expect(Transaction.verifyTransaction(txCustomAddress)).to.equal(true);
      expect(Transaction.verifyTransaction(txParentHash)).to.equal(true);
      expect(Transaction.verifyTransaction(txForNode)).to.equal(true);
    });

    it('failed to verify an invalid transaction with altered operation.type', () => {
      tx.tx_body.operation.type = 'SET_RULE';
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('failed to verify an invalid transaction with altered operation.ref', () => {
      tx.tx_body.operation.ref = 'path2';
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('failed to verify an invalid transaction with altered operation.value', () => {
      tx.tx_body.operation.value = 'val2';
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('failed to verify an invalid transaction with altered nonce', () => {
      tx.tx_body.nonce++;
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('failed to verify an invalid transaction with altered timestamp', () => {
      tx.tx_body.timestamp++;
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('failed to verify an invalid transaction with altered parent_tx_hash', () => {
      txParentHash.tx_body.parent_tx_hash = '';
      expect(Transaction.verifyTransaction(txParentHash)).to.equal(false);
    });
  });
});
