const ainUtil = require('@ainblockchain/ain-util');

// NOTE(seo): To keep the blockchain deterministic as much as possibble over time,
// we keep util functions here self-contained as much as possible.
class BuiltInRuleUtil {
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

  isValidAddress(addr) {
    return this.isString(addr) && ainUtil.isValidAddress(addr);
  }

  isChecksumAddr(addr) {
    return this.isString(addr) && ainUtil.isValidAddress(addr) &&
        addr === ainUtil.toChecksumAddress(addr);
  }
}

module.exports = BuiltInRuleUtil