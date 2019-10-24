const {ForgedBlock} = require('./block');
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
    this.chain = [ForgedBlock.genesis()];
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
    * Given a block hash or hash substring, returns a block with a matching hash from the blockchain.
    *
    * @param {string} hash - hash or hash substring of block.
    * @return {blockchain.ForgedBlock} ForgedBlock instance corresponding to the queried block hash.
    */
  getBlockByHash(hash) {
    if (!hash) return null;
    const blockFileName = glob.sync(BlockFilePatterns.getBlockFilenameByHash(this._blockchainDir(), hash)).pop();
    return blockFileName === undefined ? null : ForgedBlock.loadBlock(blockFileName);
  }

  /**
    * Given a number, returns the block corresponding to that height of the blockchain.
    *
    * @param {integer} number - Height of block.
    * @return {blockchain.ForgedBlock} ForgedBlock instance corresponding to the queried block number.
]   */
  getBlockByNumber(number) {
    if (!number) return null;
    const blockFileName = this.getBlockFiles(number, number + 1).pop();
    return blockFileName === undefined ? null : ForgedBlock.loadBlock(blockFileName);
  }

  setBackDb(backUpDB) {
    if (this.backUpDB !== null) {
      throw Error('Already set backupDB');
    }
    this.backUpDB = backUpDB;
  }

  height() {
    return this.lastBlock().height;
  }

  lastBlock() {
    return this.chain[this.chain.length -1];
  }

  addNewBlock(block) {
    if (block.height != this.height() + 1) {
      throw Error('Blockchain height is wrong');
    }
    if (!(block instanceof ForgedBlock)) {
      block = ForgedBlock.parse(block);
    }

    this.chain.push(block);
    while (this.chain.length > 10) {
      this.backUpDB.executeBlockTransactions(this.chain.shift());
    }
    this.writeChain();
  }


  static isValidChain(chain) {
    if (chain[0].hash !== ForgedBlock.hash) {
      console.log('first block not genesis');
      return false;
    }
    return Blockchain.isValidChainSubsection(chain);
  }

  static isValidChainSubsection(chainSubSection) {
    for (let i=1; i < chainSubSection.length; i++) {
      const block = chainSubSection[i];
      const lastBlock = chainSubSection[i - 1];
      if (block.lastHash !== lastBlock.hash || block.hash !== ForgedBlock.hash(block)) {
        console.log(`Invalid hashing for block ${block.height}`);
        return false;
      }
    }
    return true;
  }

  replaceChain(newChain) {
    // This operation is too slow !!!!! must speed up !!!!!!

    if (newChain.length <= this.chain.length) {
      console.log('Received chain is not longer than current chain');
      return false;
    } else if (! Blockchain.isValidChain(newChain)) {
      console.log('Received chain is not valid');
      return false;
    }

    console.log('Replacing blockchain with the new chain');
    this.chain = newChain;
    this.writeChain();
    return true;
  }

  _blockchainDir() {
    return path.resolve(BLOCKCHAINS_DIR, this.blockchain_dir);
  }

  pathToBlock(block) {
    return path.resolve(this._blockchainDir(), ForgedBlock.getFileName(block));
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
    for (let i=this.chain[0].height; i<this.height() + 1; i++) {
      const block = this.chain[i - this.chain[0].height];
      const filePath = this.pathToBlock(block);
      if (!(fs.existsSync(filePath))) {
        // Change to async implementation
        zipper.sync.zip(Buffer.from(JSON.stringify(block))).compress().save(filePath);
      }
    }
  }

  /**
    * Returns a section of the chain up to a maximuim of length CHAIN_SUBSECT_LENGTH, starting from the index of the queired lastBLock
    *
    * @param {ForgedBlock} lastBlock - The current highest block tin the querying nodes blockchain
    * @return {list} A list of ForgedBlock instances with lastBlock at index 0, up to a maximuim length CHAIN_SUBSECT_LENGTH
    */
  requestBlockchainSection(lastBlock) {
    console.log(`Current chain height: ${this.height()}: Requesters height ${lastBlock.height}\t hash ${lastBlock.lastHash}`);
    const blockFiles = this.getBlockFiles(lastBlock.height, lastBlock.height + CHAIN_SUBSECT_LENGTH);
    if (blockFiles.length > 0 && ForgedBlock.loadBlock(blockFiles[blockFiles.length - 1]).height > lastBlock.height &&
      blockFiles[0].indexOf(ForgedBlock.getFileName(lastBlock)) < 0) {
      console.log('Invalid blockchain request. Requesters last block does not belong to this blockchain');
      return;
    }
    if (lastBlock.hash === this.lastBlock().hash) {
      console.log('Requesters blockchain is up to date with this blockchain');
      return;
    }

    const chainSubSection = [];
    blockFiles.forEach((blockFile) => {
      chainSubSection.push(ForgedBlock.loadBlock(blockFile));
    });
    return chainSubSection.length > 0 ? chainSubSection: null;
  }

  merge(chainSubSection) {
    // Call to shift here is important as it removes the first element from the list !!
    console.log(`Current height before merge: ${this.height()}`);
    if (chainSubSection[chainSubSection.length - 1].height <= this.height()) {
      console.log('Received chain is of lower height than current height');
      return false;
    }
    const firstBlock = chainSubSection.shift();
    if (this.lastBlock().hash !== ForgedBlock.hash(JSON.parse(JSON.stringify(firstBlock))) && this.lastBlock().hash !== ForgedBlock.genesis().hash) {
      console.log(`Hash ${this.lastBlock().hash.substring(0, 5)} does not equal ${ForgedBlock.hash(JSON.parse(JSON.stringify(firstBlock))).substring(0, 5)}`);
      return false;
    }
    if (!Blockchain.isValidChainSubsection(chainSubSection)) {
      console.log('Invalid chain subsection');
      return false;
    }
    chainSubSection.forEach((block) => this.addNewBlock(block));
    console.log(`Height after merge: ${this.height()}`);
    return true;
  }

  static loadChain(chainPath) {
    const newChain = [];
    const blockFiles = Blockchain.getAllBlockFiles(chainPath);

    blockFiles.forEach((block) => {
      newChain.push(ForgedBlock.loadBlock(block));
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
    return glob.sync(BlockFilePatterns.getBlockFilesInRange(this._blockchainDir(), from, to)).sort(naturalSort());
  }

  getChainSection(from, to) {
    from = from ? Number(from) : 0;
    to = to ? Number(to) : this.height();
    const chain = [];
    const blockFiles = this.getBlockFiles(from, to);
    blockFiles.forEach((blockFile) => {
      const block = ForgedBlock.loadBlock(blockFile);
      chain.push(block);
    });
    return chain;
  }
}

module.exports = Blockchain;
