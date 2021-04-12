const stringify = require('fast-json-stable-stringify');
const sizeof = require('object-sizeof');
const moment = require('moment');
const logger = require('../logger')('BLOCK');
const ChainUtil = require('../common/chain-util');
const Transaction = require('../tx-pool/transaction');
const StateNode = require('../db/state-node');
const DB = require('../db');
const {
  PredefinedDbPaths,
  GenesisAccounts,
  GENESIS_VALIDATORS,
  GenesisValues,
  GenesisFunctions,
  GenesisRules,
  GenesisOwners,
  AccountProperties,
  ProofProperties,
  StateVersions,
} = require('../common/constants');
const PathUtil = require('../common/path-util');

class Block {
  constructor(lastHash, lastVotes, transactions, number, epoch, timestamp,
      stateProofHash, proposer, validators) {
    this.last_votes = lastVotes;
    this.transactions = Block.sanitizeTransactions(transactions);
    // Block's header
    this.last_hash = lastHash;
    this.last_votes_hash = ChainUtil.hashString(stringify(lastVotes));
    this.transactions_hash = ChainUtil.hashString(stringify(this.transactions));
    this.number = number;
    this.epoch = epoch;
    this.timestamp = timestamp;
    this.state_proof_hash = stateProofHash;
    this.proposer = proposer;
    this.validators = validators;
    // Hash of block's header
    this.hash = Block.hash(this);
    this.size = Block.getSize(this);
  }

  get header() {
    return {
      last_hash: this.last_hash,
      last_votes_hash: this.last_votes_hash,
      transactions_hash: this.transactions_hash,
      number: this.number,
      epoch: this.epoch,
      timestamp: this.timestamp,
      state_proof_hash: this.state_proof_hash,
      proposer: this.proposer,
      validators: this.validators,
    };
  }

  get body() {
    return {
      last_votes: this.last_votes,
      transactions: this.transactions,
    };
  }

  toString() {
    return JSON.stringify(this, null, 2);
  }

  static sanitizeTransactions(transactions) {
    const sanitized = [];
    transactions.forEach((tx) => {
      sanitized.push(Transaction.toJsObject(tx));
    });
    return sanitized;
  }

  static hash(block) {
    if (!(block instanceof Block)) block = Block.parse(block);
    return ChainUtil.hashString(stringify(block.header));
  }

  static getSize(block) {
    if (!(block instanceof Block)) block = Block.parse(block);
    return sizeof({...block.header, ...block.body});
  }

  static create(lastHash, lastVotes, transactions, number, epoch,
      stateProofHash, proposer, validators) {
    return new Block(lastHash, lastVotes, transactions, number, epoch, Date.now(),
        stateProofHash, proposer, validators);
  }

  static parse(blockInfo) {
    if (!Block.hasRequiredFields(blockInfo)) return null;
    if (blockInfo instanceof Block) return blockInfo;
    return new Block(blockInfo.last_hash, blockInfo.last_votes,
        blockInfo.transactions, blockInfo.number, blockInfo.epoch, blockInfo.timestamp,
        blockInfo.state_proof_hash, blockInfo.proposer, blockInfo.validators);
  }

  static hasRequiredFields(block) {
    return (block && block.last_hash !== undefined && block.last_votes !== undefined &&
        block.transactions !== undefined && block.number !== undefined &&
        block.epoch !== undefined && block.timestamp !== undefined &&
        block.state_proof_hash !== undefined && block.proposer !== undefined &&
        block.validators !== undefined);
  }

