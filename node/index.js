/* eslint guard-for-in: "off" */
const logger = new (require('../logger'))('NODE');

const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');
const path = require('path');
const {
  DevFlags,
  BlockchainConfigs,
  BlockchainNodeStates,
  PredefinedDbPaths,
  BlockchainSnapshotProperties,
  ShardingProperties,
  ShardingProtocols,
  GenesisAccounts,
  GenesisSharding,
  TransactionStates,
  StateVersions,
  SyncModeOptions,
} = require('../common/constants');
const { ValidatorOffenseTypes } = require('../consensus/constants');
const FileUtil = require('../common/file-util');
const CommonUtil = require('../common/common-util');
const Blockchain = require('../blockchain');
const TransactionPool = require('../tx-pool');
const StateManager = require('../db/state-manager');
const DB = require('../db');
const Transaction = require('../tx-pool/transaction');
const Consensus = require('../consensus');
const BlockPool = require('../block-pool');
const ConsensusUtil = require('../consensus/consensus-util');

class BlockchainNode {
  constructor(account = null) {
    this.keysDir = path.resolve(BlockchainConfigs.KEYS_ROOT_DIR, `${BlockchainConfigs.PORT}`);
    FileUtil.createDir(this.keysDir);
    this.snapshotDir = path.resolve(BlockchainConfigs.SNAPSHOTS_ROOT_DIR, `${BlockchainConfigs.PORT}`);
    FileUtil.createSnapshotDir(this.snapshotDir);

    this.account = account;
    this.bootstrapAccount = null;
    this.ipAddrInternal = null;
    this.ipAddrExternal = null;
    this.urlInternal = null;
    this.urlExternal = null;

    this.bc = new Blockchain(String(BlockchainConfigs.PORT));
    this.tp = new TransactionPool(this);
    this.bp = new BlockPool(this);
    this.stateManager = new StateManager();
    const initialVersion = `${StateVersions.NODE}:${this.bc.lastBlockNumber()}`;
    this.db = DB.create(
        StateVersions.EMPTY, initialVersion, this.bc, false, this.bc.lastBlockNumber(),
        this.stateManager);
    this.state = BlockchainNodeStates.STARTING;
    logger.info(`Now node in STARTING state!`);
    if (account === null) {
      this.initAccount();
    }
  }

  setAccount(account) {
    this.account = account;
    this.bootstrapAccount = null;
  }

  initAccount() {
    const LOG_HEADER = 'initAccount';
    if (BlockchainConfigs.ACCOUNT_INDEX !== null) { // TODO(liayoo): Deprecate ACCOUNT_INDEX.
      this.setAccountAndInitShardSetting(GenesisAccounts.others[BlockchainConfigs.ACCOUNT_INDEX]);
    } else if (BlockchainConfigs.ACCOUNT_INJECTION_OPTION !== null) {
      // Create a bootstrap account & wait for the account injection
      this.bootstrapAccount = ainUtil.createAccount();
    } else {
      throw Error(`[${LOG_HEADER}] Must specify either ACCOUNT_INJECTION_OPTION or ACCOUNT_INDEX.`);
    }
  }

  setAccountAndInitShardSetting(account) {
    const LOG_HEADER = 'setAccountAndInitShardSetting';
    this.setAccount(account);
    if (!this.account) {
      throw Error(`[${LOG_HEADER}] Failed to initialize with an account`);
    }
    logger.info(`[${LOG_HEADER}] Initializing a new blockchain node with account: ` +
        `${this.account.address}`);
    this.initShardSetting();
  }

