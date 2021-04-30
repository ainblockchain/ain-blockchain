const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const stringify = require('fast-json-stable-stringify');
const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;
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

  static hashTxBody(txBody) {
    return '0x' + ainUtil.hashTransaction(txBody).toString('hex');
  }

  static signTransaction(txBody, privateKey) {
    const keyBuffer = Buffer.from(privateKey, 'hex');
    const sig = ainUtil.ecSignTransaction(txBody, keyBuffer);
    const sigBuffer = ainUtil.toBuffer(sig);
    const lenHash = sigBuffer.length - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    const txHash = '0x' + hashedData.toString('hex');
    return {
      txHash,
      signedTx: {
        tx_body: txBody,
        signature: sig,
        protoVer: CURRENT_PROTOCOL_VERSION,
      }
    };
  }

  static hashSignature(sig) {
    const sigBuffer = ainUtil.toBuffer(sig);
    const lenHash = sigBuffer.length - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    return '0x' + hashedData.toString('hex');
  }

  /**
   * Gets address from hash and signature.
   */
  static getAddressFromSignature(hash, signature) {
    const logger = require('../logger')('CHAIN_UTIL');
    const LOG_HEADER = 'getAddressFromSignature';
    let address = '';
    try {
      const sigBuffer = ainUtil.toBuffer(signature);
      const len = sigBuffer.length;
      const lenHash = len - 65;
      const {r, s, v} = ainUtil.ecSplitSig(sigBuffer.slice(lenHash, len));
      const publicKey = ainUtil.ecRecoverPub(Buffer.from(hash, 'hex'), r, s, v);
      address = ainUtil.toChecksumAddress(ainUtil.bufferToHex(
          ainUtil.pubToAddress(publicKey, publicKey.length === 65)));
    } catch (err) {
      logger.error(
          `[${LOG_HEADER}] Failed to extract address with error: ${JSON.stringify(err)}.`);
    }
    return address;
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

  static isNumber(value) {
    return ruleUtil.isNumber(value);
  }

  static isInteger(value) {
    return ruleUtil.isInteger(value);
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

  static includes(arr, value) {
    return ruleUtil.includes(arr, value);
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

  static areSameAddrs(addr1, addr2) {
    return ruleUtil.areSameAddrs(addr1, addr2);
  }

  static parseServAcntName(accountName) {
    return ruleUtil.parseServAcntName(accountName);
  }

  static toServiceAccountName(serviceType, serviceName, key) {
    return ruleUtil.toServiceAccountName(serviceType, serviceName, key);
  }

  static toEscrowAccountName(source, target, escrowKey) {
    return ruleUtil.toEscrowAccountName(source, target, escrowKey);
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

  static mergeNumericJsObjects(obj1, obj2) {
    return _.mergeWith(obj1, obj2, (a, b) => {
      if (!ChainUtil.isDict(a) && !ChainUtil.isDict(b)) {
        return ChainUtil.numberOrZero(a) + ChainUtil.numberOrZero(b);
      }
    });
  }

  static simplifyProperties(obj) {
    const newObj = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = true;
    }
    return newObj;
  }

  /**
   * Returns true if the given result is from failed transaction or transaction list.
   */
  static isFailedTx(result) {
    if (!result) {
      return true;
    }
    if (Array.isArray(result)) {
      for (const elem of result) {
        if (ChainUtil.isFailedTxResultCode(elem.code)) {
          return true;
        }
      }
      return false;
    }
    return ChainUtil.isFailedTxResultCode(result.code);
  }

  static isFailedTxResultCode(code) {
    return code !== 0;
  }

  static isAppPath(parsedPath) {
    const { PredefinedDbPaths } = require('../common/constants');
    return _.get(parsedPath, 0) === PredefinedDbPaths.APPS;
  }

  // TODO(lia): fix testing paths (writing at the root) and update isServicePath().
  static isServicePath(parsedPath) {
    const { NATIVE_SERVICE_TYPES } = require('../common/constants');
    return NATIVE_SERVICE_TYPES.includes(_.get(parsedPath, 0));
  }

  static getGasAmountObj(path, value) {
    const parsedPath = ChainUtil.parsePath(path);
    const gasAmount = {};
    if (ChainUtil.isServicePath(parsedPath)) {
      ChainUtil.setJsObject(gasAmount, ['service'], value);
    } else if (ChainUtil.isAppPath(parsedPath)) {
      const appName = _.get(parsedPath, 1);
      if (!appName) return;
      ChainUtil.setJsObject(gasAmount, ['app', appName], value);
    }
    return gasAmount;
  }

  static getSingleOpServiceGasAmount(result) {
    if (!result) {
      return 0;
    }
    return _.get(result, 'gas.gas_amount.service', 0);
  }

  /**
   * Returns the total gas amount of the result (esp. multi-operation result).
   */
  static getTotalGasAmount(result) {
    if (Array.isArray(result)) {
      let gasAmount = 0;
      for (const elem of result) {
        gasAmount += ChainUtil.getSingleOpServiceGasAmount(elem);
      }
      return gasAmount;
    }
    return ChainUtil.getSingleOpServiceGasAmount(result);
  }
  /**
   * Calculate the gas cost (unit = ain).
   * Only the service bandwidth gas amount is counted toward gas cost.
   * 
   * @param {Number} gasPrice gas price in microain
   * @param {Object} result transaction execution result
   * @returns 
   */
  static getTotalGasCost(gasPrice, result) {
    const { MICRO_AIN } = require('./constants');
    if (gasPrice === undefined) gasPrice = 0; // Default gas price = 0 microain
    const gasPriceAIN = gasPrice * MICRO_AIN;
    if (Array.isArray(result)) {
      let gasCostTotal = 0;
      for (const elem of result) {
        const gasCost = ChainUtil.getSingleOpServiceGasAmount(elem) * gasPriceAIN;
        ChainUtil.setJsObject(elem, ['gas', 'gas_cost'], gasCost);
        gasCostTotal += gasCost;
      }
      return gasCostTotal;
    }
    const gasCost = ChainUtil.getSingleOpServiceGasAmount(result) * gasPriceAIN;
    ChainUtil.setJsObject(result, ['gas', 'gas_cost'], gasCost);
    return gasCost;
  }

  static getServiceGasCostTotalFromTxList(txList, resList) {
    const gasAmountTotal = resList.reduce((acc, cur) => acc + ChainUtil.getTotalGasAmount(cur), 0);
    const gasCostTotal = resList.reduce((acc, cur, index) => {
      return acc + ChainUtil.getTotalGasCost(txList[index].tx_body.gas_price, cur);
    }, 0);
    return { gasAmountTotal, gasCostTotal };
  }

  static returnTxResult(code, message = null, gas = null, funcResults = null) {
    const { ExecResultProperties } = require('../common/constants');
    const result = { code };
    if (message) {
      result.error_message = message;
    }
    if (!ChainUtil.isEmpty(funcResults)) {
      result[ExecResultProperties.FUNC_RESULTS] = funcResults;
    }
    if (gas) {
      result.gas = gas;
    }
    return result;
  }

  /**
   * Logs and returns transaction result.
   * 
   * @param logger logger to log with
   * @param code error code
   * @param message error message
   * @param level level to log with
   * @param gas gas object
   */
  static logAndReturnTxResult(logger, code, message = null, level = 1, gas = null) {
    if (level === 0) {
      logger.error(message);
    } else if (level === 1) {
      logger.info(message);
    } else {
      logger.debug(message);
    }
    return ChainUtil.returnTxResult(code, message, gas);
  }

  static keyStackToMetricName(keyStack) {
    return _.join(keyStack, ':');
  }

  static metricsToText(metrics) {
    const lines = [];
    for (const key in metrics) {
      const value = metrics[key];
      lines.push(`${key} ${value}`);
    }
    return _.join(lines, '\n');
  }

  static objToMetricsRecursive(obj, keyStack) {
    if (!ChainUtil.isDict(obj)) {
      if (ChainUtil.isNumber(obj)) {
        return {
          [ChainUtil.keyStackToMetricName(keyStack)]: obj
        };
      } else if (ChainUtil.isBool(obj)) {
        return {
          [ChainUtil.keyStackToMetricName(keyStack)]: obj ? 1 : 0  // Convert to a numeric value
        };
      }
      return {};  // Skip non-numeric / non-boolean values.
    }
    const metrics = {};
    for (const key in obj) {
      const subObj = obj[key];
      const subMetrics = ChainUtil.objToMetricsRecursive(subObj, [...keyStack, _.snakeCase(key)]);
      Object.assign(metrics, subMetrics);
    }
    return metrics;
  }

  /**
   * Converts given object to Prometheus metrics. * e.g. { aa: { bb: 10 }, cc: "x" } to
   * 'aa:bb 10\ncc x'. Note that array structures or non-numeric values are skipped.
   */
  static objToMetrics(obj) {
    if (!ChainUtil.isDict(obj)) {
      return '';
    }
    const keyStack = [];
    const metrics = ChainUtil.objToMetricsRecursive(obj, keyStack);
    return ChainUtil.metricsToText(metrics);
  }

  static sleep = (ms) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  };

  static convertEnvVarInputToBool = (input) => {
    return input ? input.toLowerCase().startsWith('t') : false;
  }
}

module.exports = ChainUtil;
