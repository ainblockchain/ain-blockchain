const rimraf = require('rimraf');
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const zipper = require('zip-local');
const naturalSort = require('node-natural-sort');
const logger = require('../logger')
const { Block } = require('./block');
const DB = require('../db');
const BlockFilePatterns = require('./block-file-patterns');
const { BLOCKCHAINS_DIR } = require('../constants');
const CHAIN_SUBSECT_LENGTH = 20;

const LOG_PREFIX = 'BLOCKCHAIN';

class Blockchain {
  constructor(blockchainDir) {
    // Finalized chain
    this.chain = [];
    this.blockchainDir = blockchainDir;
    this.backupDb = null;
    this.syncedAfterStartup = false;
  }

  init(isFirstNode) {
    let lastBlockWithoutProposal;
    if (this.createBlockchainDir()) {
      if (isFirstNode) {
        logger.info("\n");
        logger.info("############################################################");
        logger.info("## Starting FIRST-NODE blockchain with a GENESIS block... ##");
        logger.info("############################################################");
        logger.info("\n");
        this.chain = [Block.genesis()];
        this.writeChain();
      } else {
        logger.info("\n");
        logger.info("#############################################################");
        logger.info("## Starting NON-FIRST-NODE blockchain with EMPTY blocks... ##");
        logger.info("#############################################################");
        logger.info("\n");
        this.chain = [];
        this.writeChain();
      }
    } else {
      if (isFirstNode) {
        logger.info("\n");
        logger.info("############################################################");
        logger.info("## Starting FIRST-NODE blockchain with EXISTING blocks... ##");
        logger.info("############################################################");
        logger.info("\n");
      } else {
        logger.info("\n");
        logger.info("################################################################");
        logger.info("## Starting NON-FIRST-NODE blockchain with EXISTING blocks... ##");
        logger.info("################################################################");
        logger.info("\n");
      }
      let newChain = Blockchain.loadChain(this._blockchainDir());
      if (newChain) {
        lastBlockWithoutProposal = newChain.pop();
        const path = this.pathToBlock(lastBlockWithoutProposal);
        fs.unlinkSync(path);
        this.chain = newChain;
      }
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
    const blockFileName =
        glob.sync(BlockFilePatterns.getBlockFilenameByHash(this._blockchainDir(), hash)).pop();
    if (blockFileName === undefined) {
      const found = this.chain.filter(block => block.hash === hash);
      return found.length ? found[0] : null;
    } else {
      return Block.loadBlock(blockFileName);
    }
  }

  /**
    * Given a block number, returns the block that corresponds to the block number.
    *
    * @param {integer} number - block number
    * @return {Block} Block instance corresponding to the queried block number.
]   */
  getBlockByNumber(number) {
    if (number === undefined || number === null) return null;
    const blockFileName = this.getBlockFiles(number, number + 1).pop();
    if (blockFileName === undefined) {
      const found = this.chain.filter(block => block.number === number);
      return found.length ? found[0] : null;
    } else {
      return Block.loadBlock(blockFileName);
    }
  }

  setBackupDb(backupDb) {
    if (this.backupDb !== null) {
      throw Error('Already set backupdb');
    }
    this.backupDb = backupDb;
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
      return -1;
    }
    return lastBlock.number;
  }

  lastBlockTimestamp() {
    const lastBlock = this.lastBlock();
    if (!lastBlock) {
      return -1;
    }
    return lastBlock.timestamp;
  }

  addNewBlock(newBlock) {
    if (!newBlock) {
      logger.error(`[blockchain.addNewBlock] Block is null`);
      return false;
    }
    if (newBlock.number != this.lastBlockNumber() + 1) {
      logger.error(`[blockchain.addNewBlock] Invalid blockchain number: ${newBlock.number}`);
      return false;
    }
    if (!(newBlock instanceof Block)) {
      newBlock = Block.parse(newBlock);
    }
    const block = this.chain.shift();
    this.chain.push(newBlock);
    if (!this.backupDb.executeTransactionList(newBlock.last_votes)) {
      logger.error(`[blockchain.addNewBlock] Failed to execute last_votes of block ${JSON.stringify(block, null, 2)}`);
      return false;
    }
    if (!this.backupDb.executeTransactionList(newBlock.transactions)) {
      logger.error(`[blockchain.addNewBlock] Failed to execute transactions of block ${JSON.stringify(block, null, 2)}`);
      return false;
    }
    this.writeChain();
    return true;
  }