  static validateHashes(block) {
    const LOG_HEADER = 'validateHashes';

    if (block.hash !== Block.hash(block)) {
      logger.error(`[${LOG_HEADER}] Block hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.transactions_hash !== ChainUtil.hashString(stringify(block.transactions))) {
      logger.error(
          `[${LOG_HEADER}] Transactions or transactions_hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.last_votes_hash !== ChainUtil.hashString(stringify(block.last_votes))) {
      logger.error(
          `[${LOG_HEADER}] Last votes or last_votes_hash is incorrect for block ${block.hash}`);
      return false;
    }
    logger.info(
        `[${LOG_HEADER}] Hash check successfully done for block: ${block.number} / ${block.epoch}`);
    return true;
  }

  static validateProposedBlock(block) {
    const LOG_HEADER = 'validateProposedBlock';

    if (!Block.validateHashes(block)) return false;
    const nonceTracker = {};
    let tx;
    for (let i = 0; i < block.transactions.length; i++) {
      tx = block.transactions[i];
      if (tx.tx_body.nonce < 0) {
        continue;
      }
      if (!(tx.address in nonceTracker)) {
        nonceTracker[tx.address] = tx.tx_body.nonce;
        continue;
      }
      if (tx.tx_body.nonce != nonceTracker[tx.address] + 1) {
        logger.error(`[${LOG_HEADER}] Invalid noncing for ${tx.address} ` +
            `Expected ${nonceTracker[tx.address] + 1} ` +
            `Received ${tx.tx_body.nonce}`);
        return false;
      }
      nonceTracker[tx.address] = tx.tx_body.nonce;
    }

    logger.info(`[${LOG_HEADER}] Validated block: ${block.number} / ${block.epoch}`);
    return true;
  }

  static buildDbSetupTx(timestamp, privateKey) {
    const opList = [];

    // Values operation
    opList.push({
      type: 'SET_VALUE',
      ref: '/',
      value: GenesisValues,
    });

    // Functions operation
    opList.push({
      type: 'SET_FUNCTION',
      ref: '/',
      value: GenesisFunctions,
    });

    // Rules operation
    opList.push({
      type: 'SET_RULE',
      ref: '/',
      value: GenesisRules,
    });

    // Owners operation
    opList.push({
      type: 'SET_OWNER',
      ref: '/',
      value: GenesisOwners,
    });

    // Transaction
    const firstTxBody = {
      nonce: -1,
      timestamp,
      operation: {
        type: 'SET',
        op_list: opList,
      }
    };
    return Transaction.fromTxBody(firstTxBody, privateKey);
  }

  static buildAccountsSetupTx(timestamp, privateKey, ownerAddress) {
    const transferOps = [];
    const otherAccounts = GenesisAccounts[AccountProperties.OTHERS];
    if (otherAccounts && Array.isArray(otherAccounts) && otherAccounts.length > 0 &&
        GenesisAccounts[AccountProperties.SHARES] > 0) {
      for (let i = 0; i < otherAccounts.length; i++) {
        const accountAddress = otherAccounts[i][AccountProperties.ADDRESS];
        // Transfer operation
        const op = {
          type: 'SET_VALUE',
          ref: PathUtil.getTransferValuePath(ownerAddress, accountAddress, i),
          value: GenesisAccounts[AccountProperties.SHARES],
        };
        transferOps.push(op);
      }
    }

    // Transaction
    const secondTxBody = {
      nonce: -1,
      timestamp,
      operation: {
        type: 'SET',
        op_list: transferOps
      }
    };
    return Transaction.fromTxBody(secondTxBody, privateKey);
  }

  static buildConsensusAppTx(timestamp, privateKey, ownerAddress) {
    const thirdTxBody = {
      nonce: -1,
      timestamp,
      operation: {
        type: 'SET_VALUE',
        ref: PathUtil.getCreateAppRecordPath(PredefinedDbPaths.CONSENSUS, timestamp),
        value: {
          [PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN]: {
            [ownerAddress]: true
          },
          [PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE]: {
            [PredefinedDbPaths.STAKING]: {
              [PredefinedDbPaths.STAKING_LOCKUP_DURATION]: moment.duration(180, 'days').as('milliseconds')
            }
          }
        }
      }
    }
    return Transaction.fromTxBody(thirdTxBody, privateKey);
  }

  static buildGenesisStakingTxs(timestamp) {
    const _ = require('lodash');
    const txs = [];
    Object.entries(GENESIS_VALIDATORS).forEach(([address, amount], index) => {
      const privateKey = _.get(GenesisAccounts,
          `${AccountProperties.OTHERS}.${index}.${AccountProperties.PRIVATE_KEY}`);
      if (!privateKey) {
        throw Error(`GenesisAccounts missing values: ${JSON.stringify(GenesisAccounts)}, ${address}`);
      }
      const txBody = {
        nonce: -1,
        timestamp,
        operation: {
          type: 'SET_VALUE',
          ref: PathUtil.getStakingStakeRecordValuePath(PredefinedDbPaths.CONSENSUS, address, 0, timestamp),
          value: amount
        }
      };
      txs.push(Transaction.fromTxBody(txBody, privateKey));
    });
    return txs;
  }

  static getGenesisBlockData(genesisTime) {
    const ownerAddress = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
    const ownerPrivateKey = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);

    const firstTx = this.buildDbSetupTx(genesisTime, ownerPrivateKey);
    const secondTx = this.buildAccountsSetupTx(genesisTime, ownerPrivateKey, ownerAddress);
    const thirdTx = this.buildConsensusAppTx(genesisTime, ownerPrivateKey, ownerAddress);
    // TODO(lia): Change the logic to staking & signing by the current node
    const stakingTxs = this.buildGenesisStakingTxs(genesisTime);

    return [firstTx, secondTx, thirdTx, ...stakingTxs];
  }

  static getGenesisStateProofHash() {
    const tempGenesisDb = new DB(
        new StateNode(StateVersions.EMPTY), StateVersions.EMPTY, null, null, false, -1, null);
    tempGenesisDb.initDbStates();
    const genesisTransactions = Block.getGenesisBlockData(
        GenesisAccounts[AccountProperties.TIMESTAMP]);
    for (const tx of genesisTransactions) {
      const res = tempGenesisDb.executeTransaction(Transaction.toExecutable(tx));
      if (ChainUtil.isFailedTx(res)) {
        logger.error(`Genesis transaction failed:\n${JSON.stringify(tx, null, 2)}` +
            `\nRESULT: ${JSON.stringify(res)}`)
        return null;
      }
    }
    return tempGenesisDb.getStateProof('/')[ProofProperties.PROOF_HASH];
  }

  static genesis() {
    // This is a temporary fix for the genesis block. Code should be modified after
    // genesis block broadcasting feature is implemented.
    const ownerAddress = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
    const genesisTime = GenesisAccounts[AccountProperties.TIMESTAMP];
    const lastHash = '';
    const lastVotes = [];
    const transactions = Block.getGenesisBlockData(genesisTime);
    const number = 0;
    const epoch = 0;
    const proposer = ownerAddress;
    const validators = GENESIS_VALIDATORS;
    const stateProofHash = Block.getGenesisStateProofHash();
    return new Block(lastHash, lastVotes, transactions, number, epoch, genesisTime,
        stateProofHash, proposer, validators);
  }
}

module.exports = {
  Block
};
