const {Block} = require('./block');
const BlockFilePatterns = require('./block-file-patterns');
const {BLOCKCHAINS_DIR} = require('../constants');
const rimraf = require('rimraf');
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const zipper = require('zip-local');
const naturalSort = require('node-natural-sort');
const CHAIN_SUBSECT_LENGTH = 20;

class Blockchain {
  constructor(blockchainDir) {
    this.chain = [Block.genesis()];
    this.blockchain_dir = blockchainDir;
    this.backUpDB = null;
    this._proposedBlock = null;
    this.syncedAfterStartup = false;
    let newChain;
    if (this.createBlockchainDir()) {
      newChain = Blockchain.loadChain(this._blockchainDir());
      this.chain = newChain ? newChain: this.chain;
    }
    this.writeChain();
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
    return blockFileName === undefined ? null : Block.loadBlock(blockFileName);
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
    return blockFileName === undefined ? null : Block.loadBlock(blockFileName);
  }

  setBackDb(backUpDB) {
    if (this.backUpDB !== null) {
      throw Error('Already set backupDB');
    }
    this.backUpDB = backUpDB;
  }

  height() {
    const lastBlockNumber = this.lastBlockNumber();
    if (lastBlockNumber >= 0) {
      return lastBlockNumber + 1;
    }
    return 0;
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

  addNewBlock(block) {
    if (block.number != this.lastBlockNumber() + 1) {
      console.log(`[blockchain.addNewBlock] Invalid blockchain number: ${block.number}`);
      return false;
    }
    if (!(block instanceof Block)) {
      block = Block.parse(block);
    }
    this.chain.push(block);
    while (this.chain.length > 10) {
      this.backUpDB.executeBlockTransactions(this.chain.shift());
    }
    this.writeChain();
    return true;
  }


  static isValidChain(chain) {
    const firstBlock = Block.parse(chain[0]);
    if (firstBlock.hash !== Block.genesis().hash) {
      console.log('First block is not the Genesis block');
      return false;
    }
    if (!Block.validateHashes(firstBlock)) {
      console.log('Genesis block is corrupted')
      return false;
    }
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
    return path.resolve(BLOCKCHAINS_DIR, this.blockchain_dir);
  }

  pathToBlock(block) {
    return path.resolve(this._blockchainDir(), Block.getFileName(block));
  }

  createBlockchainDir() {
    let alreadyExists = true;
    const dirs = [BLOCKCHAINS_DIR, this._blockchainDir()];
    dirs.forEach((directory) => {
      if (!(fs.existsSync(directory))) {
        fs.mkdirSync(directory);
        alreadyExists = false;
      }
    });
    return alreadyExists;
  }

  writeChain() {
    for (let i = this.chain[0].number; i < this.lastBlockNumber() + 1; i++) {
      const block = this.chain[i - this.chain[0].number];
      const filePath = this.pathToBlock(block);
      if (!(fs.existsSync(filePath))) {
        // Change to async implementation
        zipper.sync.zip(Buffer.from(JSON.stringify(block))).compress().save(filePath);
      }
    }
  }

  /**
    * Returns a section of the chain up to a maximuim of length CHAIN_SUBSECT_LENGTH, starting from
    * the index of the queired lastBlock
    *
    * @param {Block} lastBlock - The current highest block tin the querying nodes blockchain
    * @return {list} A list of Block instances with lastBlock at index 0, up to a maximuim length
    *                CHAIN_SUBSECT_LENGTH
    */
  requestBlockchainSection(lastBlock) {
    console.log(`Current last block number: ${this.lastBlockNumber()}, ` +
        `Requester's last block number: ${lastBlock.number}\t (hash: ${lastBlock.last_hash})`);
    const blockFiles =
        this.getBlockFiles(lastBlock.number, lastBlock.number + CHAIN_SUBSECT_LENGTH);
    if (blockFiles.length > 0 &&
        Block.loadBlock(blockFiles[blockFiles.length - 1]).number > lastBlock.number &&
      blockFiles[0].indexOf(Block.getFileName(lastBlock)) < 0) {
      console.log(
          'Invalid blockchain request. Requesters last block does not belong to this blockchain');
      return;
    }
    if (lastBlock.hash === this.lastBlock().hash) {
      console.log('Requesters blockchain is up to date with this blockchain');
      return;
    }

    const chainSubSection = [];
    blockFiles.forEach((blockFile) => {
      chainSubSection.push(Block.loadBlock(blockFile));
    });
    return chainSubSection.length > 0 ? chainSubSection: null;
  }

  merge(chainSubSection) {
    // Call to shift here is important as it removes the first element from the list !!
    console.log(`Last block number before merge: ${this.lastBlockNumber()}`);
    if (chainSubSection[chainSubSection.length - 1].number <= this.lastBlockNumber()) {
      console.log('Received chain is of lower block number than current last block number');
      return false;
    }
    const firstBlock = Block.parse(chainSubSection.shift());
    // Fix this logic
    if (this.lastBlock().hash !== firstBlock.hash &&
        this.lastBlock().hash !== Block.genesis().hash) {
      console.log(`Hash ${this.lastBlock().hash.substring(0, 5)} ` +
          `does not equal ${firstBlock.hash.substring(0, 5)}`);
      return false;
    }
    if (!Blockchain.isValidChainSubsection(chainSubSection)) {
      console.log('Invalid chain subsection');
      return false;
    }
    chainSubSection.forEach((block) => {
      if (!this.addNewBlock(block)) {
        console.log('Failed to add block '+ block);
        return false;
      }
    });
    console.log(`Last block number after merge: ${this.lastBlockNumber()}`);
    return true;
  }

  static loadChain(chainPath) {
    const newChain = [];
    const blockFiles = Blockchain.getAllBlockFiles(chainPath);

    blockFiles.forEach((block) => {
      newChain.push(Block.loadBlock(block));
    });

    if (Blockchain.isValidChain(newChain)) {
      console.log(`Valid chain of size ${newChain.length}`);
      return newChain;
    }
    console.log('Invalid chain');
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
    from = from ? Number(from) : 0;
    to = to ? Number(to) : this.lastBlockNumber();
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
