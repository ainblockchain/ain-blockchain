const Transaction = require('../db/transaction');
const ainUtil = require('@ainblockchain/ain-util');
const fs = require('fs');
const stringify = require('fast-json-stable-stringify');
const {GENESIS_OWNERS, GENESIS_RULES, PredefinedDbPaths, GenesisToken, GenesisAccount}
    = require('../constants');
const BlockFilePatterns = require('./block-file-patterns');
const zipper = require('zip-local');
const sizeof = require('object-sizeof');

class ForgedBlock {
  constructor(timestamp, lastHash, data, number, signature, forger, validators, threshold) {
    this.timestamp = timestamp;
    this.lastHash = lastHash;
    this.data = data;
    this.validatorTransactions = [];
    this.number = number;
    this.signature = signature;
    this.forger = forger;
    this.validators = validators;
    this.threshold = threshold;
    this.blockSize = sizeof(this.data);
    this.hash = ForgedBlock.hash({timestamp, lastHash, data, number, signature});
  }

  setValidatorTransactions(validatorTransactions) {
    this.validatorTransactions = validatorTransactions;
  }

  // TODO (lia): remove "forger"?
  static forgeBlock(data, db, number, lastBlock, forger, validators, threshold) {
    const lastHash = lastBlock.hash;
    const timestamp = Date.now();
    const signature = db.sign(stringify(data)); // TODO (lia): include other information to sign?
    return new ForgedBlock(timestamp, lastHash, data, number, signature, forger,
        validators, threshold);
  }

  header() {
    return {
      hash: this.hash,
      number: this.number,
      threshold: this.threshold,
      validators: this.validators,
      forger: this.forger,
      validatorTransactions: this.validatorTransactions,
    };
  }

  body() {
    return {
      timestamp: this.timestamp,
      lastHash: this.lastHash,
      hash: this.hash,
      data: this.data,
      forger: this.forger,
      number: this.number,
      signature: this.signature,
      blockSize: this.blockSize,
    };
  }

  static getFileName(block) {
    return BlockFilePatterns.getBlockFileName(block);
  }

  static hash(block) {
    if (block.timestamp === undefined || block.lastHash === undefined ||
        block.data === undefined || block.number === undefined ||
        block.signature === undefined) {
      throw Error('A block should contain timestamp, lastHash, data, number, and signature fields.');
    }
    let sanitizedBlockData = {
      timestamp: block.timestamp,
      lastHash: block.lastHash,
      data: block.data,
      number: block.number,
      signature: block.signature
    };
    return '0x' + ainUtil.hashMessage(stringify(sanitizedBlockData)).toString('hex');
  }

  toString() {
    return `Block -
        Timestamp : ${this.timestamp}
        Last Hash : ${this.lastHash.substring(0, 10)}
        Hash      : ${this.hash.substring(0, 10)}
        Data      : ${this.data}
        Number    : ${this.number}
        Size      : ${this.blockSize}`;
  }

  static loadBlock(blockZipFile) {
    const unzippedfs = zipper.sync.unzip(blockZipFile).memory();
    const blockInfo = JSON.parse(unzippedfs.read(unzippedfs.contents()[0], 'buffer').toString());
    return ForgedBlock.parse(blockInfo);
  }

  static parse(blockInfo) {
    const block = new ForgedBlock(blockInfo['timestamp'], blockInfo['lastHash'],
        blockInfo['data'], blockInfo['number'], blockInfo['signature'],
        blockInfo['forger'], blockInfo['validators'], blockInfo['threshold']);
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

    for (let i=0; i<block.data.length; i++) {
      transaction = block.data[i];

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
    return new this(timestamp, lastHash, data, number, blockSignature, forger, [], -1);
  }
}

module.exports = {ForgedBlock};
