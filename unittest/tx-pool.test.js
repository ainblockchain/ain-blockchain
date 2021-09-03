const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const shuffleSeed = require('shuffle-seed');
const CommonUtil = require('../common/common-util');
const {Block} = require('../blockchain/block');
const BlockchainNode = require('../node');
const {setNodeForTesting, getTransaction, txsToDummyReceipts} = require('./test-util');
const TransactionPool = require('../tx-pool');
const {
  BANDWIDTH_BUDGET_PER_BLOCK,
  SERVICE_BANDWIDTH_BUDGET_PER_BLOCK,
  APPS_BANDWIDTH_BUDGET_PER_BLOCK,
  FREE_BANDWIDTH_BUDGET_PER_BLOCK,
  TransactionStates,
} = require('../common/constants');

describe('TransactionPool', async () => {
  let node, transaction;

  beforeEach(async () => {
    node = new BlockchainNode();
    setNodeForTesting(node);
    transaction = getTransaction(node, {
      operation: {
        type: 'SET_VALUE',
        ref: 'REF',
        value: 'VALUE'
      },
      nonce: node.getNonce(),
      gas_price: 1
    });
    node.tp.addTransaction(transaction);
    await CommonUtil.sleep(1);
  });

  describe('Transaction addition', () => {
    let initialNonce = node.getNonce();
    let txToAdd;

    beforeEach(async () => {
      txToAdd = getTransaction(node, {
        operation: {
          type: 'SET_VALUE',
          ref: 'REF',
          value: 'VALUE'
        },
        nonce: initialNonce++,
        gas_price: 1
      });
    });

    it('add a pending transaction', () => {
      node.tp.addTransaction(txToAdd);
      expect(node.tp.transactions[node.account.address].find((t) => t.hash === txToAdd.hash))
          .to.equal(txToAdd);
      const txInfo = node.getTransactionByHash(txToAdd.hash);
      expect(txInfo.state).to.equal(TransactionStates.PENDING);
    });

    it('add an executed transaction', () => {
      node.tp.addTransaction(txToAdd, true);

      expect(node.tp.transactions[node.account.address].find((t) => t.hash === txToAdd.hash))
          .to.equal(txToAdd);
      const txInfo = node.getTransactionByHash(txToAdd.hash);
      expect(txInfo.state).to.equal(TransactionStates.EXECUTED);
    });
  });

  describe('Transaction ordering', async () => {
    let node2; let node3; let node4;

    beforeEach(async () => {
      let initialNonce = node.getNonce();
      for (let i = 0; i < 10; i++) {
        const tx = getTransaction(node, {
          operation: {
            type: 'SET_VALUE',
            ref: 'REF',
            value: 'VALUE',
          },
          nonce: initialNonce++,
          gas_price: 1
        });
        node.tp.addTransaction(tx);
        await CommonUtil.sleep(1);
      }
      // NOTE: Shuffle transactions and see if the transaction-pool can re-sort them according to
      // their proper ordering
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
        const curNode = nodes[j];
        let initialNonce = curNode.getNonce();
        for (let i = 0; i < 11; i++) {
          const tx = getTransaction(curNode, {
            operation: {
              type: 'SET_VALUE',
              ref: 'REF',
              value: 'VALUE',
            },
            nonce: initialNonce++,
            gas_price: 1
          });
          node.tp.addTransaction(tx);
          await CommonUtil.sleep(1);
        }
        // NOTE: Shuffle transactions and see if the transaction-pool can re-sort them according to
        // their proper ordering
        node.tp.transactions[nodes[j].account.address] =
            shuffleSeed.shuffle(node.tp.transactions[nodes[j].account.address]);
      }
    });

    describe('getValidTransactions()', () => {
      it('transactions are correctly ordered by nonces', () => {
        const validTransactions = node.tp.getValidTransactions();
        const sortedNonces1 = validTransactions.filter((tx) => {
          if (CommonUtil.areSameAddrs(tx.address, node.account.address)) {
            return tx;
          }
        }).map((tx) => {
          return tx.tx_body.nonce;
        });
        const sortedNonces2 = validTransactions.filter((tx) => {
          if (CommonUtil.areSameAddrs(tx.address, node2.account.address)) {
            return tx;
          }
        }).map((tx) => {
          return tx.tx_body.nonce;
        });
        const sortedNonces3 = validTransactions.filter((tx) => {
          if (CommonUtil.areSameAddrs(tx.address, node3.account.address)) {
            return tx;
          }
        }).map((tx) => {
          return tx.tx_body.nonce;
        });
        const sortedNonces4 = validTransactions.filter((tx) => {
          if (CommonUtil.areSameAddrs(tx.address, node4.account.address)) {
            return tx;
          }
        }).map((tx) => {
          return tx.tx_body.nonce;
        });
        assert.deepEqual(sortedNonces1, [...Array(11).keys()]);
        assert.deepEqual(sortedNonces2, [...Array(11).keys()]);
        assert.deepEqual(sortedNonces3, [...Array(11).keys()]);
        assert.deepEqual(sortedNonces4, [...Array(11).keys()]);
      });
    });

    describe('mergeTwoSortedArrays()', () => {
      it('with service txs', () => {
        assert.deepEqual(TransactionPool.mergeTwoSortedArrays([], []), []);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [], 
            [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}]
          ),
          [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}],
            [{tx_body: {timestamp: 2, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}}]
          ),
          [
            {tx_body: {timestamp: 2, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [{tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}}],
            [{tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [{tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}],
            [{tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}}]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [
              {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
              {tx_body: {timestamp: 2, gas_price: 3}, extra: {gas: {bandwidth: {service: 1}}}}
            ],
            [{tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 3}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [
              {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
              {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
            ],
            [{tx_body: {timestamp: 3, gas_price: 3}, extra: {gas: {bandwidth: {service: 1}}}}]
          ),
          [
            {tx_body: {timestamp: 3, gas_price: 3}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
          ]);
      });

      it('with app txs', () => {
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [], 
            [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}]
          ),
          [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
            [{tx_body: {timestamp: 2, gas_price: 2}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 2}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [{tx_body: {timestamp: 2, gas_price: 2}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
            [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 2}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [
              {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
              {tx_body: {timestamp: 3, gas_price: 2}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
            ], 
            [{tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 3, gas_price: 2}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
      });

      it('with service & app txs', () => {
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [{tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
            [{tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}]
          ),
          [
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [
              {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
              {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
            ],
            [{tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}}]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [
              {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
              {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
            ],
            [{tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}}]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeTwoSortedArrays(
            [
              {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
              {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
            ],
            [{tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1, app: {app1: 1}}}}}]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 2}, extra: {gas: {bandwidth: {service: 1, app: {app1: 1}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
      });
    });

    describe('mergeMultipleSortedArrays()', () => {
      it('empty arrays', () => {
        assert.deepEqual(TransactionPool.mergeMultipleSortedArrays([]), []);
        assert.deepEqual(TransactionPool.mergeMultipleSortedArrays([[], []]), []);
        assert.deepEqual(
          TransactionPool.mergeMultipleSortedArrays(
            [
              [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}],
              []
            ]
          ),
          [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}]);
      });

      it('with service txs', () => {
        assert.deepEqual(
          TransactionPool.mergeMultipleSortedArrays(
            [
                [{tx_body: {timestamp: 1, gas_price: 3}, extra: {gas: {bandwidth: {service: 1}}}}],
                [{tx_body: {timestamp: 2, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}}],
                [{tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}]
            ]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 3}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
          ]);
      });

      it('with app txs', () => {
        assert.deepEqual(
          TransactionPool.mergeMultipleSortedArrays(
            [
              [{tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [{tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}]
            ]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeMultipleSortedArrays(
            [
              [{tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [
                {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
              ],
              [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}]
            ]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeMultipleSortedArrays(
            [
              [{tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [{tx_body: {timestamp: 5, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [
                {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
              ]
            ]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 5, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeMultipleSortedArrays(
            [
              [{tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [{tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [
                {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
              ]
            ]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeMultipleSortedArrays(
            [
              [{tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [
                {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 5, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
              ],
              [
                {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
              ]
            ]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 5, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
      });

      it('with service & app txs', () => {
        assert.deepEqual(
          TransactionPool.mergeMultipleSortedArrays(
            [
              [{tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [
                {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 5, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}
              ],
              [
                {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 6, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
              ]
            ]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 5, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 6, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
        assert.deepEqual(
          TransactionPool.mergeMultipleSortedArrays(
            [
              [{tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}],
              [
                {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
                {tx_body: {timestamp: 6, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
              ],
              [
                {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
                {tx_body: {timestamp: 4, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
                {tx_body: {timestamp: 5, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
              ]
            ]
          ),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 4, gas_price: 2}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 4, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 3, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 5, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}},
            {tx_body: {timestamp: 6, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: 1}}}}}
          ]);
      });
    });
  });

  describe('Transaction selection & bandwidth budgets', () => {
    describe('performBandwidthChecks()', () => {
      it('empty array', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([], node.db),
          []
        );
      });

      it('within BANDWIDTH_BUDGET_PER_BLOCK', () => {
        node.db.setValuesForTesting(`/staking/app1/balance_total`, 1); // 100%
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: APPS_BANDWIDTH_BUDGET_PER_BLOCK}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}}}}
          ], node.db),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: APPS_BANDWIDTH_BUDGET_PER_BLOCK}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}}}}
          ]
        );
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK - 1}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: APPS_BANDWIDTH_BUDGET_PER_BLOCK}}}}}
          ], node.db),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK - 1}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: APPS_BANDWIDTH_BUDGET_PER_BLOCK}}}}}
          ]
        );
      });

      it('cannot exceed BANDWIDTH_BUDGET_PER_BLOCK', () => {
        node.db.setValuesForTesting(`/staking/app1/balance_total`, 1); // 100%
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: BANDWIDTH_BUDGET_PER_BLOCK + 1}}}}
          ], node.db),
          []
        );
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: BANDWIDTH_BUDGET_PER_BLOCK}}}}
          ], node.db),
          [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}]
        );
      });

      it('within SERVICE_BANDWIDTH_BUDGET_PER_BLOCK', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}}}}
          ], node.db),
          [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}}}}]
        );
      });

      it('cannot exceed SERVICE_BANDWIDTH_BUDGET_PER_BLOCK', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK + 1}}}}
          ], node.db),
          []
        );
      });

      it('cannot exceed allocated app bandwidth budget when service bandwidth == SERVICE_BANDWIDTH_BUDGET_PER_BLOCK', () => {
        node.db.setValuesForTesting(`/staking/app1/balance_total`, 10); // 50%
        node.db.setValuesForTesting(`/staking/app2/balance_total`, 10); // 50%
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: APPS_BANDWIDTH_BUDGET_PER_BLOCK / 2}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app2: APPS_BANDWIDTH_BUDGET_PER_BLOCK / 2}}}}}
          ], node.db),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: APPS_BANDWIDTH_BUDGET_PER_BLOCK / 2}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app2: APPS_BANDWIDTH_BUDGET_PER_BLOCK / 2}}}}}
          ]
        );
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: (APPS_BANDWIDTH_BUDGET_PER_BLOCK / 2) + 1}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app2: APPS_BANDWIDTH_BUDGET_PER_BLOCK / 2}}}}}
          ], node.db),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app2: APPS_BANDWIDTH_BUDGET_PER_BLOCK / 2}}}}}
          ]
        );
      });

      it('within 10% free tier for bandwidth budget', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: FREE_BANDWIDTH_BUDGET_PER_BLOCK}}}}}
          ], node.db),
          [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: FREE_BANDWIDTH_BUDGET_PER_BLOCK}}}}}]
        );
      });

      it('cannot exceed 10% free tier for bandwidth budget', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: FREE_BANDWIDTH_BUDGET_PER_BLOCK + 1}}}}}
          ], node.db),
          []
        );
      });

      it('correctly discards higher nonced txs', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1, nonce: 0}, address: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 1, gas_price: 1, nonce: 1}, address: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', extra: {gas: {bandwidth: {service: SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}}}},
            {tx_body: {timestamp: 1, gas_price: 1, nonce: 2}, address: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', extra: {gas: {bandwidth: {service: 1}}}}
          ], node.db),
          [{tx_body: {timestamp: 1, gas_price: 1, nonce: 0}, address: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', extra: {gas: {bandwidth: {service: 1}}}}]
        );
      });
    });
  });

  describe('Transaction pool clean-up', () => {
    it('cleanUpForNewBlock()', () => {
      const number = 1;
      const lastBlock = Block.genesis();
      const transactions = node1.tp.getValidTransactions();
      const receipts = txsToDummyReceipts(transactions);
      const block = Block.create(
          lastBlock.hash, [], transactions, receipts, number, lastBlock.epoch + 1, '',
          node.account.address, []);
      const newTransactions = {};
      newTransactions[node.account.address] = [];
      let initialNonce = node.getNonce();
      for (let i = 0; i < 10; i++) {
        newTransactions[node.account.address].push(getTransaction(node, {
          operation: {
            type: 'SET_VALUE',
            ref: 'REF',
            value: 'VALUE',
          },
          nonce: initialNonce++,
          gas_price: 1
        }));
        node.tp.addTransaction(newTransactions[node.account.address][i]);
      }
      node.tp.cleanUpForNewBlock(block);
      assert.deepEqual(newTransactions, node.tp.transactions);
    });
  });
});
