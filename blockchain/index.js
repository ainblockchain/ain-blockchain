const rimraf = require('rimraf');
const path = require('path');
const fs = require('fs');
const logger = require('../logger')('BLOCKCHAIN');
const { Block } = require('./block');
const FileUtil = require('../common/file-util');
const {
  CHAINS_DIR,
  CHAINS_N2B_DIR_NAME,
} = require('../common/constants');
const CHAIN_SEGMENT_LENGTH = 20;
const ON_MEM_CHAIN_LENGTH = 20;

class Blockchain {
  constructor(basePath) {
    // Finalized chain
    this.chain = [];
    this.blockchainPath = path.resolve(CHAINS_DIR, basePath);
    this.initSnapshotBlockNumber = -1;
  }

  init(isFirstNode, latestSnapshotBlockNumber) {
    let lastBlockWithoutProposal;
    this.initSnapshotBlockNumber = latestSnapshotBlockNumber;
    if (FileUtil.createBlockchainDir(this.blockchainPath)) {
      if (isFirstNode) {
        logger.info('\n');
        logger.info('############################################################');
        logger.info('## Starting FIRST-NODE blockchain with a GENESIS block... ##');
        logger.info('############################################################');
        logger.info('\n');
        this.chain.push(Block.genesis());
        this.writeChain();
      } else {
        logger.info('\n');
        logger.info('#############################################################');
        logger.info('## Starting NON-FIRST-NODE blockchain with EMPTY blocks... ##');
        logger.info('#############################################################');
        logger.info('\n');
        this.writeChain();
      }
    } else {
      if (isFirstNode) {
        logger.info('\n');
        logger.info('############################################################');
        logger.info('## Starting FIRST-NODE blockchain with EXISTING blocks... ##');
        logger.info('############################################################');
        logger.info('\n');
      } else {
        logger.info('\n');
        logger.info('################################################################');
        logger.info('## Starting NON-FIRST-NODE blockchain with EXISTING blocks... ##');
        logger.info('################################################################');
        logger.info('\n');
      }
      const newChain = this.loadChain(latestSnapshotBlockNumber);
      if (newChain) {
        // NOTE(minsulee2): Deal with the case the only genesis block was generated.
        if (newChain.length > 1) {
          lastBlockWithoutProposal = newChain.pop();
          const lastBlockPath = FileUtil.getBlockPath(
              this.blockchainPath, lastBlockWithoutProposal.number);
          fs.unlinkSync(lastBlockPath);
        }
        this.chain = newChain;
      }
    }
    if (!this.getBlockByNumber(0)) {
      const genesisBlock = Block.genesis();
      FileUtil.writeBlock(this.blockchainPath, genesisBlock);
      FileUtil.writeHashToNumber(this.blockchainPath, genesisBlock.hash, genesisBlock.number);
    }
    return lastBlockWithoutProposal;
  }

  /**
    * Given a block hash or hash substring, returns a block with a matching hash from
    * the blockchain.
    *
    * @param {string} hash - hash or hash substring of block.
    * @return {Block} Block instance corresponding to the queried block hash.
    */
  getBlockByHash(hash) {
    if (!hash) return null;
    const blockPath = FileUtil.getBlockPath(this.blockchainPath,
        FileUtil.readHashToNumber(this.blockchainPath, hash));
    if (!blockPath) {
      const found = this.chain.filter((block) => block.hash === hash);
      return found.length ? found[0] : null;
    } else {
      return Block.parse(FileUtil.readCompressedJson(blockPath));
    }
  }

  /**
    * Given a block number, returns the block that corresponds to the block number.
    *
    * @param {integer} number - block number
    * @return {Block} Block instance corresponding to the queried block number.
    */
  getBlockByNumber(number) {
    if (number === undefined || number === null) return null;
    const blockPath = FileUtil.getBlockPath(this.blockchainPath, number);
    if (!blockPath || number > this.lastBlockNumber() - ON_MEM_CHAIN_LENGTH) {
      const found = this.chain.filter((block) => block.number === number);
      return found.length ? found[0] : null;
    } else {
      return Block.parse(FileUtil.readCompressedJson(blockPath));
    }
  }

  lastBlock() {
    if (this.chain.length === 0) {
      return null;
    }
    return this.chain[this.chain.length - 1];
  }

  lastBlockNumber() {
    const lastBlock = this.lastBlock();
    if (!lastBlock) {
      if (this.initSnapshotBlockNumber) {
        return this.initSnapshotBlockNumber;
      }
      return -1;
    }
    return lastBlock.number;
  }

  lastBlockEpoch() {
    const lastBlock = this.lastBlock();
    if (!lastBlock) {
      return -1;
    }
    return lastBlock.epoch;
  }

  lastBlockTimestamp() {
    const lastBlock = this.lastBlock();
    if (!lastBlock) {
      return -1;
    }
    return lastBlock.timestamp;
  }

  addNewBlockToChain(newBlock) {
    const LOG_HEADER = 'addNewBlockToChain';

    if (!newBlock) {
      logger.error(`[${LOG_HEADER}] Block is null.`);
      return false;
    }
    if (newBlock.number !== this.lastBlockNumber() + 1) {
      logger.error(`[${LOG_HEADER}] Invalid blockchain number: ${newBlock.number}`);
      return false;
    }
    if (!(newBlock instanceof Block)) {
      newBlock = Block.parse(newBlock);
    }
    this.chain.push(newBlock);
    this.writeChain();
    // Keep up to latest ON_MEM_CHAIN_LENGTH blocks
    while (this.chain.length > ON_MEM_CHAIN_LENGTH) {
      this.chain.shift();
    }
    return true;
  }

