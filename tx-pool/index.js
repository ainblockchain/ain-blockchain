/* eslint guard-for-in: "off" */
const logger = require('../logger')('TX_POOL');
const _ = require('lodash');
const {
  TRANSACTION_POOL_TIMEOUT_MS,
  TRANSACTION_TRACKER_TIMEOUT_MS,
  LIGHTWEIGHT,
  GenesisSharding,
  GenesisAccounts,
  ShardingProperties,
  TransactionStatus,
  WriteDbOperations,
  AccountProperties,
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const {
  sendGetRequest,
  signAndSendTx
} = require('../p2p/util');
const Transaction = require('./transaction');

const parentChainEndpoint = GenesisSharding[ShardingProperties.PARENT_CHAIN_POC] + '/json-rpc';

class TransactionPool {
  constructor(node) {
    this.node = node;
    // MUST IMPLEMENT WAY TO RESET NONCE WHEN TRANSACTION IS LOST IN NETWORK
    this.transactions = {};
    this.committedNonceTracker = {};
    this.pendingNonceTracker = {};
    this.transactionTracker = {};
    // Track transactions in remote blockchains (e.g. parent blockchain).
    this.remoteTransactionTracker = {};
    this.isChecking = false;
  }

  addTransaction(tx) {
    // Quick verification of transaction on entry
    // TODO(lia): pull verification out to the very front
    // (closer to the communication layers where the node first receives transactions)
    if (!LIGHTWEIGHT) {
      if (!Transaction.verifyTransaction(tx)) {
        logger.info('Invalid transaction');
        logger.debug(`NOT ADDING: ${JSON.stringify(tx)}`);
        return false;
      }
    }

    if (!(tx.address in this.transactions)) {
      this.transactions[tx.address] = [];
    }
    this.transactions[tx.address].push(tx);
    this.transactionTracker[tx.hash] = {
      status: TransactionStatus.POOL_STATUS,
      address: tx.address,
      index: this.transactions[tx.address].length - 1,
      timestamp: tx.tx_body.timestamp,
      is_finalized: false,
      finalized_at: -1,
      tracked_at: tx.extra.created_at,
    };
    if (tx.tx_body.nonce >= 0 &&
        (!(tx.address in this.pendingNonceTracker) ||
        tx.tx_body.nonce > this.pendingNonceTracker[tx.address])) {
      this.pendingNonceTracker[tx.address] = tx.tx_body.nonce;
    }
    logger.debug(`ADDING: ${JSON.stringify(tx)}`);
    return true;
  }

  isTimedOut(txTimestamp, lastBlockTimestamp, timeout) {
    if (lastBlockTimestamp < 0) {
      return false;
    }
    return lastBlockTimestamp >= txTimestamp + timeout;
  }

  isTimedOutFromPool(txTimestamp, lastBlockTimestamp) {
    return this.isTimedOut(txTimestamp, lastBlockTimestamp, TRANSACTION_POOL_TIMEOUT_MS);
  }

  isTimedOutFromTracker(txTimestamp, lastBlockTimestamp) {
    return this.isTimedOut(txTimestamp, lastBlockTimestamp, TRANSACTION_TRACKER_TIMEOUT_MS);
  }

  isNotEligibleTransaction(tx) {
    return ((tx.address in this.transactions) &&
        (this.transactions[tx.address].find((trans) => trans.hash === tx.hash) !== undefined)) ||
        (tx.tx_body.nonce >= 0 && tx.tx_body.nonce <= this.committedNonceTracker[tx.address]) ||
        (tx.tx_body.nonce < 0 && tx.hash in this.transactionTracker);
  }

  getValidTransactions(excludeBlockList) {
    let excludeTransactions = [];
    if (excludeBlockList && excludeBlockList.length) {
      excludeBlockList.forEach((block) => {
        excludeTransactions = excludeTransactions.concat(block.last_votes);
        excludeTransactions = excludeTransactions.concat(block.transactions);
      })
    }
    const unvalidatedTransactions = JSON.parse(JSON.stringify(this.transactions));
    // Transactions are first ordered by nonce in their individual lists by address
    for (const address in unvalidatedTransactions) {
      let tempFilteredTransactions = _.differenceWith(
          unvalidatedTransactions[address],
          excludeTransactions,
          (a, b) => {
            return a.hash === b.hash;
          }
      );
      tempFilteredTransactions = tempFilteredTransactions.filter((tx) => {
        const ref = _.get(tx, 'tx_body.operation.ref');
        const innerRef = tx.tx_body.operation.op_list && tx.tx_body.operation.op_list.length ?
            tx.tx_body.operation.op_list[0].ref : undefined;
        const type = _.get(tx, 'tx_body.operation.type');
        return (type !== WriteDbOperations.SET_VALUE && type !== WriteDbOperations.SET) ||
            (ref && !ref.startsWith('/consensus/number')) ||
            (innerRef && !innerRef.startsWith('/consensus/number'));
      });
      if (!tempFilteredTransactions.length) {
        delete unvalidatedTransactions[address];
      } else {
        unvalidatedTransactions[address] = tempFilteredTransactions;
        // Order by noncing if transactions are nonced, else by timestamp
        unvalidatedTransactions[address].sort((a, b) =>
            (a.tx_body.nonce < 0 || b.tx_body.nonce < 0) ?
                ((a.tx_body.timestamp > b.tx_body.timestamp) ?
                    1 : ((b.tx_body.timestamp > a.tx_body.timestamp) ? -1 : 0)) :
                (a.tx_body.nonce > b.tx_body.nonce) ?
                    1 : ((b.tx_body.nonce > a.tx_body.nonce) ? -1 : 0));
      }
    }
    // Secondly transactions are combined and ordered by timestamp, while still remaining
    // ordered noncing from the initial sort by nonce
    const orderedUnvalidatedTransactions = Object.values(unvalidatedTransactions);
    while (orderedUnvalidatedTransactions.length > 1) {
      const tempNonceTracker = JSON.parse(JSON.stringify(this.committedNonceTracker));
      const list1 = orderedUnvalidatedTransactions.shift();
      const list2 = orderedUnvalidatedTransactions.shift();
      const newList = [];
      let listToTakeValue;
      while (list1.length + list2.length > 0) {
        if ((list2.length === 0 ||
            (list1.length > 0 && list1[0].tx_body.timestamp <= list2[0].tx_body.timestamp))) {
          listToTakeValue = list1;
        } else {
          listToTakeValue = list2;
        }
        if (listToTakeValue[0].tx_body.nonce === tempNonceTracker[listToTakeValue[0].address] + 1) {
          tempNonceTracker[listToTakeValue[0].address] = listToTakeValue[0].tx_body.nonce;
          newList.push(listToTakeValue.shift());
        } else if (!(listToTakeValue[0].address in tempNonceTracker) &&
            listToTakeValue[0].tx_body.nonce === 0) {
          tempNonceTracker[listToTakeValue[0].address] = 0;
          newList.push(listToTakeValue.shift());
        } else if (listToTakeValue[0].tx_body.nonce < 0) {
          newList.push(listToTakeValue.shift());
        } else {
          const invalidNoncedTransaction = listToTakeValue.shift();
          logger.error(
              'Dropping transactions!: ' + JSON.stringify(invalidNoncedTransaction, null, 2));
          _.remove(this.transactions[invalidNoncedTransaction.address],
              (tx) => tx.hash === invalidNoncedTransaction.hash);
          delete this.transactionTracker[invalidNoncedTransaction.hash];
        }
      }

      orderedUnvalidatedTransactions.push(newList);
    }
    return orderedUnvalidatedTransactions.length > 0 ? orderedUnvalidatedTransactions[0] : [];
  }

  removeTimedOutTxsFromPool(blockTimestamp) {
    // Get timed-out transactions.
    const timedOutTxs = new Set();
    for (const address in this.transactions) {
      this.transactions[address].forEach((tx) => {
        if (this.isTimedOutFromPool(tx.extra.created_at, blockTimestamp)) {
          timedOutTxs.add(tx.hash);
        }
      });
    }
    // Remove transactions from the pool.
    for (const address in this.transactions) {
      this.transactions[address] = this.transactions[address].filter((tx) => {
        return !timedOutTxs.has(tx.hash);
      });
    }
    return timedOutTxs.size > 0;
  }

  removeTimedOutTxsFromTracker(blockTimestamp) {
    // Remove transactions from transactionTracker.
    let removed = false;
    for (const hash in this.transactionTracker) {
      const txData = this.transactionTracker[hash];
      if (this.isTimedOutFromTracker(txData.tracked_at, blockTimestamp)) {
        delete this.transactionTracker[hash];
        removed = true;
      }
    }
    return removed;
  }

  removeInvalidTxsFromPool(txs) {
    const addrToTxSet = {};
    txs.forEach((tx) => {
      const {address, hash} = tx;
      if (!addrToTxSet[address]) {
        addrToTxSet[address] = new Set();
      }
      addrToTxSet[address].add(hash);
      const tracked = this.transactionTracker[hash];
      if (tracked && tracked.status !== TransactionStatus.BLOCK_STATUS) {
        this.transactionTracker[hash].status = TransactionStatus.FAIL_STATUS;
        this.transactionTracker[hash].index = -1;
      }
    })
    for (const address in addrToTxSet) {
      if (this.transactions[address]) {
        this.transactions[address] = this.transactions[address].filter((tx) => {
          return !(addrToTxSet[address].has(tx.hash));
        })
      }
    }
  }

  cleanUpForNewBlock(block) {
    const finalizedAt = Date.now();
    // Get in-block transaction set.
    const inBlockTxs = new Set();
    block.last_votes.forEach((voteTx) => {
      // voting txs are loosely ordered.
      this.transactionTracker[voteTx.hash] = {
        status: TransactionStatus.BLOCK_STATUS,
        number: block.number,
        index: -1,
        timestamp: voteTx.tx_body.timestamp,
        is_finalized: true,
        finalized_at: finalizedAt,
        tracked_at: finalizedAt,
      };
      inBlockTxs.add(voteTx.hash);
    });
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i];
      // Update committed nonce tracker.
      if (tx.tx_body.nonce >= 0) {
        this.committedNonceTracker[tx.address] = tx.tx_body.nonce;
      }
      // Update transaction tracker.
      this.transactionTracker[tx.hash] = {
        status: TransactionStatus.BLOCK_STATUS,
        number: block.number,
        index: i,
        timestamp: tx.tx_body.timestamp,
        is_finalized: true,
        finalized_at: finalizedAt,
        tracked_at: finalizedAt,
      };
      inBlockTxs.add(tx.hash);
    }

    for (const address in this.transactions) {
      // Remove transactions from the pool.
      this.transactions[address] = this.transactions[address].filter((tx) => {
        return !inBlockTxs.has(tx.hash);
      });
      if (this.transactions[address].length === 0) {
        delete this.transactions[address];
      } else {
        // Update transaction index.
        this.transactions[address].forEach((tx) => {
          this.transactionTracker[tx.hash].index = this.transactions[address].indexOf(tx);
        });
      }
    }

    this.removeTimedOutTxsFromTracker(block.timestamp);
    if (this.removeTimedOutTxsFromPool(block.timestamp)) {
      this.rebuildPendingNonceTracker();
    }
  }

  updateNonceTrackers(transactions) {
    transactions.forEach((tx) => {
      if (tx.tx_body.nonce >= 0) {
        if (this.committedNonceTracker[tx.address] === undefined ||
            this.committedNonceTracker[tx.address] < tx.tx_body.nonce) {
          this.committedNonceTracker[tx.address] = tx.tx_body.nonce;
        }
        if (this.pendingNonceTracker[tx.address] === undefined ||
            this.pendingNonceTracker[tx.address] < tx.tx_body.nonce) {
          this.pendingNonceTracker[tx.address] = tx.tx_body.nonce;
        }
      }
    });
  }

  rebuildPendingNonceTracker() {
    const newNonceTracker = JSON.parse(JSON.stringify(this.committedNonceTracker));
    for (const address in this.transactions) {
      this.transactions[address].forEach((tx) => {
        if (tx.tx_body.nonce >= 0 &&
            (!(tx.address in newNonceTracker) || tx.tx_body.nonce > newNonceTracker[tx.address])) {
          newNonceTracker[tx.address] = tx.tx_body.nonce;
        }
      });
    }
    this.pendingNonceTracker = newNonceTracker;
  }

  getPoolSize() {
    let size = 0;
    for (const address in this.transactions) {
      size += this.transactions[address].length;
    }
    return size;
  }

  addRemoteTransaction(txHash, action) {
    if (!action.ref || !action.valueFunction) {
      logger.debug(
          `  =>> remote tx action is missing required fields: ${JSON.stringify(action)}`);
      return;
    }
    const trackingInfo = {
      txHash,
      action,
    };
    logger.info(
        `  =>> Added remote transaction to the tracker: ${JSON.stringify(trackingInfo, null, 2)}`);
    this.remoteTransactionTracker[txHash] = trackingInfo;
  }

  checkRemoteTransactions() {
    if (this.isChecking) {
      return;
    }
    this.isChecking = true;
    const tasks = [];
    for (const txHash in this.remoteTransactionTracker) {
      tasks.push(sendGetRequest(
          parentChainEndpoint,
          'ain_getTransactionByHash',
          {hash: txHash}
      ).then((resp) => {
        const trackingInfo = this.remoteTransactionTracker[txHash];
        const result = _.get(resp, 'data.result.result', null);
        logger.info(
            `  =>> Checked remote transaction: ${JSON.stringify(trackingInfo, null, 2)} ` +
            `with result: ${JSON.stringify(result, null, 2)}`);
        if (result && (result.is_finalized ||
            result.status === TransactionStatus.FAIL_STATUS ||
            result.status === TransactionStatus.TIMEOUT_STATUS)) {
          this.doAction(trackingInfo.action, result.is_finalized);
          delete this.remoteTransactionTracker[txHash];
        }
        return result ? result.is_finalized : null;
      }));
    }
    return Promise.all(tasks)
    .then(() => {
      this.isChecking = false;
    });
  }

  doAction(action, success) {
    const triggerTxBody = action.tx_body;
    let value = null;
    if (!action.valueFunction) {
      logger.info(`  =>> No valueFunction in action: ${JSON.stringify(action, null, 2)}`);
      return;
    }
    try {
      value = action.valueFunction(success);
    } catch (e) {
      logger.info(`  =>> valueFunction() failed: ${e}`);
      return;
    }
    const actionTxBody = {
      operation: {
        type: WriteDbOperations.SET_VALUE,
        ref: action.ref,
        value: value,
        is_global: action.is_global
      },
      timestamp: triggerTxBody.timestamp,
      nonce: -1
    };
    logger.info(`  =>> Doing action with actionTxBody: ${JSON.stringify(actionTxBody, null, 2)}`);
    const ownerPrivateKey = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);
    const endpoint = `${this.node.urlInternal}/json-rpc`;
    signAndSendTx(endpoint, actionTxBody, ownerPrivateKey);
  }
}

module.exports = TransactionPool;
