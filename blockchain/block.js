const Transaction = require('../db/transaction');
const ainUtil = require('@ainblockchain/ain-util');
const ChainUtil = require('../chain-util');
const fs = require('fs');
const stringify = require('fast-json-stable-stringify');
const {GENESIS_OWNERS, ADDITIONAL_OWNERS, GENESIS_RULES, ADDITIONAL_RULES, PredefinedDbPaths,
       GenesisToken, GenesisAccount} = require('../constants');
const BlockFilePatterns = require('./block-file-patterns');
const zipper = require('zip-local');
const sizeof = require('object-sizeof');

class Block {
  constructor(lastHash, lastVotes, transactions, number, timestamp, proposer, validators) {
    this.last_votes = lastVotes;
    this.transactions = transactions;
    // Block's header
    this.last_hash = lastHash;
    this.last_votes_hash = ChainUtil.hashString(stringify(lastVotes));
    this.transactions_hash = ChainUtil.hashString(stringify(transactions));
    this.number = number;
    this.timestamp = timestamp;
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
      timestamp: this.timestamp,
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
        timestamp:         ${this.timestamp}
        proposer:          ${this.proposer}
        validators:        ${this.validators}
        size:              ${this.size}`;
  }

  static hash(block) {
    if (!(block instanceof Block)) block = Block.parse(block);
    return ChainUtil.hashString(stringify(block.header));
  }

  static createBlock(lastHash, lastVotes, transactions, number, proposer, validators) {
    return new Block(lastHash, lastVotes, transactions, number, Date.now(),
        proposer, validators);
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
    return new Block(blockInfo['last_hash'], blockInfo['last_votes'],
        blockInfo['transactions'], blockInfo['number'], blockInfo['timestamp'],
        blockInfo['proposer'], blockInfo['validators']);
  }

  static hasRequiredFields(block) {
    return (block.last_hash !== undefined && block.last_votes !== undefined &&
        block.transactions !== undefined && block.number !== undefined &&
        block.timestamp !== undefined && block.proposer !== undefined &&
        block.validators !== undefined);
  }

  static validateHashes(block) {
    if (block.hash !== Block.hash(block)) {
      console.log(`Block hash is incorrect for  block ${block.hash}`);
      return false;
    }
    if (block.transactions_hash !== ChainUtil.hashString(stringify(block.transactions))) {
      console.log(`Transactions or transactions_hash is incorrect for block ${block.hash}`);
      return false;
    }
    if (block.last_votes_hash !== ChainUtil.hashString(stringify(block.last_votes))) {
      console.log(`Last votes or last_votes_hash is incorrect for block ${block.hash}`);
      return false;
    }
    return true;
  }

  static validateProposedBlock(block, blockchain) {
    if (!Block.validateHashes(block)) { return false; }
    if (block.number !== (blockchain.height() + 1)) {
      console.log(`Number is not correct for block ${block.hash}.
                   Expected: ${(blockchain.height() + 1)}
                   Actual: ${block.number}`);
      return false;
    }
    const nonceTracker = {};
    let transaction;
    for (let i=0; i<block.transactions.length; i++) {
      transaction = block.transactions[i];
      if (transaction.nonce < 0) {
        continue;
      }
      if (!(transaction.address in nonceTracker)) {
        nonceTracker[transaction.address] = transaction.nonce;
        continue;
      }
      if (transaction.nonce != nonceTracker[transaction.address] + 1) {
        console.log(`Invalid noncing for ${transaction.address}.
                     Expected ${nonceTracker[transaction.address] + 1}.
                     Received ${transaction.nonce}`);
        return false;
      }
      nonceTracker[transaction.address] = transaction.nonce;
    }
    console.log(`Valid block of number ${block.number}`);
    return true;
  }

  static getGenesisBlockData() {
    const keyBuffer = Buffer.from(GenesisAccount.private_key, 'hex');
    const tokenOp = {
      type: 'SET_VALUE',
      ref: `/${PredefinedDbPaths.TOKEN}`,
      value: GenesisToken
    };
    const balancesOp = {
      type: 'SET_VALUE',
      ref: `/${PredefinedDbPaths.ACCOUNTS}/${GenesisAccount.address}/${PredefinedDbPaths.BALANCE}`,
      value: GenesisToken.total_supply
    };
    if (!fs.existsSync(GENESIS_RULES)) {
      throw Error('Missing genesis rules file: ' + GENESIS_RULES);
    }
    const rules = JSON.parse(fs.readFileSync(GENESIS_RULES));
    if (ADDITIONAL_RULES) {
      if (fs.existsSync(ADDITIONAL_RULES.filePath)) {
        const addRules = JSON.parse(fs.readFileSync(ADDITIONAL_RULES.filePath));
        rules[ADDITIONAL_RULES.dbPath] = addRules;
      } else {
        throw Error('Missing additional rules file: ' + ADDITIONAL_RULES.filePath);
      }
    }
    const rulesOp = {
      type: 'SET_RULE',
      ref: '/',
      value: rules
    };
    if (!fs.existsSync(GENESIS_OWNERS)) {
      throw Error('Missing genesis owners file: ' + GENESIS_OWNERS);
    }
    const owners = JSON.parse(fs.readFileSync(GENESIS_OWNERS));
    if (ADDITIONAL_OWNERS) {
      if (fs.existsSync(ADDITIONAL_OWNERS.filePath)) {
        const addOwners = JSON.parse(fs.readFileSync(ADDITIONAL_OWNERS.filePath));
        owners[ADDITIONAL_OWNERS.dbPath] = addOwners;
      } else {
        throw Error('Missing additional owners file: ' + ADDITIONAL_OWNERS.filePath);
      }
    }
    const ownersOp = {
      type: 'SET_OWNER',
      ref: '/',
      value: owners
    };
    const firstTxData = {
      nonce: -1,
      timestamp: GenesisAccount.timestamp,
      operation: {
        type: 'SET',
        op_list: [ tokenOp, balancesOp, rulesOp, ownersOp]
      }
    };
    const signature = ainUtil.ecSignTransaction(firstTxData, keyBuffer);
    const firstTx = new Transaction({ signature, transaction: firstTxData });
    return [firstTx];
  }

  static genesis() {
    // This is a temporary fix for the genesis block. Code should be modified after
    // genesis block broadcasting feature is implemented.
    const lastHash = '';
    const lastVotes = [];
    const transactions = Block.getGenesisBlockData();
    const number = 0;
    const timestamp = GenesisAccount.timestamp;
    const proposer = GenesisAccount.address;
    const validators = [];
    return new this(lastHash, lastVotes, transactions, number, timestamp,
        proposer, validators);
  }
}

module.exports = {Block};
