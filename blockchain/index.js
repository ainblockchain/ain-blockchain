const path = require('path');
const fs = require('fs');
const logger = require('../logger')('BLOCKCHAIN');
const { Block } = require('./block');
const FileUtil = require('../common/file-util');
const {
  CHAINS_DIR,
  CHAIN_SEGMENT_LENGTH,
  ON_MEMORY_CHAIN_LENGTH,
  GenesisAccounts,
  AccountProperties,
} = require('../common/constants');
const { ConsensusConsts } = require('../consensus/constants');
const CommonUtil = require('../common/common-util');

class Blockchain {
  constructor(basePath) {
    // Finalized chain
    this.chain = [];
    this.blockchainPath = path.resolve(CHAINS_DIR, basePath);
    this.initSnapshotBlockNumber = -1;

    // Mapping of a block number to the finalized block's info
    this.numberToBlockInfo = {};
  }

  /**
   * Initializes the blockchain and returns whether there are block files to load.
   */
  init(isFirstNode, latestSnapshotBlockNumber) {
    this.initSnapshotBlockNumber = latestSnapshotBlockNumber;
    const wasBlockDirEmpty = FileUtil.createBlockchainDir(this.blockchainPath);
    let isGenesisStart = false;
    if (wasBlockDirEmpty) {
      if (isFirstNode) {
        logger.info('\n');
        logger.info('############################################################');
        logger.info('## Starting FIRST-NODE blockchain with a GENESIS block... ##');
        logger.info('############################################################');
        logger.info('\n');
        this.writeBlock(Block.genesis());
        isGenesisStart = true;
      } else {
        logger.info('\n');
        logger.info('#############################################################');
        logger.info('## Starting NON-FIRST-NODE blockchain with EMPTY blocks... ##');
        logger.info('#############################################################');
        logger.info('\n');
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
    }
    return {
      wasBlockDirEmpty,
      isGenesisStart,
    };
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
        FileUtil.readH2nFile(this.blockchainPath, hash));
    if (!blockPath) {
      return this.chain.find((block) => block.hash === hash);
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
    const blockNumber = CommonUtil.toNumberOrNaN(number);
    if (!CommonUtil.isNumber(blockNumber)) return null;
    const blockPath = FileUtil.getBlockPath(this.blockchainPath, blockNumber);
    if (!blockPath || blockNumber > this.lastBlockNumber() - ON_MEMORY_CHAIN_LENGTH) {
      return this.chain.find((block) => block.number === blockNumber);
    } else {
      return Block.parse(FileUtil.readCompressedJson(blockPath));
    }
  }

  getBlockInfoByNumber(number) {
    if (number === undefined || number === null) return null;
    const blockNumber = CommonUtil.toNumberOrNaN(number);
    if (!CommonUtil.isNumber(blockNumber)) return null;
    return this.numberToBlockInfo[blockNumber];
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
      return GenesisAccounts[AccountProperties.TIMESTAMP];
    }
    return lastBlock.timestamp;
  }

  addBlockToChain(block) {
    const LOG_HEADER = 'addBlockToChain';

    this.chain.push(block);
    logger.info(`[${LOG_HEADER}] Successfully added block ${block.number} to chain.`);
  }

  updateNumberToBlockInfo(block) {
    this.numberToBlockInfo[block.number] = {
      finalized_at: Date.now()
    };
    if (block.number >= ConsensusConsts.MAX_FINALIZED_BLOCK_INFO_ON_MEM) {
      delete this.numberToBlockInfo[block.number - ConsensusConsts.MAX_FINALIZED_BLOCK_INFO_ON_MEM];
    }
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
    this.addBlockToChain(newBlock);
    this.updateNumberToBlockInfo(newBlock);
    this.writeBlock(newBlock);
    // Keep up to latest ON_MEMORY_CHAIN_LENGTH blocks
    while (this.chain.length > ON_MEMORY_CHAIN_LENGTH) {
      this.chain.shift();
    }
    return true;
  }

  static validateBlock(block, prevBlockNumber = null, prevBlockHash = null) {
    const LOG_HEADER = 'validateBlock';

    if (prevBlockNumber != null && block.number !== prevBlockNumber + 1) {
      logger.error(`Invalid block number (expected: ${prevBlockNumber}) of block: ${block.number}`);
      return false;
    }
    if (prevBlockHash !== null && block.last_hash !== prevBlockHash) {
      logger.error(
          `Invalid block last_hash (expected: ${prevBlockHash}) of block: ${block.last_hash}`);
      return false;
    }
    if (!Block.validateHashes(block)) {
      logger.error(`Invalid block hashes of block: ${block.number}`);
      return false;
    }
    logger.info(`[${LOG_HEADER}] Successfully validated block: ${block.number} / ${block.epoch}`);
    return true;
  }


  static validateChainSegment(chainSegment) {
    let prevBlockNumber;
    let prevBlockHash;
    if (chainSegment.length > 0) {
      const block = chainSegment[0];
      if (!Blockchain.validateBlock(block)) {
        return false;
      }
      prevBlockNumber = block.number;
      prevBlockHash = block.hash;
    }
    for (let i = 1; i < chainSegment.length; i++) {
      const block = chainSegment[i];
      if (!Blockchain.validateBlock(block, prevBlockNumber, prevBlockHash)) {
        return false;
      }
      prevBlockNumber = block.number;
      prevBlockHash = block.hash;
    }
    return true;
  }

  writeBlock(block) {
    FileUtil.writeBlockFile(this.blockchainPath, block);
    FileUtil.writeH2nFile(this.blockchainPath, block.hash, block.number);
  }

  deleteBlock(block) {
    FileUtil.deleteBlockFile(this.blockchainPath, block.number);
    FileUtil.deleteH2nFile(this.blockchainPath, block.hash);
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
    if (!Blockchain.validateChainSegment(chainSegment)) {
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

  getNumBlockFiles() {
    return FileUtil.getNumBlockFiles(this.blockchainPath);
  }

  loadBlock(blockNumber) {
    const blockPath = FileUtil.getBlockPath(this.blockchainPath, blockNumber);
    if (!fs.existsSync(blockPath)) {
      return null;
    }
    return Block.parse(FileUtil.readCompressedJson(blockPath));
  }

  /**
    * Returns a section of the chain up to a maximuim of length CHAIN_SEGMENT_LENGTH, starting from
    * the `from` block number (included) up till `to` block number (excluded).
    *
    * @param {Number} from - The lowest block number to get (included)
    * @param {Number} to - The highest block number to geet (excluded)
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
    const blockPaths = FileUtil.getBlockPathList(this.blockchainPath, from, to - from);
    blockPaths.forEach((blockPath) => {
      blockList.push(Block.parse(FileUtil.readCompressedJson(blockPath)));
    });
    return blockList;
  }
}

module.exports = Blockchain;
