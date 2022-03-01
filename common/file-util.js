const logger = new (require('../logger'))('FILE-UTIL');

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const JsonStreamStringify = require('json-stream-stringify');
const JSONStream = require('JSONStream');
const { BlockchainConsts, NodeConfigs } = require('./constants');
const CommonUtil = require('./common-util');
const ObjectUtil = require('./object-util');
const JSON_GZIP_FILE_EXTENSION = 'json.gz';

class FileUtil {
  static getBlockDirPath(chainPath, blockNumber) {
    const n2bPrefix = Math.floor(blockNumber / NodeConfigs.CHAINS_N2B_MAX_NUM_FILES).toString();
    return path.join(chainPath, BlockchainConsts.CHAINS_N2B_DIR_NAME, n2bPrefix);
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
        BlockchainConsts.SNAPSHOTS_N2S_DIR_NAME,
        FileUtil.getSnapshotFilenameByNumber(blockNumber, isDebug));
  }

  static getH2nDirPath(chainPath, blockHash) {
    const h2nPrefix = blockHash.substring(0, NodeConfigs.CHAINS_H2N_HASH_PREFIX_LENGTH);
    return path.join(chainPath, BlockchainConsts.CHAINS_H2N_DIR_NAME, h2nPrefix);
  }

  static getH2nPath(chainPath, blockHash) {
    return path.join(FileUtil.getH2nDirPath(chainPath, blockHash), blockHash);
  }

  static getSnapshotFilenameByNumber(blockNumber, isDebug = false) {
    const filenamePrefix = isDebug ? BlockchainConsts.DEBUG_SNAPSHOT_FILE_PREFIX : '';
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

    const snapshotPathPrefix = path.join(snapshotPath, BlockchainConsts.SNAPSHOTS_N2S_DIR_NAME);
    let latestSnapshotPath = null;
    let latestSnapshotBlockNumber = -1;
    let fileList = [];
    try {
      fileList = fs.readdirSync(snapshotPathPrefix);
    } catch (err) {
      logger.error(
          `[${LOG_HEADER}] Failed to read snapshots from ${snapshotPathPrefix}: ${err.stack}`);
      return { latestSnapshotPath, latestSnapshotBlockNumber };
    }
    for (const file of fileList) {
      // NOTE(platfowner): Skips the file if its name starts with debug snapshot file prefix.
      if (_.startsWith(file, BlockchainConsts.DEBUG_SNAPSHOT_FILE_PREFIX)) {
        logger.info(`[${LOG_HEADER}] Skipping debug snapshot file: ${file}`);
        continue;
      }
      const numString = _.get(_.split(file, `.${JSON_GZIP_FILE_EXTENSION}`), 0);
      let blockNumber = Number(numString);
      blockNumber = CommonUtil.isNumber(blockNumber) ? blockNumber : -1;
      if (blockNumber !== -1 && blockNumber > latestSnapshotBlockNumber) {
        latestSnapshotPath = path.join(snapshotPathPrefix, file);
        latestSnapshotBlockNumber = blockNumber;
      }
    }
    return { latestSnapshotPath, latestSnapshotBlockNumber };
  }

  static getLatestBlockInfo(chainPath) {
    const LOG_HEADER = 'getLatestBlockInfo';

    let latestBlockPath = null;
    let latestBlockNumber = -1;

    const blockDirPathPrefix = path.join(chainPath, BlockchainConsts.CHAINS_N2B_DIR_NAME);
    let dirList = [];
    try {
      dirList = fs.readdirSync(blockDirPathPrefix);
    } catch (err) {
      logger.error(
          `[${LOG_HEADER}] Failed to read block dirs from ${blockDirPathPrefix}: ${err.stack}`);
      return { latestBlockPath, latestBlockNumber };
    }
    if (dirList.length === 0) {
      return { latestBlockPath, latestBlockNumber };
    }
    const latestBlockDir = dirList.sort((a, b) => {
      let aNum = Number(a);
      aNum = CommonUtil.isNumber(aNum) ? aNum : -1;
      let bNum = Number(b);
      bNum = CommonUtil.isNumber(bNum) ? bNum : -1;
      return bNum - aNum;
    })[0];

    const blockFilePathPrefix = path.join(blockDirPathPrefix, latestBlockDir);
    let fileList = [];
    try {
      fileList = fs.readdirSync(blockFilePathPrefix);
    } catch (err) {
      logger.error(
          `[${LOG_HEADER}] Failed to read block files from ${blockFilePathPrefix}: ${err.stack}`);
      return { latestBlockPath, latestBlockNumber };
    }
    if (fileList.length === 0) {
      return { latestBlockPath, latestBlockNumber };
    }
    for (const file of fileList) {
      const numString = _.get(_.split(file, `.${JSON_GZIP_FILE_EXTENSION}`), 0);
      let blockNumber = Number(numString);
      blockNumber = CommonUtil.isNumber(blockNumber) ? blockNumber : -1;
      if (blockNumber !== -1 && blockNumber > latestBlockNumber) {
        latestBlockPath = path.join(blockFilePathPrefix, file);
        latestBlockNumber = blockNumber;
      }
    }
    return { latestBlockPath, latestBlockNumber };
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
    const n2bPath = path.join(chainPath, BlockchainConsts.CHAINS_N2B_DIR_NAME);
    const h2nPath = path.join(chainPath, BlockchainConsts.CHAINS_H2N_DIR_NAME);
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
    FileUtil.createDir(path.join(snapshotPath, BlockchainConsts.SNAPSHOTS_N2S_DIR_NAME));
  }

  static createDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  static isCompressedFile(filePath) {
    return _.endsWith(filePath, '.gz');
  }

  static async processChunkedJsonAsync(filePath, chunkCallback, endCallback) {
    const LOG_HEADER = 'processChunkedJsonAsync';
    try {
      return new Promise((resolve) => {
        const transformStream = JSONStream.parse('docs.*');
        let numChunks = 0;
        fs.createReadStream(filePath)
          .pipe(zlib.createGunzip())
          .pipe(transformStream)
          .on('data', (data) => {
            logger.debug(`[${LOG_HEADER}] Read chunk[${numChunks}]: ${JSON.stringify(data)}`);
            chunkCallback(data, numChunks);
            numChunks++;
          })
          .on('end', () => {
            logger.debug(
                `[${LOG_HEADER}] Reading ${numChunks} chunks done.`);
            resolve(endCallback(numChunks));
          })
          .on('error', (e) => {
            logger.error(`[${LOG_HEADER}] Error while reading ${filePath}: ${e}`);
            resolve(false);
          });
      });
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Error while reading ${filePath}: ${err}`);
      return false;
    }
  }

  static async readChunkedJsonAsync(filePath) {
    const LOG_HEADER = 'readChunkedJsonAsync';
    try {
      return new Promise((resolve) => {
        const transformStream = JSONStream.parse('docs.*');
        const chunks = [];
        let numChunks = 0;
        fs.createReadStream(filePath)
          .pipe(zlib.createGunzip())
          .pipe(transformStream)
          .on('data', (data) => {
            logger.debug(`[${LOG_HEADER}] Read chunk[${numChunks}]: ${JSON.stringify(data)}`);
            chunks.push(data);
            numChunks++;
          })
          .on('end', () => {
            logger.debug(
                `[${LOG_HEADER}] Reading ${chunks.length} chunks done.`);
            resolve(FileUtil.buildObjectFromChunks(chunks));
          })
          .on('error', (e) => {
            logger.error(`[${LOG_HEADER}] Error while reading ${filePath}: ${e}`);
            resolve(null);
          });
      });
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Error while reading ${filePath}: ${err}`);
      return null;
    }
  }

  static readChunkedJsonSync(filePath) {
    const LOG_HEADER = 'readChunkedJsonSync';
    try {
      const zippedFs = fs.readFileSync(filePath);
      return FileUtil.buildObjectFromChunks(JSON.parse(zlib.gunzipSync(zippedFs).toString()).docs);
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Error while reading ${filePath}: ${err}`);
      return null;
    }
  }

  static buildObjectFromChunks(chunks) {
    return ObjectUtil.fromChunks(chunks);
  }

  static readCompressedJsonSync(filePath) {
    const LOG_HEADER = 'readCompressedJsonSync';
    try {
      const zippedFs = fs.readFileSync(filePath);
      return JSON.parse(zlib.gunzipSync(zippedFs).toString());
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Error while reading ${filePath}: ${err}`);
      return null;
    }
  }

  static readJsonSync(filePath) {
    const LOG_HEADER = 'readJsonSync';
    try {
      const fileStr = fs.readFileSync(filePath);
      return JSON.parse(fileStr);
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Error while reading ${filePath}: ${err}`);
      return null;
    }
  }

  static readBlockByNumber(chainPath, blockNumber) {
    const blockPath = FileUtil.getBlockPath(chainPath, blockNumber);
    return FileUtil.readCompressedJsonSync(blockPath);
  }

  static writeBlockFile(chainPath, block) {
    const LOG_HEADER = 'writeBlockFile';

    const blockPath = FileUtil.getBlockPath(chainPath, block.number);
    const blockDirPath = FileUtil.getBlockDirPath(chainPath, block.number);
    FileUtil.createDir(blockDirPath);
    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(block)));
    fs.writeFileSync(blockPath, compressed);
    logger.debug(`[${LOG_HEADER}] Block written at ${blockPath}`);
  }

  static deleteBlockFile(chainPath, blockNumber) {
    const LOG_HEADER = 'deleteBlockFile';

    logger.info(`[${LOG_HEADER}] Deleting block file with block number: ${blockNumber}`);
    const blockPath = FileUtil.getBlockPath(chainPath, blockNumber);
    if (fs.existsSync(blockPath)) {
      fs.unlinkSync(blockPath);
    }
  }

  static hasBlockFile(chainPath, blockNumber) {
    const blockPath = FileUtil.getBlockPath(chainPath, blockNumber);
    return fs.existsSync(blockPath);
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

  static hasH2nFile(chainPath, blockHash) {
    const h2nPath = FileUtil.getH2nPath(chainPath, blockHash);
    return fs.existsSync(h2nPath);
  }

  static readH2nFile(chainPath, blockHash) {
    const LOG_HEADER = 'readH2nFile';
    const h2nPath = FileUtil.getH2nPath(chainPath, blockHash);
    try {
      return Number(fs.readFileSync(h2nPath).toString());
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Error while reading ${h2nPath}: ${err}`);
      return -1;
    }
  }

  static async writeSnapshotFile(
      snapshotPath, blockNumber, snapshot, snapshotChunkSize, isDebug = false) {
    const LOG_HEADER = 'writeSnapshotFile';

    const filePath = FileUtil.getSnapshotPathByBlockNumber(snapshotPath, blockNumber, isDebug);
    return new Promise((resolve) => {
      new JsonStreamStringify({ docs: ObjectUtil.toChunks(snapshot, snapshotChunkSize) })
        .pipe(zlib.createGzip())
        .pipe(fs.createWriteStream(filePath, { flags: 'w' }))
        .on('finish', () => {
          logger.debug(`[${LOG_HEADER}] Snapshot written at ${filePath}`);
          resolve();
        })
        .on('error', (e) => {
          logger.error(`[${LOG_HEADER}] Failed to write snapshot at ${filePath}: ${e}`);
          resolve();
        });
    });
  }

  static deleteSnapshotFile(snapshotPath, blockNumber, isDebug = false) {
    const LOG_HEADER = 'deleteSnapshotFile';

    const filePath = FileUtil.getSnapshotPathByBlockNumber(snapshotPath, blockNumber, isDebug);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.error(`[${LOG_HEADER}] Failed to delete snapshot at ${filePath}: ${err.stack}`);
      }
    }
  }

  static hasSnapshotFile(snapshotPath, blockNumber, isDebug = false) {
    const filePath = FileUtil.getSnapshotPathByBlockNumber(snapshotPath, blockNumber, isDebug);
    return fs.existsSync(filePath);
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
}

module.exports = FileUtil;
