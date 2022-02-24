const logger = new (require('../logger'))('BLOCKCHAIN');

const path = require('path');
const fs = require('fs');
const { Block } = require('./block');
const FileUtil = require('../common/file-util');
const {
  NodeConfigs,
  BlockchainSnapshotProperties,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');

class Blockchain {
  constructor(basePath) {
    // Finalized chain
    this.chain = [];
    this.blockchainPath = path.resolve(NodeConfigs.CHAINS_DIR, basePath);
    this.setGenesisBlock();

    // Mapping of a block number to the finalized block's info
    this.numberToBlockInfo = {};
  }

  setGenesisBlock() {
    const genesisBlockPath = path.join(NodeConfigs.GENESIS_BLOCK_DIR, 'genesis_block.json.gz');
    const block = Block.parse(FileUtil.readCompressedJsonSync(genesisBlockPath));
    if (!block) {
      throw Error(`Missing genesis block at ${genesisBlockPath}`);
    }
    if (block.number !== 0) {
      throw Error(`Invalid genesis block: ${JSON.stringify(block)}`);
    }
    this.genesisBlock = block;
    this.genesisBlockHash = block.hash;
  }

  /**
   * Initializes the blockchain and returns whether there are block files to load.
   */
  initBlockchain(isFirstNode, snapshot) {
    if (snapshot) {
      this.addBlockToChain(snapshot[BlockchainSnapshotProperties.BLOCK]);
    }
    const wasBlockDirEmpty = FileUtil.createBlockchainDir(this.blockchainPath);
    if (wasBlockDirEmpty) {
      if (isFirstNode) {
        logger.info('\n');
        logger.info('############################################################');
        logger.info('## Starting FIRST-NODE blockchain with a GENESIS block... ##');
        logger.info('############################################################');
        logger.info('\n');
        // Copy the genesis block from the genesis configs dir to the blockchain dir.
        this.writeBlock(this.genesisBlock);
      } else {
        logger.info('\n');
        logger.info('#############################################################');
        logger.info('## Starting NON-FIRST-NODE blockchain with EMPTY blocks... ##');
        logger.info('#############################################################');
        logger.info('\n');
        if (snapshot) {
          // Write the block from the snapshot to the blockchain dir.
          this.writeBlock(snapshot[BlockchainSnapshotProperties.BLOCK]);
        }
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
    return wasBlockDirEmpty;
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
      return Block.parse(FileUtil.readCompressedJsonSync(blockPath));
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
    if (blockNumber === 0) return this.genesisBlock;
    const blockPath = FileUtil.getBlockPath(this.blockchainPath, blockNumber);
    if (!blockPath || blockNumber > this.lastBlockNumber() - NodeConfigs.ON_MEMORY_CHAIN_LENGTH) {
      return this.chain.find((block) => block.number === blockNumber);
    } else {
      return Block.parse(FileUtil.readCompressedJsonSync(blockPath));
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
    if (lastBlock) {
      return lastBlock.number;
    }
    return -1;
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

  addBlockToChain(block) {
    const LOG_HEADER = 'addBlockToChain';

    this.chain.push(block);
    logger.info(`[${LOG_HEADER}] Successfully added block ${block.number} to chain.`);

    // Keep up to latest ON_MEMORY_CHAIN_LENGTH blocks
    while (this.chain.length > NodeConfigs.ON_MEMORY_CHAIN_LENGTH) {
      this.chain.shift();
    }
  }

  updateNumberToBlockInfo(block) {
    this.numberToBlockInfo[block.number] = {
      finalized_at: Date.now()
    };
    if (block.number >= NodeConfigs.MAX_FINALIZED_BLOCK_INFO_ON_MEM) {
      delete this.numberToBlockInfo[block.number - NodeConfigs.MAX_FINALIZED_BLOCK_INFO_ON_MEM];
    }
  }

  addBlockToChainAndWriteToDisk(block, writeToDisk) {
    const LOG_HEADER = 'addBlockToChainAndWriteToDisk';

    if (!(block instanceof Block)) {
      block = Block.parse(block);
    }
    if (!block) {
      logger.error(`[${LOG_HEADER}] Ill-formed block: ${JSON.stringify(block)}`);
      return false;
    }
    if (block.number !== this.lastBlockNumber() + 1) {
      logger.error(`[${LOG_HEADER}] Invalid block number: ${block.number}`);
      return false;
    }
    this.addBlockToChain(block);
    this.updateNumberToBlockInfo(block);
    if (writeToDisk) {
      this.writeBlock(block);
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
    if (!Block.validateValidators(block.validators)) {
      logger.error(
          `[${LOG_HEADER}] Invalid validators format: ${JSON.stringify(block.validators)} ` +
          `(${block.number} / ${block.epoch})`);
      return false;
    }
    logger.info(`[${LOG_HEADER}] Successfully validated block: ${block.number} / ${block.epoch}`);
    return true;
  }

  writeBlock(block) {
    const LOG_HEADER = 'writeBlock';

    if (FileUtil.hasBlockFile(this.blockchainPath, block)) {
      logger.error(
          `[${LOG_HEADER}] Overwriting block file for block ${block.number} of hash ${block.hash}`);
    }
    FileUtil.writeBlockFile(this.blockchainPath, block);

    if (FileUtil.hasH2nFile(this.blockchainPath, block.hash)) {
      logger.error(
          `[${LOG_HEADER}] Overwriting h2n file for block ${block.number} of hash ${block.hash}`);
    }
    FileUtil.writeH2nFile(this.blockchainPath, block.hash, block.number);
  }

  deleteBlock(block) {
    FileUtil.deleteBlockFile(this.blockchainPath, block.number);
    FileUtil.deleteH2nFile(this.blockchainPath, block.hash);
  }

  getValidBlocksInChainSegment(chainSegment) {
    const firstBlock = Block.parse(chainSegment[0]);
    const lastBlock = this.lastBlock();
    const lastBlockHash = this.lastBlockNumber() >= 0 && lastBlock ? lastBlock.hash : null;
    const overlap = lastBlockHash ?
        chainSegment.filter((block) => block.number === this.lastBlockNumber()) : null;
    const overlappingBlock = overlap ? overlap[0] : null;
    const validBlocks = [];
    if (lastBlockHash) {
      // Case 1: Not a cold start.
      // TODO(liayoo): Try to overwrite with the new chainSegment if the new chain is longer & valid
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
    for (const block of chainSegment) {
      if (block.number <= this.lastBlockNumber()) {
        continue;
      }
      validBlocks.push(block);
    }
    return validBlocks;
  }

  getLatestBlockNumber() {
    const latestBlockInfo = FileUtil.getLatestBlockInfo(this.blockchainPath);
    return latestBlockInfo.latestBlockNumber;
  }

  loadBlock(blockNumber) {
    const blockPath = FileUtil.getBlockPath(this.blockchainPath, blockNumber);
    if (!fs.existsSync(blockPath)) {
      return null;
    }
    return Block.parse(FileUtil.readCompressedJsonSync(blockPath));
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
    if (to - from > NodeConfigs.CHAIN_SEGMENT_LENGTH) { // NOTE: To prevent large query.
      to = from + NodeConfigs.CHAIN_SEGMENT_LENGTH;
    }
    const blockPaths = FileUtil.getBlockPathList(this.blockchainPath, from, to - from);
    for (const blockPath of blockPaths) {
      blockList.push(Block.parse(FileUtil.readCompressedJsonSync(blockPath)));
    }
    return blockList;
  }
}

module.exports = Blockchain;
