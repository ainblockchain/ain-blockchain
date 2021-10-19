/* eslint guard-for-in: "off" */
const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');
const path = require('path');
const logger = require('../logger')('NODE');
const {
  FeatureFlags,
  PORT,
  ACCOUNT_INDEX,
  KEYSTORE_FILE_PATH,
  SYNC_MODE,
  ON_MEMORY_CHAIN_LENGTH,
  SNAPSHOTS_ROOT_DIR,
  SNAPSHOTS_INTERVAL_BLOCK_NUMBER,
  MAX_NUM_SNAPSHOTS,
  BlockchainNodeStates,
  PredefinedDbPaths,
  ShardingProperties,
  ShardingProtocols,
  GenesisAccounts,
  GenesisSharding,
  TransactionStates,
  StateVersions,
  SyncModeOptions,
  LIGHTWEIGHT,
  TX_POOL_SIZE_LIMIT,
  TX_POOL_SIZE_LIMIT_PER_ACCOUNT,
  MAX_BLOCK_NUMBERS_FOR_RECEIPTS,
  KEYS_ROOT_DIR,
} = require('../common/constants');
const FileUtil = require('../common/file-util');
const CommonUtil = require('../common/common-util');
const PathUtil = require('../common/path-util');
const Blockchain = require('../blockchain');
const TransactionPool = require('../tx-pool');
const StateManager = require('../db/state-manager');
const DB = require('../db');
const Transaction = require('../tx-pool/transaction');

class BlockchainNode {
  constructor() {
    this.keysDir = path.resolve(KEYS_ROOT_DIR, `${PORT}`);
    FileUtil.createDir(this.keysDir);
    this.snapshotDir = path.resolve(SNAPSHOTS_ROOT_DIR, `${PORT}`);
    FileUtil.createSnapshotDir(this.snapshotDir);

    this.account = null;
    this.bootstrapAccount = null;
    this.ipAddrInternal = null;
    this.ipAddrExternal = null;
    this.urlInternal = null;
    this.urlExternal = null;

    this.bc = new Blockchain(String(PORT));
    this.tp = new TransactionPool(this);
    this.stateManager = new StateManager();
    const initialVersion = `${StateVersions.NODE}:${this.bc.lastBlockNumber()}`;
    this.db = DB.create(
        StateVersions.EMPTY, initialVersion, this.bc, false, this.bc.lastBlockNumber(),
        this.stateManager);

    this.state = BlockchainNodeStates.STARTING;
    logger.info(`Now node in STARTING state!`);
    this.initAccount();
  }

  setAccount(account) {
    this.account = account;
    this.bootstrapAccount = null;
  }

  initAccount() {
    const LOG_HEADER = 'initAccount';
    if (ACCOUNT_INDEX !== null) {
      this.setAccount(GenesisAccounts.others[ACCOUNT_INDEX]);
      if (!this.account) {
        throw Error(`[${LOG_HEADER}] Failed to initialize with an account`);
      }
      logger.info(`[${LOG_HEADER}] Initializing a new blockchain node with account: ` +
          `${this.account.address}`);
      this.initShardSetting();
    } else if (KEYSTORE_FILE_PATH !== null) {
      // Create a bootstrap account & wait for the password
      this.bootstrapAccount = ainUtil.createAccount();
    } else {
      throw Error(`[${LOG_HEADER}] Must specify either KEYSTORE_FILE_PATH or ACCOUNT_INDEX.`);
    }
  }

