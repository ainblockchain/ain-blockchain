const TransactionPool = require('../../tx-pool');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const shuffleSeed = require('shuffle-seed');
const CommonUtil = require('../../common/common-util');
const {Block} = require('../../blockchain/block');
const BlockchainNode = require('../../node');
const {
  TransactionStates,
  BlockchainParams,
  NodeConfigs,
} = require('../../common/constants');
const {
  setNodeForTesting,
  getTransaction,
  txsToDummyReceipts,
  eraseTxCreatedAt,
} = require('../test-util');

describe('TransactionPool', () => {
  let node, transaction, bandwidthBudgets;
  const bandwidthBudgetPerBlock = BlockchainParams.resource.bandwidth_budget_per_block;

  beforeEach(async () => {
    node = new BlockchainNode();
    await setNodeForTesting(node);
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
    bandwidthBudgets = node.tp.getBandwidthBudgets();
    await CommonUtil.sleep(1);
  });

  describe('Transaction addition', () => {
    let txToAdd;

    beforeEach(async () => {
      let initialNonce = node.getNonce();
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
      const addedTx = node.tp.transactions.get(node.account.address).find((t) => t.hash === txToAdd.hash);
      assert.deepEqual(eraseTxCreatedAt(addedTx), eraseTxCreatedAt(txToAdd));
      const txInfo = node.getTransactionByHash(txToAdd.hash);
      expect(txInfo.state).to.equal(TransactionStates.PENDING);
    });

    it('add an executed transaction', () => {
      const execResult = { code: 0 };
      node.tp.addTransaction(txToAdd, execResult, true);
      const addedTx = node.tp.transactions.get(node.account.address).find((t) => t.hash === txToAdd.hash);
      assert.deepEqual(eraseTxCreatedAt(addedTx), eraseTxCreatedAt(txToAdd));
      const txInfo = node.getTransactionByHash(txToAdd.hash);
      expect(txInfo.state).to.equal(TransactionStates.EXECUTED);
      assert.deepEqual(txInfo.exec_result, execResult);
    });
  });

  describe('Transaction pool counting', async () => {
    const currentTime = Date.now();

    beforeEach(async () => {
      node = new BlockchainNode();
      await setNodeForTesting(node);
    })

    it('Add paid transactions and free transactions', async () => {
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
        tx.extra.created_at = currentTime;
        node.tp.addTransaction(tx);
        await CommonUtil.sleep(1);
      }
      for (let i = 0; i < 5; i++) {
        const tx = getTransaction(node, {
          operation: {
            type: 'SET_VALUE',
            ref: 'REF',
            value: 'VALUE',
          },
          nonce: initialNonce++,
          gas_price: 0
        });
        tx.extra.created_at = currentTime;
        node.tp.addTransaction(tx);
        await CommonUtil.sleep(1);
      }
      assert.equal(node.tp.getPoolSize(), 15);
      assert.equal(node.tp.getFreePoolSize(), 5);
    })

    it('Remove invalid transactions', async () => {
      let initialNonce = node.getNonce();
      const invalidTxs = [];
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
        tx.extra.created_at = currentTime;
        if (i < 2) {
          invalidTxs.push(tx);
        }
        node.tp.addTransaction(tx);
        await CommonUtil.sleep(1);
      }
      for (let i = 0; i < 5; i++) {
        const tx = getTransaction(node, {
          operation: {
            type: 'SET_VALUE',
            ref: 'REF',
            value: 'VALUE',
          },
          nonce: initialNonce++,
          gas_price: 0
        });
        tx.extra.created_at = currentTime;
        if (i < 3) {
          invalidTxs.push(tx);
        }
        node.tp.addTransaction(tx);
        await CommonUtil.sleep(1);
      }
      assert.equal(node.tp.getPoolSize(), 15);
      assert.equal(node.tp.getFreePoolSize(), 5);
      node.tp.removeInvalidTxsFromPool(invalidTxs);
      assert.equal(node.tp.getPoolSize(), 10);
      assert.equal(node.tp.getFreePoolSize(), 2);
    })

    it('Remove timed out transactions', async () => {
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
        tx.extra.created_at = currentTime + i;
        node.tp.addTransaction(tx);
        await CommonUtil.sleep(1);
      }
      for (let i = 0; i < 5; i++) {
        const tx = getTransaction(node, {
          operation: {
            type: 'SET_VALUE',
            ref: 'REF',
            value: 'VALUE',
          },
          nonce: initialNonce++,
          gas_price: 0
        });
        tx.extra.created_at = currentTime + i;
        node.tp.addTransaction(tx);
        await CommonUtil.sleep(1);
      }
      assert.equal(node.tp.getPoolSize(), 15);
      assert.equal(node.tp.getFreePoolSize(), 5);
      node.tp.removeTimedOutTxsFromPool(currentTime + 2 + NodeConfigs.TX_POOL_TIMEOUT_MS);
      assert.equal(node.tp.getPoolSize(), 9);
      assert.equal(node.tp.getFreePoolSize(), 2);
    })
  })

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
      node.tp.transactions.set(
          node.account.address,
          shuffleSeed.shuffle(node.tp.transactions.get(node.account.address)));

      node2 = new BlockchainNode();
      await setNodeForTesting(node2, 1);
      node3 = new BlockchainNode();
      await setNodeForTesting(node3, 2);
      node4 = new BlockchainNode();
      await setNodeForTesting(node4, 3);
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
        node.tp.transactions.set(
            nodes[j].account.address,
            shuffleSeed.shuffle(node.tp.transactions.get(nodes[j].account.address)));
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
        assert.deepEqual(sortedNonces1, [...Array(10).keys()]);
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

      it('within ', () => {
        node.db.setValuesForTesting(`/staking/app1/balance_total`, 1); // 100%
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: bandwidthBudgets.appsBandwidthBudgetPerBlock}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock}}}}
          ], node.db),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: bandwidthBudgets.appsBandwidthBudgetPerBlock}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock}}}}
          ]
        );
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock - 1}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: bandwidthBudgets.appsBandwidthBudgetPerBlock}}}}}
          ], node.db),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock - 1}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: bandwidthBudgets.appsBandwidthBudgetPerBlock}}}}}
          ]
        );
      });

      it('cannot exceed bandwidth_budget_per_block', () => {
        node.db.setValuesForTesting(`/staking/app1/balance_total`, 1); // 100%
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgetPerBlock + 1}}}}
          ], node.db),
          []
        );
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 2, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgetPerBlock}}}}
          ], node.db),
          [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: 1}}}}]
        );
      });

      it('within serviceBandwidthBudgetPerBlock', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock}}}}
          ], node.db),
          [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock}}}}]
        );
      });

      it('cannot exceed serviceBandwidthBudgetPerBlock', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock + 1}}}}
          ], node.db),
          []
        );
      });

      it('cannot exceed allocated app bandwidth budget when service bandwidth == serviceBandwidthBudgetPerBlock', () => {
        node.db.setValuesForTesting(`/staking/app1/balance_total`, 10); // 50%
        node.db.setValuesForTesting(`/staking/app2/balance_total`, 10); // 50%
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: bandwidthBudgets.appsBandwidthBudgetPerBlock / 2}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app2: bandwidthBudgets.appsBandwidthBudgetPerBlock / 2}}}}}
          ], node.db),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: bandwidthBudgets.appsBandwidthBudgetPerBlock / 2}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app2: bandwidthBudgets.appsBandwidthBudgetPerBlock / 2}}}}}
          ]
        );
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: (bandwidthBudgets.appsBandwidthBudgetPerBlock / 2) + 1}}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app2: bandwidthBudgets.appsBandwidthBudgetPerBlock / 2}}}}}
          ], node.db),
          [
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock}}}},
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app2: bandwidthBudgets.appsBandwidthBudgetPerBlock / 2}}}}}
          ]
        );
      });

      it('within 10% free tier for bandwidth budget', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: bandwidthBudgets.freeBandwidthBudgetPerBlock}}}}}
          ], node.db),
          [{tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: bandwidthBudgets.freeBandwidthBudgetPerBlock}}}}}]
        );
      });

      it('cannot exceed 10% free tier for bandwidth budget', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1}, extra: {gas: {bandwidth: {app: {app1: bandwidthBudgets.freeBandwidthBudgetPerBlock + 1}}}}}
          ], node.db),
          []
        );
      });

      it('correctly discards higher nonced txs', () => {
        assert.deepEqual(
          node.tp.performBandwidthChecks([
            {tx_body: {timestamp: 1, gas_price: 1, nonce: 0}, address: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', extra: {gas: {bandwidth: {service: 1}}}},
            {tx_body: {timestamp: 1, gas_price: 1, nonce: 1}, address: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', extra: {gas: {bandwidth: {service: bandwidthBudgets.serviceBandwidthBudgetPerBlock}}}},
            {tx_body: {timestamp: 1, gas_price: 1, nonce: 2}, address: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', extra: {gas: {bandwidth: {service: 1}}}}
          ], node.db),
          [{tx_body: {timestamp: 1, gas_price: 1, nonce: 0}, address: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1', extra: {gas: {bandwidth: {service: 1}}}}]
        );
      });
    });
  });

  describe('Transaction pool clean-up', () => {
    let node2; let node3; let node4; let nodes;

    before(async () => {
      node2 = new BlockchainNode();
      await setNodeForTesting(node2, 1);
      node3 = new BlockchainNode();
      await setNodeForTesting(node3, 2);
      node4 = new BlockchainNode();
      await setNodeForTesting(node4, 3);
      nodes = [node2, node3, node4];
    });

    it('cleanUpForFinalizedBlock()', () => {
      const number = 1;
      const lastBlock = node.bc.genesisBlock;
      const transactions = node.tp.getValidTransactions();
      const receipts = txsToDummyReceipts(transactions);
      const block = Block.create(
          lastBlock.hash, [], {}, transactions, receipts, number, lastBlock.epoch + 1, '',
          node.account.address, {}, 0, 0);
      const newTransactions = {};
      newTransactions[node.account.address] = [];
      let initialNonce = node.getNonce() + 1;
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
      node.tp.cleanUpForFinalizedBlock(block);
      assert.deepEqual(newTransactions, Object.fromEntries(node.tp.transactions));
    });

    it('cleanUpConsensusTxs()', async () => {
      const lastBlock = node.bc.genesisBlock;
      const transactions = node.tp.getValidTransactions();
      const lastVotes = [];
      nodes.forEach((_node) => {
        const consensusTx = getTransaction(_node, {
          operation: {
            type: 'SET_VALUE',
            ref: `/consensus/number/0/0xblock_hash/vote/0xaddress`,
            value: {
              block_hash: '0xblock_hash',
              stake: 10000000,
              is_against: false,
              vote_nonce: 1639315169164
            },
          },
          nonce: -1,
        });
        node.tp.addTransaction(consensusTx);
        lastVotes.push(consensusTx);
      });
      const evidenceTx = getTransaction(node, {
        operation: {
          type: 'SET_VALUE',
          ref: `/consensus/number/0/0xblock_hash/vote/0xaddress`,
          value: {
            block_hash: '0xblock_hash',
            stake: 10000000,
            is_against: true,
            vote_nonce: 1639315169164
          },
        },
        nonce: -1,
      });
      node.tp.addTransaction(evidenceTx);
      const invalidProposal = getTransaction(node, {
        operation: {
          type: 'SET_VALUE',
          ref: `/consensus/number/0/propose`,
          value: {
            number: 0
          },
        },
        nonce: -1,
      });
      node.tp.addTransaction(invalidProposal);
      const evidence = {
        [node.account.address]: [{
          transactions: [invalidProposal],
          block: lastBlock,
          votes: [evidenceTx],
          offense_type: 'INVALID_PROPOSAL',
        }]
      }
      for (const tx of [...lastVotes, evidenceTx, invalidProposal]) {
        expect(node.tp.transactions.get(tx.address).includes(tx)).to.equal(true);
      }
      const receipts = txsToDummyReceipts(transactions);
      const block = Block.create(
          lastBlock.hash, lastVotes, evidence, transactions, receipts, 1, lastBlock.epoch + 1, '',
          node.account.address, {}, 0, 0);
      node.tp.cleanUpConsensusTxs(block);
      for (const tx of [...lastVotes, evidenceTx, invalidProposal]) {
        if (node.tp.transactions.has(tx.address)) {
          expect(node.tp.transactions.get(tx.address).includes(tx)).to.equal(false);
        }
      }
    });
  });
});