  async injectAccountFromKeystore(encryptedPassword) {
    const LOG_HEADER = 'injectAccountFromKeystore';
    if (!this.bootstrapAccount || this.account || this.state !== BlockchainNodeStates.STARTING) {
      return false;
    }
    try {
      const password = await ainUtil.decryptWithPrivateKey(
          this.bootstrapAccount.private_key, encryptedPassword);
      const accountFromKeystore = FileUtil.getAccountFromKeystoreFile(BlockchainConfigs.KEYSTORE_FILE_PATH, password);
      if (accountFromKeystore !== null) {
        this.setAccountAndInitShardSetting(accountFromKeystore)
        return true;
      }
      return false;
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Failed to inject an account: ${err.stack}`);
      return false;
    }
  }

  async injectAccountFromHDWallet(encryptedMnemonic, index) {
    const LOG_HEADER = 'injectAccountFromHDWallet';
    try {
      const mnemonic = await ainUtil.decryptWithPrivateKey(
          this.bootstrapAccount.private_key, encryptedMnemonic);
      const accountFromHDWallet = ainUtil.mnemonicToAccount(mnemonic, index);
      if (accountFromHDWallet !== null) {
        this.setAccountAndInitShardSetting(accountFromHDWallet)
        return true;
      }
      return false;
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Failed to inject an account: ${err.stack}`);
      return false;
    }
  }

  initShardSetting() {
    this.isShardChain = GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE;
    this.isShardReporter =
        this.isShardChain &&
        CommonUtil.areSameAddrs(
            GenesisSharding[ShardingProperties.SHARD_REPORTER], this.account.address);
  }

  // For testing purpose only.
  setAccountForTesting(account) {
    this.account = account;
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
    return `http://${ipAddr}:${BlockchainConfigs.PORT}`;
  }

  initNode(isFirstNode) {
    const LOG_HEADER = 'initNode';

    let latestSnapshot = null;
    let latestSnapshotPath = null;
    let latestSnapshotBlockNumber = -1;

    // 1. Get the latest snapshot if in the "fast" sync mode.
    if (BlockchainConfigs.SYNC_MODE === SyncModeOptions.FAST) {
      logger.info(`[${LOG_HEADER}] Initializing node in 'fast' mode..`);
      const latestSnapshotInfo = FileUtil.getLatestSnapshotInfo(this.snapshotDir);
      latestSnapshotPath = latestSnapshotInfo.latestSnapshotPath;
      if (latestSnapshotPath) {
        try {
          latestSnapshot = FileUtil.readCompressedJson(latestSnapshotPath);
          latestSnapshotBlockNumber = latestSnapshot[BlockchainSnapshotProperties.BLOCK_NUMBER];
        } catch (err) {
          CommonUtil.finishWithStackTrace(
              logger, 
              `[${LOG_HEADER}] Failed to read latest snapshot file (${latestSnapshotPath}) ` +
              `with error: ${err.stack}`);
          return false;
        }
      }
      logger.info(`[${LOG_HEADER}] Fast mode DB snapshot loading done!`);
    } else {
      logger.info(`[${LOG_HEADER}] Initializing node in 'full' mode..`);
    }

    // 2. Initialize DB (with the latest snapshot, if it exists)
    logger.info(`[${LOG_HEADER}] Initializing DB..`);
    const startingDb = DB.create(
        StateVersions.EMPTY, StateVersions.START, this.bc, true, latestSnapshotBlockNumber,
        this.stateManager);
    startingDb.initDb(latestSnapshot);

    // 3. Initialize the blockchain, starting from `latestSnapshotBlockNumber`.
    logger.info(`[${LOG_HEADER}] Initializing blockchain..`);
    const { wasBlockDirEmpty, isGenesisStart } =
        this.bc.initBlockchain(isFirstNode, latestSnapshot);

    // 4. Execute the chain on the DB and finalize it.
    logger.info(`[${LOG_HEADER}] Executing chains on DB if needed..`);
    if (!wasBlockDirEmpty || isGenesisStart) {
      if (!this.loadAndExecuteChainOnDb(latestSnapshotBlockNumber, startingDb.stateVersion, isGenesisStart)) {
        return false;
      }
    }

    // 5. Execute transactions from the pool.
    logger.info(`[${LOG_HEADER}] Executing the transaction from the tx pool..`);
    this.db.executeTransactionList(
        this.tp.getValidTransactions(null, this.stateManager.getFinalVersion()), false, true,
        this.bc.lastBlockNumber() + 1);

    // 6. Node status changed: STARTING -> SYNCING.
    this.state = BlockchainNodeStates.SYNCING;
    logger.info(`[${LOG_HEADER}] Now node in SYNCING state!`);

    return true;
  }

  createTempDb(baseVersion, versionPrefix, blockNumberSnapshot) {
    const LOG_HEADER = 'createTempDb';
    const { tempVersion, tempRoot } = this.stateManager.cloneToTempVersion(
        baseVersion, versionPrefix);
    if (!tempRoot) {
      logger.error(
          `[${LOG_HEADER}] Failed to clone state version: ${baseVersion}`);
      return null;
    }
    return new DB(tempRoot, tempVersion, null, blockNumberSnapshot, this.stateManager);
  }

  syncDbAndNonce(newVersion) {
    const LOG_HEADER = 'syncDbAndNonce';

    const oldVersion = this.db.stateVersion;
    if (newVersion === oldVersion) {
      logger.info(`[${LOG_HEADER}] Already sync'ed with version: ${newVersion}`);
      return false;
    }
    const clonedRoot = this.stateManager.cloneFinalVersion(newVersion);
    if (!clonedRoot) {
      logger.error(`[${LOG_HEADER}] Failed to clone the final state version: ` +
          `${this.stateManager.getFinalVersion()}`);
    }
    this.db.setStateVersion(newVersion, clonedRoot);
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
    logger.info(`[${LOG_HEADER}] Finalizing version: ${newFinalVersion}`);
    if (!this.stateManager.finalizeVersion(newFinalVersion)) {
      logger.error(`[${LOG_HEADER}] Failed to finalize version: ${newFinalVersion}`);
    }
    if (DevFlags.enableStateTreeTransfer) {
      logger.info(`[${LOG_HEADER}] Transfering state tree: ${version} -> ${newFinalVersion}`);
      if (!this.stateManager.transferStateTree(version, newFinalVersion)) {
        logger.error(
            `[${LOG_HEADER}] Failed to transfer state tree: ${version} -> ${newFinalVersion}`);
      }
    }
    if (oldFinalVersion) {
      logger.info(`[${LOG_HEADER}] Deleting previous final version: ${oldFinalVersion}`);
      if (!this.stateManager.deleteVersion(oldFinalVersion)) {
        logger.error(`[${LOG_HEADER}] Failed to delete previous final version: ${oldFinalVersion}`);
      }
    }
    const nodeVersion = `${StateVersions.NODE}:${blockNumber}`;
    this.syncDbAndNonce(nodeVersion);
    this.updateSnapshots(blockNumber);
  }

  updateSnapshots(blockNumber) {
    if (blockNumber % BlockchainConfigs.SNAPSHOTS_INTERVAL_BLOCK_NUMBER === 0) {
      const snapshot = this.buildBlockchainSnapshot(blockNumber, this.stateManager.getFinalRoot());
      FileUtil.writeSnapshot(this.snapshotDir, blockNumber, snapshot);
      FileUtil.writeSnapshot(
          this.snapshotDir,
          blockNumber - BlockchainConfigs.MAX_NUM_SNAPSHOTS * BlockchainConfigs.SNAPSHOTS_INTERVAL_BLOCK_NUMBER, null);
    }
  }

  buildBlockchainSnapshot(blockNumber, stateRoot) {
    const block = this.bc.getBlockByNumber(blockNumber);
    const stateSnapshot = stateRoot.toStateSnapshot({ includeVersion: true });
    const radixSnapshot = stateRoot.toRadixSnapshot();
    const rootProofHash = stateRoot.getProofHash();
    return {
      [BlockchainSnapshotProperties.BLOCK_NUMBER]: blockNumber,
      [BlockchainSnapshotProperties.BLOCK]: block,
      [BlockchainSnapshotProperties.STATE_SNAPSHOT]: stateSnapshot,
      [BlockchainSnapshotProperties.RADIX_SNAPSHOT]: radixSnapshot,
      [BlockchainSnapshotProperties.ROOT_PROOF_HASH]: rootProofHash,
    }
  }

  getTransactionByHash(hash) {
    const LOG_HEADER = 'getTransactionByHash';
    const transactionInfo = this.tp.transactionTracker[hash];
    if (!transactionInfo) {
      return null;
    }

    if (transactionInfo.state === TransactionStates.FINALIZED) {
      const block = this.bc.getBlockByNumber(transactionInfo.number);
      const index = transactionInfo.index;
      if (!block) {
        logger.debug(`[${LOG_HEADER}] Block of number ${transactionInfo.number} is missing`);
        return transactionInfo;
      } else if (index >= 0) {
        transactionInfo.transaction = block.transactions[index];
        transactionInfo.receipt = block.receipts[index];
      } else {
        transactionInfo.transaction =
            _.find(block.last_votes, (tx) => tx.hash === hash) || null;
      }
    } else if (transactionInfo.state === TransactionStates.EXECUTED ||
        transactionInfo.state === TransactionStates.PENDING) {
      const address = transactionInfo.address;
      transactionInfo.transaction =
          _.find(this.tp.transactions[address], (tx) => tx.hash === hash) || null;
    }
    return transactionInfo;
  }

  getNonce(fromPending = true) {
    return this.getNonceForAddr(this.account.address, fromPending);
  }

  getNonceForAddr(address, fromPending = true) {
    if (!CommonUtil.isValAddr(address)) return -1;
    const cksumAddr = CommonUtil.toCksumAddr(address);
    if (fromPending) {
      const { nonce } = this.db.getAccountNonceAndTimestamp(cksumAddr);
      return nonce;
    }
    const stateRoot = this.stateManager.getFinalRoot();
    const { nonce } = DB.getAccountNonceAndTimestampFromStateRoot(stateRoot, cksumAddr);
    return nonce;
  }

  getTimestampForAddr(address, fromPending) {
    if (!CommonUtil.isValAddr(address)) return -1;
    const cksumAddr = CommonUtil.toCksumAddr(address);
    if (fromPending) {
      const { timestamp } = this.db.getAccountNonceAndTimestamp(cksumAddr);
      return timestamp;
    }
    const stateRoot = this.stateManager.getFinalRoot();
    const { timestamp } = DB.getAccountNonceAndTimestampFromStateRoot(stateRoot, cksumAddr);
    return timestamp;
  }

  getSharding() {
    const shardingInfo = {};
    if (this.db && this.db.stateRoot) {
      const shards = this.db.getValue(CommonUtil.formatPath(
          [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_SHARD]));
      for (const encodedPath in shards) {
        const shardPath = ainUtil.decode(encodedPath);
        shardingInfo[encodedPath] = {
          [ShardingProperties.SHARDING_ENABLED]: this.db.getValue(CommonUtil.appendPath(
              shardPath, PredefinedDbPaths.DOT_SHARD, ShardingProperties.SHARDING_ENABLED)),
          [ShardingProperties.LATEST_BLOCK_NUMBER]: this.db.getValue(CommonUtil.appendPath(
              shardPath, PredefinedDbPaths.DOT_SHARD, ShardingProperties.LATEST_BLOCK_NUMBER)),
        };
      }
    }
    return shardingInfo;
  }

  getStateUsage(appName) {
    if (!appName) return null;
    return this.db.getStateUsageAtPath(`${PredefinedDbPaths.APPS}/${appName}`);
  }

  getTxPoolSizeUtilization(address) {
    const result = {};
    if (address) { // Per account
      result.limit = BlockchainConfigs.TX_POOL_SIZE_LIMIT_PER_ACCOUNT;
      result.used = this.tp.getPerAccountPoolSize(address);
    } else { // Total
      result.limit = BlockchainConfigs.TX_POOL_SIZE_LIMIT;
      result.used = this.tp.getPoolSize();
    }
    return result;
  }

  /**
    * Validates transaction is valid according to AIN database rules and returns a transaction
    * instance
    *
    * @param {dict} operation - Database write operation to be converted to transaction
    *                                        not
    * @return {Transaction} Instance of the transaction class
    */
  createTransaction(txBody) {
    const LOG_HEADER = 'createTransaction';

    if (Transaction.isBatchTxBody(txBody)) {
      const txList = [];
      for (const subTxBody of txBody.tx_body_list) {
        const createdTx = this.createSingleTransaction(subTxBody);
        if (createdTx === null) {
          logger.info(`[${LOG_HEADER}] Failed to create a transaction with subTx: ` +
              `${JSON.stringify(subTxBody, null, 2)}`);
        } else {
          txList.push(createdTx);
        }
      }
      return { tx_list: txList };
    }
    const createdTx = this.createSingleTransaction(txBody);
    if (createdTx === null) {
      logger.info(`[${LOG_HEADER}] Failed to create a transaction with txBody: ` +
          `${JSON.stringify(txBody, null, 2)}`);
      return null;
    }
    return createdTx;
  }

  createSingleTransaction(txBody) {
    if (txBody.nonce === undefined) {
      txBody.nonce = this.getNonce();
    }
    if (txBody.timestamp === undefined) {
      txBody.timestamp = Date.now();
    }
    if (txBody.gas_price === undefined) {
      txBody.gas_price = 0;
    }
    return Transaction.fromTxBody(txBody, this.account.private_key);
  }

  /**
   * Executes a transaction and add it to the transaction pool if the execution was successful.
   * @param {Object} tx transaction
   */
  executeTransactionAndAddToPool(tx) {
    const LOG_HEADER = 'executeTransactionAndAddToPool';
    if (DevFlags.enableRichTransactionLogging) {
      logger.info(`[${LOG_HEADER}] EXECUTING TRANSACTION: ${JSON.stringify(tx, null, 2)}`);
    }
    if (!this.tp.hasRoomForNewTransaction()) {
      return CommonUtil.logAndReturnTxResult(
          logger, 3,
          `[${LOG_HEADER}] Tx pool does NOT have enough room (${this.tp.getPoolSize()}).`);
    }
    if (this.tp.isNotEligibleTransaction(tx)) {
      return CommonUtil.logAndReturnTxResult(
          logger, 1,
          `[${LOG_HEADER}] Already received transaction: ${JSON.stringify(tx, null, 2)}`);
    }
    if (this.state !== BlockchainNodeStates.SERVING) {
      return CommonUtil.logAndReturnTxResult(
          logger, 2, `[${LOG_HEADER}] Blockchain node is NOT in SERVING mode: ${this.state}`, 0);
    }
    const executableTx = Transaction.toExecutable(tx);
    if (!Transaction.isExecutable(executableTx)) {
      return CommonUtil.logAndReturnTxResult(
          logger, 5,
          `[${LOG_HEADER}] Invalid transaction: ${JSON.stringify(executableTx, null, 2)}`);
    }
    if (!BlockchainConfigs.LIGHTWEIGHT) {
      if (!Transaction.verifyTransaction(executableTx)) {
        return CommonUtil.logAndReturnTxResult(logger, 6, `[${LOG_HEADER}] Invalid signature`);
      }
    }
    if (!this.tp.hasPerAccountRoomForNewTransaction(executableTx.address)) {
      const perAccountPoolSize = this.tp.getPerAccountPoolSize(executableTx.address);
      return CommonUtil.logAndReturnTxResult(
          logger, 4,
          `[${LOG_HEADER}] Tx pool does NOT have enough room (${perAccountPoolSize}) ` +
          `for account: ${executableTx.address}`);
    }
    const result = this.db.executeTransaction(executableTx, false, true, this.bc.lastBlockNumber() + 1);
    if (CommonUtil.isFailedTx(result)) {
      if (DevFlags.enableRichTransactionLogging) {
        logger.error(
            `[${LOG_HEADER}] FAILED TRANSACTION: ${JSON.stringify(executableTx, null, 2)}\n ` +
            `WITH RESULT:${JSON.stringify(result)}`);
      }
      // NOTE(liayoo): Transactions that don't pass the pre-checks will be rejected instantly and
      //               will not be included in the tx pool, as they can't be included in a block
      //               anyway, and may be used for attacks on blockchain nodes.
      if (!CommonUtil.txPrecheckFailed(result)) {
        this.tp.addTransaction(executableTx);
      }
    } else {
      this.tp.addTransaction(executableTx, true);
    }

    return result;
  }

  loadAndExecuteChainOnDb(latestSnapshotBlockNumber, latestSnapshotStateVersion, isGenesisStart) {
    const LOG_HEADER = 'loadAndExecuteChainOnDb';

    const numBlockFiles = this.bc.getNumBlockFiles();
    const fromBlockNumber = BlockchainConfigs.SYNC_MODE === SyncModeOptions.FAST ? Math.max(latestSnapshotBlockNumber, 0) : 0;
    let nextBlock = null;
    let proposalTx = null;
    for (let number = fromBlockNumber; number < numBlockFiles; number++) {
      const block = nextBlock ? nextBlock : this.bc.loadBlock(number);
      nextBlock = this.bc.loadBlock(number + 1);
      proposalTx = nextBlock ? ConsensusUtil.filterProposalFromVotes(nextBlock.last_votes) : null;
      if (!block) {
        // NOTE(liayoo): Quick fix for the problem. May be fixed by deleting the block files.
        CommonUtil.finishWithStackTrace(
            logger, `[${LOG_HEADER}] Failed to load block ${number}.`);
        return false;
      }
      logger.info(`[${LOG_HEADER}] Successfully loaded block: ${block.number} / ${block.epoch}`);
      try {
        if (latestSnapshotBlockNumber === number && BlockchainConfigs.SYNC_MODE === SyncModeOptions.FAST) {
          // TODO(liayoo): Deal with the case where block corresponding to the latestSnapshot doesn't exist.
          if (!this.bp.addSeenBlock(block, proposalTx)) {
            return false;
          }
          const latestDb = this.createTempDb(latestSnapshotStateVersion, `${StateVersions.LOAD}:${number}`, number);
          this.bp.addToHashToDbMap(block.hash, latestDb);
        } else {
          Consensus.validateAndExecuteBlockOnDb(block, this, StateVersions.LOAD, proposalTx, true);
          if (number === 0) {
            this.bc.addBlockToChainAndWriteToDisk(block, false);
            this.cloneAndFinalizeVersion(this.bp.hashToDb.get(block.hash).stateVersion, 0);
          } else {
            this.tryFinalizeChain(isGenesisStart);
          }
        }
      } catch (e) {
        CommonUtil.finishWithStackTrace(
            logger, `[${LOG_HEADER}] Failed to validate and execute block ${block.number}: ${e.stack}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Merge chainSegment into my blockchain.
   * @param {Array} chainSegment An array of blocks (a segment of the blockchain)
   * @returns {Number} 0 if merged successfully;
   *                   1 if chainSegment wasn't merged but I have a longer chain;
   *                  -1 if merge failed.
   */
  mergeChainSegment(chainSegment) {
    const LOG_HEADER = 'mergeChainSegment';

    if (!chainSegment || chainSegment.length === 0) {
      logger.info(`[${LOG_HEADER}] Empty chain segment`);
      if (this.state !== BlockchainNodeStates.SERVING) {
        // Regard this situation as if you're synced.
        logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
        this.state = BlockchainNodeStates.SERVING;
        logger.info(`[${LOG_HEADER}] Now node in SERVING state.`);
      }
      return 1; // Merge failed but I'm ahead
    }
    if (chainSegment[chainSegment.length - 1].number < this.bc.lastBlockNumber()) {
      logger.info(
          `[${LOG_HEADER}] Received chain is of lower block number than current last block number`);
      return 1; // Merge failed but I'm ahead
    }
    const validBlocks = this.bc.getValidBlocksInChainSegment(chainSegment, this.bp.getLongestNotarizedChainHeight());
    if (!validBlocks.length) {
      return -1; // Merge failed and I'm behind
    }
    for (let i = 0; i < validBlocks.length; i++) {
      const block = validBlocks[i];
      if (this.bp.hasSeenBlock(block.hash)) {
        continue;
      }
      const proposalTx = i < validBlocks.length - 1 ?
          ConsensusUtil.filterProposalFromVotes(validBlocks[i + 1].last_votes) : null;
      try {
        Consensus.validateAndExecuteBlockOnDb(block, this, StateVersions.SEGMENT, proposalTx, true);
        this.tryFinalizeChain();
      } catch (e) {
        logger.info(`[${LOG_HEADER}] Failed to add new block (${block.number} / ${block.hash}) to chain: ${e.stack}`);
        return -1; // Merge failed and I'm behind
      }
    }
    return 0; // Successfully merged
  }

  tryFinalizeChain(isGenesisStart = false) {
    const LOG_HEADER = 'tryFinalizeChain';
    const finalizableChain = this.bp.getFinalizableChain(isGenesisStart);
    if (!finalizableChain || !finalizableChain.length) {
      logger.debug(`[${LOG_HEADER}] No notarized chain with 3 consecutive epochs yet`);
      return;
    }
    const recordedInvalidBlocks = new Set();
    let numBlocks = finalizableChain.length;
    if (finalizableChain.length > 1 || finalizableChain[0].number !== 0) {
      numBlocks -= 1; // Cannot finalize the last block yet.
    }
    let lastFinalizedBlock = null
    for (let i = 0; i < numBlocks; i++) {
      const blockToFinalize = finalizableChain[i];
      if (blockToFinalize.number <= this.bc.lastBlockNumber()) {
        continue;
      }
      if (this.bc.addBlockToChainAndWriteToDisk(blockToFinalize, true)) {
        lastFinalizedBlock = blockToFinalize;
        logger.debug(`[${LOG_HEADER}] Finalized a block of number ${blockToFinalize.number} and ` +
            `hash ${blockToFinalize.hash}`);
        this.tp.cleanUpForNewBlock(blockToFinalize);
        if (!CommonUtil.isEmpty(blockToFinalize.evidence)) {
          Object.values(blockToFinalize.evidence).forEach((evidenceList) => {
            evidenceList.forEach((val) => {
              if (val.offense_type === ValidatorOffenseTypes.INVALID_PROPOSAL) {
                recordedInvalidBlocks.add(val.block.hash);
              }
            });
          });
        }
      } else {
        logger.error(`[${LOG_HEADER}] Failed to finalize a block: ` +
            `${JSON.stringify(blockToFinalize, null, 2)}`);
        return;
      }
    }
    if (lastFinalizedBlock) {
      const versionToFinalize = this.bp.hashToDb.get(lastFinalizedBlock.hash).stateVersion;
      this.cloneAndFinalizeVersion(versionToFinalize, lastFinalizedBlock.number);
      this.bp.cleanUpAfterFinalization(this.bc.lastBlock(), recordedInvalidBlocks);
    }
  }
}

module.exports = BlockchainNode;