  async injectAccount(encryptedPassword) {
    const LOG_HEADER = 'injectAccount';
    if (!this.bootstrapAccount || this.account || this.state !== BlockchainNodeStates.STARTING) {
      return false;
    }
    try {
      const password = await ainUtil.decryptWithPrivateKey(
          this.bootstrapAccount.private_key, encryptedPassword);
      const accountFromKeystore = FileUtil.getAccountFromKeystoreFile(KEYSTORE_FILE_PATH, password);
      if (accountFromKeystore !== null) {
        this.setAccount(accountFromKeystore);
        logger.info(`[${LOG_HEADER}] Injecting an account from a keystore file: ` +
            `${this.account.address}`);
        this.initShardSetting();
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
    const LOG_HEADER = 'BlockchainNode.init';

    let latestSnapshot = null;
    let latestSnapshotPath = null;
    let latestSnapshotBlockNumber = -1;

    // 1. Get the latest snapshot if in the "fast" sync mode.
    if (SYNC_MODE === SyncModeOptions.FAST) {
      logger.info(`[${LOG_HEADER}] Initializing node in 'fast' mode..`);
      const latestSnapshotInfo = FileUtil.getLatestSnapshotInfo(this.snapshotDir);
      latestSnapshotPath = latestSnapshotInfo.latestSnapshotPath;
      latestSnapshotBlockNumber = latestSnapshotInfo.latestSnapshotBlockNumber;
      if (latestSnapshotPath) {
        try {
          latestSnapshot = FileUtil.readCompressedJson(latestSnapshotPath);
        } catch (err) {
          logger.error(`[${LOG_HEADER}] ${err.stack}`);
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
    startingDb.initDbStates(latestSnapshot);

    // 3. Initialize the blockchain, starting from `latestSnapshotBlockNumber`.
    logger.info(`[${LOG_HEADER}] Initializing blockchain..`);
    const { wasBlockDirEmpty, isGenesisStart } =
        this.bc.init(isFirstNode, latestSnapshotBlockNumber);

    // 4. Execute the chain on the DB and finalize it.
    logger.info(`[${LOG_HEADER}] Executing chains on DB if needed..`);
    let lastBlockWithoutProposal = null;
    if (!wasBlockDirEmpty || isGenesisStart) {
      lastBlockWithoutProposal =
          this.loadAndExecuteChainOnDb(latestSnapshotBlockNumber, !wasBlockDirEmpty, startingDb);
    }
    this.cloneAndFinalizeVersion(StateVersions.START, this.bc.lastBlockNumber());

    // 5. Execute transactions from the pool.
    logger.info(`[${LOG_HEADER}] Executing the transaction from the tx pool..`);
    this.db.executeTransactionList(
        this.tp.getValidTransactions(null, this.stateManager.getFinalVersion()), false, true,
        this.bc.lastBlockNumber() + 1);

    // 6. Node status changed: STARTING -> SYNCING.
    this.state = BlockchainNodeStates.SYNCING;
    logger.info(`[${LOG_HEADER}] Now node in SYNCING state!`);

    return lastBlockWithoutProposal;
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
    if (FeatureFlags.enableStateTreeTransfer) {
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
    if (blockNumber % SNAPSHOTS_INTERVAL_BLOCK_NUMBER === 0) {
      const snapshot = this.dumpFinalDbStates();
      FileUtil.writeSnapshot(this.snapshotDir, blockNumber, snapshot);
      FileUtil.writeSnapshot(
          this.snapshotDir, blockNumber - MAX_NUM_SNAPSHOTS * SNAPSHOTS_INTERVAL_BLOCK_NUMBER, null);
    }
  }

  dumpFinalDbStates(options) {
    return this.stateManager.getFinalRoot().toJsObject(options);
  }

  getTransactionByHash(hash) {
    const LOG_HEADER = 'getTransactionByHash';
    const transactionInfo = this.tp.transactionTracker[hash];
    if (!transactionInfo) {
      return null;
    }

    if (transactionInfo.state === TransactionStates.IN_BLOCK) {
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
              shardPath, PredefinedDbPaths.DOT_SHARD, ShardingProperties.PROOF_HASH_MAP,
              ShardingProperties.LATEST)),
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
      result.limit = TX_POOL_SIZE_LIMIT_PER_ACCOUNT;
      result.used = this.tp.getPerAccountPoolSize(address);
    } else { // Total
      result.limit = TX_POOL_SIZE_LIMIT;
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
    if (FeatureFlags.enableRichTransactionLogging) {
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
    if (!LIGHTWEIGHT) {
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
      if (FeatureFlags.enableRichTransactionLogging) {
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

  addNewBlock(block) {
    if (this.bc.addNewBlockToChain(block)) {
      this.tp.cleanUpForNewBlock(block);
      return true;
    }
    return false;
  }

  removeOldReceipts(blockNumber, db) {
    const LOG_HEADER = 'removeOldReceipts';
    if (!FeatureFlags.enableReceiptsRecording) {
      return;
    }
    if (blockNumber > MAX_BLOCK_NUMBERS_FOR_RECEIPTS) {
      const oldBlock = this.bc.getBlockByNumber(blockNumber - MAX_BLOCK_NUMBERS_FOR_RECEIPTS);
      if (oldBlock) {
        oldBlock.transactions.forEach((tx) => {
          db.writeDatabase(
              [
                PredefinedDbPaths.VALUES_ROOT,
                ...CommonUtil.parsePath(PathUtil.getReceiptPath(tx.hash))
              ], null);
        });
      } else {
        logger.error(
            `[${LOG_HEADER}] Non-existing block ${blockNumber - MAX_BLOCK_NUMBERS_FOR_RECEIPTS}.`);
      }
    }
  }

  applyBlocksToDb(blockList, db) {
    const LOG_HEADER = 'applyBlocksToDb';

    for (const block of blockList) {
      this.removeOldReceipts(block.number, db);
      if (block.number > 0) {
        if (!db.executeTransactionList(block.last_votes, true, false, 0, block.timestamp)) {
          logger.error(`[${LOG_HEADER}] Failed to execute last_votes of block: ` +
              `${JSON.stringify(block, null, 2)}`);
          return false;
        }
      }
      if (!db.executeTransactionList(block.transactions, block.number === 0, false, block.number, block.timestamp)) {
        logger.error(`[${LOG_HEADER}] Failed to execute transactions of block: ` +
            `${JSON.stringify(block, null, 2)}`);
        return false;
      }
      if (!LIGHTWEIGHT) {
        if (db.stateRoot.getProofHash() !== block.state_proof_hash) {
          logger.error(`[${LOG_HEADER}] Failed to validate state proof of block: ` +
              `${JSON.stringify(block, null, 2)}\n${db.stateRoot.getProofHash()}`);
          return false;
        }
      }
    }
    return true;
  }

  mergeChainSegment(chainSegment) {
    const LOG_HEADER = 'mergeChainSegment';

    if (!chainSegment || chainSegment.length === 0) {
      logger.info(`[${LOG_HEADER}] Empty chain segment`);
      if (this.state !== BlockchainNodeStates.SERVING) {
        // Regard this situation as if you're synced.
        // TODO(liayoo): Ask the tracker server for another peer.
        logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
        this.state = BlockchainNodeStates.SERVING;
        logger.info(`[${LOG_HEADER}] Now node in SERVING state.`);
      }
      return false;
    }
    if (chainSegment[chainSegment.length - 1].number < this.bc.lastBlockNumber()) {
      logger.info(
          `[${LOG_HEADER}] Received chain is of lower block number than current last block number`);
      return false;
    }
    if (chainSegment[chainSegment.length - 1].number === this.bc.lastBlockNumber()) {
      logger.info(`[${LOG_HEADER}] Received chain is at the same block number`);
      if (this.state !== BlockchainNodeStates.SERVING) {
        // Regard this situation as if you're synced.
        // TODO(liayoo): Ask the tracker server for another peer.
        logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
        this.state = BlockchainNodeStates.SERVING;
        logger.info(`[${LOG_HEADER}] Now node in SERVING state!`);
      }
      return false;
    }

    const baseVersion = this.stateManager.getFinalVersion();
    const tempDb = this.createTempDb(
        baseVersion, `${StateVersions.SEGMENT}:${this.bc.lastBlockNumber()}`,
        this.bc.lastBlockNumber());
    if (!tempDb) {
      logger.error(`[${LOG_HEADER}] Failed to create a temp database with state version: ${baseVersion}.`);
      return null;
    }
    const validBlocks = this.bc.getValidBlocksInChainSegment(chainSegment);
    if (validBlocks.length > 0) {
      if (!this.applyBlocksToDb(validBlocks, tempDb)) {
        logger.error(`[${LOG_HEADER}] Failed to apply valid blocks to database: ` +
            `${JSON.stringify(validBlocks, null, 2)}`);
        tempDb.destroyDb();
        return false;
      }
      for (const block of validBlocks) {
        if (!this.bc.addNewBlockToChain(block)) {
          logger.error(`[${LOG_HEADER}] Failed to add new block to chain: ` +
              `${JSON.stringify(block, null, 2)}`);
          tempDb.destroyDb();
          return false;
        }
      }
      const lastBlockNumber = this.bc.lastBlockNumber();
      this.cloneAndFinalizeVersion(tempDb.stateVersion, lastBlockNumber);
      for (const block of validBlocks) {
        this.tp.cleanUpForNewBlock(block);
      }
    } else {
      logger.info(`[${LOG_HEADER}] No blocks to apply.`);
      return true;
    }
    tempDb.destroyDb();

    return true;
  }

  executeBlockOnDb(block, db) {
    const LOG_HEADER = 'executeBlockOnDb';

    this.removeOldReceipts(block.number, db);
    if (block.number > 0) {
      if (!db.executeTransactionList(block.last_votes, true, false, block.number, block.timestamp)) {
        logger.error(`[${LOG_HEADER}] Failed to execute last_votes (${block.number})`);
        // NOTE(liayoo): Quick fix for the problem. May be fixed by deleting the block files.
        process.exit(1);
      }
    }
    if (!db.executeTransactionList(block.transactions, block.number === 0, false, block.number, block.timestamp)) {
      logger.error(`[${LOG_HEADER}] Failed to execute transactions (${block.number})`)
      // NOTE(liayoo): Quick fix for the problem. May be fixed by deleting the block files.
      process.exit(1);
    }
    if (block.state_proof_hash !== db.stateRoot.getProofHash()) {
      logger.error(`[${LOG_HEADER}] Invalid state proof hash (${block.number}): ` +
          `${db.stateRoot.getProofHash()}, ${block.state_proof_hash}`);
      // NOTE(liayoo): Quick fix for the problem. May be fixed by deleting the block files.
      process.exit(1);
    }
    this.tp.cleanUpForNewBlock(block);
    logger.info(`[${LOG_HEADER}] Successfully executed block ${block.number} on DB.`);
  }

  loadAndExecuteChainOnDb(latestSnapshotBlockNumber, deleteLastBlock, db) {
    const LOG_HEADER = 'loadAndExecuteChainOnDb';

    let lastBlockWithoutProposal = null;
    const numBlockFiles = this.bc.getNumBlockFiles();
    const fromBlockNumber = SYNC_MODE === SyncModeOptions.FAST ? latestSnapshotBlockNumber + 1 : 0;
    let prevBlockNumber = latestSnapshotBlockNumber;
    let prevBlockHash = null;
    for (let number = fromBlockNumber; number < numBlockFiles; number++) {
      const block = this.bc.loadBlock(number);
      if (!block) {
        logger.error(`[${LOG_HEADER}] Failed to load block ${number}.`);
        // NOTE(liayoo): Quick fix for the problem. May be fixed by deleting the block files.
        process.exit(1);
      }
      logger.info(`[${LOG_HEADER}] Successfully loaded block: ${block.number} / ${block.epoch}`);
      if (!Blockchain.validateBlock(block, prevBlockNumber, prevBlockHash)) {
        logger.error(`[${LOG_HEADER}] Failed to validate block ${number}.`);
        // NOTE(liayoo): Quick fix for the problem. May be fixed by deleting the block files.
        process.exit(1);
      }
      // NOTE(liayoo): we don't have the votes for the last block, so remove it and try to
      //               receive from peers.
      if (deleteLastBlock && number > 0 && number === numBlockFiles - 1) {
        lastBlockWithoutProposal = block;
        this.bc.deleteBlock(lastBlockWithoutProposal);
      } else {
        this.executeBlockOnDb(block, db);
        if (numBlockFiles - number <= ON_MEMORY_CHAIN_LENGTH) {
          this.bc.addBlockToChain(block)
        }
      }
      prevBlockNumber = block.number;
      prevBlockHash = block.hash;
    }

    return lastBlockWithoutProposal;
  }
}

module.exports = BlockchainNode;
