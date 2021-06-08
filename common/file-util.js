const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const _ = require('lodash');
const {
  CHAINS_N2B_DIR_NAME,
  CHAINS_H2N_DIR_NAME,
  SNAPSHOTS_N2S_DIR_NAME,
} = require('./constants');
const ChainUtil = require('./chain-util');
const FILE_NAME_SUFFIX = 'json.gz';
const logger = require('../logger')('FILE-UTIL');

class FileUtil {
  static getBlockPath(chainPath, blockNumber) {
    if (blockNumber < 0) return null;
    return path.join(chainPath, CHAINS_N2B_DIR_NAME, this.getBlockFilenameByNumber(blockNumber));
  }

  static getSnapshotPathByBlockNumber(snapshotPath, blockNumber) {
    return path.join(snapshotPath, SNAPSHOTS_N2S_DIR_NAME, this.getBlockFilenameByNumber(blockNumber));
  }

  static getHashToNumberPath(chainPath, blockHash) {
    return path.join(chainPath, CHAINS_H2N_DIR_NAME, blockHash);
  }

  static getBlockFilenameByNumber(blockNumber) {
    return `${blockNumber}.${FILE_NAME_SUFFIX}`;
  }

  static getBlockFilename(block) {
    return this.getBlockFilenameByNumber(block.number);
  }

  static getLatestSnapshotInfo(snapshotPath) {
    const snapshotPathPrefix = path.join(snapshotPath, SNAPSHOTS_N2S_DIR_NAME);
    let latestSnapshotPath = null;
    let latestSnapshotBlockNumber = -1;
    let files = [];
    try {
      files = fs.readdirSync(snapshotPathPrefix);
    } catch (err) {
      logger.debug(`Failed to read snapshots: ${err.stack}`);
      return { latestSnapshotPath, latestSnapshotBlockNumber };
    }
    for (const file of files) {
      const blockNumber = _.get(file.split('.json.gz'), 0);
      if (blockNumber !== undefined && blockNumber > latestSnapshotBlockNumber) {
        latestSnapshotPath = path.join(snapshotPathPrefix, file);
        latestSnapshotBlockNumber = Number(blockNumber);
      }
    }
    return { latestSnapshotPath, latestSnapshotBlockNumber };
  }

  static getBlockPaths(chainPath, from, size) {
    const blockPaths = [];
    if (size <= 0) return blockPaths;
    for (let number = from; number < from + size; number++) {
      const blockFile = this.getBlockPath(chainPath, number);
      if (fs.existsSync(blockFile)) {
        blockPaths.push(blockFile);
      } else {
        logger.error(`blockFile (${blockFile}) does not exist`);
        return blockPaths;
      }
    }
    return blockPaths;
  }

  static createBlockchainDir(chainPath) {
    const n2bPath = path.join(chainPath, CHAINS_N2B_DIR_NAME);
    const h2nPath = path.join(chainPath, CHAINS_H2N_DIR_NAME);
    let isBlockEmpty = true;

    if (!fs.existsSync(chainPath)) {
      fs.mkdirSync(chainPath, {recursive: true});
    }

    if (!fs.existsSync(n2bPath)) {
      fs.mkdirSync(n2bPath);
    }

    if (!fs.existsSync(h2nPath)) {
      fs.mkdirSync(h2nPath);
    }

    if (fs.readdirSync(n2bPath).length > 0) {
      isBlockEmpty = false;
    }
    return isBlockEmpty;
  }

  static createSnapshotDir(snapshotPath) {
    if (!fs.existsSync(snapshotPath)) {
      fs.mkdirSync(snapshotPath, { recursive: true });
    }
    if (!fs.existsSync(path.join(snapshotPath, SNAPSHOTS_N2S_DIR_NAME))) {
      fs.mkdirSync(path.join(snapshotPath, SNAPSHOTS_N2S_DIR_NAME));
    }
  }

  // TODO(cshcomcom): Change to asynchronous.
  static readCompressedJson(blockPath) {
    try {
      const zippedFs = fs.readFileSync(blockPath);
      return JSON.parse(zlib.gunzipSync(zippedFs).toString());
    } catch (err) {
      return null;
    }
  }

  static readBlockByNumber(chainPath, blockNumber) {
    const blockPath = this.getBlockPath(chainPath, blockNumber);
    return this.readCompressedJson(blockPath);
  }

  // TODO(cshcomcom): Change to asynchronous.
  static writeBlock(chainPath, block) {
    const blockPath = this.getBlockPath(chainPath, block.number);
    if (!fs.existsSync(blockPath)) {
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(block)));
      fs.writeFileSync(blockPath, compressed);
    } else {
      logger.debug(`${blockPath} file already exists!`);
    }
  }

  static writeHashToNumber(chainPath, blockHash, blockNumber) {
    if (!blockHash || !ChainUtil.isNumber(blockNumber) || blockNumber < 0) {
      logger.error(`Invalid writeHashToNumber parameters (${blockHash}, ${blockNumber})`);
      return;
    }
    const hashToNumberPath = this.getHashToNumberPath(chainPath, blockHash);
    if (!fs.existsSync(hashToNumberPath)) {
      fs.writeFileSync(hashToNumberPath, blockNumber);
    } else {
      logger.debug(`${hashToNumberPath} file already exists!`);
    }
  }

  static readHashToNumber(chainPath, blockHash) {
    try {
      const hashToNumberPath = this.getHashToNumberPath(chainPath, blockHash);
      return Number(fs.readFileSync(hashToNumberPath).toString());
    } catch (err) {
      return -1;
    }
  }

  static writeSnapshot(snapshotPath, blockNumber, snapshot) {
    const filePath = this.getSnapshotPathByBlockNumber(snapshotPath, blockNumber);
    fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(snapshot))));
  }

  static deleteSnapshot(snapshotPath, blockNumber) {
    const filePath = this.getSnapshotPathByBlockNumber(snapshotPath, blockNumber);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.debug(`Failed to delete ${filePath}: ${err.stack}`);
      }
    }
  }
}

module.exports = FileUtil;