  static isValidChain(chain) {
    const firstBlock = Block.parse(chain[0]);
    if (!firstBlock || firstBlock.hash !== Block.genesis().hash) {
      logger.error(`[${LOG_PREFIX}] First block is not the Genesis block`);
      return false;
    }
    if (!Block.validateHashes(firstBlock)) {
      logger.error(`[${LOG_PREFIX}] Genesis block is corrupted`);
      return false;
    }
    // TODO (lia): Check if the tx nonces are correct.
    return Blockchain.isValidChainSubsection(chain);
  }

  static isValidChainSubsection(chainSubSection) {
    for (let i = 1; i < chainSubSection.length; i++) {
      const block = chainSubSection[i];
      const lastBlock = Block.parse(chainSubSection[i - 1]);
      if (block.last_hash !== lastBlock.hash || !Block.validateHashes(block)) {
        return false;
      }
    }
    return true;
  }

  _blockchainDir() {
    return path.resolve(BLOCKCHAINS_DIR, this.blockchainDir);
  }

  pathToBlock(block) {
    return path.resolve(this._blockchainDir(), Block.getFileName(block));
  }

  createBlockchainDir() {
    let created = false;
    const dirs = [BLOCKCHAINS_DIR];
    if (this.blockchainDir) {
      dirs.push(this._blockchainDir());
    }
    dirs.forEach((directory) => {
      if (!(fs.existsSync(directory))) {
        fs.mkdirSync(directory);
        created = true;
      }
    });
    return created;
  }

  writeChain() {
    for (let i = 0; i < this.chain.length; i++) {
      const block = this.chain[i];
      const filePath = this.pathToBlock(block);
      if (!(fs.existsSync(filePath))) {
        // Change to async implementation
        zipper.sync.zip(Buffer.from(JSON.stringify(block))).compress().save(filePath);
      }
    }
  }

  /**
    * Returns a section of the chain up to a maximuim of length CHAIN_SUBSECT_LENGTH, starting from
    * the block number of the reference block.
    *
    * @param {Block} refBlock - The current highest block tin the querying nodes blockchain
    * @return {list} A list of Block instances with refBlock at index 0, up to a maximuim length
    *                CHAIN_SUBSECT_LENGTH
    */
  requestBlockchainSection(refBlock) {
    const refBlockNumber = !!refBlock ? refBlock.number : -1;
    const nextBlockNumber = refBlockNumber + 1;

    logger.info(`[${LOG_PREFIX}] Current last block number: ${this.lastBlockNumber()}, ` +
                `[${LOG_PREFIX}] Requester's last block number: ${refBlockNumber}`);

    const blockFiles = this.getBlockFiles(nextBlockNumber, nextBlockNumber + CHAIN_SUBSECT_LENGTH);

    if (blockFiles.length > 0 &&
        (!!(refBlock) && Block.loadBlock(blockFiles[0]).last_hash !== refBlock.hash)) {
      logger.error(`[${LOG_PREFIX}] Invalid blockchain request. Requesters last block does not belong to this blockchain`);
      return;
    }

    const refBlockHash = refBlock ? refBlock.hash : null;
    if (refBlockHash === this.lastBlock().hash) {
      logger.info(`[${LOG_PREFIX}] Requesters blockchain is up to date with this blockchain`);
      return [this.lastBlock()];
    }

    const chainSubSection = [];
    blockFiles.forEach((blockFile) => {
      chainSubSection.push(Block.loadBlock(blockFile));
    });
    return chainSubSection.length > 0 ? chainSubSection : [];
  }

