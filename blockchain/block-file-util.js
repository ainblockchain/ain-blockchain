const fs = require('fs');
const glob = require('glob');
const path = require('path');
const naturalSort = require('node-natural-sort');
const zipper = require('zip-local');
const {BLOCKCHAINS_DIR} = require('../common/constants');
const FILE_NAME_SUFFIX = 'json.zip';

class BlockFileUtil {
  static getBlockFilePath(chainPath, blockNumber) {
    return path.resolve(chainPath, this.getFilenameByNumber(blockNumber));
  }

  static getFilenameByNumber(blockNumber) {
    return `${blockNumber}.${FILE_NAME_SUFFIX}`;
  }

  static getFilename(block) {
    return this.getFilenameByNumber(block.number);
  }

  static getAllBlockFiles(chainPath) {
    const allBlockFilesPattern = `${chainPath}/*.${FILE_NAME_SUFFIX}`;
    return glob.sync(allBlockFilesPattern).sort(naturalSort());
  }

  static getBlockFiles(chainPath, from, to) {
    const blockFiles = [];
    for (let number = from; number < to; number++) {
      const blockFile = `${this.getBlockFilePath(chainPath, number)}`;
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

  static readBlock(filePath) {
    const unzippedFs = zipper.sync.unzip(filePath).memory();
    return JSON.parse(unzippedFs.read(unzippedFs.contents()[0], 'buffer').toString());
  }

  static readBlockByNumber(chainPath, blockNumber) {
    const file = this.getBlockFilePath(chainPath, blockNumber);
    return this.readBlock(file);
  }

  static writeBlock(filePath, block) {
    zipper.sync.zip(Buffer.from(JSON.stringify(block))).compress().save(filePath);
  }
}

module.exports = BlockFileUtil;
