const stringify = require('fast-json-stable-stringify');
const zipper = require('zip-local');
const sizeof = require('object-sizeof');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('BLOCK');
const ChainUtil = require('../common/chain-util');
const Transaction = require('../tx-pool/transaction');
const StateNode = require('../db/state-node');
const DB = require('../db');
const {
  PredefinedDbPaths,
  GenesisAccounts,
  GenesisWhitelist,
  GenesisValues,
  GenesisFunctions,
  GenesisRules,
  GenesisOwners,
  AccountProperties,
  ProofProperties,
  StateVersions,
} = require('../common/constants');
const BlockFilePatterns = require('./block-file-patterns');

class Block {
  constructor(lastHash, lastVotes, transactions, number, epoch, timestamp,
      stateProofHash, proposer, validators) {
    this.last_votes = lastVotes;
    this.transactions = transactions;
    // Block's header
    this.last_hash = lastHash;
    this.last_votes_hash = ChainUtil.hashString(stringify(lastVotes));
    this.transactions_hash = ChainUtil.hashString(stringify(transactions));
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

  toString() {
    return `Block -
            hash:              ${ChainUtil.shortenHash(this.hash)}
            last_hash:         ${ChainUtil.shortenHash(this.last_hash)}
            last_votes_hash:   ${ChainUtil.shortenHash(this.last_votes_hash)}
            transactions_hash: ${ChainUtil.shortenHash(this.transactions_hash)}
            number:            ${this.number}
            epoch:             ${this.epoch}
            timestamp:         ${this.timestamp}
            state_proof_hash:    ${this.state_proof_hash}
            proposer:          ${this.proposer}
            validators:        ${this.validators}
            size:              ${this.size}
            last_votes len:    ${this.last_votes.length}
            transactions len:  ${this.transactions.length}
            last_votes:        ${stringify(this.last_votes)}
            transactions:      ${stringify(this.transactions)}`;
  }

  static hash(block) {
    if (!(block instanceof Block)) block = Block.parse(block);
    return ChainUtil.hashString(stringify(block.header));
  }

  static getSize(block) {
    if (!(block instanceof Block)) block = Block.parse(block);
    return sizeof({
      // header
      hash: block.hash,
      last_hash: block.last_hash,
      last_votes_hash: block.last_votes_hash,
      transactions_hash: block.transactions_hash,
      number: block.number,
      epoch: block.epoch,
      timestamp: block.timestamp,
      state_proof_hash: block.state_proof_hash,
      proposer: block.proposer,
      validators: block.validators,
      // body
      last_votes: block.last_votes,
      transactions: block.transactions,
    });
  }

  static create(lastHash, lastVotes, transactions, number, epoch,
      stateProofHash, proposer, validators) {
    return new Block(lastHash, lastVotes, transactions, number, epoch, Date.now(),
        stateProofHash, proposer, validators);
  }

  static getFileName(block) {
    return BlockFilePatterns.getBlockFileName(block);
  }

  static loadBlock(blockZipFile) {
    const unzippedfs = zipper.sync.unzip(blockZipFile).memory();
    const blockInfo = JSON.parse(unzippedfs.read(unzippedfs.contents()[0], 'buffer').toString());
    return Block.parse(blockInfo);
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
    return Transaction.signTxBody(firstTxBody, privateKey);
  }

  static buildAccountsSetupTx(ownerAddress, timestamp, privateKey) {
    const transferOps = [];
    const otherAccounts = GenesisAccounts[AccountProperties.OTHERS];
    if (otherAccounts && Array.isArray(otherAccounts) && otherAccounts.length > 0 &&
        GenesisAccounts[AccountProperties.SHARES] > 0) {
      for (let i = 0; i < otherAccounts.length; i++) {
        const accountAddress = otherAccounts[i][AccountProperties.ADDRESS];
        // Transfer operation
        const op = {
          type: 'SET_VALUE',
          ref: `/${PredefinedDbPaths.TRANSFER}/${ownerAddress}/` +
              `${accountAddress}/${i}/${PredefinedDbPaths.TRANSFER_VALUE}`,
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
    return Transaction.signTxBody(secondTxBody, privateKey);
  }

  static getGenesisBlockData(genesisTime) {
    const ownerAddress = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
    const ownerPrivateKey = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);

    const firstTx = this.buildDbSetupTx(genesisTime, ownerPrivateKey);
    const secondTx = this.buildAccountsSetupTx(ownerAddress, genesisTime, ownerPrivateKey);

    return [firstTx, secondTx];
  }

  static getGenesisStateProofHash() {
    const tempGenesisDb =
        new DB(new StateNode(StateVersions.EMPTY), StateVersions.EMPTY, null, null, false, -1);
    tempGenesisDb.initDbStates();
    const genesisTransactions = Block.getGenesisBlockData(
        GenesisAccounts[AccountProperties.TIMESTAMP]);
    for (const tx of genesisTransactions) {
      const res = tempGenesisDb.executeTransaction(tx);
      if (ChainUtil.transactionFailed(res)) {
        logger.error(`Genesis transaction failed:\n${JSON.stringify(tx, null, 2)}` +
            `\nRESULT: ${JSON.stringify(res)}`)
        return null;
      }
    }
    return tempGenesisDb.getProof('/')[ProofProperties.PROOF_HASH];
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
    const validators = GenesisWhitelist;
    const stateProofHash = Block.getGenesisStateProofHash();
    return new Block(lastHash, lastVotes, transactions, number, epoch, genesisTime,
        stateProofHash, proposer, validators);
  }
}

module.exports = {
  Block
};
