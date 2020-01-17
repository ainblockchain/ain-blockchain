const rimraf = require('rimraf');
const chai = require('chai');
const expect = chai.expect;
const TransactionPool = require('../tx-pool');
const Transaction = require('../tx-pool/transaction');
const Node = require('../node/');
const Blockchain = require('../blockchain/');
const {setDbForTesting, getTransaction} = require('./test-util')

describe('Transaction', () => {
  let txData, transaction, bc, tp, node;
  let txDataSkipVerif; let txSkipVerif;

  beforeEach(() => {
    bc = new Blockchain('test-blockchain');
    tp = new TransactionPool();
    node = new Node();
    setDbForTesting(bc, tp, node);
    txData = {
      operation: {
        type: 'SET_VALUE',
        ref: 'path',
        value: 'val'
      }
    };
    transaction = getTransaction(node, txData);
    txDataSkipVerif = {
      operation: {
        type: 'SET_VALUE',
        ref: 'path',
        value: 'val',
      },
      skip_verif: true,
      address: 'abcd'
    };
    txSkipVerif = getTransaction(node, txDataSkipVerif);
  });

  afterEach(() => {
    rimraf.sync(bc._blockchainDir());
  });

  it('assigns nonces correctly', () => {
    let t;
    let currentNonce;
    for (currentNonce = node.nonce - 1; currentNonce < 50; currentNonce++) {
      t = getTransaction(node, txData);
    }
    expect(t.nonce).to.equal(currentNonce);
  });


  it('validates a valid transaction', () => {
    expect(Transaction.verifyTransaction(transaction)).to.equal(true);
  });

  it('validates a valid transaction signed with keys of others', () => {
    const transaction = new Transaction({
      signature: '0x230beb11b8f20a8629bdc1cf45ba921222c72cfcc5066633c3edd9ff32d72d0ca61aaa70ecc92a12829028439b896c2a8b7b58754a01d37226336e3a0eae877251542df124dbaba39371024dc1fc65bdffc10e0e1982e530b3a9cb8d93a14f6d1b',
      transaction: {
        nonce: 0,
        timestamp: 1568798344000,
        operation: {
          type: 'SET_VALUE',
          ref: 'afan/test',
          value: 100,
        },
      },
    });
    expect(Transaction.verifyTransaction(transaction)).to.equal(true);

    const transaction_flattend = new Transaction({
      signature: '0x230beb11b8f20a8629bdc1cf45ba921222c72cfcc5066633c3edd9ff32d72d0ca61aaa70ecc92a12829028439b896c2a8b7b58754a01d37226336e3a0eae877251542df124dbaba39371024dc1fc65bdffc10e0e1982e530b3a9cb8d93a14f6d1b',
      nonce: 0,
      timestamp: 1568798344000,
      operation: {
        type: 'SET_VALUE',
        ref: 'afan/test',
        value: 100,
      },
    });
    expect(Transaction.verifyTransaction(transaction_flattend)).to.equal(true);

    const transaction_triggered = new Transaction({
      signature: '0x0a3770aeb2c758fef3491c9270b18157c3fc4401c411ca18170698ea02deea2edc29a1ae00ea83e64a43d5f3cac21e78713824f42a52f6555948a28ab4bf4f056caf3699871f4c72d0ac2072038dbaa1c6e19690504087afa3c69a0dba97693e1c',
      transaction: {
        nonce: 0,
        timestamp: 1568798344000,
        operation: {
          type: 'SET_VALUE',
          ref: 'afan/test',
          value: 100,
        },
        parent_tx_hash: '0xd96c7966aa6e6155af3b0ac69ec180a905958919566e86c88aef12c94d936b5e',
      },
    });
    expect(Transaction.verifyTransaction(transaction_triggered)).to.equal(true);
  });

  it('invalidates an invalid transaction', () => {
    transaction.operation.ref = 'different_path';
    expect(Transaction.verifyTransaction(transaction)).to.equal(false);
  });

  it('invalidates an invalid transaction signed with keys of others', () => {
    // transaction data has been changed
    const transaction = new Transaction({
      signature: '0x230beb11b8f20a8629bdc1cf45ba921222c72cfcc5066633c3edd9ff32d72d0ca61aaa70ecc92a12829028439b896c2a8b7b58754a01d37226336e3a0eae877251542df124dbaba39371024dc1fc65bdffc10e0e1982e530b3a9cb8d93a14f6d1b',
      transaction: {
        nonce: 0,
        timestamp: 1568798344000,
        operation: {
          type: 'SET_VALUE',
          ref: 'afan/test',
          value: 101,
        },
      },
    });
    expect(Transaction.verifyTransaction(transaction)).to.equal(false);

    const transaction_flattend = new Transaction({
      signature: '0x230beb11b8f20a8629bdc1cf45ba921222c72cfcc5066633c3edd9ff32d72d0ca61aaa70ecc92a12829028439b896c2a8b7b58754a01d37226336e3a0eae877251542df124dbaba39371024dc1fc65bdffc10e0e1982e530b3a9cb8d93a14f6d1b',
      nonce: 0,
      timestamp: 1568798344000,
      operation: {
        type: 'SET_VALUE',
        ref: 'afan/test',
        value: 101,
      },
    });
    expect(Transaction.verifyTransaction(transaction_flattend)).to.equal(false);

    const transaction_triggered = new Transaction({
      signature: '0x0a3770aeb2c758fef3491c9270b18157c3fc4401c411ca18170698ea02deea2edc29a1ae00ea83e64a43d5f3cac21e78713824f42a52f6555948a28ab4bf4f056caf3699871f4c72d0ac2072038dbaa1c6e19690504087afa3c69a0dba97693e1c',
      transaction: {
        nonce: 0,
        timestamp: 1568798344000,
        operation: {
          type: 'SET_VALUE',
          ref: 'afan/test',
          value: 101,
        },
        parent_tx_hash: '0xd96c7966aa6e6155af3b0ac69ec180a905958919566e86c88aef12c94d936b5e',
      },
    });
    expect(Transaction.verifyTransaction(transaction_triggered)).to.equal(false);
  });

  it('creates transaction with skip_verif and custom address', () => {
    expect(txSkipVerif.skip_verif).to.equal(true);
    expect(txSkipVerif.address).to.equal('abcd');
    expect(txSkipVerif.signature).to.equal('');
  });

  it('validates a transaction with skip_verif and custom address', () => {
    expect(Transaction.verifyTransaction(txSkipVerif)).to.equal(true);
  });
});
