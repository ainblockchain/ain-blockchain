const Transaction = require('../db/transaction');
const ainUtil = require('@ainblockchain/ain-util');
const fs = require('fs');
const stringify = require('fast-json-stable-stringify');
const {GenesisInfo, PredefinedDbPaths} = require('../constants');
const BlockFilePatterns = require('./block-file-patterns');
const zipper = require('zip-local');
const sizeof = require('object-sizeof');


class Block {
  constructor(timestamp, lastHash, data) {
    this.timestamp = timestamp;
    this.lastHash = lastHash;
    this.data = data;
  }
}

class ForgedBlock extends Block {
  constructor(timestamp, lastHash, data, height, signature, forger, validators, threshold) {
    super(timestamp, lastHash, data);
    this.validatorTransactions = [];
    this.height = height;
    this.signature = signature;
    this.forger = forger;
    this.validators = validators;
    this.threshold = threshold;
    this.blockSize = sizeof(this.data);
    this.hash = ForgedBlock.hash({timestamp, lastHash, data, height, signature});
  }

  setValidatorTransactions(validatorTransactions) {
    this.validatorTransactions = validatorTransactions;
  }

  // TODO (lia): remove "forger"?
  static forgeBlock(data, db, height, lastBlock, forger, validators, threshold) {
    const lastHash = lastBlock.hash;
    const timestamp = Date.now();
    const signature = db.sign(stringify(data)); // TODO (lia): include other information to sign?
    return new ForgedBlock(timestamp, lastHash, data, height, signature, forger,
        validators, threshold);
  }

  header() {
    return {
      hash: this.hash,
      height: this.height,
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
      height: this.height,
      signature: this.signature,
      blockSize: this.blockSize,
    };
  }

  static getFileName(block) {
    return BlockFilePatterns.getBlockFileName(block);
  }

  static hash(block) {
    if (block.timestamp === undefined || block.lastHash === undefined ||
        block.data === undefined || block.height === undefined ||
        block.signature === undefined) {
      throw Error('A block should contain timestamp, lastHash, data, height, and signature fields.');
    }
    let sanitizedBlockData = {
      timestamp: block.timestamp,
      lastHash: block.lastHash,
      data: block.data,
      height: block.height,
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
        Height    : ${this.height}
        Size      : ${this.blockSize}`;
  }

  static loadBlock(blockZipFile) {
    const unzippedfs = zipper.sync.unzip(blockZipFile).memory();
    const blockInfo = JSON.parse(unzippedfs.read(unzippedfs.contents()[0], 'buffer').toString());
    return ForgedBlock.parse(blockInfo);
  }

  static parse(blockInfo) {
    const block = new ForgedBlock(blockInfo['timestamp'], blockInfo['lastHash'],
        blockInfo['data'], blockInfo['height'], blockInfo['signature'],
        blockInfo['forger'], blockInfo['validators'], blockInfo['threshold']);
    blockInfo['validatorTransactions'].forEach((transaction) => {
      block.validatorTransactions.push(transaction);
    });
    return block;
  }

  static validateBlock(block, blockchain) {
    if (block.height !== (blockchain.height() + 1)) {
      console.log(`Height is not correct for block ${block.hash}.
                   Expected: ${(blockchain.height() + 1)}
                   Actual: ${block.height}`);
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
    console.log(`Valid block at height ${block.height}`);
    return true;
  }

  // TODO(seo): Choose more meaningful transactions as the first transactions.
  static genesis() {
    // This is a temporary fix for the genesis block. Code should be modified after
    // genesis block broadcasting feature is implemented.
    const keyBuffer = Buffer.from(GenesisInfo.private_key, 'hex');
    const ref = [PredefinedDbPaths.ACCOUNT, GenesisInfo.address, PredefinedDbPaths.NICKNAME].join('/');
    const operation = {
      type: 'SET_VALUE',
      ref,
      value: 'ainetwork.ai'
    };
    const firstTxData = {
      nonce: -1,
      timestamp: GenesisInfo.timestamp,
      operation
    };
    const signature = ainUtil.ecSignTransaction(firstTxData, keyBuffer);
    const firstTx = new Transaction({ signature, transaction: firstTxData });
    const timestamp = GenesisInfo.timestamp;
    const height = 0;
    const data = [firstTx];
    const forger = GenesisInfo.address;
    const blockSignature = ainUtil.ecSignMessage(stringify(data), keyBuffer);
    const lastHash = '';
    return new this(timestamp, lastHash, data, height, blockSignature, forger, [], -1);
  }
}

module.exports = {ForgedBlock};