  static isValidChain(chain, latestSnapshotBlockNumber) {
    if (!chain.length) {
      return true;
    }
    const firstBlock = Block.parse(chain[0]);
    if (!firstBlock) {
      return false;
    }
    if (latestSnapshotBlockNumber > 0 && latestSnapshotBlockNumber + 1 !== firstBlock.number) {
      logger.error(`Missing blocks between ${latestSnapshotBlockNumber + 1} and ${firstBlock.number}`);
      return false;
    }
    if (firstBlock.number === 0 && firstBlock.hash !== Block.genesis().hash) {
      logger.error(`Invalid genesis block: ${firstBlock}\n${Block.genesis()}`);
      return false;
    }
    return Blockchain.isValidChainSegment(chain);
  }

  static isValidChainSegment(chainSegment) {
    if (chainSegment.length) {
      if (!Block.validateHashes(chainSegment[0])) {
        return false;
      }
    }
    for (let i = 1; i < chainSegment.length; i++) {
      const block = chainSegment[i];
      const lastBlock = Block.parse(chainSegment[i - 1]);
      if (block.last_hash !== lastBlock.hash || !Block.validateHashes(block)) {
        return false;
      }
    }
    return true;
  }

  writeChain() {
    for (let i = 0; i < this.chain.length; i++) {
      const block = this.chain[i];
      FileUtil.writeBlock(this.blockchainPath, block);
      FileUtil.writeHashToNumber(this.blockchainPath, block.hash, block.number);
    }
  }

  getValidBlocksInChainSegment(chainSegment) {
    logger.info(`Last block number before merge: ${this.lastBlockNumber()}`);
    const firstBlock = Block.parse(chainSegment[0]);
    const lastBlock = this.lastBlock();
    const lastBlockHash = this.lastBlockNumber() >= 0 && lastBlock ? lastBlock.hash : null;
    const overlap = lastBlockHash ?
        chainSegment.filter((block) => block.number === this.lastBlockNumber()) : null;
    const overlappingBlock = overlap ? overlap[0] : null;
    const validBlocks = [];
    if (lastBlockHash) {
      // Case 1: Not a cold start.
      if (overlappingBlock && overlappingBlock.hash !== lastBlockHash) {
        logger.info(`The last block's hash ${lastBlock.hash.substring(0, 5)} ` +
            `does not match with the first block's hash ${firstBlock.hash.substring(0, 5)}`);
        return validBlocks;
      }
    } else {
      // Case 2: A cold start.
      if (firstBlock.number === 0 && firstBlock.last_hash !== '') {
        logger.info(`First block of hash ${firstBlock.hash.substring(0, 5)} ` +
            `and last hash ${firstBlock.last_hash.substring(0, 5)} is not a genesis block`);
        return validBlocks;
      }
    }
    if (!Blockchain.isValidChainSegment(chainSegment)) {
      logger.error(`Invalid chain segment`);
      return validBlocks;
    }
    for (const block of chainSegment) {
      if (block.number <= this.lastBlockNumber()) {
        continue;
      }
      validBlocks.push(block);
    }
    return validBlocks;
  }

  loadChain(latestSnapshotBlockNumber) {
    const chainPath = this.blockchainPath;
    const newChain = [];
    const numBlockFiles = fs.readdirSync(path.join(chainPath, CHAINS_N2B_DIR_NAME)).length;
    const fromBlockNumber = latestSnapshotBlockNumber === undefined ? latestSnapshotBlockNumber :
        latestSnapshotBlockNumber + 1;
    const blockPaths = FileUtil.getBlockPaths(chainPath, fromBlockNumber, numBlockFiles);

    blockPaths.forEach((blockPath) => {
      const block = Block.parse(FileUtil.readCompressedJson(blockPath));
      newChain.push(block);
    });

    if (Blockchain.isValidChain(newChain, latestSnapshotBlockNumber)) {
      logger.info(`Valid chain of size ${newChain.length}`);
      return newChain;
    }
    logger.error(`Invalid chain`);
    rimraf.sync(chainPath + '/*');
    return null;
  }

  /**
    * Returns a section of the chain up to a maximuim of length CHAIN_SEGMENT_LENGTH, starting from
    * the `from` block number up till `to` block number.
    *
    * @param {Number} from - The lowest block number to get
    * @param {Number} to - The highest block number to geet
    * @return {list} A list of Blocks, up to a maximuim length of CHAIN_SEGMENT_LENGTH
    */
  getBlockList(from, to) {
    const blockList = [];
    const lastBlock = this.lastBlock();
    if (!lastBlock) {
      return blockList;
    }
    if (from === lastBlock.number + 1) {
      logger.info(`Requesters blockchain is up to date with this blockchain`);
      blockList.push(lastBlock);
      return blockList;
    }
    if (!Number.isInteger(from) || from < 0) {
      from = 0;
    }
    if (!Number.isInteger(to) || to < 0) {
      to = this.lastBlockNumber() + 1;
    }
    if (to - from > CHAIN_SEGMENT_LENGTH) { // NOTE: To prevent large query.
      to = from + CHAIN_SEGMENT_LENGTH;
    }
    const blockPaths = FileUtil.getBlockPaths(this.blockchainPath, from, to - from);
    blockPaths.forEach((blockPath) => {
      blockList.push(Block.parse(FileUtil.readCompressedJson(blockPath)));
    });
    return blockList;
  }
}

module.exports = Blockchain;
