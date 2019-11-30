const ainUtil = require('@ainblockchain/ain-util');

// NOTE(seo): To keep the blockchain deterministic as much as possibble over generations,
// we keep util functions here self-contained as much as possible.
class RuleUtil {
  isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  isString(value) {
    return typeof value === 'string';
  }

  isArray(value) {
    return Array.isArray(value);
  }

  length(value) {
    if (!this.isString(value) && !this.isArray(value)) {
      return 0;
    }
    return value.length;
  }

  isValidAddress(addr) {
    return this.isString(addr) && ainUtil.isValidAddress(addr);
  }

  isChecksumAddr(addr) {
    return this.isString(addr) && ainUtil.isValidAddress(addr) &&
        addr === ainUtil.toChecksumAddress(addr);
  }
}

module.exports = RuleUtil