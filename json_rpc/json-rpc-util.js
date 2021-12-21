
const {
  BlockchainConsts,
} = require('../common/constants');

class JsonRpcUtil {
  static extractTransactionHashes(block) {
    if (!block) return [];
    const hashes = [];
    block.transactions.forEach((tx) => {
      hashes.push(tx.hash);
    });
    return hashes;
  }

  static addProtocolVersion(result) {
    result.protoVer = BlockchainConsts.CURRENT_PROTOCOL_VERSION;
    return result;
  }
};

module.exports = JsonRpcUtil;
