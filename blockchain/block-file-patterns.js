const FILE_NAME_SUFFIX = 'json.zip';

class BlockFilePatterns {
  /**
  * Returns a RegEx query expression which will match a block file in the chainPath directory with the corresponding hash.
  *
  * @param {String} chainPath - The directory containing blockchain files.
  * @param {String} hash - The hash of the block being queried. The hash can be any substring of the complete hash and the function should still work.
  * @return {String} A RegEx statement matching the block corresponding to the hash in the given chainPath directory.
  */
  static getBlockFilenameByHash(chainPath, hash) {
    return `${chainPath}/*-*-*${hash}*.${FILE_NAME_SUFFIX}`;
  }
  /**
  * Returns a RegEx query expression for querying all block files in a given chainPath directory.
  *
  * @param {String} chainPath - The directory containing blockchain files.
  * @return {list} A RegEx statement matching all block files in the given chainPath directory.
  */
  static getAllBlockFiles(chainPath) {
    return `${chainPath}/[0-9]*-*.${FILE_NAME_SUFFIX}`;
  }
  /**
  * Returns a RegEx query expression for querying a range of block files in a given chainPath directory.
  *
  * @param {String} chainPath - The directory containing blockchain files.
  * @param {int} from - The index of the blockchain to start querying from.
  * @param {int} to - The index of the blockchain to query up to (not inclusive).
  * @return {String} A RegEx statement matching the queried range of block files in the given chainPath directory.
  */
  static getBlockFilesInRange(chainPath, from, to) {
    return `${chainPath}/{${from}..${to - 1}}-*.${FILE_NAME_SUFFIX}`;
  }
  /**
  * Returns the name of the block file corresponding to the given block e.g. <lastHash>-<currentHash>.json.zip
  *
  * @param {ForgedBlock} block - An instance of a ForgedBlock
  * @return {String} The name of the corresponding block file.
  */
  static getBlockFileName(block) {
    return `${block.height}-${block.lastHash}-${block.hash}.${FILE_NAME_SUFFIX}`;
  }
}

module.exports = BlockFilePatterns;
