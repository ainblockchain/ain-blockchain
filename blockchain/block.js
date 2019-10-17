const Transaction = require('../db/transaction');
const ChainUtil = require('../chain-util');
const fs = require('fs');
const {RULES_FILE_PATH} = require('../constants');
const zipper = require('zip-local');
const FILE_ENDING = 'json.zip';
const sizeof = require('object-sizeof');


class Block {
  constructor(timestamp, lastHash, hash, data) {
    this.timestamp = timestamp;
    this.lastHash = lastHash;
    this.hash = hash;
    this.data = data;
  }
}

class ForgedBlock extends Block {
  constructor(timestamp, lastHash, hash, data, height, signature, forger, validators, threshold) {
    super(timestamp, lastHash, hash, data);
    this.validatorTransactions = [];
    this.height = height;
    this.signature = signature;
    this.forger = forger;
    this.validators = validators;
    this.threshold = threshold;
    this.blockSize = sizeof(this.data);
  }

  setValidatorTransactions(validatorTransactions) {
    this.validatorTransactions = validatorTransactions;
  }

  static forgeBlock(data, db, height, lastBlock, forger, validators, threshold) {
    const lastHash = lastBlock.hash;
    const timestamp = Date.now();
    const signature = db.sign(ChainUtil.hash(data));
    const hash = ForgedBlock.hash(timestamp, lastHash, data, height, signature);
    return new ForgedBlock(timestamp, lastHash, hash, data, height,
                           signature, forger, validators, threshold);
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
    return `${block.height}-${block.lastHash}-${block.hash}.${FILE_ENDING}`;
  }

  static blockHash(block) {
    const {timestamp, lastHash, data, height, signature} = block;
    return ForgedBlock.hash(timestamp, lastHash, data, height, signature);
  }

  static hash(timestamp, lastHash, data, height, signature) {
    return '0x' + ChainUtil.hash(`${timestamp}${lastHash}${data}${height}${signature}`).toString();
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
    // Hack to return global genesis. Need to return separate genesis blocks
    // for mined and forged implementations
    if (blockZipFile.indexOf('0-#####-f1r57') >= 0) {
      return ForgedBlock.genesis();
    }
    const unzippedfs = zipper.sync.unzip(blockZipFile).memory();
    const blockInfo = JSON.parse(unzippedfs.read(unzippedfs.contents()[0], 'buffer').toString());
    return ForgedBlock.parse(blockInfo);
  }

  static parse(blockInfo) {
    const block = new ForgedBlock(blockInfo['timestamp'], blockInfo['lastHash'], blockInfo['hash'],
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

  static genesis() {
    let genesisTx;

    // Genesis block will set all the rules for the database if any rules are
    // specified in the proj/database/database.rules.json
    if (fs.existsSync(RULES_FILE_PATH)) {
      const keyPair = ChainUtil.genKeyPair();   // TODO(everyone); think of how to generate/keep it.
      const operation = { type: 'SET_RULE', ref: '/',
                          value: JSON.parse(fs.readFileSync(RULES_FILE_PATH))['rules'] };

      genesisTx = Transaction.newTransaction(keyPair.priv, { operation, nonce: -1 });
    }

    // timestamp, lastHash, hash, data, height, signature, forger, validators, threshold
    return new this('Genesis time', '#####', 'f1r57-h45h', [genesisTx], 0,
                    '----', 'genesis', [], -1);
  }
}

module.exports = {ForgedBlock};
