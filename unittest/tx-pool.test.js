const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const shuffleSeed = require('shuffle-seed');
const ainUtil = require('@ainblockchain/ain-util');
const Blockchain = require('../blockchain');
const {Block} = require('../blockchain/block');
const BlockchainNode = require('../node');
const {setNodeForTesting, getTransaction} = require('./test-util')

describe('TransactionPool', () => {
  let node, transaction;

  beforeEach(() => {
    node = new BlockchainNode();
    setNodeForTesting(node);

    transaction = getTransaction(node, {
      operation: {
        type: 'SET_VALUE',
        ref: 'REF',
        value:
        'VALUE'
      }
    });
    node.tp.addTransaction(transaction);
  });

  it('adds a transaction to the pool', () => {
    expect(node.tp.transactions[node.account.address].find((t) => t.hash === transaction.hash))
        .to.equal(transaction);
  });


  describe('sorting transactions by nonces', () => {
    let node2; let node3; let node4;

    beforeEach(() => {
      for (let i = 0; i < 10; i++) {
        t = getTransaction(node, {
          operation: {
            type: 'SET_VALUE',
            ref: 'REF',
            value: 'VALUE',
          }
        });
        node.tp.addTransaction(t);
      }
      node.tp.transactions[node.account.address] =
          shuffleSeed.shuffle(node.tp.transactions[node.account.address]);

      node2 = new BlockchainNode();
      setNodeForTesting(node2, 1);
      node3 = new BlockchainNode();
      setNodeForTesting(node3, 2);
      node4 = new BlockchainNode();
      setNodeForTesting(node4, 3);
      const nodes = [node2, node3, node4];
      for (let j = 0; j < nodes.length; j++) {
        for (let i = 0; i < 11; i++) {
          t = getTransaction(nodes[j], {
            operation: {
              type: 'SET_VALUE',
              ref: 'REF',
              value: 'VALUE',
            }
          }, true);
          node.tp.addTransaction(t);
        }
        node.tp.transactions[nodes[j].account.address] =
            shuffleSeed.shuffle(node.tp.transactions[nodes[j].account.address]);
      }

      // Shuffle transactions and see if the transaction-pool can re-sort them according to them according to their proper ordering
    });

    it('transactions are correctly numbered', () => {
      const sortedNonces1 = node.tp.getValidTransactions().filter((transaction) => {
        if (ainUtil.areSameAddresses(transaction.address, node.account.address)) {
          return transaction;
        }
      }).map((transaction) => {
        return transaction.nonce;
      });
      const sortedNonces2 = node.tp.getValidTransactions().filter((transaction) => {
        if (ainUtil.areSameAddresses(transaction.address, node2.account.address)) {
          return transaction;
        }
      }).map((transaction) => {
        return transaction.nonce;
      });
      const sortedNonces3 = node.tp.getValidTransactions().filter((transaction) => {
        if (ainUtil.areSameAddresses(transaction.address, node3.account.address)) {
          return transaction;
        }
      }).map((transaction) => {
        return transaction.nonce;
      });
      const sortedNonces4 = node.tp.getValidTransactions().filter((transaction) => {
        if (ainUtil.areSameAddresses(transaction.address, node4.account.address)) {
          return transaction;
        }
      }).map((transaction) => {
        return transaction.nonce;
      });
      assert.deepEqual(sortedNonces1, [...Array(11).keys()]);
      assert.deepEqual(sortedNonces2, [...Array(11).keys()]);
      assert.deepEqual(sortedNonces3, [...Array(11).keys()]);
      assert.deepEqual(sortedNonces4, [...Array(11).keys()]);
    });

    it('clean up for new block', () => {
      const number = 1;
      const lastBlock = Block.genesis();
      const block = Block.createBlock(lastBlock.hash, [], node.tp.getValidTransactions(),
          number, lastBlock.epoch + 1, '', node.account.address, []);
      const newTransactions = {};
      newTransactions[node.account.address] = [];
      for (let i = 0; i < 10; i++) {
        newTransactions[node.account.address].push(getTransaction(node, {
          operation: {
            type: 'SET_VALUE',
            ref: 'REF',
            value: 'VALUE',
          }
        }));
        node.tp.addTransaction(newTransactions[node.account.address][i]);
      }
      node.tp.cleanUpForNewBlock(block);
      assert.deepEqual(newTransactions, node.tp.transactions);
    });
  });
});
