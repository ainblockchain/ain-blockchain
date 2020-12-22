const ainUtil = require('@ainblockchain/ain-util');

// NOTE(seo): To keep the blockchain deterministic as much as possibble over time,
// we keep util functions here self-contained as much as possible.
class RuleUtil {
  isBool(value) {
    return typeof value === 'boolean';
  }

  isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  isString(value) {
    return typeof value === 'string';
  }

  isArray(value) {
    return Array.isArray(value);
  }

  isDict(value) {
    return (typeof value === 'object' && value !== null && !Array.isArray(value));
  }

  isEmpty(value) {
    return value === null || value === undefined ||
        (this.isDict(value) && Object.keys(value).length === 0);
  }

  keys(value) {
    if (this.isDict(value)) {
      return Object.keys(value);
    }
    return [];
  }

  length(value) {
    if (this.isString(value) || this.isArray(value)) {
      return value.length;
    }
    if (this.isDict(value)) {
      return this.keys(value).length;
    }
    return 0;
  }

  isValAddr(addr) {
    return this.isString(addr) && ainUtil.isValidAddress(addr);
  }

  isCksumAddr(addr) {
    return this.isValAddr(addr) && addr === ainUtil.toChecksumAddress(addr);
  }

  isValShardProto(value) {
    const {ShardingProtocols} = require('../common/constants');
    return value === ShardingProtocols.NONE || value === ShardingProtocols.POA;
  }

  toBool(value) {
    return this.isBool(value) ? value : value === 'true';
  }

  // TODO(lia): normalize addresses in rule strings using this function.
  toCksumAddr(addr) {
    try {
      return ainUtil.toChecksumAddress(addr);
    } catch (e) {
      return '';
    }
  }
}

module.exports = RuleUtil;
