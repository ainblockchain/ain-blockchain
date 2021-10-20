/* eslint guard-for-in: "off" */
const logger = require('../logger')('TX_POOL');
const _ = require('lodash');
const {
  FeatureFlags,
  TRANSACTION_POOL_TIMEOUT_MS,
  TRANSACTION_TRACKER_TIMEOUT_MS,
  TX_POOL_SIZE_LIMIT,
  TX_POOL_SIZE_LIMIT_PER_ACCOUNT,
  SERVICE_BANDWIDTH_BUDGET_PER_BLOCK,
  APPS_BANDWIDTH_BUDGET_PER_BLOCK,
  FREE_BANDWIDTH_BUDGET_PER_BLOCK,
  TransactionStates,
  WriteDbOperations,
  StateVersions,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const Transaction = require('./transaction');

class TransactionPool {
  constructor(node) {
    this.node = node;
    this.transactions = {};
    this.transactionTracker = {};
    this.txCountTotal = 0;
  }

  addTransaction(tx, isExecutedTx = false) {
    // NOTE(platfowner): A transaction needs to be converted to an executable form
    //                   before being added.
    if (!Transaction.isExecutable(tx)) {
      logger.error(`Not executable transaction: ${JSON.stringify(tx)}`);
      return false;
    }
    if (!(tx.address in this.transactions)) {
      this.transactions[tx.address] = [];
    }
    this.transactions[tx.address].push(tx);
    this.transactionTracker[tx.hash] = {
      state: isExecutedTx ? TransactionStates.EXECUTED : TransactionStates.PENDING,
      address: tx.address,
      index: this.transactions[tx.address].length - 1,
      timestamp: tx.tx_body.timestamp,
      is_executed: isExecutedTx,
      is_finalized: false,
      finalized_at: -1,
      tracked_at: tx.extra.created_at,
      executed_at: tx.extra.executed_at,
    };
    this.txCountTotal++;
    logger.debug(`ADDING(${this.getPoolSize()}): ${JSON.stringify(tx)}`);
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

  hasRoomForNewTransaction() {
    return this.getPoolSize() < TX_POOL_SIZE_LIMIT;
  }

  hasPerAccountRoomForNewTransaction(address) {
    return this.getPerAccountPoolSize(address) < TX_POOL_SIZE_LIMIT_PER_ACCOUNT;
  }

  isNotEligibleTransaction(tx) {
    return (tx.address in this.transactions &&
        this.transactions[tx.address].find((trans) => trans.hash === tx.hash) !== undefined) ||
        tx.hash in this.transactionTracker;
  }

  static isCorrectlyNoncedOrTimestamped(txNonce, txTimestamp, accountNonce, accountTimestamp) {
    return txNonce === -1 || // unordered
        (txNonce === -2 && txTimestamp > accountTimestamp) || // ordered
        txNonce === accountNonce; // numbered
  }

  static excludeConsensusTransactions(txList) {
    return txList.filter((tx) => {
        const type = _.get(tx, 'tx_body.operation.type');
        if (type !== WriteDbOperations.SET_VALUE && type !== WriteDbOperations.SET) {
          return true;
        }
        const ref = _.get(tx, 'tx_body.operation.ref');
        const innerRef = _.get(tx, 'tx_body.operation.op_list.0.ref');
        return ((ref && !ref.startsWith('/consensus/number')) ||
            (innerRef && !innerRef.startsWith('/consensus/number')));
      });
  }

  static filterAndSortTransactions(addrToTxList, excludeBlockList) {
    let excludeTransactions = [];
    if (excludeBlockList && excludeBlockList.length) {
      excludeBlockList.forEach((block) => {
        excludeTransactions = excludeTransactions.concat(block.last_votes);
        excludeTransactions = excludeTransactions.concat(block.transactions);
      })
    }
    for (const address in addrToTxList) {
      // exclude transactions in excludeBlockList
      let filteredTransactions = _.differenceWith(
          addrToTxList[address],
          excludeTransactions,
          (a, b) => {
            return a.hash === b.hash;
          });
      // exclude consensus transactions
      filteredTransactions = TransactionPool.excludeConsensusTransactions(filteredTransactions);
      if (!filteredTransactions.length) {
        delete addrToTxList[address];
      } else {
        addrToTxList[address] = filteredTransactions;
        // sort transactions
        addrToTxList[address].sort((a, b) => {
          if (a.tx_body.nonce === b.tx_body.nonce) {
            if (a.tx_body.nonce >= 0) { // both with numbered nonces
              return 0;
            }
            // both with ordered or unordered nonces
            return a.tx_body.timestamp - b.tx_body.timestamp;
          }
          if (a.tx_body.nonce >= 0 && b.tx_body.nonce >= 0) { // both with numbered nonces
            return a.tx_body.nonce - b.tx_body.nonce;
          }
          return 0;
        });
      }
    }
  }

  getValidTransactions(excludeBlockList, baseVersion) {
    const LOG_HEADER = 'getValidTransactions';
    if (!baseVersion) {
      baseVersion = this.node.db.stateVersion;
    }
    const tempDb = this.node.createTempDb(
        baseVersion, `${StateVersions.TX_POOL}:${this.node.bc.lastBlockNumber()}`, -2);
    if (!tempDb) {
      logger.error(
          `[${LOG_HEADER}] Failed to create a temp database with state version: ${baseVersion}.`);
      return null;
    }

    const addrToTxList = JSON.parse(JSON.stringify(this.transactions));
    TransactionPool.filterAndSortTransactions(addrToTxList, excludeBlockList);
    // Remove incorrectly nonced / timestamped transactions
    for (const [addr, txList] of Object.entries(addrToTxList)) {
      const newTxList = [];
      for (let index = 0; index < txList.length; index++) {
        const tx = txList[index];
        const txNonce = tx.tx_body.nonce;
        const txTimestamp = tx.tx_body.timestamp;
        const { nonce: accountNonce, timestamp: accountTimestamp } =
            tempDb.getAccountNonceAndTimestamp(addr);
        if (TransactionPool.isCorrectlyNoncedOrTimestamped(
            txNonce, txTimestamp, accountNonce, accountTimestamp)) {
          newTxList.push(tx);
          tempDb.updateAccountNonceAndTimestamp(addr, txNonce, txTimestamp);
        }
      }
      addrToTxList[addr] = newTxList;
    }

    // Merge lists of transactions while ordering by gas price and timestamp.
    // Initial ordering by nonce is preserved.
    const merged = TransactionPool.mergeMultipleSortedArrays(Object.values(addrToTxList));
    const checkedTxs = this.performBandwidthChecks(merged, tempDb);
    tempDb.destroyDb();
    return checkedTxs;
  }

  getAppBandwidthAllocated(db, appStakesTotal, appName) {
    const appStake = db ? db.getAppStake(appName) : 0;
    return appStakesTotal > 0 ? APPS_BANDWIDTH_BUDGET_PER_BLOCK * appStake / appStakesTotal : 0;
  }

  // NOTE(liayoo): txList is already sorted by their gas prices and/or timestamps,
  // depending on the types of the transactions (service vs app).
  // TODO(): Try allocating the excess bandwidth to app txs.
  performBandwidthChecks(txList, db) {
    const candidateTxList = [];
    let serviceBandwidthSum = 0;
    let freeTierBandwidthSum = 0;
    const appBandwidthSum = {};
    // Sum of all apps' staked AIN
    const appStakesTotal = db ? db.getAppStakesTotal() : 0;
    // NOTE(liayoo): Keeps track of whether an address's nonced tx has been discarded. If true, any
    // nonced txs from the same address that come after the discarded tx need to be dropped as well.
    const addrToDiscardedNoncedTx = {};
    const discardedTxList = [];
    for (const tx of txList) {
      const nonce = tx.tx_body.nonce;
      if (addrToDiscardedNoncedTx[tx.address] && nonce >= 0) {
        // Tx nonce is no longer valid
        discardedTxList.push(tx);
        continue;
      }
      const serviceBandwidth = _.get(tx, 'extra.gas.bandwidth.service', 0);
      const appBandwidth = _.get(tx, 'extra.gas.bandwidth.app', null);
      // Check if tx exceeds service bandwidth
      if (serviceBandwidth) {
        if (serviceBandwidthSum + serviceBandwidth > SERVICE_BANDWIDTH_BUDGET_PER_BLOCK) {
          // Exceeds service bandwidth budget. Discard tx.
          if (nonce >= 0) {
            addrToDiscardedNoncedTx[tx.address] = true;
          }
          if (FeatureFlags.enableRichTxSelectionLogging) {
            logger.debug(`Skipping service tx: ${serviceBandwidthSum + serviceBandwidth} > ${SERVICE_BANDWIDTH_BUDGET_PER_BLOCK}`);
          }
          discardedTxList.push(tx);
          continue;
        }
        serviceBandwidthSum += serviceBandwidth;
      }
      // Check if tx exceeds app bandwidth
      let isSkipped = false;
      if (appBandwidth) {
        const tempAppBandwidthSum = {};
        let tempFreeTierBandwidthSum = freeTierBandwidthSum;
        for (const [appName, bandwidth] of Object.entries(appBandwidth)) {
          const appBandwidthAllocated =
              this.getAppBandwidthAllocated(db, appStakesTotal, appName);
          const currAppBandwidthSum =
              _.get(appBandwidthSum, appName, 0) + _.get(tempAppBandwidthSum, appName, 0);
          if (currAppBandwidthSum + bandwidth > appBandwidthAllocated) {
            if (appBandwidthAllocated === 0 &&
              tempFreeTierBandwidthSum + bandwidth <= FREE_BANDWIDTH_BUDGET_PER_BLOCK) {
              // May be able to include this tx for the free tier budget.
              tempFreeTierBandwidthSum += bandwidth;
            } else {
              // Exceeds app bandwidth budget. Discard tx.
              if (nonce >= 0) {
                addrToDiscardedNoncedTx[tx.address] = true;
              }
              if (FeatureFlags.enableRichTxSelectionLogging) {
                logger.debug(`Skipping app tx: ${currAppBandwidthSum + bandwidth} > ${appBandwidthAllocated}`);
              }
              isSkipped = true;
              discardedTxList.push(tx);
              break;
            }
          }
          CommonUtil.setJsObject(tempAppBandwidthSum, [appName], bandwidth);
        }
        if (!isSkipped) {
          freeTierBandwidthSum = tempFreeTierBandwidthSum;
          CommonUtil.mergeNumericJsObjects(appBandwidthSum, appBandwidth);
        }
      }
      if (!isSkipped) {
        candidateTxList.push(tx);
      }
    }

    return candidateTxList;
  }

  static mergeMultipleSortedArrays(arrays) {
    while (arrays.length > 1) {
      const newArr = [];
      for (let i = 0; i < arrays.length; i += 2) {
        if (i + 1 < arrays.length) {
          newArr.push(TransactionPool.mergeTwoSortedArrays(arrays[i], arrays[i + 1]));
        } else {
          newArr.push(arrays[i]);
        }
      }
      arrays = newArr;
    }
    return arrays.length === 1 ? arrays[0] : [];
  }

  static mergeTwoSortedArrays(arr1, arr2) {
    const newArr = [];
    let i = 0;
    let j = 0;
    const len1 = arr1.length;
    const len2 = arr2.length;
    while (i < len1 && j < len2) {
      const tx1 = arr1[i];
      const tx2 = arr2[j];
      const isTx1ServiceTx = !!_.get(tx1, 'extra.gas.bandwidth.service', false);
      const isTx2ServiceTx = !!_.get(tx2, 'extra.gas.bandwidth.service', false);
      if (isTx1ServiceTx && isTx2ServiceTx) {
        // Compare gas price if both service transactions
        if (tx1.tx_body.gas_price > tx2.tx_body.gas_price) {
          newArr.push(tx1);
          i++;
        } else {
          newArr.push(tx2);
          j++;
        }
      } else if (!isTx1ServiceTx && !isTx2ServiceTx) {
        // Compare timestamp if both app transactions
        if (tx1.tx_body.timestamp < tx2.tx_body.timestamp) {
          newArr.push(tx1);
          i++;
        } else {
          newArr.push(tx2);
          j++;
        }
      } else {
        // Service tx has priority over app tx
        if (isTx1ServiceTx) {
          newArr.push(tx1);
          i++;
        } else {
          newArr.push(tx2);
          j++;
        }
      }
    }
    while (i < len1) {
      newArr.push(arr1[i++]);
    }
    while (j < len2) {
      newArr.push(arr2[j++]);
    }
    return newArr;
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
      const sizeBefore = this.transactions[address].length;
      this.transactions[address] = this.transactions[address].filter((tx) => {
        return !timedOutTxs.has(tx.hash);
      });
      const sizeAfter = this.transactions[address].length;
      this.txCountTotal += sizeAfter - sizeBefore;
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
      if (tracked && tracked.state !== TransactionStates.IN_BLOCK) {
        this.transactionTracker[hash].state = TransactionStates.FAILED;
      }
    });
    for (const address in addrToTxSet) {
      const sizeBefore = this.transactions[address].length;
      if (this.transactions[address]) {
        this.transactions[address] = this.transactions[address].filter((tx) => {
          return !(addrToTxSet[address].has(tx.hash));
        })
      }
      const sizeAfter = this.transactions[address].length;
      this.txCountTotal += sizeAfter - sizeBefore;
    }
  }

  cleanUpForNewBlock(block) {
    const finalizedAt = Date.now();
    // Get in-block transaction set.
    const inBlockTxs = new Set();
    const addrToNonce = {};
    const addrToTimestamp = {};
    for (const voteTx of block.last_votes) {
      const txTimestamp = voteTx.tx_body.timestamp;
      // voting txs with ordered nonces.
      this.transactionTracker[voteTx.hash] = {
        state: TransactionStates.IN_BLOCK,
        number: block.number,
        index: -1,
        address: voteTx.address,
        timestamp: txTimestamp,
        is_executed: true,
        is_finalized: true,
        finalized_at: finalizedAt,
        tracked_at: finalizedAt,
      };
      inBlockTxs.add(voteTx.hash);
    }
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i];
      const txNonce = tx.tx_body.nonce;
      const txTimestamp = tx.tx_body.timestamp;
      // Update transaction tracker.
      this.transactionTracker[tx.hash] = {
        state: TransactionStates.IN_BLOCK,
        number: block.number,
        index: i,
        address: tx.address,
        timestamp: tx.tx_body.timestamp,
        is_executed: true,
        is_finalized: true,
        finalized_at: finalizedAt,
        tracked_at: finalizedAt,
      };
      inBlockTxs.add(tx.hash);
      const lastNonce = addrToNonce[tx.address];
      const lastTimestamp = addrToTimestamp[tx.address];
      if (txNonce >= 0 && (lastNonce === undefined || txNonce > lastNonce)) {
        addrToNonce[tx.address] = txNonce;
      }
      if (txNonce === -2 && (lastTimestamp === undefined || txTimestamp > lastTimestamp)) {
        addrToTimestamp[tx.address] = txTimestamp;
      }
    }

    for (const address in this.transactions) {
      // Remove transactions from the pool.
      const lastNonce = addrToNonce[address];
      const lastTimestamp = addrToTimestamp[address];
      const sizeBefore = this.transactions[address].length;
      this.transactions[address] = this.transactions[address].filter((tx) => {
        if (lastNonce !== undefined && tx.tx_body.nonce >= 0 && tx.tx_body.nonce <= lastNonce) {
          return false;
        }
        if (lastTimestamp !== undefined && tx.tx_body.nonce === -2 && tx.tx_body.timestamp <= lastTimestamp) {
          return false;
        }
        return !inBlockTxs.has(tx.hash);
      });
      const sizeAfter = this.transactions[address].length;
      this.txCountTotal += sizeAfter - sizeBefore;
      if (this.transactions[address].length === 0) {
        delete this.transactions[address];
      }
    }

    this.removeTimedOutTxsFromTracker(block.timestamp);
    this.removeTimedOutTxsFromPool(block.timestamp);
  }

  getPoolSize() {
    return this.txCountTotal;
  }

  getPerAccountPoolSize(address) {
    return this.transactions[address] ? this.transactions[address].length : 0;
  }
}

module.exports = TransactionPool;
