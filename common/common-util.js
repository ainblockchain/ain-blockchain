const fs = require('fs');
const path = require('path');
const stringify = require('fast-json-stable-stringify');
const jsonDiff = require('json-diff');
const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');
const matchUrl = require('match-url-wildcard');
const ip = require('ip');
const {
  FailedTxPrecheckCodeSet,
  FunctionResultCode,
  TxResultCode,
} = require('../common/result-code');
const RuleUtil = require('../db/rule-util');
const ruleUtil = new RuleUtil();

class CommonUtil {
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

  static signTransaction(txBody, privateKey, chainId) {
    const { BlockchainConsts } = require('../common/constants');
    if (!privateKey) {
      return null;
    }
    const keyBuffer = Buffer.from(privateKey, 'hex');
    const sig = ainUtil.ecSignTransaction(txBody, keyBuffer, chainId);
    const sigBuffer = ainUtil.toBuffer(sig);
    const lenHash = sigBuffer.length - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    const txHash = '0x' + hashedData.toString('hex');
    return {
      txHash,
      signedTx: {
        tx_body: txBody,
        signature: sig,
        protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
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
  static getAddressFromSignature(logger, hash, signature, chainId) {
    const LOG_HEADER = 'getAddressFromSignature';
    let address = '';
    try {
      const sigBuffer = ainUtil.toBuffer(signature);
      const len = sigBuffer.length;
      const lenHash = len - 65;
      const {r, s, v} = ainUtil.ecSplitSig(sigBuffer.slice(lenHash, len));
      const publicKey = ainUtil.ecRecoverPub(Buffer.from(hash, 'hex'), r, s, v, chainId);
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

  static isIntegerString(value) {
    return ruleUtil.isIntegerString(value);
  }

  static isFloatString(value) {
    return ruleUtil.isFloatString(value);
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

  static isHexString(value) {
    return ruleUtil.isHexString(value);
  }

  static isValidHash(value) {
    return ruleUtil.isValidHash(value);
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

  static isValidatorOffenseType(type) {
    return ruleUtil.isValidatorOffenseType(type);
  }

  static isValidUrl(url) {
    return ruleUtil.isValidUrl(url);
  }

  static isValidPrivateUrl(url) {
    return ruleUtil.isValidPrivateUrl(url);
  }

  static isValidIpV4(ipAddress) {
    return ruleUtil.isValidIpV4(ipAddress);
  }

  static isValidIpV6(ipAddress) {
    return ruleUtil.isValidIpV6(ipAddress);
  }

  static isWildcard(value) {
    return value === '*';
  }

  static boolOrFalse(value) {
    return ruleUtil.boolOrFalse(value);
  }

  static numberOrZero(num) {
    return ruleUtil.numberOrZero(num);
  }

  static stringOrEmpty(str) {
    return ruleUtil.stringOrEmpty(str);
  }

  static toBool(value) {
    return ruleUtil.toBool(value);
  }

  static toNumberOrNaN(value) {
    return ruleUtil.toNumberOrNaN(value);
  }

  static toString(value) {
    if (CommonUtil.isBool(value)) {
      return value.toString();
    } else if (CommonUtil.isNumber(value)) {
      return value.toString();
    } else if (CommonUtil.isString(value)) {
      return value;
    } else if (value === undefined) {
      return '';
    } else {
      return JSON.stringify(value);
    }
  }

  /**
   * Converts the given string to a hex string (with lower case).
   */
  static toHexString(str, withPrefix = false) {
    if (this.isHexString(str)) {
      if (withPrefix) {
        return str.toLowerCase();
      }
      return str.slice(2).toLowerCase();
    }
    const hexStr = this.isString(str) ? Buffer.from(str).toString('hex') : '';
    if (!withPrefix) {
      return hexStr;
    }
    return '0x' + hexStr;
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

  // NOTE(liayoo): billing is in the form <app name>|<billing id>
  static toBillingAccountName(billing) {
    const { PredefinedDbPaths } = require('../common/constants');
    return `${PredefinedDbPaths.GAS_FEE_BILLING}|${billing}`;
  }

  static toEscrowAccountName(source, target, escrowKey) {
    return ruleUtil.toEscrowAccountName(source, target, escrowKey);
  }

  static toGetOptions(args, fromApi = false) {
    const options = {};
    if (args.is_global !== undefined) {
      options.isGlobal = CommonUtil.toBool(args.is_global);
    }
    if (args.is_final !== undefined) {
      options.isFinal = CommonUtil.toBool(args.is_final);
    }
    if (args.is_shallow !== undefined) {
      options.isShallow = CommonUtil.toBool(args.is_shallow);
    } else {
      options.isShallow = false;
    }
    if (args.is_partial !== undefined) {
      options.isPartial = CommonUtil.toBool(args.is_partial);
      options.lastEndLabel = args.last_end_label !== undefined ?
          CommonUtil.toString(args.last_end_label) : null;
    } else {
      options.isPartial = false;
    }
    if (args.include_version !== undefined) {
      options.includeVersion = CommonUtil.toBool(args.include_version);
    }
    if (args.include_tree_info !== undefined) {
      options.includeTreeInfo = CommonUtil.toBool(args.include_tree_info);
    }
    if (args.include_proof !== undefined) {
      options.includeProof = CommonUtil.toBool(args.include_proof);
    }
    if (fromApi) {
      options.fromApi = true;
    }
    return options;
  }

  static toMatchOrEvalOptions(args, fromApi = false) {
    const options = {};
    // NOTE: Not allowed true values of isShallow or isPartial options in match/eval requests.
    options.isShallow = false;
    options.isPartial = false;
    if (args.is_global !== undefined) {
      options.isGlobal = CommonUtil.toBool(args.is_global);
    }
    if (args.is_merge !== undefined) {
      options.isMerge = CommonUtil.toBool(args.is_merge);
    }
    if (args.timestamp !== undefined) {
      options.timestamp = CommonUtil.numberOrZero(args.timestamp);
    }
    if (args.block_number !== undefined) {
      options.blockNumber = CommonUtil.numberOrZero(args.block_number);
    }
    if (args.block_time !== undefined) {
      options.blockTime = CommonUtil.numberOrZero(args.block_time);
    }
    if (fromApi) {
      options.fromApi = true;
    }
    return options;
  }

  static toSetOptions(args) {
    const options = {};
    if (args.is_global !== undefined) {
      options.isGlobal = CommonUtil.toBool(args.is_global);
    }
    if (args.timestamp !== undefined) {
      options.timestamp = CommonUtil.numberOrZero(args.timestamp);
    }
    return options;
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
    return CommonUtil.parseJsonOrNull(str) !== null;
  }

  static parsePath(path) {
    if (!path) {
      return [];
    }
    if (!CommonUtil.isString(path)) {
      return [];
    }
    return path.split('/').filter((node) => {
      return !!node;
    });
  }

  static formatPath(parsedPath) {
    if (!CommonUtil.isArray(parsedPath) || parsedPath.length === 0) {
      return '/';
    }
    let formatted = '';
    for (const label of parsedPath) {
      if (CommonUtil.isString(label)) {
        formatted += '/' + label;
      } else {
        formatted += '/' + stringify(label);
      }
    }
    return (formatted.startsWith('/') ? '' : '/') + formatted;
  }

  static appendPath(path, ...pathsToAppend) {
    const labels = CommonUtil.parsePath(path);
    for (const toAppend of pathsToAppend) {
      labels.push(...CommonUtil.parsePath(toAppend));
    }
    return CommonUtil.formatPath(labels);
  }

  static getBalancePath(addrOrServAcnt) {
    return ruleUtil.getBalancePath(addrOrServAcnt);
  }

  static isPrefixedLabel(label, prefix) {
    return _.startsWith(label, prefix);
  }

  static isVariableLabel(label) {
    const { StateLabelProperties } = require('../common/constants');
    return CommonUtil.isPrefixedLabel(label, StateLabelProperties.VARIABLE_LABEL_PREFIX)
  }

  static getJsObject(obj, path) {
    if (!CommonUtil.isArray(path)) {
      return null;
    }
    let ref = obj;
    for (let i = 0; i < path.length; i++) {
      const key = CommonUtil.toString(path[i]);
      if (!CommonUtil.isDict(ref)) {
        return null;
      }
      ref = ref[key];
    }
    return ref === undefined ? null : ref;
  }

  /**
   * Sets a value to the given path of an object. If the given path is empty, it tries to copy
   * the first-level properties of the value to the object.
   *
   * @param {object} obj target object
   * @param {array} path target path
   * @param {*} value value to set
   * @returns true if any changes are done, otherwise false
   */
  static setJsObject(obj, path, value) {
    if (!CommonUtil.isArray(path)) {
      return false;
    }
    if (!CommonUtil.isDict(obj)) {
      return false;
    }
    if (path.length === 0) {
      if (!CommonUtil.isDict(value)) {
        return false;
      }
      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          obj[key] = value[key];
        }
      }
      return true;
    }
    let ref = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = CommonUtil.toString(path[i]);
      if (!CommonUtil.isDict(ref[key])) {
        ref[key] = {};
      }
      ref = ref[key];
    }
    const key = CommonUtil.toString(path[path.length - 1]);
    ref[key] = value;
    return true;
  }

  static mergeNumericJsObjects(obj1, obj2) {
    return _.mergeWith(obj1, obj2, (a, b) => {
      if (!CommonUtil.isDict(a) && !CommonUtil.isDict(b)) {
        return CommonUtil.numberOrZero(a) + CommonUtil.numberOrZero(b);
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
   * Returns true if the given result is one of the pre-check failure codes.
   * Includes codes from precheckTxBillingParams(), precheckBalanceAndStakes(),
   * precheckTransaction(), and executeTransaction() but does not include any codes returned
   * after executeOperation().
   */
  static txPrecheckFailed(result) {
    return FailedTxPrecheckCodeSet.has(result.code);
  }

  /**
   * Returns true if the given result is from failed transaction or transaction list.
   */
  static isFailedTx(result) {
    if (!result) {
      return true;
    }
    if (CommonUtil.isDict(result.result_list)) {
      for (const subResult of Object.values(result.result_list)) {
        if (CommonUtil.isFailedTxResultCode(subResult.code)) {
          return true;
        }
        if (subResult.func_results) {
          if (CommonUtil.isFailedFuncTrigger(subResult.func_results)) {
            return true;
          }
        }
        if (subResult.subtree_func_results) {
          if (CommonUtil.isFailedSubtreeFuncTrigger(subResult.subtree_func_results)) {
            return true;
          }
        }
      }
      return false;
    }
    if (CommonUtil.isFailedTxResultCode(result.code)) {
      return true;
    }
    if (result.func_results) {
      if (CommonUtil.isFailedFuncTrigger(result.func_results)) {
        return true;
      }
    }
    if (result.subtree_func_results) {
      if (CommonUtil.isFailedSubtreeFuncTrigger(result.subtree_func_results)) {
        return true;
      }
    }
    return false;
  }

  static isFailedTxResultCode(code) {
    return code !== TxResultCode.SUCCESS;
  }

  /**
   * Returns true if the given result is from a failed function trigger.
   */
  static isFailedFuncTrigger(result) {
    if (CommonUtil.isDict(result)) {
      for (const fid in result) {
        const funcResult = result[fid];
        if (CommonUtil.isFailedFuncResultCode(funcResult.code)) {
          return true;
        }
        if (!CommonUtil.isEmpty(funcResult.op_results)) {
          for (const opResult of Object.values(funcResult.op_results)) {
            if (CommonUtil.isFailedTx(opResult.result)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Returns true if the given result is from a failed subtree function trigger.
   */
  static isFailedSubtreeFuncTrigger(result) {
    if (CommonUtil.isDict(result)) {
      for (const functionPath in result) {
        const funcPathResult = result[functionPath];
        for (const valuePath in funcPathResult) {
          const valuePathResult = funcPathResult[valuePath];
          const funcResult = valuePathResult.func_results;
          if (CommonUtil.isFailedFuncTrigger(funcResult)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // TODO(platfowner): Consider some code (e.g. IN_LOCKUP_PERIOD, INSUFFICIENT_BALANCE) no failure
  // so that their transactions are not reverted.
  static isFailedFuncResultCode(code) {
    return code !== FunctionResultCode.SUCCESS;
  }

  static isAppPath(parsedPath) {
    const { PredefinedDbPaths } = require('../common/constants');

    return _.get(parsedPath, 0) === PredefinedDbPaths.APPS;
  }

  static hasServiceOp(op) {
    if (op.op_list) {
      for (const innerOp of op.op_list) {
        if (!CommonUtil.isAppPath(CommonUtil.parsePath(innerOp.ref))) {
          return true;
        }
      }
      return false;
    }
    return !CommonUtil.isAppPath(CommonUtil.parsePath(op.ref));
  }

  static getAppNameFromRef(ref, shardingPath, isGlobal) {
    const DB = require('../db');
    const parsedPath = CommonUtil.parsePath(ref);
    const localPath = isGlobal === true ? DB.toLocalPath(parsedPath, shardingPath) : parsedPath;
    if (CommonUtil.isAppPath(localPath)) {
      return _.get(localPath, 1, null);
    }
    return null;
  }

  static getAppNameList(op, shardingPath) {
    if (!op) {
      return [];
    }
    if (op.op_list) {
      const appNames = new Set();
      for (const innerOp of op.op_list) {
        const name = CommonUtil.getAppNameFromRef(innerOp.ref, shardingPath, innerOp.is_global);
        if (name) {
          appNames.add(name);
        }
      }
      return [...appNames];
    }
    const name = CommonUtil.getAppNameFromRef(op.ref, shardingPath, op.is_global);
    return name ? [name] : [];
  }

  static getDependentAppNameFromRef(ref) {
    const { isAppDependentServiceType } = require('../common/constants');
    const parsedPath = CommonUtil.parsePath(ref);
    const type = _.get(parsedPath, 0);
    if (!type || !isAppDependentServiceType(type)) {
      return null;
    }
    return _.get(parsedPath, 1, null);
  }

  static getServiceDependentAppNameList(op) {
    if (!op) {
      return [];
    }
    if (op.op_list) {
      const appNames = new Set();
      for (const innerOp of op.op_list) {
        const name = CommonUtil.getDependentAppNameFromRef(innerOp.ref);
        if (name) {
          appNames.add(name);
        }
      }
      return [...appNames];
    }
    const name = CommonUtil.getDependentAppNameFromRef(op.ref);
    return name ? [name] : [];
  }

  static getSingleOpBandwidthGasAmount(parsedPath, value) {
    const gasAmount = { service: 0 };
    if (!value) {
      return gasAmount;
    }
    if (CommonUtil.isAppPath(parsedPath)) {
      const appName = _.get(parsedPath, 1);
      if (!appName) return;
      CommonUtil.setJsObject(gasAmount, ['app', appName], value);
    } else {
      CommonUtil.setJsObject(gasAmount, ['service'], value);
    }
    return gasAmount;
  }

  static getFuncResultsBandwidthGasAmount(triggeringPath, resultObj) {
    const gasAmount = { service: 0 };

    for (const funcRes of Object.values(resultObj)) {
      if (!CommonUtil.isEmpty(funcRes.op_results)) {
        for (const opRes of Object.values(funcRes.op_results)) {
          CommonUtil.mergeNumericJsObjects(
            gasAmount,
            CommonUtil.getTotalBandwidthGasAmountInternal(CommonUtil.parsePath(opRes.path), opRes.result)
          );
        }
      }
      // Follow the tx type of the triggering tx.
      CommonUtil.mergeNumericJsObjects(
        gasAmount,
        CommonUtil.getSingleOpBandwidthGasAmount(triggeringPath, funcRes.bandwidth_gas_amount)
      );
    }

    return gasAmount;
  }

  static getSubtreeFuncResultsBandwidthGasAmount(triggeringPath, resultObj) {
    const gasAmount = { service: 0 };

    if (CommonUtil.isDict(resultObj)) {
      for (const functionPath in resultObj) {
        const funcPathResult = resultObj[functionPath];
        for (const valuePath in funcPathResult) {
          const valuePathResult = funcPathResult[valuePath];
          const funcResult = valuePathResult.func_results;
          CommonUtil.mergeNumericJsObjects(
            gasAmount,
            CommonUtil.getFuncResultsBandwidthGasAmount(
                [...triggeringPath, ...CommonUtil.parsePath(valuePath)], funcResult)
          );
        }
      }
    }

    return gasAmount;
  }

  static getTotalBandwidthGasAmountInternal(triggeringPath, resultObj) {
    const gasAmount = { service: 0 };

    if (!resultObj) return gasAmount;
    if (resultObj.result_list) return gasAmount; // NOTE: Assume nested SET is not allowed

    if (resultObj.func_results) {
      CommonUtil.mergeNumericJsObjects(
        gasAmount,
        CommonUtil.getFuncResultsBandwidthGasAmount(triggeringPath, resultObj.func_results)
      );
    }

    if (resultObj.subtree_func_results) {
      CommonUtil.mergeNumericJsObjects(
        gasAmount,
        CommonUtil.getSubtreeFuncResultsBandwidthGasAmount(
            triggeringPath, resultObj.subtree_func_results)
      );
    }

    if (resultObj.bandwidth_gas_amount) {
      CommonUtil.mergeNumericJsObjects(
        gasAmount,
        CommonUtil.getSingleOpBandwidthGasAmount(triggeringPath, resultObj.bandwidth_gas_amount)
      );
    }

    return gasAmount;
  }

  /**
   * Returns the total gas amount of the result, separated by the types of operations (service / app)
   * (esp. multi-operation result).
   */
  static getTotalBandwidthGasAmount(op, result) {
    const gasAmount = { service: 0 };

    if (!op || !result) return gasAmount;
    if (result.result_list) {
      for (const [index, res] of Object.entries(result.result_list)) {
        CommonUtil.mergeNumericJsObjects(
          gasAmount,
          CommonUtil.getTotalBandwidthGasAmountInternal(CommonUtil.parsePath(op.op_list[index].ref), res)
        );
      }
    } else {
      const triggeringPath = CommonUtil.parsePath(op.ref);
      CommonUtil.mergeNumericJsObjects(
        gasAmount,
        CommonUtil.getTotalBandwidthGasAmountInternal(triggeringPath, result)
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
  static getTotalGasCost(gasPrice, gasAmount, gasPriceUnit) {
    if (!CommonUtil.isNumber(gasPrice)) {
      gasPrice = 0; // Default gas price = 0 microain
    }
    if (!CommonUtil.isNumber(gasAmount)) {
      gasAmount = 0; // Default gas amount = 0
    }
    return gasPrice * gasPriceUnit * gasAmount;
  }

  static getServiceGasCostTotalFromTxList(txList, resList, gasPriceUnit) {
    return resList.reduce((acc, cur, index) => {
      const tx = txList[index];
      return CommonUtil.mergeNumericJsObjects(acc, {
        gasAmountTotal: cur.gas_amount_charged,
        gasCostTotal: CommonUtil.getTotalGasCost(tx.tx_body.gas_price, cur.gas_amount_charged, gasPriceUnit)
      });
    }, { gasAmountTotal: 0, gasCostTotal: 0 });
  }

  static deleteSubtreeFuncResFuncPromises(res) {
    const deleted = JSON.parse(JSON.stringify(res));
    for (const subtreeFuncPath in res) {
      const subtreeFuncPathRes = res[subtreeFuncPath];
      for (const subtreeValuePath in subtreeFuncPathRes) {
        _.unset(deleted, `${subtreeFuncPath}.${subtreeValuePath}.func_promises`);
      }
    }
    return deleted;
  }

  static returnTxResult(
      code, message = null, bandwidthGasAmount = 0, funcResults = null, subtreeFuncResults = null) {
    const result = {};
    if (message) {
      result.message = message;
    }
    if (!CommonUtil.isEmpty(funcResults)) {
      result.func_results = funcResults;
    }
    if (!CommonUtil.isEmpty(subtreeFuncResults)) {
      result.subtree_func_results =
          CommonUtil.deleteSubtreeFuncResFuncPromises(subtreeFuncResults);
    }
    result.code = code;
    result.bandwidth_gas_amount = bandwidthGasAmount;
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
    return CommonUtil.returnTxResult(code, message);
  }

  /**
   * Logs an error message with stack trace.
   *
   * @param logger logger to log with
   * @param message message to log
   */
  static logErrorWithStackTrace(logger, message) {
    logger.error(message + `\n${new Error().stack}.`);
  }

  /**
   * Finishes logging after stack trace logging.
   *
   * @param logger logger to log with
   * @param message message to log
   */
  static finishWithStackTrace(logger, message) {
    CommonUtil.logErrorWithStackTrace(logger, message);
    logger.finish();
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
    if (!CommonUtil.isDict(obj)) {
      if (CommonUtil.isNumber(obj)) {
        return {
          [CommonUtil.keyStackToMetricName(keyStack)]: obj
        };
      } else if (CommonUtil.isBool(obj)) {
        return {
          [CommonUtil.keyStackToMetricName(keyStack)]: obj ? 1 : 0  // Convert to a numeric value
        };
      }
      return {};  // Skip non-numeric / non-boolean values.
    }
    const metrics = {};
    for (const key in obj) {
      const subObj = obj[key];
      const subMetrics = CommonUtil.objToMetricsRecursive(subObj, [...keyStack, _.snakeCase(key)]);
      Object.assign(metrics, subMetrics);
    }
    return metrics;
  }

  /**
   * Converts given object to Prometheus metrics. * e.g. { aa: { bb: 10 }, cc: "x" } to
   * 'aa:bb 10\ncc x'. Note that array structures or non-numeric values are skipped.
   */
  static objToMetrics(obj) {
    if (!CommonUtil.isDict(obj)) {
      return '';
    }
    const keyStack = [];
    const metrics = CommonUtil.objToMetricsRecursive(obj, keyStack);
    return CommonUtil.metricsToText(metrics);
  }

  static sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  };

  static convertEnvVarInputToBool(input, defaultValue = false) {
    return input ? input.toLowerCase().startsWith('t') : defaultValue;
  }

  static convertListToObj(list) {
    const obj = {};
    if (!CommonUtil.isArray(list)) return null;
    const copyOfList = JSON.parse(JSON.stringify(list));
    copyOfList.forEach((item, index) => {
      obj[index] = item;
    });
    return obj;
  }

  static getDayTimestamp(timestamp) {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  static txResultsToReceipts(resList) {
    const DB = require('../db');
    if (!CommonUtil.isArray(resList)) return [];
    return resList.map((res) => DB.trimExecutionResult(res));
  }

  static getCorsWhitelist(input) {
    if (!input) {
      return null;
    }
    const inputList = input.split(',').filter((str) => !!str);
    if (inputList.includes('*')) {
      return '*';
    }
    return [...new Set([...inputList])];
  }

  static getJsonDiff(base, target) {
    if (!CommonUtil.isDict(base) || !CommonUtil.isDict(target)) {
      return '';
    }
    return jsonDiff.diffString(base, target, { color: "" });
  }

  static getRegexpList(strList) {
    const regexpList = [];
    for (const str of strList) {
      regexpList.push(new RegExp(str));
    }
    return regexpList;
  }

  static getWhitelistFromString(value) {
    return CommonUtil.isWildcard(value) ? value : value.split(',');
  }

  static isWhitelistedUrl(url, whitelist) {
    if (CommonUtil.isWildcard(whitelist)) return true;
    if (!CommonUtil.isArray(whitelist)) return false;
    return matchUrl(url, whitelist);
  }

  static isWhitelistedIp(ipAddr, whitelist) {
    if (CommonUtil.isWildcard(whitelist)) return true;
    if (!CommonUtil.isArray(whitelist)) return false;
    if (!CommonUtil.isValidIpV4(ipAddr) && !CommonUtil.isValidIpV6(ipAddr)) {
      return false;
    }
    for (const listItem of whitelist) {
      try {
        if (ip.isEqual(ipAddr, listItem)) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  static countMaxOccurrences(list) {
    if (!CommonUtil.isArray(list)) {
      return 0;
    }
    let maxOccurrences = 0;
    const counts = {};
    for (const item of list) {
      counts[item] = (counts[item] || 0) + 1;
      if (maxOccurrences < counts[item]) {
        maxOccurrences = counts[item];
      }
    }
    return maxOccurrences;
  }

  static timestampExceedsThreshold(timestamp, threshold) {
    if (!timestamp) return true;
    return Date.now() - timestamp > threshold;
  }

  static hasTimerFlagEnabled(timerFlags, flagName, blockNumber) {
    const flag = timerFlags[flagName];
    if (!CommonUtil.isDict(flag)) {
      return false;
    }
    if (!CommonUtil.isNumber(blockNumber)) {
      return false;
    }
    const enabledBlockNumber = CommonUtil.getEnabledBlockNumberFromTimerFlag(flag);
    if (!CommonUtil.isNumber(enabledBlockNumber) || blockNumber < enabledBlockNumber) {
      return false;
    }
    const disabledBlockNumber = CommonUtil.getDisabledBlockNumberFromTimerFlag(flag);
    if (!CommonUtil.isNumber(disabledBlockNumber) || blockNumber < disabledBlockNumber) {
      return true;
    }
    return false;
  }

  static getEnabledBlockNumberFromTimerFlag(timerFlag) {
    const enabledBlockNumber = timerFlag['enabled_block'];
    if (!CommonUtil.isNumber(enabledBlockNumber)) {
      return null;
    }
    const earlyAppliedBlockNumber = process.env.TIMER_FLAG_EARLY_APPLIED_BLOCK_NUMBER ? Number(process.env.TIMER_FLAG_EARLY_APPLIED_BLOCK_NUMBER) : null;
    if (CommonUtil.isNumber(earlyAppliedBlockNumber) && enabledBlockNumber <= earlyAppliedBlockNumber) {
      return 2;
    }
    return enabledBlockNumber;
  }

  static getDisabledBlockNumberFromTimerFlag(timerFlag) {
    const disabledBlockNumber = timerFlag['disabled_block'];
    if (!CommonUtil.isNumber(disabledBlockNumber)) {
      return null;
    }
    const earlyAppliedBlockNumber = process.env.TIMER_FLAG_EARLY_APPLIED_BLOCK_NUMBER ? Number(process.env.TIMER_FLAG_EARLY_APPLIED_BLOCK_NUMBER) : null;
    if (CommonUtil.isNumber(earlyAppliedBlockNumber) && disabledBlockNumber <= earlyAppliedBlockNumber) {
      return 2;
    }
    return disabledBlockNumber;
  }

  static getTimerFlagEnabledBlockNumber(timerFlags, flagName) {
    const flag = timerFlags[flagName];
    if (!CommonUtil.isDict(flag)) {
      return null;
    }
    return CommonUtil.getEnabledBlockNumberFromTimerFlag(flag);
  }

  static getTimerFlagDisabledBlockNumber(timerFlags, flagName) {
    const flag = timerFlags[flagName];
    if (!CommonUtil.isDict(flag)) {
      return null;
    }
    return CommonUtil.getDisabledBlockNumberFromTimerFlag(flag);
  }

  // NOTE(platfowner): Bandage files are applied on 'enabled_block' number but not reverted on
  // 'disabled_block' number.
  static createTimerFlagEnabledBandageMap(timerFlags) {
    const LOG_HEADER = 'createTimerFlagEnabledBandageMap';
    const map = new Map();
    console.log(`[${LOG_HEADER}] Registering bandage files:`);
    const flagNameList = Object.keys(timerFlags);
    for (let i = 0; i < flagNameList.length; i++) {
      const flagName = flagNameList[i];
      const flag = timerFlags[flagName];
      const enabledBlockNumber = CommonUtil.getEnabledBlockNumberFromTimerFlag(flag);
      if (CommonUtil.isNumber(enabledBlockNumber) && flag['has_bandage'] === true) {
        const bandageFilePath = path.resolve(__dirname, '../db/bandage-files', `${flagName}.js`);
        console.log(`[${LOG_HEADER}] [${i}] Registering ${bandageFilePath}`);
        if (!fs.existsSync(bandageFilePath)) {
          throw Error(`Missing bandage file: ${bandageFilePath}`);
        }
        if (!map.has(enabledBlockNumber)) {
          map.set(enabledBlockNumber, []);
        }
        map.get(enabledBlockNumber).push(flagName);
      } else {
        console.log(`[${LOG_HEADER}] [${i}] Skipping for timer flag: ${flagName}`);
      }
    }
    return map;
  }
}

module.exports = CommonUtil;
