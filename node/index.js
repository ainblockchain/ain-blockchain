const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger');
const {
  PORT,
  ACCOUNT_INDEX,
  PredefinedDbPaths,
  ShardingProperties,
  ShardingProtocols,
  GenesisAccounts,
  GenesisSharding
} = require('../constants');
const ChainUtil = require('../chain-util');
const Blockchain = require('../blockchain');
const TransactionPool = require('../tx-pool');
const DB = require('../db');
const Transaction = require('../tx-pool/transaction');

const NODE_PREFIX = 'NODE';
const isShardChain = GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE;

class BlockchainNode {
  constructor() {
    // TODO(lia): Add account importing functionality.
    this.account = ACCOUNT_INDEX !== null ?
        GenesisAccounts.others[ACCOUNT_INDEX] : ainUtil.createAccount();
    logger.info(`[${NODE_PREFIX}] Initializing a new blockchain node with account: ` +
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
    this.db = new DB(this.bc, this.tp, false);
    this.nonce = null;
    this.initialized = false;
  }

  // For testing purpose only.
  setAccountForTesting(accountIndex) {
    this.account = GenesisAccounts.others[accountIndex];
  }

  setIpAddresses(ipAddrInternal, ipAddrExternal) {
    this.ipAddrInternal = ipAddrInternal;
    this.ipAddrExternal = ipAddrExternal;
    this.urlInternal = BlockchainNode.getNodeUrl(ipAddrInternal);
    this.urlExternal = BlockchainNode.getNodeUrl(ipAddrExternal);
    logger.info(
        `[${NODE_PREFIX}] Set Node URLs to '${this.urlInternal}' (internal), ` +
        `'${this.urlExternal}' (external)`);
  }

  static getNodeUrl(ipAddr) {
    return `http://${ipAddr}:${PORT}`;
  }

  init(isFirstNode) {
    logger.info(`[${NODE_PREFIX}] Initializing node..`);
    const lastBlockWithoutProposal = this.bc.init(isFirstNode);
    this.bc.setBackupDb(new DB(this.bc, this.tp, true));
    this.nonce = this.getNonce();
    this.executeChainOnBackupDb();
    this.db.setDbToSnapshot(this.bc.backupDb);
    this.db.executeTransactionList(this.tp.getValidTransactions());
    this.initialized = true;
    return lastBlockWithoutProposal;
  }

  getNonce() {
    // TODO (Chris): Search through all blocks for any previous nonced transaction with current
    //               publicKey
    let nonce = 0;
    for (let i = this.bc.chain.length - 1; i > -1; i--) {
      for (let j = this.bc.chain[i].transactions.length -1; j > -1; j--) {
        if (ainUtil.areSameAddresses(this.bc.chain[i].transactions[j].address,
                                     this.account.address)
            && this.bc.chain[i].transactions[j].nonce > -1) {
          // If blockchain is being restarted, retreive nonce from blockchain
          nonce = this.bc.chain[i].transactions[j].nonce + 1;
          break;
        }
      }
      if (nonce > 0) {
        break;
      }
    }

    logger.info(`[${NODE_PREFIX}] Setting nonce to ${nonce}`);
    return nonce;
  }

  getSharding() {
    const shardingInfo = {};
    const shards = this.db.getValue(ChainUtil.formatPath(
        [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_SHARD]));
    for (let encodedPath in shards) {
      const shardPath = ainUtil.decode(encodedPath);
      const shardProofHashes =
          this.db.getValue(ChainUtil.appendPath(shardPath, ShardingProperties.SHARD));
      shardingInfo[encodedPath] = {
        [ShardingProperties.SHARDING_ENABLED]: shardProofHashes[
          ShardingProperties.SHARDING_ENABLED
        ],
        [ShardingProperties.LATEST_BLOCK_NUMBER]: ChainUtil.getJsObject(
            shardProofHashes, [
          ShardingProperties.PROOF_HASH_MAP,
          ShardingProperties.LATEST
        ]),
      };
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
      return { tx_list: txList };
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
    return Transaction.newTransaction(this.account.private_key, txData);
  }

  addNewBlock(block) {
    if (this.bc.addNewBlockToChain(block)) {
      this.tp.cleanUpForNewBlock(block);
      this.db.setDbToSnapshot(this.bc.backupDb);
      this.tp.updateNonceTrackers(block.transactions);
      this.tp.checkRemoteTransactions();
      return true;
    }
    return false;
  }

  executeChainOnBackupDb() {
    this.bc.chain.forEach((block) => {
      const transactions = block.transactions;
      if (!this.bc.backupDb.executeTransactionList(block.last_votes)) {
        logger.error(`[node:executeChainOnBackupDb] Failed to execute last_votes`)
      }
      if (!this.bc.backupDb.executeTransactionList(transactions)) {
        logger.error(`[node:executeChainOnBackupDb] Failed to execute transactions`)
      }
      this.tp.updateNonceTrackers(transactions);
    });
  }
}

module.exports = BlockchainNode;
