const fs = require('fs');
const glob = require('glob');
const path = require('path');
const {compare} = require('natural-orderby');
const zlib = require('zlib');
const {BLOCKCHAINS_DIR} = require('../common/constants');
const FILE_NAME_SUFFIX = 'json.zip';

class BlockFileUtil {
  static getBlockPath(chainPath, blockNumber) {
    return path.resolve(chainPath, this.getBlockFilenameByNumber(blockNumber));
  }

  static getBlockFilenameByNumber(blockNumber) {
    return `${blockNumber}.${FILE_NAME_SUFFIX}`;
  }

  static getBlockFilename(block) {
    return this.getBlockFilenameByNumber(block.number);
  }

  // TODO(csh): Don't use glob?
  static getAllBlockPaths(chainPath) {
    const allBlockFilesPattern = `${chainPath}/*.${FILE_NAME_SUFFIX}`;
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
    let created = false;
    const dirs = [BLOCKCHAINS_DIR];
    if (chainPath) {
      dirs.push(chainPath);
    }
    dirs.forEach((directory) => {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
        created = true;
      } else {
        const files = fs.readdirSync(directory);
        // Note(minsu): Added this check to avoid an only dir exists case without zip files at all.
        if (!files.length) {
          created = true;
        }
      }
    });
    return created;
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
}

module.exports = BlockFileUtil;
