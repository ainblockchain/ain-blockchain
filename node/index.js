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
} = require('../constants');
const ChainUtil = require('../chain-util');
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
    this.db = this.createDb(StateVersions.EMPTY, initialVersion, this.bc, this.tp, false);
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
    return this.createDb(baseVersion, newVersion, null, null, false, blockNumberSnapshot);
  }

  createDb(baseVersion, newVersion, bc, tp, isFinalizedState, blockNumberSnapshot) {
    const LOG_HEADER = 'createDb';
    const newRoot = this.stateManager.cloneVersion(baseVersion, newVersion);
    if (!newRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone state version: ${baseVersion}`)
      return null;
    }
    if (isFinalizedState) {
      this.stateManager.finalizeVersion(newVersion);
    }
    return new DB(newRoot, newVersion, bc, tp, isFinalizedState, blockNumberSnapshot);
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
    const clonedRoot = this.stateManager.cloneFinalizedVersion(newVersion);
    if (!clonedRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone finalized state version: ` +
          `${this.stateManager.getFinalizedVersion()}`);
    }
    this.db.setStateVersion(clonedRoot, newVersion);
    if (oldVersion) {
      this.stateManager.deleteVersion(oldVersion);
    }
    return true;
  }

  cloneAndFinalizeVersion(version, blockNumber) {
    const LOG_HEADER = 'cloneAndFinalizeVersion';
    const oldVersion = this.stateManager.getFinalizedVersion();
    const backupVersion = `${StateVersions.BACKUP}:${blockNumber}`;
    const clonedRoot = this.stateManager.cloneVersion(version, backupVersion);
    if (!clonedRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone state version: ${version}`);
      return;
    }
    this.stateManager.finalizeVersion(backupVersion);
    if (oldVersion) {
      logger.info(`[${LOG_HEADER}] Deleting previously finalized version: ${oldVersion}`);
      this.stateManager.deleteVersion(oldVersion);
    }
    const nodeVersion = `${StateVersions.NODE}:${blockNumber}`;
    this.syncDb(nodeVersion)
  }

  dumpFinalizedVersion(withDetails) {
    return this.stateManager.getFinalizedRoot().toJsObject(withDetails);
  }

  getNonce() {
    const LOG_HEADER = 'getNonce';
    // TODO (Chris): Search through all blocks for any previous nonced transaction with current
    //               publicKey
    let nonce = 0;
    for (let i = this.bc.chain.length - 1; i > -1; i--) {
      for (let j = this.bc.chain[i].transactions.length - 1; j > -1; j--) {
        if (ainUtil.areSameAddresses(this.bc.chain[i].transactions[j].address,
            this.account.address) && this.bc.chain[i].transactions[j].nonce > -1) {
          // If blockchain is being restarted, retreive nonce from blockchain
          nonce = this.bc.chain[i].transactions[j].nonce + 1;
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
  createTransaction(txData, isNoncedTransaction = true) {
    if (Transaction.isBatchTransaction(txData)) {
      const txList = [];
      txData.tx_list.forEach((subData) => {
        txList.push(this.createSingleTransaction(subData, isNoncedTransaction));
      })
      return {tx_list: txList};
    }
    return this.createSingleTransaction(txData, isNoncedTransaction);
  }

  createSingleTransaction(txData, isNoncedTransaction) {
    // Workaround for skip_verif with custom address
    if (txData.address !== undefined) {
      txData.skip_verif = true;
    }
    if (txData.nonce === undefined) {
      let nonce;
      if (isNoncedTransaction) {
        nonce = this.nonce;
        this.nonce++;
      } else {
        nonce = -1;
      }
      txData.nonce = nonce;
    }
    return Transaction.newTransaction(txData, this.account.private_key);
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
    const tempDb = this.createTempDb(
        this.stateManager.getFinalizedVersion(),
        `${StateVersions.TEMP}:${Date.now()}`,
        this.bc.lastBlockNumber()
      );
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
