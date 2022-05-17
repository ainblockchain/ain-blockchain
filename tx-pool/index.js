/* eslint guard-for-in: "off" */
const logger = new (require('../logger'))('TX_POOL');

const _ = require('lodash');
const {
  DevFlags,
  NodeConfigs,
  TransactionStates,
  isTxInBlock,
  WriteDbOperations,
  StateVersions,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const Transaction = require('./transaction');
const { isFailedTx } = require('../common/common-util');

class TransactionPool {
  constructor(node) {
    this.node = node;
    this.transactions = new Map();
    this.transactionTracker = new Map();
    this.txCountTotal = 0;
    this.freeTxCountTotal = 0;
    this.freeTxCountPerAccount = new Map();
  }

  updateTxList(address, txList) {
    // Update txList of given address in transaction pool
    if (txList.length === 0) {
      this.transactions.delete(address);
      return;
    }
    this.transactions.set(address, txList);
  }

  makeCountUpdateWrapperForFilterFunction(filterFunc) {
    return (tx) => {
      if (filterFunc(tx)) {
        return true;
      }
      if (Transaction.isFreeTransaction(tx)) {
        --this.freeTxCountTotal;
      }
      --this.txCountTotal;
      return false;
    }
  }

  updateFreeTxCountPerAccount(address, change){
    const freeTxCntBefore = this.freeTxCountPerAccount.get(address) || 0;
    const freeTxCntAfter = freeTxCntBefore + change;
    if (freeTxCntAfter === 0) {
      this.freeTxCountPerAccount.delete(address);
    } else {
      this.freeTxCountPerAccount.set(address, freeTxCntAfter);
    }
  }

  updateTxListAndCounts(address, txList, filterFunc) {
    // Update txList of given address in transaction pool and update txCountTotal,
    // freeTxTotalCount, and freeTxCountPerAccount
    const freeTxCntTotalBefore = this.freeTxCountTotal;
    const txListAfter = txList.filter(this.makeCountUpdateWrapperForFilterFunction(filterFunc));
    const freeTxCntTotalAfter = this.freeTxCountTotal;
    this.updateFreeTxCountPerAccount(address, freeTxCntTotalAfter - freeTxCntTotalBefore);
    this.updateTxList(address, txListAfter);
  }

  addTransaction(tx, isExecutedTx = false) {
    // NOTE(platfowner): A transaction needs to be converted to an executable form
    //                   before being added.
    if (!Transaction.isExecutable(tx)) {
      logger.error(`Not executable transaction: ${JSON.stringify(tx)}`);
      return false;
    }
    if (!this.transactions.has(tx.address)) {
      this.transactions.set(tx.address, []);
    }
    this.transactions.get(tx.address).push(tx);
    this.transactionTracker.set(tx.hash, {
      state: isExecutedTx ? TransactionStates.EXECUTED : TransactionStates.PENDING,
      number: -1,
      index: this.transactions.get(tx.address).length - 1,
      address: tx.address,
      timestamp: tx.tx_body.timestamp,
      is_executed: isExecutedTx,
      is_finalized: false,
      tracked_at: tx.extra.created_at,
      executed_at: tx.extra.executed_at,
      finalized_at: -1,
    });
    this.txCountTotal++;
    if (Transaction.isFreeTransaction(tx)) {
      this.freeTxCountTotal++;
      this.updateFreeTxCountPerAccount(tx.address, 1);
    }
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
    return this.isTimedOut(txTimestamp, lastBlockTimestamp, NodeConfigs.TX_POOL_TIMEOUT_MS);
  }

  isTimedOutFromTracker(txTimestamp, lastBlockTimestamp) {
    return this.isTimedOut(txTimestamp, lastBlockTimestamp, NodeConfigs.TX_TRACKER_TIMEOUT_MS);
  }

  hasRoom() {
    return this.getPoolSize() < NodeConfigs.TX_POOL_SIZE_LIMIT;
  }

  hasFreeRoom() {
    return this.getFreePoolSize() < Math.floor(NodeConfigs.TX_POOL_SIZE_LIMIT * NodeConfigs.FREE_TX_POOL_SIZE_LIMIT_RATIO);
  }

  hasPerAccountRoom(address) {
    return this.getPerAccountPoolSize(address) < NodeConfigs.TX_POOL_SIZE_LIMIT_PER_ACCOUNT;
  }
  
  hasPerAccountFreeRoom(address) {
    return this.getPerAccountFreePoolSize(address) < Math.floor(NodeConfigs.TX_POOL_SIZE_LIMIT_PER_ACCOUNT * NodeConfigs.FREE_TX_POOL_SIZE_LIMIT_RATIO_PER_ACCOUNT);
  }

  isNotEligibleTransaction(tx) {
    return (this.transactions.has(tx.address) &&
        this.transactions.get(tx.address).find((trans) => trans.hash === tx.hash) !== undefined) ||
        this.transactionTracker.has(tx.hash);
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
    if (excludeBlockList && excludeBlockList.length > 0) {
      excludeBlockList.forEach((block) => {
        excludeTransactions = excludeTransactions.concat(block.last_votes);
        excludeTransactions = excludeTransactions.concat(block.transactions);
      })
    }
    for (const [address, txList] of addrToTxList.entries()) {
      // exclude transactions in excludeBlockList
      let filteredTransactions = _.differenceWith(
          txList,
          excludeTransactions,
          (a, b) => {
            return a.hash === b.hash;
          });
      // exclude consensus transactions
      filteredTransactions = TransactionPool.excludeConsensusTransactions(filteredTransactions);
      if (!filteredTransactions.length) {
        addrToTxList.delete(address);
      } else {
        addrToTxList.set(address, filteredTransactions);
        // sort transactions
        addrToTxList.get(address).sort((a, b) => {
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

    const addrToTxList = _.cloneDeep(this.transactions);
    TransactionPool.filterAndSortTransactions(addrToTxList, excludeBlockList);
    // Remove incorrectly nonced / timestamped transactions
    for (const [addr, txList] of addrToTxList.entries()) {
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
      addrToTxList.set(addr, newTxList);
    }

    // Merge lists of transactions while ordering by gas price and timestamp.
    // Initial ordering by nonce is preserved.
    const merged = TransactionPool.mergeMultipleSortedArrays(Array.from(addrToTxList.values()));
    if (!DevFlags.enableTxBandwidthCheckPerBlock) {
      tempDb.destroyDb();
      return merged;
    }
    const checkedTxs = this.performBandwidthChecks(merged, tempDb);
    tempDb.destroyDb();
    return checkedTxs;
  }

  getAppBandwidthAllocated(db, appStakesTotal, appName, appsBandwidthBudgetPerBlock) {
    const appStake = db ? db.getAppStake(appName) : 0;
    return appStakesTotal > 0 ? appsBandwidthBudgetPerBlock * appStake / appStakesTotal : 0;
  }

  getBandwidthBudgets(stateVersion) {
    const bandwidthBudgetPerBlock = this.node.getBlockchainParam(
        'resource/bandwidth_budget_per_block', null, stateVersion);
    const serviceBandwidthBudgetRatio = this.node.getBlockchainParam(
        'resource/service_bandwidth_budget_ratio', null, stateVersion);
    const appsBandwidthBudgetRatio = this.node.getBlockchainParam(
        'resource/apps_bandwidth_budget_ratio', null, stateVersion);
    const freeBandwidthBudgetRatio = this.node.getBlockchainParam(
        'resource/free_bandwidth_budget_ratio', null, stateVersion);
    const serviceBandwidthBudgetPerBlock = bandwidthBudgetPerBlock * serviceBandwidthBudgetRatio;
    const appsBandwidthBudgetPerBlock = bandwidthBudgetPerBlock * appsBandwidthBudgetRatio;
    const freeBandwidthBudgetPerBlock = bandwidthBudgetPerBlock * freeBandwidthBudgetRatio;
    return {
      serviceBandwidthBudgetPerBlock,
      appsBandwidthBudgetPerBlock,
      freeBandwidthBudgetPerBlock,
    };
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
    const {
      serviceBandwidthBudgetPerBlock,
      appsBandwidthBudgetPerBlock,
      freeBandwidthBudgetPerBlock,
    } = this.getBandwidthBudgets(db.stateVersion);
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
        if (serviceBandwidthSum + serviceBandwidth > serviceBandwidthBudgetPerBlock) {
          // Exceeds service bandwidth budget. Discard tx.
          if (nonce >= 0) {
            addrToDiscardedNoncedTx[tx.address] = true;
          }
          if (DevFlags.enableRichTxSelectionLogging) {
            logger.debug(`Skipping service tx: ${serviceBandwidthSum + serviceBandwidth} > ${serviceBandwidthBudgetPerBlock}`);
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
              this.getAppBandwidthAllocated(db, appStakesTotal, appName, appsBandwidthBudgetPerBlock);
          const currAppBandwidthSum =
              _.get(appBandwidthSum, appName, 0) + _.get(tempAppBandwidthSum, appName, 0);
          if (currAppBandwidthSum + bandwidth > appBandwidthAllocated) {
            if (appBandwidthAllocated === 0 &&
              tempFreeTierBandwidthSum + bandwidth <= freeBandwidthBudgetPerBlock) {
              // May be able to include this tx for the free tier budget.
              tempFreeTierBandwidthSum += bandwidth;
            } else {
              // Exceeds app bandwidth budget. Discard tx.
              if (nonce >= 0) {
                addrToDiscardedNoncedTx[tx.address] = true;
              }
              if (DevFlags.enableRichTxSelectionLogging) {
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
    // Remove timed-out transactions from the pool.
    const sizeBefore = this.txCountTotal;
    for (const [address, txList] of this.transactions.entries()) {
      const filterFunc = (tx) => !this.isTimedOutFromPool(tx.extra.created_at, blockTimestamp);
      this.updateTxListAndCounts(address, txList, filterFunc);
    }
    const sizeAfter = this.txCountTotal;
    return sizeBefore > sizeAfter;
  }

  removeTimedOutTxsFromTracker(blockTimestamp) {
    // Remove timed-out transactions from transactionTracker.
    let removed = false;
    for (const [hash, txData] of this.transactionTracker.entries()) {
      if (this.isTimedOutFromTracker(txData.tracked_at, blockTimestamp)) {
        this.transactionTracker.delete(hash);
        removed = true;
      }
    }
    return removed;
  }

  removeInvalidTxsFromPool(txs) {
    const addrToInvalidTxSet = new Map();
    txs.forEach((tx) => {
      const { address, hash } = tx;
      if (!addrToInvalidTxSet.has(address)) {
        addrToInvalidTxSet.set(address, new Set());
      }
      addrToInvalidTxSet.get(address).add(hash);
      const tracked = this.transactionTracker.get(hash);
      if (tracked && !isTxInBlock(tracked.state)) {
        tracked.state = TransactionStates.FAILED;
      }
    });
    for (const [address, invalidTxSet] of addrToInvalidTxSet.entries()) {
      if (this.transactions.has(address)) {
        const txList = this.transactions.get(address);
        const filterFunc = (tx) => !invalidTxSet.has(tx.hash);
        this.updateTxListAndCounts(address, txList, filterFunc);
      }
    }
  }

  addEvidenceTxsToTxHashSet(txHashSet, evidence) {
    if (CommonUtil.isEmpty(evidence)) {
      return;
    }
    for (const evidenceList of Object.values(evidence)) {
      for (const evidenceForOffense of evidenceList) {
        for (const evidenceTx of evidenceForOffense.transactions) {
          txHashSet.add(evidenceTx.hash);
        }
        for (const evidenceTx of evidenceForOffense.votes) {
          txHashSet.add(evidenceTx.hash);
        }
      }
    }
  }

  updateTxPoolWithTxHashSet(txHashSet, addrToNonce, addrToTimestamp) {
    for (const [address, txList] of this.transactions.entries()) {
      // Remove transactions from the pool.
      const lastNonce = addrToNonce[address];
      const lastTimestamp = addrToTimestamp[address];
      const filterFunc = (tx) => {
        if (lastNonce !== undefined && tx.tx_body.nonce >= 0 && tx.tx_body.nonce <= lastNonce) {
          return false;
        }
        if (lastTimestamp !== undefined && tx.tx_body.nonce === -2 && tx.tx_body.timestamp <= lastTimestamp) {
          return false;
        }
        return !txHashSet.has(tx.hash);
      };
      this.updateTxListAndCounts(address, txList, filterFunc);
    }
  }

  cleanUpConsensusTxs(block = null, additionalVotes = []) {
    const consensusTxs = new Set();
    if (block) {
      block.last_votes.map((tx) => tx.hash).forEach((hash) => consensusTxs.add(hash));
      this.addEvidenceTxsToTxHashSet(consensusTxs, block.evidence);
    }
    if (!CommonUtil.isEmpty(additionalVotes)) {
      additionalVotes.map((tx) => tx.hash).forEach((hash) => consensusTxs.add(hash));
    }
    this.updateTxPoolWithTxHashSet(consensusTxs, {}, {});
  }

  cleanUpForNewBlock(block) {
    const finalizedAt = Date.now();
    // Get in-block transaction set.
    const inBlockTxs = new Set();
    const addrToNonce = {};
    const addrToTimestamp = {};
    for (const voteTx of block.last_votes) {
      const txTimestamp = voteTx.tx_body.timestamp;
      const executedAt = _.get(this.transactionTracker.get(voteTx.hash), 'executed_at', -1);
      // voting txs with ordered nonces.
      this.transactionTracker.set(voteTx.hash, {
        state: TransactionStates.FINALIZED,
        number: block.number,
        index: -1,
        address: voteTx.address,
        timestamp: txTimestamp,
        is_executed: true,
        is_finalized: true,
        tracked_at: finalizedAt,
        executed_at: executedAt,
        finalized_at: finalizedAt,
      });
      inBlockTxs.add(voteTx.hash);
    }
    this.addEvidenceTxsToTxHashSet(inBlockTxs, block.evidence);
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i];
      const txNonce = tx.tx_body.nonce;
      const txTimestamp = tx.tx_body.timestamp;
      const executedAt = _.get(this.transactionTracker.get(tx.hash), 'executed_at', -1);
      // Update transaction tracker.
      this.transactionTracker.set(tx.hash, {
        state: isFailedTx(block.receipts[i]) ? TransactionStates.REVERTED : TransactionStates.FINALIZED,
        number: block.number,
        index: i,
        address: tx.address,
        timestamp: tx.tx_body.timestamp,
        is_executed: true,
        is_finalized: true,
        tracked_at: finalizedAt,
        executed_at: executedAt,
        finalized_at: finalizedAt,
      });
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

    this.updateTxPoolWithTxHashSet(inBlockTxs, addrToNonce, addrToTimestamp);
    this.removeTimedOutTxsFromTracker(block.timestamp);
    this.removeTimedOutTxsFromPool(block.timestamp);
  }

  getPoolSize() {
    return this.txCountTotal;
  }

  getFreePoolSize() {
    return this.freeTxCountTotal;
  }

  getPerAccountPoolSize(address) {
    return this.transactions.has(address) ? this.transactions.get(address).length : 0;
  }

  getPerAccountFreePoolSize(address) {
    return this.freeTxCountPerAccount.has(address) ? this.freeTxCountPerAccount.get(address) : 0;
  }
}

module.exports = TransactionPool;
