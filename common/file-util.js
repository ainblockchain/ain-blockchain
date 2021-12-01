const logger = new (require('../logger'))('FILE-UTIL');

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const { BlockchainConfigs } = require('./constants');
const CommonUtil = require('./common-util');
const JSON_GZIP_FILE_EXTENSION = 'json.gz';

class FileUtil {
  static getBlockDirPath(chainPath, blockNumber) {
    const n2bPrefix = Math.floor(blockNumber / BlockchainConfigs.CHAINS_N2B_MAX_NUM_FILES).toString();
    return path.join(chainPath, BlockchainConfigs.CHAINS_N2B_DIR_NAME, n2bPrefix);
  }

  static getBlockPath(chainPath, blockNumber) {
    if (blockNumber < 0) return null;
    return path.join(
        FileUtil.getBlockDirPath(chainPath, blockNumber),
        FileUtil.getBlockFilenameByNumber(blockNumber));
  }

  static getSnapshotPathByBlockNumber(snapshotPath, blockNumber, isDebug = false) {
    return path.join(
        snapshotPath,
        BlockchainConfigs.SNAPSHOTS_N2S_DIR_NAME,
        FileUtil.getSnapshotFilenameByNumber(blockNumber, isDebug));
  }

  static getH2nDirPath(chainPath, blockHash) {
    const h2nPrefix = blockHash.substring(0, BlockchainConfigs.CHAINS_H2N_HASH_PREFIX_LENGTH);
    return path.join(chainPath, BlockchainConfigs.CHAINS_H2N_DIR_NAME, h2nPrefix);
  }

  static getH2nPath(chainPath, blockHash) {
    return path.join(FileUtil.getH2nDirPath(chainPath, blockHash), blockHash);
  }

  static getSnapshotFilenameByNumber(blockNumber, isDebug = false) {
    const filenamePrefix = isDebug ? BlockchainConfigs.DEBUG_SNAPSHOT_FILE_PREFIX : '';
    return `${filenamePrefix}${blockNumber}.${JSON_GZIP_FILE_EXTENSION}`;
  }

  static getBlockFilenameByNumber(blockNumber) {
    return `${blockNumber}.${JSON_GZIP_FILE_EXTENSION}`;
  }

  static getBlockFilename(block) {
    return FileUtil.getBlockFilenameByNumber(block.number);
  }

  static getLatestSnapshotInfo(snapshotPath) {
    const LOG_HEADER = 'getLatestSnapshotInfo';

    const snapshotPathPrefix = path.join(snapshotPath, BlockchainConfigs.SNAPSHOTS_N2S_DIR_NAME);
    let latestSnapshotPath = null;
    let latestSnapshotBlockNumber = -1;
    let files = [];
    try {
      files = fs.readdirSync(snapshotPathPrefix);
    } catch (err) {
      logger.debug(`[${LOG_HEADER}] Failed to read snapshots: ${err.stack}`);
      return { latestSnapshotPath, latestSnapshotBlockNumber };
    }
    for (const file of files) {
      // NOTE(platfowner): Skips the file if its name starts with debug snapshot file prefix.
      if (_.startsWith(file, BlockchainConfigs.DEBUG_SNAPSHOT_FILE_PREFIX)) {
        logger.info(`[${LOG_HEADER}] Skipping debug snapshot file: ${file}`);
        continue;
      }
      const blockNumber = _.get(_.split(file, `.${JSON_GZIP_FILE_EXTENSION}`), 0);
      if (blockNumber !== undefined && blockNumber > latestSnapshotBlockNumber) {
        latestSnapshotPath = path.join(snapshotPathPrefix, file);
        latestSnapshotBlockNumber = Number(blockNumber);
      }
    }
    return { latestSnapshotPath, latestSnapshotBlockNumber };
  }

  static getBlockPathList(chainPath, from, size) {
    const LOG_HEADER = 'getBlockPathList';

    const blockPaths = [];
    if (size <= 0) return blockPaths;
    for (let number = from; number < from + size; number++) {
      const blockFile = FileUtil.getBlockPath(chainPath, number);
      if (fs.existsSync(blockFile)) {
        blockPaths.push(blockFile);
      } else {
        logger.debug(`[${LOG_HEADER}] blockFile (${blockFile}) does not exist`);
        return blockPaths;
      }
    }
    return blockPaths;
  }

  static createBlockchainDir(chainPath) {
    const n2bPath = path.join(chainPath, BlockchainConfigs.CHAINS_N2B_DIR_NAME);
    const h2nPath = path.join(chainPath, BlockchainConfigs.CHAINS_H2N_DIR_NAME);
    let isBlocksDirEmpty = true;
    FileUtil.createDir(chainPath);
    FileUtil.createDir(n2bPath);
    FileUtil.createDir(h2nPath);
    if (fs.readdirSync(n2bPath).length > 0) {
      isBlocksDirEmpty = false;
    }
    return isBlocksDirEmpty;
  }

