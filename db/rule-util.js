// NOTE(seo): To keep the blockchain deterministic as much as possibble over generations,
// we keep util functions here self-contained as much as possible.
class RuleUtil {
  isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  isString(value) {
    return typeof value === 'string';
  }

  isChecksumAddr(addr) {
    return true;
  }
}

module.exports = RuleUtil