  merge(chainSubSection) {
    // Call to shift here is important as it removes the first element from the list !!
    logger.info(`[${LOG_PREFIX}] Last block number before merge: ${this.lastBlockNumber()}`);
    if (!chainSubSection || chainSubSection.length === 0) {
      logger.info(`[${LOG_PREFIX}] Empty chain sub section`);
      if (!this.syncedAfterStartup) {
        // Regard this situation as if you're synced.
        // TODO (lia): ask the tracker server for another peer.
        this.syncedAfterStartup = true;
      }
      return false;
    }
    if (chainSubSection[chainSubSection.length - 1].number < this.lastBlockNumber()) {
      logger.info(`[${LOG_PREFIX}] Received chain is of lower block number than current last block number`);
      return false;
    }
    if (chainSubSection[chainSubSection.length - 1].number === this.lastBlockNumber()) {
      logger.info(`[${LOG_PREFIX}] Received chain is at the same block number`);
      if (!this.syncedAfterStartup) {
        // Regard this situation as if you're synced.
        // TODO (lia): ask the tracker server for another peer.
        this.syncedAfterStartup = true;
      }
      return false;
    }

    const firstBlock = Block.parse(chainSubSection[0]);
    const lastBlockHash = this.lastBlockNumber() >= 0 ? this.lastBlock().hash : null;
    const overlap = lastBlockHash ? chainSubSection.filter(block => block.number === this.lastBlockNumber()) : null;
    const overlappingBlock = overlap ? overlap[0] : null;
    if (lastBlockHash) {
      // Case 1: Not a cold start.
      if (overlappingBlock && overlappingBlock.hash !== lastBlockHash) {
        logger.info(`The last block's hash ${this.lastBlock().hash.substring(0, 5)} ` +
            `does not match with the first block's hash ${firstBlock.hash.substring(0, 5)}`);
        return false;
      }
    } else {
      // Case 2: A cold start.
      if (firstBlock.last_hash !== '') {
        logger.info(`[${LOG_PREFIX}] First block of hash ${firstBlock.hash.substring(0, 5)} ` +
                    `and last hash ${firstBlock.last_hash.substring(0, 5)} is not a genesis block`);
        return false;
      }
    }
    if (!Blockchain.isValidChainSubsection(chainSubSection)) {
      logger.error(`[${LOG_PREFIX}] Invalid chain subsection`);
      return false;
    }
    for (let i = 0; i < chainSubSection.length; i++) {
      const block = chainSubSection[i];

      if (block.number <= this.lastBlockNumber()) {
        continue;
      }
      if (!this.addNewBlock(block)) {
        logger.error(`[${LOG_PREFIX}] Failed to add block ` + block);
        return false;
      }
    }
    logger.info(`[${LOG_PREFIX}] Last block number after merge: ${this.lastBlockNumber()}`);
    return true;
  }

  static loadChain(chainPath) {
    const newChain = [];
    const blockFiles = Blockchain.getAllBlockFiles(chainPath);

    blockFiles.forEach((block) => {
      newChain.push(Block.loadBlock(block));
    });

    if (Blockchain.isValidChain(newChain)) {
      logger.info(`[${LOG_PREFIX}] Valid chain of size ${newChain.length}`);
      return newChain;
    }
    logger.error(`[${LOG_PREFIX}] Invalid chain`);
    rimraf.sync(chainPath + '/*');
    return null;
  }

  static getAllBlockFiles(chainPath) {
    return glob.sync(BlockFilePatterns.getAllBlockFiles(chainPath)).sort(naturalSort());
  }


  getBlockFiles(from, to) {
    // Here we use (to - 1) so files can be queried like normal array index querying.
    return glob.sync(BlockFilePatterns.getBlockFilesInRange(
      this._blockchainDir(), from, to)).sort(naturalSort());
  }

  getChainSection(from, to) {
    if (!Number.isInteger(from) || from < 0) {
      from = 0;
    }
    if (!Number.isInteger(to) || to < 0) {
      to = this.lastBlockNumber() + 1;
    }
    const chain = [];
    const blockFiles = this.getBlockFiles(from, to);
    blockFiles.forEach((blockFile) => {
      const block = Block.loadBlock(blockFile);
      chain.push(block);
    });
    return chain;
  }
}

module.exports = Blockchain;
