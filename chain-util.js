const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const stringify = require('fast-json-stable-stringify');
const ainUtil = require('@ainblockchain/ain-util');
const RuleUtil = require('./db/rule-util');
const ruleUtil = new RuleUtil();
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

  static isNumber(num) {
    return ruleUtil.isNumber(num);
  }

  static isString(value) {
    return ruleUtil.isString(value);
  }

  static isArray(value) {
    return ruleUtil.isArray(value);
  }

  static isDict(value) {
    return ruleUtil.isDict(value);
  }

  static isEmptyNode(value) {
    return ruleUtil.isEmptyNode(value);
  }

  static isValAddr(value) {
    return ruleUtil.isValAddr(value);
  }

  // TODO(lia): normalize addresses in user inputs using this function.
  static toCksumAddr(value) {
    return ruleUtil.toCksumAddr(value);
  }

  static isValShardProto(value) {
    return ruleUtil.isValShardProto(value);
  }

  static boolOrFalse(value) {
    return ChainUtil.isBool(value) ? value : false;
  }

  static numberOrZero(num) {
    return ChainUtil.isNumber(num) ? num : 0;
  }

  static stringOrEmpty(str) {
    return ChainUtil.isString(str) ? str : '';
  }

  static toString(value) {
    if (ChainUtil.isBool(value)) {
      return value.toString();
    } else if (ChainUtil.isNumber(value)) {
      return value.toString();
    } else if (ChainUtil.isString(value)) {
      return value;
    } else if (value === undefined) {
      return '';
    } else {
      return JSON.stringify(value);
    }
  }

  static parsePath(path) {
    if (!path) {
      return [];
    }
    return path.split('/').filter((node) => {
      return !!node;
    });
  }

  static formatPath(parsedPath) {
    if (!Array.isArray(parsedPath) || parsedPath.length === 0) {
      return '/';
    }
    let formatted = '';
    for (const label of parsedPath) {
      if (ChainUtil.isString(label)) {
        formatted += '/' + label;
      } else {
        formatted += '/' + stringify(label);
      }
    }
    return (formatted.startsWith('/') ? '' : '/') + formatted;
  }

  static getJsObject(obj, path) {
    if (!ChainUtil.isArray(path)) {
      return null;
    }
    let ref = obj;
    for (let i = 0; i < path.length; i++) {
      const key = ChainUtil.toString(path[i]);
      if (!ChainUtil.isDict(ref)) {
        return null;
      }
      ref = ref[key];
    }
    return ref === undefined ? null : ref;
  }

  static setJsObject(obj, path, value) {
    if (!ChainUtil.isArray(path)) {
      return false;
    }
    if (!ChainUtil.isDict(obj)) {
      return false;
    }
    if (path.length == 0) {
      return false;
    }
    let ref = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = ChainUtil.toString(path[i]);
      if (!ChainUtil.isDict(ref[key])) {
        ref[key] = {};
      }
      ref = ref[key];
    }
    const key = ChainUtil.toString(path[path.length - 1]);
    ref[key] = value;
    return true;
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
