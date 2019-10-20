const FILE_ENDING = 'json.zip';

class BlockFilePatterns {
  static getBlockFilenameByHash(chainPath, hash) {
    return `${chainPath}/*-*-*${hash}*.${FILE_ENDING}`;
  }

  static getAllBlockFiles(chainPath) {
    return `${chainPath}/[0-9]*-*.${FILE_ENDING}`;
  }

  static getBlockFilesInRange(chainPath, from, to) {
    return `${chainPath}/{${from}..${to - 1}}-*.${FILE_ENDING}`;
  }

  static getBlockFileName(block) {
    return `${block.height}-${block.lastHash}-${block.hash}.${FILE_ENDING}`;
  }
}

module.exports = BlockFilePatterns;
