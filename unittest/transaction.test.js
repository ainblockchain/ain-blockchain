const rimraf = require('rimraf');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const {
  CHAINS_DIR,
  FeatureFlags,
} = require('../common/constants');
const Transaction = require('../tx-pool/transaction');
const BlockchainNode = require('../node/');
const { setNodeForTesting, getTransaction } = require('./test-util');
const ChainUtil = require('../common/chain-util');
const { msleep } = require('sleep');

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
    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    txBody = {
      operation: {
        type: 'SET_VALUE',
        ref: 'path',
        value: 'val',
      },
      timestamp: 1568798344000,
      nonce: 10,
      gas_price: 1
    };
    tx = Transaction.fromTxBody(txBody, node.account.private_key);

    txBodyCustomAddress = {
      operation: {
        type: 'SET_VALUE',
        ref: 'path',
        value: 'val',
      },
      timestamp: 1568798344000,
      nonce: 10,
      address: 'abcd',
      gas_price: 1
    };
    txCustomAddress = Transaction.fromTxBody(txBodyCustomAddress, node.account.private_key);

    txBodyParentHash = {
      operation: {
        type: 'SET_VALUE',
        ref: 'path',
        value: 'val',
      },
      timestamp: 1568798344000,
      nonce: 10,
      gas_price: 1,
      parent_tx_hash: '0xd96c7966aa6e6155af3b0ac69ec180a905958919566e86c88aef12c94d936b5e',
    };
    txParentHash = Transaction.fromTxBody(txBodyParentHash, node.account.private_key);

    txBodyForNode = {
      operation: {
        type: 'SET_VALUE',
        ref: 'test/comcom',
        value: 'val'
      },
      gas_price: 1
    };
    txForNode = getTransaction(node, txBodyForNode);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe('fromTxBody', () => {
    it('succeed', () => {
      expect(tx).to.not.equal(null);
      expect(tx.tx_body.nonce).to.equal(txBody.nonce);
      expect(tx.tx_body.timestamp).to.equal(txBody.timestamp);
      expect(tx.hash).to.equal(ChainUtil.hashTxBody(txBody));
      expect(tx.address).to.equal(node.account.address);
      expect(tx.extra.created_at).to.not.equal(undefined);
      expect(tx.extra.skip_verif).to.equal(undefined);

      expect(txParentHash).to.not.equal(null);
      expect(txParentHash.tx_body.parent_tx_hash).to.equal(txBodyParentHash.parent_tx_hash);
      expect(txParentHash.hash).to.equal(ChainUtil.hashTxBody(txBodyParentHash));
      expect(txParentHash.address).to.equal(node.account.address);
      expect(txParentHash.extra.created_at).to.not.equal(undefined);
      expect(txParentHash.extra.skip_verif).to.equal(undefined);
    });

    it('fail with custom address', () => {
      delete txBody.operation;
      const tx2 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx2, null);
    });

    it('fail with missing operation', () => {
      delete txBody.operation;
      const tx2 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx2, null);
    });

    it('fail with missing timestamp', () => {
      delete txBody.timestamp;
      const tx2 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx2, null);
    });

    it('fail with missing nonce', () => {
      delete txBody.nonce;
      const tx2 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx2, null);
    });

    it('fail with missing gas_price', () => {
      delete txBody.gas_price;
      const tx2 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx2, null);
    });

    it('fail with non-positive gas_price', () => {
      txBody.gas_price = 0;
      const tx2 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx2, null);

      txBody.gas_price = -1;
      const tx3 = Transaction.fromTxBody(txBody, node.account.private_key);
      assert.deepEqual(tx3, null);
    });
  });

  describe('isExecutable / toExecutable / toJsObject', () => {
    it('isExecutable', () => {
      expect(Transaction.isExecutable(null)).to.equal(false);
      expect(Transaction.isExecutable(txBody)).to.equal(false);
      expect(Transaction.isExecutable(tx)).to.equal(true);
      expect(Transaction.isExecutable(Transaction.toJsObject(tx))).to.equal(false);
      expect(Transaction.isExecutable(
          Transaction.toExecutable(Transaction.toJsObject(tx)))).to.equal(true);
    });

    it('toJsObject', () => {
      const jsObjectInput = Transaction.toJsObject(tx);
      const jsObjectOutput = Transaction.toJsObject(Transaction.toExecutable(jsObjectInput));
      assert.deepEqual(jsObjectOutput, jsObjectInput);
    });

    it('toExecutable', () => {
      const executable = Transaction.toExecutable(Transaction.toJsObject(tx));
      executable.extra.created_at = 'erased';
      tx.extra.created_at = 'erased';
      assert.deepEqual(executable, tx);
    });

    it('setExecutedAt', () => {
      const executable = Transaction.toExecutable(Transaction.toJsObject(tx));
      assert.deepEqual(executable.extra.executed_at, null);
      executable.setExecutedAt(123456789);
      assert.deepEqual(executable.extra.executed_at, 123456789);
    });
  });

  describe('getTransaction', () => {
    it('construction', () => {
      expect(txForNode).to.not.equal(null);
      expect(txForNode.tx_body.operation.type).to.equal(txBodyForNode.operation.type);
      expect(txForNode.tx_body.operation.ref).to.equal(txBodyForNode.operation.ref);
      expect(txForNode.tx_body.operation.value).to.equal(txBodyForNode.operation.value);
      expect(txForNode.hash).to.equal(ChainUtil.hashTxBody(txForNode.tx_body));
      expect(txForNode.address).to.equal(node.account.address);
    });

    it('assigns nonces correctly', () => {
      let tx2;
      let currentNonce;
      for (currentNonce = node.nonce - 1; currentNonce < 50; currentNonce++) {
        delete txBodyForNode.nonce;
        tx2 = getTransaction(node, txBodyForNode);
        node.db.executeTransaction(tx2);
        msleep(1);
      }
      expect(tx2).to.not.equal(null);
      expect(tx2.tx_body.nonce).to.equal(currentNonce);
    });
  });

  describe('verifyTransaction', () => {
    it('succeed to verify a valid transaction', () => {
      expect(Transaction.verifyTransaction(tx)).to.equal(true);
      expect(Transaction.verifyTransaction(txParentHash)).to.equal(true);
      expect(Transaction.verifyTransaction(txForNode)).to.equal(true);
    });

    it('fail to verify a transaction with custom address', () => {
      expect(Transaction.verifyTransaction(txCustomAddress)).to.equal(false);
    });

    it('fail to verify an invalid transaction with altered operation.type', () => {
      tx.tx_body.operation.type = 'SET_RULE';
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('fail to verify an invalid transaction with altered operation.ref', () => {
      tx.tx_body.operation.ref = 'path2';
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('fail to verify an invalid transaction with altered operation.value', () => {
      tx.tx_body.operation.value = 'val2';
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('fail to verify an invalid transaction with altered nonce', () => {
      tx.tx_body.nonce++;
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('fail to verify an invalid transaction with altered timestamp', () => {
      tx.tx_body.timestamp++;
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('fail to verify an invalid transaction with altered gas_price', () => {
      tx.tx_body.gas_price = 0;
      expect(Transaction.verifyTransaction(tx)).to.equal(false);
    });

    it('fail to verify an invalid transaction with altered parent_tx_hash', () => {
      txParentHash.tx_body.parent_tx_hash = '';
      expect(Transaction.verifyTransaction(txParentHash)).to.equal(false);
    });
  });
});
