const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const shuffleSeed = require('shuffle-seed');
const ainUtil = require('@ainblockchain/ain-util');
const TransactionPool = require('../db/transaction-pool');
const Blockchain = require('../blockchain/');
const {Block} = require('../blockchain/block');
const DB = require('../db');
const {setDbForTesting, getTransaction} = require('./test-util')

describe('TransactionPool', () => {
  let tp; let db; let bc; let transaction;

  beforeEach(() => {
    bc = new Blockchain('test-blockchain');
    tp = new TransactionPool();
    db = DB.getDatabase(bc, tp);
    setDbForTesting(bc, tp, db, 0);

    transaction = getTransaction(db, {
      operation: {
        type: 'SET_VALUE',
        ref: 'REF',
        value:
        'VALUE'
      }
    });
    tp.addTransaction(transaction);
  });

  it('adds a transaction to the pool', () => {
    expect(tp.transactions[db.account.address].find((t) => t.hash === transaction.hash)).to.equal(transaction);
  });


  describe('sorting transactions by nonces', () => {
    let db2; let db3; let db4;

    beforeEach(() => {
      for (let i = 0; i < 10; i++) {
        t = getTransaction(db, {
          operation: {
            type: 'SET_VALUE',
            ref: 'REF',
            value: 'VALUE',
          }
        });
        tp.addTransaction(t);
      }
      tp.transactions[db.account.address] = shuffleSeed.shuffle(tp.transactions[db.account.address]);

      const bc2 = new Blockchain('test-blockchain2');
      db2 = DB.getDatabase(bc2, tp);
      setDbForTesting(bc2, tp, db2, 1);
      const bc3 = new Blockchain('test-blockchain3');
      db3 = DB.getDatabase(bc3, tp);
      setDbForTesting(bc3, tp, db3, 2);
      const bc4 = new Blockchain('test-blockchain4');
      db4 = DB.getDatabase(bc4, tp);
      setDbForTesting(bc4, tp, db4, 3);
      const dbs = [db2, db3, db4];
      for (let j = 0; j < dbs.length; j++) {
        for (let i = 0; i < 11; i++) {
          t = getTransaction(dbs[j], {
            operation: {
              type: 'SET_VALUE',
              ref: 'REF',
              value: 'VALUE',
            }
          }, true);
          tp.addTransaction(t);
        }
        tp.transactions[dbs[j].account.address] = shuffleSeed.shuffle(tp.transactions[dbs[j].account.address]);
      }

      // Shuffle transactions and see if the transaction-pool can re-sort them according to them according to their proper ordering
    });

    it('transactions are correctly numbered', () => {
      const sortedNonces1 = tp.validTransactions().filter((transaction) => {
        if (ainUtil.areSameAddresses(transaction.address, db.account.address)) return transaction;
      }).map((transaction) => {
        return transaction.nonce;
      });
      const sortedNonces2 = tp.validTransactions().filter((transaction) => {
        if (ainUtil.areSameAddresses(transaction.address, db2.account.address)) return transaction;
      }).map((transaction) => {
        return transaction.nonce;
      });
      const sortedNonces3 = tp.validTransactions().filter((transaction) => {
        if (ainUtil.areSameAddresses(transaction.address, db3.account.address)) return transaction;
      }).map((transaction) => {
        return transaction.nonce;
      });
      const sortedNonces4 = tp.validTransactions().filter((transaction) => {
        if (ainUtil.areSameAddresses(transaction.address, db4.account.address)) return transaction;
      }).map((transaction) => {
        return transaction.nonce;
      });
      assert.deepEqual(sortedNonces1, [...Array(11).keys()]);
      assert.deepEqual(sortedNonces2, [...Array(11).keys()]);
      assert.deepEqual(sortedNonces3, [...Array(11).keys()]);
      assert.deepEqual(sortedNonces4, [...Array(11).keys()]);
    });

    it('removes transactions included in block', () => {
      const number = 1;
      const lastBlock = Block.genesis();
      const block = Block.createBlock(lastBlock.hash, [], tp.validTransactions(),
          number, db.account.address, []);
      const newTransactions = {};
      newTransactions[db.account.address] = [];
      for (let i = 0; i < 10; i++) {
        newTransactions[db.account.address].push(getTransaction(db, {
          operation: {
            type: 'SET_VALUE',
            ref: 'REF',
            value: 'VALUE',
          }
        }));
        tp.addTransaction(newTransactions[db.account.address][i]);
      }
      tp.removeCommitedTransactions(block);
      assert.deepEqual(newTransactions, tp.transactions);
    });
  });
});
