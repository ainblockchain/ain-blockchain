const stringify = require('fast-json-stable-stringify');
const zipper = require('zip-local');
const sizeof = require('object-sizeof');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('BLOCK');
const ChainUtil = require('../chain-util');
const Transaction = require('../tx-pool/transaction');
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
} = require('../constants');
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
    // TODO(lia): change this to snake case
    this.stateProofHash = stateProofHash;
    this.proposer = proposer;
    this.validators = validators;
    this.size = sizeof(this.transactions);
    // Hash of block's header
    this.hash = Block.hash(this);
  }

  get header() {
    return {
      last_hash: this.last_hash,
      last_votes_hash: this.last_votes_hash,
      transactions_hash: this.transactions_hash,
      number: this.number,
      epoch: this.epoch,
      timestamp: this.timestamp,
      stateProofHash: this.stateProofHash,
      proposer: this.proposer,
      validators: this.validators,
      size: this.size
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
            stateProofHash:    ${this.stateProofHash}
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

  static createBlock(lastHash, lastVotes, transactions, number, epoch,
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
        blockInfo.stateProofHash, blockInfo.proposer, blockInfo.validators);
  }

  static hasRequiredFields(block) {
    return (block && block.last_hash !== undefined && block.last_votes !== undefined &&
        block.transactions !== undefined && block.number !== undefined &&
        block.epoch !== undefined && block.timestamp !== undefined &&
        block.stateProofHash !== undefined && block.proposer !== undefined &&
        block.validators !== undefined);
  }

  static validateHashes(block) {
    if (block.hash !== Block.hash(block)) {
      logger.error(`Block hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.transactions_hash !== ChainUtil.hashString(stringify(block.transactions))) {
      logger.error(`Transactions or transactions_hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.last_votes_hash !== ChainUtil.hashString(stringify(block.last_votes))) {
      logger.error(`Last votes or last_votes_hash is incorrect for block ${block.hash}`);
      return false;
    }
    logger.info(`Hash check successfully done`);
    return true;
  }

  static validateProposedBlock(block) {
    if (!Block.validateHashes(block)) return false;
    const nonceTracker = {};
    let transaction;
    for (let i = 0; i < block.transactions.length; i++) {
      transaction = block.transactions[i];
      if (transaction.nonce < 0) {
        continue;
      }
      if (!(transaction.address in nonceTracker)) {
        nonceTracker[transaction.address] = transaction.nonce;
        continue;
      }
      if (transaction.nonce != nonceTracker[transaction.address] + 1) {
        logger.error(`Invalid noncing for ${transaction.address} ` +
            `Expected ${nonceTracker[transaction.address] + 1} ` +
            `Received ${transaction.nonce}`);
        return false;
      }
      nonceTracker[transaction.address] = transaction.nonce;
    }

    logger.info(`Valid block of number ${block.number}`);
    return true;
  }

  static getDbSetupTransaction(timestamp, keyBuffer) {
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
    const firstTxData = {
      nonce: -1,
      timestamp,
      operation: {
        type: 'SET',
        op_list: opList,
      }
    };
    const firstSig = ainUtil.ecSignTransaction(firstTxData, keyBuffer);
    return (new Transaction({signature: firstSig, transaction: firstTxData}));
  }

  static getAccountsSetupTransaction(ownerAddress, timestamp, keyBuffer) {
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
    const secondTxData = {
      nonce: -1,
      timestamp,
      operation: {
        type: 'SET',
        op_list: transferOps
      }
    };
    const secondSig = ainUtil.ecSignTransaction(secondTxData, keyBuffer);
    return (new Transaction({signature: secondSig, transaction: secondTxData}));
  }

  static getGenesisBlockData(genesisTime) {
    const ownerAddress = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
    const ownerPrivateKey = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);
    const keyBuffer = Buffer.from(ownerPrivateKey, 'hex');

    const firstTx = this.getDbSetupTransaction(genesisTime, keyBuffer);
    const secondTx = this.getAccountsSetupTransaction(ownerAddress, genesisTime, keyBuffer);

    return [firstTx, secondTx];
  }

  static getGenesisStateProofHash() {
    const tempGenesisState = new DB(null, null, false, -1);
    const genesisTransactions = Block.getGenesisBlockData(
        GenesisAccounts[AccountProperties.TIMESTAMP]);
    for (const tx of genesisTransactions) {
      const res = tempGenesisState.executeTransaction(tx);
      if (ChainUtil.transactionFailed(res)) {
        logger.error(`Genesis transaction failed:\n${JSON.stringify(tx, null, 2)}` +
            `\nRESULT: ${JSON.stringify(res)}`)
        return null;
      }
    }
    return tempGenesisState.getProof('/')[ProofProperties.PROOF_HASH];
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
