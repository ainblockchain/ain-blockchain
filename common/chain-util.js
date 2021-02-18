const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const stringify = require('fast-json-stable-stringify');
const ainUtil = require('@ainblockchain/ain-util');
const RuleUtil = require('../db/rule-util');
const ruleUtil = new RuleUtil();
const PRIVATE_KEY = process.env.PRIVATE_KEY || null;

class ChainUtil {
  static hashString(stringData) {
    if (typeof stringData !== 'string') return '';
    return '0x' + ainUtil.hashMessage(stringData).toString('hex');
  }

  static shortenHash(hash) {
    if (typeof hash !== 'string' || hash.length < 10) return hash;
    return hash.substring(0, 6) + '...' + hash.substring(hash.length - 4, hash.length);
  }

  static hashSignature(sig) {
    const sigBuffer = ainUtil.toBuffer(sig);
    const lenHash = sigBuffer.length - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    return '0x' + hashedData.toString('hex');
  }

  // TODO(lia): remove this function
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

  static isEmpty(value) {
    return ruleUtil.isEmpty(value);
  }

  static isValAddr(value) {
    return ruleUtil.isValAddr(value);
  }

  static isCksumAddr(addr) {
    return ruleUtil.isCksumAddr(addr);
  }

  static isServAcntName(name) {
    return ruleUtil.isServAcntName(name);
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

  static toBool(value) {
    return ruleUtil.toBool(value);
  }

  static toCksumAddr(addr) {
    return ruleUtil.toCksumAddr(addr);
  }

  static toServiceAccountName(serviceType, serviceName, user) {
    return `${serviceType}|${serviceName}|${user}`;
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

  static parseJsonOrNull(str) {
    let parsed = null;
    try {
      parsed = JSON.parse(str);
    } catch (e) {
      // parsed is not set
    }
    return parsed;
  }

  static isJson(str) {
    return ChainUtil.parseJsonOrNull(str) !== null;
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

  static appendPath(path, ...pathsToAppend) {
    const labels = ChainUtil.parsePath(path);
    for (const toAppend of pathsToAppend) {
      labels.push(...ChainUtil.parsePath(toAppend));
    }
    return ChainUtil.formatPath(labels);
  }

  static getBalancePath(addrOrServAcnt) {
    return ruleUtil.getBalancePath(addrOrServAcnt);
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
    if (path.length === 0) {
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

  static simplifyProperties(obj) {
    const newObj = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = true;
    }
    return newObj;
  }

  static transactionFailed(response) {
    if (Array.isArray(response)) {
      for (const result of response) {
        if (ChainUtil.checkForTransactionErrorCode(result)) {
          return true;
        }
      }
      return false;
    }
    return ChainUtil.checkForTransactionErrorCode(response);
  }

  static checkForTransactionErrorCode(result) {
    return result === null || (result.code !== undefined && result.code !== 0);
  }

  static returnError(code, message) {
    return { code, error_message: message };
  }

  /**
   * Logs and returns error.
   * 
   * @param {*} logger logger to log with
   * @param {*} code error code
   * @param {*} message error message
   * @param {*} level level to log with
   */
  static logAndReturnError(logger, code, message, level = 1) {
    if (level === 0) {
      logger.error(message);
    } else if (level === 1) {
      logger.info(message);
    } else {
      logger.debug(message);
    }
    return ChainUtil.returnError(code, message);
  }
}

module.exports = ChainUtil;
