/* eslint guard-for-in: "off" */
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('NODE');
const {
  PORT,
  ACCOUNT_INDEX,
  PredefinedDbPaths,
  ShardingProperties,
  ShardingProtocols,
  GenesisAccounts,
  GenesisSharding,
  StateVersions,
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const Blockchain = require('../blockchain');
const TransactionPool = require('../tx-pool');
const StateManager = require('../db/state-manager');
const DB = require('../db');
const Transaction = require('../tx-pool/transaction');

const isShardChain =
    GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE;

class BlockchainNode {
  constructor() {
    const LOG_HEADER = 'constructor';
    // TODO(lia): Add account importing functionality.
    this.account = ACCOUNT_INDEX !== null ?
        GenesisAccounts.others[ACCOUNT_INDEX] : ainUtil.createAccount();
    logger.info(`[${LOG_HEADER}] Initializing a new blockchain node with account: ` +
        `${this.account.address}`);
    this.isShardReporter =
        isShardChain &&
        ainUtil.areSameAddresses(
            GenesisSharding[ShardingProperties.SHARD_REPORTER], this.account.address);
    this.ipAddrInternal = null;
    this.ipAddrExternal = null;
    this.urlInternal = null;
    this.urlExternal = null;
    this.bc = new Blockchain(String(PORT));
    this.tp = new TransactionPool(this);
    this.stateManager = new StateManager();
    const initialVersion = `${StateVersions.NODE}:${this.bc.lastBlockNumber()}}`;
    this.db = this.createDb(StateVersions.EMPTY, initialVersion, this.bc, this.tp, false, true);
    this.nonce = null;
    this.initialized = false;
  }

  // For testing purpose only.
  setAccountForTesting(accountIndex) {
    this.account = GenesisAccounts.others[accountIndex];
  }

  setIpAddresses(ipAddrInternal, ipAddrExternal) {
    const LOG_HEADER = 'setIpAddresses';
    this.ipAddrInternal = ipAddrInternal;
    this.ipAddrExternal = ipAddrExternal;
    this.urlInternal = BlockchainNode.getNodeUrl(ipAddrInternal);
    this.urlExternal = BlockchainNode.getNodeUrl(ipAddrExternal);
    logger.info(
        `[${LOG_HEADER}] Set Node URLs to '${this.urlInternal}' (internal), ` +
        `'${this.urlExternal}' (external)`);
  }

  static getNodeUrl(ipAddr) {
    return `http://${ipAddr}:${PORT}`;
  }

  init(isFirstNode) {
    const LOG_HEADER = 'init';
    logger.info(`[${LOG_HEADER}] Initializing node..`);
    const lastBlockWithoutProposal = this.bc.init(isFirstNode);
    const startingDb =
        this.createDb(StateVersions.EMPTY, StateVersions.START, this.bc, this.tp, true);
    startingDb.initDbStates();
    this.executeChainOnDb(startingDb);
    this.nonce = this.getNonce();
    this.cloneAndFinalizeVersion(StateVersions.START, this.bc.lastBlockNumber());
    this.db.executeTransactionList(this.tp.getValidTransactions());
    this.initialized = true;
    return lastBlockWithoutProposal;
  }

  createTempDb(baseVersion, newVersion, blockNumberSnapshot) {
    return this.createDb(baseVersion, newVersion, null, null, false, false, blockNumberSnapshot);
  }

  createDb(baseVersion, newVersion, bc, tp, finalizeVersion, isNodeDb, blockNumberSnapshot) {
    const LOG_HEADER = 'createDb';
    const newRoot = this.stateManager.cloneVersion(baseVersion, newVersion);
    if (!newRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone state version: ${baseVersion}`)
      return null;
    }
    if (finalizeVersion) {
      this.stateManager.finalizeVersion(newVersion);
    }
    return new DB(newRoot, newVersion, bc, tp, isNodeDb, blockNumberSnapshot);
  }

  destroyDb(db) {
    return this.stateManager.deleteVersion(db.stateVersion);
  }

  syncDb(newVersion) {
    const LOG_HEADER = 'syncDb';
    const oldVersion = this.db.stateVersion;
    if (newVersion === oldVersion) {
      logger.info(`[${LOG_HEADER}] Already sync'ed.`);
      return false;
    }
    const clonedRoot = this.stateManager.cloneFinalVersion(newVersion);
    if (!clonedRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone the final state version: ` +
          `${this.stateManager.getFinalVersion()}`);
    }
    this.db.setStateVersion(clonedRoot, newVersion);
    if (oldVersion) {
      this.stateManager.deleteVersion(oldVersion);
    }
    return true;
  }

  cloneAndFinalizeVersion(version, blockNumber) {
    const LOG_HEADER = 'cloneAndFinalizeVersion';
    const oldFinalVersion = this.stateManager.getFinalVersion();
    const newFinalVersion = `${StateVersions.FINAL}:${blockNumber}`;
    const clonedRoot = this.stateManager.cloneVersion(version, newFinalVersion);
    if (!clonedRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone state version: ${version}`);
      return;
    }
    this.stateManager.finalizeVersion(newFinalVersion);
    logger.info(`[${LOG_HEADER}] Replacing version: ${version} -> ${newFinalVersion}`);
    this.stateManager.replaceVersion(version, newFinalVersion);
    if (oldFinalVersion) {
      logger.info(`[${LOG_HEADER}] Deleting previous final version: ${oldFinalVersion}`);
      this.stateManager.deleteVersion(oldFinalVersion);
    }
    const nodeVersion = `${StateVersions.NODE}:${blockNumber}`;
    this.syncDb(nodeVersion)
  }

  dumpFinalVersion(withDetails) {
    return this.stateManager.getFinalRoot().toJsObject(withDetails);
  }

  getNonce() {
    const LOG_HEADER = 'getNonce';
    // TODO (Chris): Search through all blocks for any previous nonced transaction with current
    //               publicKey
    let nonce = 0;
    for (let i = this.bc.chain.length - 1; i > -1; i--) {
      for (let j = this.bc.chain[i].transactions.length - 1; j > -1; j--) {
        if (ainUtil.areSameAddresses(this.bc.chain[i].transactions[j].address,
            this.account.address) && this.bc.chain[i].transactions[j].tx_body.nonce > -1) {
          // If blockchain is being restarted, retreive nonce from blockchain
          nonce = this.bc.chain[i].transactions[j].tx_body.nonce + 1;
          break;
        }
      }
      if (nonce > 0) {
        break;
      }
    }

    logger.info(`[${LOG_HEADER}] Setting nonce to ${nonce}`);
    return nonce;
  }

  getSharding() {
    const shardingInfo = {};
    if (this.db && this.db.stateRoot) {
      const shards = this.db.getValue(ChainUtil.formatPath(
          [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_SHARD]));
      for (const encodedPath in shards) {
        const shardPath = ainUtil.decode(encodedPath);
        shardingInfo[encodedPath] = {
          [ShardingProperties.SHARDING_ENABLED]: this.db.getValue(ChainUtil.appendPath(
              shardPath, ShardingProperties.SHARD, ShardingProperties.SHARDING_ENABLED)),
          [ShardingProperties.LATEST_BLOCK_NUMBER]: this.db.getValue(ChainUtil.appendPath(
              shardPath, ShardingProperties.SHARD, ShardingProperties.PROOF_HASH_MAP,
              ShardingProperties.LATEST)),
        };
      }
    }
    return shardingInfo;
  }

  /**
    * Validates transaction is valid according to AIN database rules and returns a transaction
    * instance
    *
    * @param {dict} operation - Database write operation to be converted to transaction
    * @param {boolean} isNoncedTransaction - Indicates whether transaction should include nonce or
    *                                        not
    * @return {Transaction} Instance of the transaction class
    */
  createTransaction(txBody, isNoncedTransaction = true) {
    const LOG_HEADER = 'createTransaction';
    if (Transaction.isBatchTxBody(txBody)) {
      const txList = [];
      for (const subTxBody of txBody.tx_list) {
        const createdTx = this.createSingleTransaction(subTxBody, isNoncedTransaction);
        if (createdTx === null) {
          logger.info(`[${LOG_HEADER}] Failed to create a transaction with subTx: ` +
              `${JSON.stringify(subTxBody, null, 2)}`);
        } else {
          txList.push(createdTx);
        }
      }
      return { tx_list: txList };
    }
    const createdTx = this.createSingleTransaction(txBody, isNoncedTransaction);
    if (createdTx === null) {
      logger.info(`[${LOG_HEADER}] Failed to create a transaction with txBody: ` +
          `${JSON.stringify(txBody, null, 2)}`);
      return null;
    }
    return createdTx;
  }

  createSingleTransaction(txBody, isNoncedTransaction) {
    if (txBody.nonce === undefined) {
      let nonce;
      if (isNoncedTransaction) {
        nonce = this.nonce;
        this.nonce++;
      } else {
        nonce = -1;
      }
      txBody.nonce = nonce;
    }
    return Transaction.signTxBody(txBody, this.account.private_key);
  }

  /**
   * Try to executes a transaction on the node database. If it was not successful, all changes are
   * rolled back from the database states.
   * @param {Object} tx transaction
   */
  executeOrRollbackTransaction(tx) {
    const backupVersion = StateManager.createRandomVersion(`${StateVersions.BACKUP}`);
    const backupRoot = this.stateManager.cloneVersion(this.db.stateVersion, backupVersion);
    if (!backupRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone state version: ${this.db.stateVersion}`);
      return null;
    }
    const result = this.db.executeTransaction(tx);
    if (ChainUtil.transactionFailed(result)) {
      // Changes are rolled back.
      if (this.stateManager.isFinalVersion(this.db.stateVersion)) {
        this.stateManager.finalizeVersion(backupVersion);
      }
      this.db.setStateVersion(backupRoot, backupVersion);
    } else {
      this.stateManager.deleteVersion(backupVersion);
    }
    return result;
  }

  /**
   * Executes a transaction and add it to the transaction pool if the execution was successful.
   * @param {Object} tx transaction
   */
  executeTransactionAndAddToPool(tx) {
    const LOG_HEADER = 'executeTransactionAndAddToPool';
    logger.debug(`[${LOG_HEADER}] EXECUTING: ${JSON.stringify(tx)}`);
    if (this.tp.isTimedOutFromPool(tx.tx_body.timestamp, this.bc.lastBlockTimestamp())) {
      logger.debug(`[${LOG_HEADER}] TIMED-OUT TRANSACTION: ${JSON.stringify(tx)}`);
      return null;
    }
    if (this.tp.isNotEligibleTransaction(tx)) {
      logger.debug(`[${LOG_HEADER}] ALREADY RECEIVED: ${JSON.stringify(tx)}`);
      return null;
    }
    if (this.bc.syncedAfterStartup === false) {
      logger.debug(`[${LOG_HEADER}] NOT SYNCED YET. WILL ADD TX TO THE POOL: ` +
          `${JSON.stringify(tx)}`);
      this.tp.addTransaction(tx);
      return null;
    }
    const result = this.executeOrRollbackTransaction(tx);
    if (ChainUtil.transactionFailed(result)) {
      logger.info(`[${LOG_HEADER}] FAILED TRANSACTION: ${JSON.stringify(tx)}\t ` +
          `RESULT:${JSON.stringify(result)}`);
    } else {
      this.tp.addTransaction(tx);
    }
    return result;
  }

  addNewBlock(block) {
    if (this.bc.addNewBlockToChain(block)) {
      this.tp.cleanUpForNewBlock(block);
      const newVersion = `${StateVersions.NODE}:${block.number}`;
      this.syncDb(newVersion);
      this.tp.updateNonceTrackers(block.transactions);
      this.tp.checkRemoteTransactions();
      return true;
    }
    return false;
  }

  mergeChainSubsection(chainSubsection) {
    const LOG_HEADER = 'mergeChainSubsection';
    const tempVersion = StateManager.createRandomVersion(`${StateVersions.TEMP}`);
    const tempDb = this.createTempDb(
        this.stateManager.getFinalVersion(), tempVersion, this.bc.lastBlockNumber());
    if (!this.bc.merge(chainSubsection, tempDb)) {
      logger.error(`[${LOG_HEADER}] Failed to merge chain subsection: ` +
          `${JSON.stringify(chainSubsection, null, 2)}`);
      this.destroyDb(tempDb);
      return false;
    }
    const lastBlockNumber = this.bc.lastBlockNumber();
    this.cloneAndFinalizeVersion(tempDb.stateVersion, lastBlockNumber);
    chainSubsection.forEach((block) => {
      this.tp.cleanUpForNewBlock(block);
      this.tp.updateNonceTrackers(block.transactions);
    });
    return true;
  }

  executeChainOnDb(db) {
    const LOG_HEADER = 'executeChainOnDb';
    this.bc.chain.forEach((block) => {
      const transactions = block.transactions;
      if (!db.executeTransactionList(block.last_votes)) {
        logger.error(`[${LOG_HEADER}] Failed to execute last_votes`)
      }
      if (!db.executeTransactionList(transactions)) {
        logger.error(`[${LOG_HEADER}] Failed to execute transactions`)
      }
      this.tp.updateNonceTrackers(transactions);
    });
  }
}

module.exports = BlockchainNode;
