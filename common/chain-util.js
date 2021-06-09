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
    if (!privateKey) {
      return null;
    }
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
          `[${LOG_HEADER}] Failed to extract address with error: ${err} ${err.stack}.`);
    }
    return address;
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
    if (!ChainUtil.isArray(parsedPath) || parsedPath.length === 0) {
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
    if (ChainUtil.isArray(result.result_list)) {
      for (const subResult of result.result_list) {
        if (ChainUtil.isFailedTxResultCode(subResult.code)) {
          return true;
        }
        if (subResult.func_results) {
          if (ChainUtil.isFailedFuncTrigger(subResult.func_results)) {
            return true;
          }
        }
      }
      return false;
    }
    if (ChainUtil.isFailedTxResultCode(result.code)) {
      return true;
    }
    if (result.func_results) {
      if (ChainUtil.isFailedFuncTrigger(result.func_results)) {
        return true;
      }
    }
    return false;
  }

  static isFailedTxResultCode(code) {
    return code !== 0;
  }

  /**
   * Returns true if the given result is from a failed function trigger.
   */
  static isFailedFuncTrigger(result) {
    if (ChainUtil.isDict(result)) {
      for (const fid in result) {
        const funcResult = result[fid];
        if (ChainUtil.isFailedFuncResultCode(funcResult.code)) {
          return true;
        }
        if (ChainUtil.isArray(funcResult.op_results)) {
          for (const opResult of funcResult.op_results) {
            if (ChainUtil.isFailedTx(opResult.result)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  // TODO(platfowner): Consider some code (e.g. IN_LOCKUP_PERIOD, INSUFFICIENT_BALANCE) no failure 
  // so that their transactions are not reverted.
  static isFailedFuncResultCode(code) {
    const { FunctionResultCode } = require('../common/constants');

    return code !== FunctionResultCode.SUCCESS;
  }

  static isAppPath(parsedPath) {
    const { PredefinedDbPaths } = require('../common/constants');

    return _.get(parsedPath, 0) === PredefinedDbPaths.APPS;
  }

  // TODO(liayoo): Fix testing paths (writing at the root) and update isServicePath().
  static isServicePath(parsedPath) {
    const { isServiceType } = require('../common/constants');

    return isServiceType(_.get(parsedPath, 0));
  }

  static getSingleOpGasAmount(parsedPath, value) {
    const gasAmount = {
      service: 0,
      app: {}
    };
    if (!value) {
      return gasAmount;
    }
    if (ChainUtil.isServicePath(parsedPath)) {
      ChainUtil.setJsObject(gasAmount, ['service'], value);
    } else if (ChainUtil.isAppPath(parsedPath)) {
      const appName = _.get(parsedPath, 1);
      if (!appName) return;
      ChainUtil.setJsObject(gasAmount, ['app', appName], value);
    }
    return gasAmount;
  }

  static getTotalGasAmountInternal(triggeringPath, resultObj) {
    const gasAmount = {
      service: 0,
      app: {}
    };
    if (!resultObj) return gasAmount;
    if (resultObj.result_list) return gasAmount; // NOTE: Assume nested SET is not allowed

    if (resultObj.func_results) {
      for (const funcRes of Object.values(resultObj.func_results)) {
        if (ChainUtil.isArray(funcRes.op_results)) {
          for (const opRes of funcRes.op_results) {
            ChainUtil.mergeNumericJsObjects(
              gasAmount,
              ChainUtil.getTotalGasAmountInternal(ChainUtil.parsePath(opRes.path), opRes.result)
            );
          }
        }
        // Follow the tx type of the triggering tx.
        ChainUtil.mergeNumericJsObjects(gasAmount, ChainUtil.getSingleOpGasAmount(triggeringPath, funcRes.gas_amount));
      }
    }

    if (resultObj.gas_amount) {
      ChainUtil.mergeNumericJsObjects(
        gasAmount,
        ChainUtil.getSingleOpGasAmount(triggeringPath, resultObj.gas_amount)
      );
    }

    return gasAmount;
  }

  /**
   * Returns the total gas amount of the result, separated by the types of operations (service / app)
   * (esp. multi-operation result).
   */
  static getTotalGasAmount(op, result) {
    const gasAmount = {
      service: 0,
      app: {}
    };
    if (!op || !result) return gasAmount;
    if (result.result_list) {
      for (let i = 0, len = result.result_list.length; i < len; i++) {
        const elem = result.result_list[i];
        ChainUtil.mergeNumericJsObjects(
          gasAmount,
          ChainUtil.getTotalGasAmountInternal(ChainUtil.parsePath(op.op_list[i].ref), elem)
        );
      }
    } else {
      const triggeringPath = ChainUtil.parsePath(op.ref);
      ChainUtil.mergeNumericJsObjects(
        gasAmount,
        ChainUtil.getTotalGasAmountInternal(triggeringPath, result)
      );
    }

    return gasAmount;
  }

  /**
   * Calculate the gas cost (unit = ain).
   * Only the service bandwidth gas amount is counted toward gas cost.
   * 
   * @param {Number} gasPrice gas price in microain
   * @param {Object} gasAmount gas amount
   * @returns 
   */
  static getTotalGasCost(gasPrice, gasAmount) {
    const { MICRO_AIN } = require('./constants');
    if (!ChainUtil.isNumber(gasPrice)) {
      gasPrice = 0; // Default gas price = 0 microain
    }
    if (!ChainUtil.isNumber(gasAmount)) {
      gasAmount = 0; // Default gas amount = 0
    }
    return gasPrice * MICRO_AIN * gasAmount;
  }

  static getServiceGasCostTotalFromTxList(txList, resList) {
    return resList.reduce((acc, cur, index) => {
      const tx = txList[index];
      const totalGasAmount = ChainUtil.getTotalGasAmount(tx.tx_body.operation, cur);
      return ChainUtil.mergeNumericJsObjects(acc, {
        gasAmountTotal: totalGasAmount.service,
        gasCostTotal: ChainUtil.getTotalGasCost(tx.tx_body.gas_price, totalGasAmount.service)
      });
    }, { gasAmountTotal: 0, gasCostTotal: 0 });
  }

  static returnTxResult(code, message = null, gasAmount = 0, funcResults = null) {
    const result = {};
    if (message) {
      result.error_message = message;
    }
    if (!ChainUtil.isEmpty(funcResults)) {
      result.func_results = funcResults;
    }
    result.code = code;
    result.gas_amount = gasAmount;
    return result;
  }

  /**
   * Logs and returns transaction result.
   * 
   * @param logger logger to log with
   * @param code error code
   * @param message error message
   * @param level level to log with
   */
  static logAndReturnTxResult(logger, code, message = null, level = 1) {
    if (level === 0) {
      logger.error(message);
    } else if (level === 1) {
      logger.info(message);
    } else {
      logger.debug(message);
    }
    return ChainUtil.returnTxResult(code, message);
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

  static convertEnvVarInputToBool = (input, defaultValue = false) => {
    return input ? input.toLowerCase().startsWith('t') : defaultValue;
  }
}

module.exports = ChainUtil;
