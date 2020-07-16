const RuleUtil = require('./db/rule-util');
const ruleUtil = new RuleUtil();
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const ainUtil = require('@ainblockchain/ain-util');
const PRIVATE_KEY = process.env.PRIVATE_KEY || null;

class ChainUtil {
  static hashString(stringData) {
    if (typeof stringData !== 'string') return '';
    return '0x' + ainUtil.hashMessage(stringData).toString('hex');
  }

  static shortenHash(hash) {
    if (typeof hash !== 'string' || hash.length < 10) return hash;
    return hash.substring(0,6) + '...' + hash.substring(hash.length - 4, hash.length);
  }

  // TODO (lia): remove this function
  static genKeyPair() {
    let keyPair;
    if (PRIVATE_KEY) {
      keyPair = ec.keyFromPrivate(PRIVATE_KEY, 'hex');
      keyPair.getPublic();
    } else {
      keyPair = ec.genKeyPair();
    }
    return keyPair;
  }

  static isBool(value) {
    return ruleUtil.isBool(value);
  }

  static isNumber(value) {
    return ruleUtil.isNumber(value);
  }

  static isString(value) {
    return ruleUtil.isString(value);
  }

  static isArray(value) {
    return ruleUtil.isString(value);
  }

  static isDict(value) {
    return ruleUtil.isDict(value);
  }

  static isEmptyNode(value) {
    return ruleUtil.isEmptyNode(value);
  }

  static numberOrZero(num) {
    return ChainUtil.isNumber(num) ? num : 0;
  }

  static stringOrEmpty(str) {
    return ChainUtil.isString(str) ? str : '';
  }

  static parsePath(path) {
    if (!path) {
      return [];
    }
    path = path.replace(/^"(.*)"$/, '$1');
    return path.split('/').filter((node) => {
      return !!node;
    });
  }

  static formatPath(parsedPath) {
    if (!Array.isArray(parsedPath) || !parsedPath.length) {
      return '/';
    }
    return (parsedPath[0].startsWith('/') ? '' : '/') + parsedPath.join('/');
  }

  static transactionFailed(response) {
    if (Array.isArray(response)) {
      response.forEach(res => {
        if (ChainUtil.checkForTransactionErrorCode(res)) {
          return true;
        }
      });
      return false;
    }
    return ChainUtil.checkForTransactionErrorCode(response);
  }

  static checkForTransactionErrorCode(response) {
    return response === null || (response.code !== undefined && response.code !== 0);
  }
}

module.exports = ChainUtil;
