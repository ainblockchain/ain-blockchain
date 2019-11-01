const Transaction = require('../db/transaction');
const ainUtil = require('@ainblockchain/ain-util');
const fs = require('fs');
const stringify = require('fast-json-stable-stringify');
const {GENESIS_OWNERS, GENESIS_RULES, PredefinedDbPaths, GenesisToken, GenesisAccount}
    = require('../constants');
const BlockFilePatterns = require('./block-file-patterns');
const zipper = require('zip-local');
const sizeof = require('object-sizeof');

class Block {
  constructor(timestamp, lastHash, transactions, number, proposer, validators) {
    this.timestamp = timestamp;
    this.lastHash = lastHash;
    this.transactions = transactions;
    this.validatorTransactions = [];
    this.number = number;
    this.proposer = proposer;
    this.validators = validators;
    this.blockSize = sizeof(this.transactions);
    this.hash = Block.hash({timestamp, lastHash, transactions, number});
  }

  setValidatorTransactions(validatorTransactions) {
    this.validatorTransactions = validatorTransactions;
  }

  // TODO (lia): remove "proposer"?
  static createBlock(transactions, db, number, lastBlock, proposer, validators) {
    const lastHash = lastBlock.hash;
    const timestamp = Date.now();
    return new Block(timestamp, lastHash, transactions, number, proposer,
        validators);
  }

  header() {
    return {
      hash: this.hash,
      number: this.number,
      validators: this.validators,
      proposer: this.proposer,
      validatorTransactions: this.validatorTransactions,
    };
  }

  body() {
    return {
      timestamp: this.timestamp,
      lastHash: this.lastHash,
      hash: this.hash,
      transactions: this.transactions,
      proposer: this.proposer,
      number: this.number,
      blockSize: this.blockSize,
    };
  }

  static getFileName(block) {
    return BlockFilePatterns.getBlockFileName(block);
  }

  static hash(block) {
    if (block.timestamp === undefined || block.lastHash === undefined ||
        block.transactions === undefined || block.number === undefined) {
      throw Error('A block should contain timestamp, lastHash, transactions and number fields.');
    }
    let sanitizedBlockData = {
      timestamp: block.timestamp,
      lastHash: block.lastHash,
      transactions: block.transactions,
      number: block.number
    };
    return '0x' + ainUtil.hashMessage(stringify(sanitizedBlockData)).toString('hex');
  }

  toString() {
    return `Block -
        Timestamp : ${this.timestamp}
        Last Hash : ${this.lastHash.substring(0, 10)}
        Hash      : ${this.hash.substring(0, 10)}
        Transactions      : ${this.transactions}
        Number    : ${this.number}
        Size      : ${this.blockSize}`;
  }

  static loadBlock(blockZipFile) {
    const unzippedfs = zipper.sync.unzip(blockZipFile).memory();
    const blockInfo = JSON.parse(unzippedfs.read(unzippedfs.contents()[0], 'buffer').toString());
    return Block.parse(blockInfo);
  }

  static parse(blockInfo) {
    const block = new Block(blockInfo['timestamp'], blockInfo['lastHash'],
        blockInfo['transactions'], blockInfo['number'], blockInfo['proposer'],
        blockInfo['validators']);
    blockInfo['validatorTransactions'].forEach((transaction) => {
      block.validatorTransactions.push(transaction);
    });
    return block;
  }

  static validateBlock(block, blockchain) {
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
    if (!fs.existsSync(GENESIS_OWNERS)) {
      throw Error('Missing genesis owners file: ' + GENESIS_OWNERS);
    }
    const ownersOp = {
      type: 'SET_OWNER',
      ref: '/',
      value: JSON.parse(fs.readFileSync(GENESIS_OWNERS))
    };
    if (!fs.existsSync(GENESIS_RULES)) {
      throw Error('Missing genesis owners file: ' + GENESIS_RULES);
    }
    const rulesOp = {
      type: 'SET_RULE',
      ref: '/',
      value: JSON.parse(fs.readFileSync(GENESIS_RULES))
    };
    const firstTxData = {
      nonce: -1,
      timestamp: GenesisAccount.timestamp,
      operation: {
        type: 'SET',
        op_list: [ tokenOp, balancesOp, ownersOp, rulesOp ]
      }
    };
    const signature = ainUtil.ecSignTransaction(firstTxData, keyBuffer);
    const firstTx = new Transaction({ signature, transaction: firstTxData });
    return [firstTx];
  }

  static genesis() {
    // This is a temporary fix for the genesis block. Code should be modified after
    // genesis block broadcasting feature is implemented.
    const timestamp = GenesisAccount.timestamp;
    const height = 0;
    const data = ForgedBlock.getGenesisBlockData();
    const forger = GenesisAccount.address;
    const blockSignature = ainUtil.ecSignMessage(stringify(data),
                                                 Buffer.from(GenesisAccount.private_key, 'hex'));
    const lastHash = '';
    return new this(timestamp, lastHash, transactions, number, proposer, [], -1);
  }
}

module.exports = {Block};
