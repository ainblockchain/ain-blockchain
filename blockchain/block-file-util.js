const fs = require('fs');
const glob = require('glob');
const path = require('path');
const {compare} = require('natural-orderby');
const zlib = require('zlib');
const {BLOCKCHAINS_N2B_DIR_NAME, BLOCKCHAINS_H2N_DIR_NAME} = require('../common/constants');
const FILE_NAME_SUFFIX = 'json.zip';
const logger = require('../logger')('BLOCK-FILE-UTIL');

class BlockFileUtil {
  static getBlockPath(chainPath, blockNumber) {
    return path.join(chainPath, BLOCKCHAINS_N2B_DIR_NAME, this.getBlockFilenameByNumber(blockNumber));
  }

  static getHashToNumberPath(chainPath, blockHash) {
    return path.join(chainPath, BLOCKCHAINS_H2N_DIR_NAME, blockHash);
  }

  static getBlockFilenameByNumber(blockNumber) {
    return `${blockNumber}.${FILE_NAME_SUFFIX}`;
  }

  static getBlockFilename(block) {
    return this.getBlockFilenameByNumber(block.number);
  }

  // TODO(csh): Don't use glob?
  static getAllBlockPaths(chainPath) {
    const allBlockFilesPattern = `${chainPath}/${BLOCKCHAINS_N2B_DIR_NAME}/*.${FILE_NAME_SUFFIX}`;
    return glob.sync(allBlockFilesPattern).sort(compare());
  }

  static getBlockPaths(chainPath, from, to) {
    const blockFiles = [];
    for (let number = from; number < to; number++) {
      const blockFile = this.getBlockPath(chainPath, number);
      if (fs.existsSync(blockFile)) {
        blockFiles.push(blockFile);
      }
    }
    return blockFiles;
  }

  static createBlockchainDir(chainPath) {
    const n2bPath = path.join(chainPath, BLOCKCHAINS_N2B_DIR_NAME);
    const h2nPath = path.join(chainPath, BLOCKCHAINS_H2N_DIR_NAME);

    if (!fs.existsSync(chainPath)) {
      fs.mkdirSync(chainPath, {recursive: true});
      fs.mkdirSync(n2bPath);
      fs.mkdirSync(h2nPath);
      return true;
    } else if (!fs.readdirSync(n2bPath).length) {
      return true;
    }
    return false;
  }

  // TODO(csh): Change to asynchronous
  static readBlock(blockPath) {
    const zippedFs = fs.readFileSync(blockPath);
    return JSON.parse(zlib.gunzipSync(zippedFs).toString());
  }

  static readBlockByNumber(chainPath, blockNumber) {
    const blockPath = this.getBlockPath(chainPath, blockNumber);
    return this.readBlock(blockPath);
  }

  // TODO(csh): Change to asynchronous
  static writeBlock(chainPath, block) {
    const blockPath = this.getBlockPath(chainPath, block.number);
    if (!fs.existsSync(blockPath)) {
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(block)));
      fs.writeFileSync(blockPath, compressed);
    }
  }

  static writeHashToNumber(chainPath, blockHash, blockNumber) {
    if (!blockHash || (blockNumber !== 0 && !blockNumber)) {
      logger.error(`Invalid writeHashToNumber parameters (${blockHash}, ${blockNumber})`);
      return;
    }
    const hashToNumberPath = this.getHashToNumberPath(chainPath, blockHash);
    if (!fs.existsSync(hashToNumberPath)) {
      fs.writeFileSync(hashToNumberPath, blockNumber);
    }
  }

  static readHashToNumber(chainPath, blockHash) {
    const hashToNumberPath = this.getHashToNumberPath(chainPath, blockHash);
    return Number(fs.readFileSync(hashToNumberPath).toString());
  }
}

module.exports = BlockFileUtil;