  static createSnapshotDir(snapshotPath) {
    FileUtil.createDir(snapshotPath);
    FileUtil.createDir(path.join(snapshotPath, BlockchainConfigs.SNAPSHOTS_N2S_DIR_NAME));
  }

  static createDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  static isCompressedFile(filePath) {
    return _.endsWith(filePath, '.gz');
  }

  // TODO(cshcomcom): Change to asynchronous.
  static readCompressedJson(filePath) {
    try {
      const zippedFs = fs.readFileSync(filePath);
      return JSON.parse(zlib.gunzipSync(zippedFs).toString());
    } catch (err) {
      return null;
    }
  }

  static readJson(filePath) {
    try {
      const fileStr = fs.readFileSync(filePath);
      return JSON.parse(fileStr);
    } catch (err) {
      return null;
    }
  }

  static readBlockByNumber(chainPath, blockNumber) {
    const blockPath = FileUtil.getBlockPath(chainPath, blockNumber);
    return FileUtil.readCompressedJson(blockPath);
  }

  // TODO(cshcomcom): Change to asynchronous.
  static writeBlockFile(chainPath, block) {
    const LOG_HEADER = 'writeBlockFile';

    const blockPath = FileUtil.getBlockPath(chainPath, block.number);
    if (!fs.existsSync(blockPath)) {
      const blockDirPath = FileUtil.getBlockDirPath(chainPath, block.number);
      FileUtil.createDir(blockDirPath);
      const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(block)));
      fs.writeFileSync(blockPath, compressed);
    } else {
      logger.debug(`[${LOG_HEADER}] ${blockPath} file already exists!`);
    }
  }

  static deleteBlockFile(chainPath, blockNumber) {
    const LOG_HEADER = 'deleteBlockFile';

    logger.info(`[${LOG_HEADER}] Deleting block file with block number: ${blockNumber}`);
    const blockPath = FileUtil.getBlockPath(chainPath, blockNumber);
    if (fs.existsSync(blockPath)) {
      fs.unlinkSync(blockPath);
    }
  }

  static writeH2nFile(chainPath, blockHash, blockNumber) {
    const LOG_HEADER = 'writeH2nFile';

    if (!blockHash || !CommonUtil.isNumber(blockNumber) || blockNumber < 0) {
      logger.error(`[${LOG_HEADER}] Invalid parameters: '${blockHash}', '${blockNumber}'`);
      return;
    }
    const h2nPath = FileUtil.getH2nPath(chainPath, blockHash);
    if (!fs.existsSync(h2nPath)) {
      const h2nDirPath = FileUtil.getH2nDirPath(chainPath, blockHash);
      FileUtil.createDir(h2nDirPath);
      fs.writeFileSync(h2nPath, blockNumber.toString());
    } else {
      logger.debug(`[${LOG_HEADER}] ${h2nPath} file already exists!`);
    }
  }

  static deleteH2nFile(chainPath, blockHash) {
    const LOG_HEADER = 'deleteH2nFile';

    logger.info(`[${LOG_HEADER}] Deleting h2n file with block hash: ${blockHash}`);
    const h2nPath = FileUtil.getH2nPath(chainPath, blockHash);
    if (fs.existsSync(h2nPath)) {
      fs.unlinkSync(h2nPath);
    }
  }

  static readH2nFile(chainPath, blockHash) {
    try {
      const h2nPath = FileUtil.getH2nPath(chainPath, blockHash);
      return Number(fs.readFileSync(h2nPath).toString());
    } catch (err) {
      return -1;
    }
  }

  static writeSnapshot(snapshotPath, blockNumber, snapshot, isDebug = false) {
    const LOG_HEADER = 'writeSnapshot';

    const filePath = FileUtil.getSnapshotPathByBlockNumber(snapshotPath, blockNumber, isDebug);
    if (snapshot === null) { // Delete
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          logger.debug(`[${LOG_HEADER}] Failed to delete ${filePath}: ${err.stack}`);
        }
      }
    } else {
      // TODO(liayoo): Change this operation to be asynchronous
      fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(snapshot))));
    }
  }

  static getAccountFromKeystoreFile(keystorePath, password) {
    const keystore = JSON.parse(fs.readFileSync(keystorePath));
    return ainUtil.privateToAccount(ainUtil.v3KeystoreToPrivate(keystore, password));
  }

  static getNumFiles(path) {
    if (!fs.existsSync(path)) {
      return 0;
    }
    return fs.readdirSync(path).filter((file) => file.endsWith(JSON_GZIP_FILE_EXTENSION)).length;
  }

  static getNumBlockFiles(chainPath) {
    let numBlockFiles = 0;
    let blockNumber = 0;
    let numFiles;
    do {
      const blockDirPath = FileUtil.getBlockDirPath(chainPath, blockNumber);
      numFiles = FileUtil.getNumFiles(blockDirPath);
      numBlockFiles += numFiles;
      blockNumber += BlockchainConfigs.CHAINS_N2B_MAX_NUM_FILES;
    } while (numFiles > 0);
    return numBlockFiles;
  }
}

module.exports = FileUtil;
