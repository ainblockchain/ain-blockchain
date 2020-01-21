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
    this.chain = [];
    this.blockchainDir = blockchainDir;
    this.backupDb = null;
    this._proposedBlock = null;
    this.syncedAfterStartup = false;
  }

  init(isFirstNode) {
    if (this.createBlockchainDir()) {
      if (isFirstNode) {
        console.log("\n");
        console.log("############################################################");
        console.log("## Starting FIRST-NODE blockchain with a GENESIS block... ##");
        console.log("############################################################");
        console.log("\n");
        this.chain = [Block.genesis()];
        this.writeChain();
      } else {
        console.log("\n");
        console.log("#############################################################");
        console.log("## Starting NON-FIRST-NODE blockchain with EMPTY blocks... ##");
        console.log("#############################################################");
        console.log("\n");
      }
    } else {
      if (isFirstNode) {
        console.log("\n");
        console.log("############################################################");
        console.log("## Starting FIRST-NODE blockchain with EXISTING blocks... ##");
        console.log("############################################################");
        console.log("\n");
      } else {
        console.log("\n");
        console.log("################################################################");
        console.log("## Starting NON-FIRST-NODE blockchain with EXISTING blocks... ##");
        console.log("################################################################");
        console.log("\n");
      }
      let newChain = Blockchain.loadChain(this._blockchainDir());
      if (newChain) {
        this.chain = newChain;
      }
    }
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

  addNewBlock(block) {
    if (!block) {
      console.log(`[blockchain.addNewBlock] Block is null`);
      return false;
    }
    if (block.number != this.lastBlockNumber() + 1) {
      console.log(`[blockchain.addNewBlock] Invalid blockchain number: ${block.number}`);
      return false;
    }
    if (!(block instanceof Block)) {
      block = Block.parse(block);
    }
    this.chain.push(block);
    while (this.chain.length > 10) {
      const block = this.chain.shift();
      this.backupDb.executeTransactionList(block.transactions);
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
    const refBlockNumber = refBlock ? refBlock.number : 0;
    console.log(`Current last block number: ${this.lastBlockNumber()}, ` +
        `Requester's last block number: ${refBlockNumber}`);
    const blockFiles =
        this.getBlockFiles(refBlockNumber, refBlockNumber + CHAIN_SUBSECT_LENGTH);
    if (blockFiles.length > 0 &&
        Block.loadBlock(blockFiles[blockFiles.length - 1]).number > refBlockNumber &&
        (refBlock && blockFiles[0].indexOf(Block.getFileName(refBlock)) < 0)) {
      console.log(
          'Invalid blockchain request. Requesters last block does not belong to this blockchain');
      return;
    }
    const refBlockHash = refBlock ? refBlock.hash : null;
    if (refBlockHash === this.lastBlock().hash) {
      console.log('Requesters blockchain is up to date with this blockchain');
      return [ this.lastBlock() ];
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
    if (chainSubSection.length === 0) {
      console.log('Empty chain sub section');
      if (!this.syncedAfterStartup) {
        // Regard this situation as if you're synced.
        // TODO (lia): ask the tracker server for another peer.
        this.syncedAfterStartup = true;
      }
      return false;
    }
    if (chainSubSection[chainSubSection.length - 1].number < this.lastBlockNumber()) {
      console.log('Received chain is of lower block number than current last block number');
      return false;
    }
    if (chainSubSection[chainSubSection.length - 1].number === this.lastBlockNumber()) {
      console.log('Received chain is at the same block number');
      if (!this.syncedAfterStartup) {
        // Regard this situation as if you're synced.
        // TODO (lia): ask the tracker server for another peer.
        this.syncedAfterStartup = true;
      }
      return false;
    }
    const firstBlock = Block.parse(chainSubSection[0]);
    const lastBlockHash = this.lastBlockNumber() >= 0 ? this.lastBlock().hash : null;
    if (lastBlockHash) {
      // Case 1: Not a cold start.
      if (lastBlockHash !== firstBlock.hash) {
        console.log(`The last block's hash ${this.lastBlock().hash.substring(0, 5)} ` +
            `does not match with the first block's hash ${firstBlock.hash.substring(0, 5)}`);
        return false;
      }
    } else {
      // Case 2: A cold start.
      if (firstBlock.last_hash !== '') {
        console.log(`First block of hash ${firstBlock.hash.substring(0, 5)} ` +
            `and last hash ${firstBlock.last_hash.substring(0, 5)} is not a genesis block`);
        return false;
      }
    }
    if (!Blockchain.isValidChainSubsection(chainSubSection)) {
      console.log('Invalid chain subsection');
      return false;
    }
    for (let i = 0; i < chainSubSection.length; i++) {
      // Skip the first block if it's not a cold start (i.e., starting from genesis block).
      if (lastBlockHash && i === 0) {
        continue;
      }
      const block = chainSubSection[i];
      if (!this.addNewBlock(block)) {
        console.log('Failed to add block '+ block);
        return false;
      }
    }
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
