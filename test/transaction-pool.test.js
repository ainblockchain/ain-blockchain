const path = require('path');
const fs = require("fs")
const ainUtil = require('@ainblockchain/ain-util');
const TransactionPool = require('../db/transaction-pool');
const Transaction = require('../db/transaction');
const Blockchain = require('../blockchain/');
const {Block} = require('../blockchain/block');
const DB = require('../db');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const shuffleSeed = require('shuffle-seed');

function setDbForTesting(db) {
  const ownersFile = path.resolve(__dirname, './data/owners_for_testing.json');
  if (!fs.existsSync(ownersFile)) {
    throw Error('Missing owners file: ' + ownersFile);
  }
  const owners = JSON.parse(fs.readFileSync(ownersFile));
  db.setOwnersForTesting("test", owners);
  const rulesFile = path.resolve(__dirname, './data/rules_for_testing.json');
  if (!fs.existsSync(rulesFile)) {
    throw Error('Missing rules file: ' + rulesFile);
  }
  const rules = JSON.parse(fs.readFileSync(rulesFile));
  db.setRulesForTesting("test", rules);
}

function getTransaction(db, txData) {
  txData.nonce = db.nonce;
  db.nonce++;
  return Transaction.newTransaction(db.account.private_key, txData);
}

describe('TransactionPool', () => {
  let tp; let db; let bc; let transaction;

  beforeEach(() => {
    tp = new TransactionPool();
    bc = new Blockchain('test-blockchain');
    db = new DB(bc);
    setDbForTesting(db);

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

      db2 = new DB(bc);
      setDbForTesting(db2);
      db3 = new DB(bc);
      setDbForTesting(db3);
      db4 = new DB(bc);
      setDbForTesting(db4);
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
