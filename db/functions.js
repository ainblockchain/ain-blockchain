const logger = new (require('../logger'))('FUNCTIONS');

const axios = require('axios');
const _ = require('lodash');
const matchUrl = require('match-url-wildcard');
const Accounts = require('web3-eth-accounts');
const stringify = require('fast-json-stable-stringify');
const {
  DevFlags,
  NodeConfigs,
  PredefinedDbPaths,
  FunctionTypes,
  NativeFunctionIds,
  WriteDbOperations,
  OwnerProperties,
  buildOwnerPermissions,
  buildRulePermission,
  isEnabledTimerFlag,
} = require('../common/constants');
const { FunctionResultCode } = require('../common/result-code');
const CommonUtil = require('../common/common-util');
const PathUtil = require('../common/path-util');

axios.defaults.timeout = NodeConfigs.DEFAULT_AXIOS_REQUEST_TIMEOUT;

/**
 * Built-in functions with function paths.
 */
// NOTE(platfowner): ownerOnly means that the function can be set only by the blockchain owner.
// NOTE(platfowner): extraGasAmount means the extra gas amount required to execute the function,
// which often reflects the external RPC calls needed.
class Functions {
  constructor(db) {
    this.db = db;
    this.nativeFunctionMap = {
      [NativeFunctionIds.CANCEL_CHECKIN]: {
        func: this._cancelCheckin.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.CLAIM]: {
        func: this._claim.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.CLAIM_REWARD]: {
        func: this._claimReward.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.CLOSE_CHECKIN]: {
        func: this._closeCheckin.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.CLOSE_CHECKOUT]: {
        func: this._closeCheckout.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.COLLECT_FEE]: {
        func: this._collectFee.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.CREATE_APP]: {
        func: this._createApp.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.DISTRIBUTE_FEE]: {
        func: this._distributeFee.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.ERASE_VALUE]: {
        func: this._eraseValue.bind(this), ownerOnly: false, extraGasAmount: 0 },
      [NativeFunctionIds.FAIL]: {
        func: this._fail.bind(this), ownerOnly: false, extraGasAmount: 0 },
      [NativeFunctionIds.HANDLE_OFFENSES]: {
        func: this._handleOffenses.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.HOLD]: {
        func: this._hold.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.OPEN_CHECKIN]: {
        func: this._openCheckin.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.OPEN_CHECKOUT]: {
        func: this._openCheckout.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.PAY]: {
        func: this._pay.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.RELEASE]: {
        func: this._release.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.SAVE_LAST_TX]: {
        func: this._saveLastTx.bind(this), ownerOnly: false, extraGasAmount: 0 },
      [NativeFunctionIds.SET_OWNER_CONFIG]: {
        func: this._setOwnerConfig.bind(this), ownerOnly: false, extraGasAmount: 0 },
      [NativeFunctionIds.STAKE]: {
        func: this._stake.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.UNSTAKE]: {
        func: this._unstake.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.TRANSFER]: {
        func: this._transfer.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: {
        func: this._updateLatestShardReport.bind(this), ownerOnly: false, extraGasAmount: 0 },
    };
    this.callStack = [];
  }

  /**
   * Runs functions of function paths matched with given database path.
   *
   * @param {Array} parsedValuePath parsed value path
   * @param {Object} value value set on the database path
   * @param {Object} prevValue previous value at the database path
   * @param {Number} timestamp the time at which the transaction was created and signed
   * @param {Number} executedAt execution time
   * @param {Object} transaction transaction
   */
  // NOTE(platfowner): Validity checks on individual addresses are done by .write rules.
  matchAndTriggerFunctions(
      parsedValuePath, value, prevValue, auth, transaction, blockchainParams, options) {
    const matchedFunction = this.db.matchFunctionForParsedPath(parsedValuePath);
    const triggerRes = this.triggerFunctions(
        matchedFunction.matchedFunction.path, matchedFunction.pathVars, matchedFunction.matchedFunction.config,
        parsedValuePath, value, prevValue, auth, transaction, blockchainParams, options);
    const subtreeFuncRes = {};
    for (const subtreeConfig of matchedFunction.subtreeFunctions) {
      const matchedPrevValues =
          Functions.matchValueWithFunctionPath(prevValue, subtreeConfig.path);
      const matchedValues = Functions.matchValueWithFunctionPath(value, subtreeConfig.path);
      const subtreeFuncPathRes = {};
      // Step 1: (implicit deletion) Trigger functions with matched prev values being deleted.
      for (const pathKey of Object.keys(matchedPrevValues)) {
        if (matchedValues[pathKey] === undefined) {  // For only paths of values being deleted.
          const matchedPrevValue = matchedPrevValues[pathKey];
          const subtreeFuncPath = [...matchedFunction.matchedFunction.path, ...subtreeConfig.path];
          const pathVars = Object.assign({}, matchedFunction.pathVars, matchedPrevValue.pathVars);
          const subtreeValuePath = [...parsedValuePath, ...matchedPrevValue.path];
          const subtreeValue = null;  // Trigger with value = null.
          const substreePrevValue = matchedPrevValue.value;
          const subtreeValuePathRes = this.triggerFunctions(
              subtreeFuncPath, pathVars, subtreeConfig.config,
              subtreeValuePath, subtreeValue, substreePrevValue, auth, transaction,
              blockchainParams, options);
          subtreeFuncPathRes[pathKey] = subtreeValuePathRes;
        }
      }
      // Step 2: Trigger functions with matched values.
      for (const pathKey of Object.keys(matchedValues)) {
        const matchedValue = matchedValues[pathKey];
        const subtreeFuncPath = [...matchedFunction.matchedFunction.path, ...subtreeConfig.path];
        const pathVars = Object.assign({}, matchedFunction.pathVars, matchedValue.pathVars);
        const subtreeValuePath = [...parsedValuePath, ...matchedValue.path];
        const subtreeValue = matchedValue.value;
        // NOTE(platfowner): this.db.getValue() cannot be used
        // as the previous value is already overwritten.
        const substreePrevValue =
            Functions.matchValueWithValuePath(prevValue, matchedValue.path);
        const subtreeValuePathRes = this.triggerFunctions(
            subtreeFuncPath, pathVars, subtreeConfig.config,
            subtreeValuePath, subtreeValue, substreePrevValue, auth, transaction,
            blockchainParams, options);
        subtreeFuncPathRes[pathKey] = subtreeValuePathRes;
      }
      subtreeFuncRes[CommonUtil.formatPath(subtreeConfig.path)] = subtreeFuncPathRes;
    }
    if (Object.keys(subtreeFuncRes).length > 0) {
      Object.assign(triggerRes, { subtree_func_results: subtreeFuncRes });
    }
    return triggerRes;
  }

  triggerFunctions(
      functionPath, pathVars, functionMap, valuePath, value, prevValue, auth, transaction,
      blockchainParams, options) {
    // NOTE(platfowner): It is assumed that the given transaction is in an executable form.
    const executedAt = transaction.extra.executed_at;
    const functionList = Functions.getFunctionList(functionMap);
    const params = Functions.convertPathVars2Params(pathVars);
    const timestamp = _.get(options, 'timestamp', null);
    const blockNumber = _.get(options, 'blockNumber', null);
    const blockTime = _.get(options, 'blockTime', null);
    let triggerCount = 0;
    let failCount = 0;
    const promises = [];
    const funcResults = {};

    if (functionList && functionList.length > 0) {
      const formattedParams = Functions.formatFunctionParams(
          valuePath, functionPath, timestamp, executedAt, params, value, prevValue, transaction,
          blockNumber, blockTime, options);
      for (const functionEntry of functionList) {
        if (!functionEntry || !functionEntry.function_type) {
          continue;  // Does nothing.
        }
        if (functionEntry.function_type === FunctionTypes.NATIVE) {
          if (this.isCircularCall(functionEntry.function_id)) {
            logger.error(
                `Circular function call [[ ${functionEntry.function_id} ]] ` +
                `with call stack ${JSON.stringify(this.getFids())} and params:\n` +
                formattedParams);
            continue;  // Skips the function.
          }
          const nativeFunction = this.nativeFunctionMap[functionEntry.function_id];
          if (nativeFunction) {
            // Execute the matched native function.
            this.pushCall(
                CommonUtil.formatPath(valuePath), value, CommonUtil.formatPath(functionPath),
                functionEntry.function_id, nativeFunction);
            if (DevFlags.enableRichFunctionLogging) {
              logger.info(
                  `  ==> Triggering NATIVE function [[ ${functionEntry.function_id} ]] ` +
                  `with call stack ${JSON.stringify(this.getFids())} and params:\n` +
                  formattedParams);
            }
            const newAuth = Object.assign(
                {}, auth, { fid: functionEntry.function_id, fids: this.getFids() });
            let result = null;
            try {
              result = nativeFunction.func(
                  value,
                  {
                    fid: functionEntry.function_id,
                    function: functionEntry,
                    valuePath,
                    functionPath,
                    value,
                    prevValue,
                    params,
                    timestamp,
                    executedAt,
                    transaction,
                    blockNumber,
                    blockTime,
                    options,
                    auth: newAuth,
                    opResultList: [],
                    otherGasAmount: 0,
                    ...blockchainParams,
                  });
              funcResults[functionEntry.function_id] = result;
              if (DevFlags.enableRichFunctionLogging) {
                const formattedResult =
                    `  ==>| Execution result of NATIVE function [[ ${functionEntry.function_id} ]] ` +
                    `with call stack ${JSON.stringify(this.getFids())}:\n` +
                    `${JSON.stringify(result, null, 2)}`;
                if (CommonUtil.isFailedFuncResultCode(result.code)) {
                  logger.error(formattedResult);
                } else {
                  logger.info(formattedResult);
                }
              }
            } finally {
              // Always pops from the call stack.
              this.popCall();
              triggerCount++;
              if (!result || CommonUtil.isFailedFuncResultCode(result.code)) {
                break;
              }
            }
          }
        } else if (functionEntry.function_type === FunctionTypes.REST) {
          if (NodeConfigs.ENABLE_REST_FUNCTION_CALL && functionEntry.function_url &&
            matchUrl(functionEntry.function_url, this.db.getRestFunctionsUrlWhitelist())) {
            if (DevFlags.enableRichFunctionLogging) {
              logger.info(
                  `  ==> Triggering REST function [[ ${functionEntry.function_id} ]] of ` +
                  `function_url '${functionEntry.function_url}' with:\n` +
                  formattedParams);
            }
            const newAuth = Object.assign(
                {}, auth, { fid: functionEntry.function_id, fids: this.getFids() });
            promises.push(axios.post(functionEntry.function_url, {
              fid: functionEntry.function_id,
              function: functionEntry,
              valuePath,
              functionPath,
              value,
              prevValue,
              params,
              timestamp,
              executedAt,
              transaction,
              blockNumber,
              blockTime,
              options,
              auth: newAuth,
              chainId: blockchainParams.chainId,
              networkId: blockchainParams.networkId,
            }, {
              timeout: NodeConfigs.REST_FUNCTION_CALL_TIMEOUT_MS
            }).catch((error) => {
              if (DevFlags.enableRichFunctionLogging) {
                logger.error(
                    `Failed to trigger REST function [[ ${functionEntry.function_id} ]] of ` +
                    `function_url '${functionEntry.function_url}' with error: \n` +
                    `${JSON.stringify(error)}` +
                    formattedParams);
              }
              failCount++;
              return true;
            }));
            funcResults[functionEntry.function_id] = {
              code: FunctionResultCode.SUCCESS,
              bandwidth_gas_amount: blockchainParams.restFunctionCallGasAmount,
            };
            triggerCount++;
          }
        }
      }
    }
    const funcPromises = Promise.all(promises).then(() => {
      return {
        func_count: functionList ? functionList.length : 0,
        trigger_count: triggerCount,
        fail_count: failCount,
      };
    });
    return {
      func_results: funcResults,
      func_promises: funcPromises,
    };
  }

  pushCall(valuePath, value, functionPath, fid, nativeFunction) {
    const topCall = this.getTopCall();
    const fidList = topCall ? Array.from(topCall.fidList) : [];
    fidList.push(fid);
    const callDepth = this.callStackSize();
    const gasAmount = nativeFunction.extraGasAmount;
    this.callStack.push({
      fid,
      fidList,
      functionPath,
      triggered_by: {
        valuePath,
        value
      },
      callDepth,
      gasAmount,
    });
  }

  popCall() {
    return this.callStack.pop();
  }

  getTopCall() {
    const size = this.callStackSize();
    if (size > 0) {
      return this.callStack[size - 1];
    }
    return null;
  }

  callStackSize() {
    return this.callStack.length;
  }

  getFids() {
    const call = this.getTopCall();
    return call ? call.fidList : [];
  }

  isCircularCall(fid) {
    const call = this.getTopCall();
    return call && call.fidList && call.fidList.includes(fid);
  }

  static addToOpResultList(path, result, context) {
    context.opResultList.push({ path, result, });
  }

  static formatFunctionParams(
      parsedValuePath, functionPath, timestamp, executedAt, params, value, prevValue, transaction,
      blockNumber, blockTime, options) {
    return `valuePath: '${CommonUtil.formatPath(parsedValuePath)}', ` +
      `functionPath: '${CommonUtil.formatPath(functionPath)}', ` +
      `timestamp: '${timestamp}', executedAt: '${executedAt}', ` +
      `params: ${JSON.stringify(params, null, 2)}, ` +
      `value: '${JSON.stringify(value, null, 2)}', ` +
      `prevValue: '${JSON.stringify(prevValue, null, 2)}'` +
      `transaction: ${JSON.stringify(transaction, null, 2)}, ` +
      `blockNumber: ${blockNumber}, blockTime: ${blockTime}` +
      `options: ${JSON.stringify(options, null, 2)}`;
  }

  static getFunctionList(functionMap) {
    if (!functionMap) {
      return null;
    }
    return Object.values(functionMap);
  }

  /**
   * Checks whether any owner only function is included in the given object.
   *
   * @param {Object} obj object
   */
  hasOwnerOnlyFunction(obj) {
    if (!CommonUtil.isDict(obj) || CommonUtil.isEmpty(obj)) {
      return null;
    }

    for (const key in obj) {
      const childObj = obj[key];
      if (key === PredefinedDbPaths.DOT_FUNCTION) {
        if (CommonUtil.isDict(childObj) && !CommonUtil.isEmpty(childObj)) {
          for (const fid in childObj) {
            const nativeFunction = this.nativeFunctionMap[fid];
            if (nativeFunction && nativeFunction.ownerOnly) {
              return fid;
            }
          }
        }
      } else {
        const ownerOnlyFid = this.hasOwnerOnlyFunction(childObj);
        if (ownerOnlyFid !== null) {
          return ownerOnlyFid;
        }
      }
    }
    return null;
  }

  static convertPathVars2Params(pathVars) {
    const params = {};
    if (CommonUtil.isDict(pathVars)) {
      Object.keys(pathVars).forEach((key) => {
        const paramName = key.slice(1);
        params[paramName] = pathVars[key];
      });
    }
    return params;
  }

  static matchValueWithFunctionPathRecursive(
      valueObj, parsedValuePath, parsedFunctionPath, depth, pathVars) {
    const matched = {};
    if (depth == parsedFunctionPath.length) {
      matched[CommonUtil.formatPath(parsedValuePath)] = {
        path: parsedValuePath,
        pathVars,
        value: JSON.parse(JSON.stringify(valueObj)),
      };
      return matched;
    }
    if (!CommonUtil.isDict(valueObj)) {
      // Avoid some special cases like string.
      return matched;
    }
    const label = parsedFunctionPath[depth];
    if (CommonUtil.isVariableLabel(label)) {
      for (const valueLabel of Object.keys(valueObj)) {
        const pathVarsCopy = JSON.parse(JSON.stringify(pathVars));
        if (pathVarsCopy[label] !== undefined) {
          // This should not happen!
          logger.error(`Duplicated path variables [${label}] that should NOT happen!`)
        } else {
          pathVarsCopy[label] = valueLabel;
        }
        const matchedRecur = Functions.matchValueWithFunctionPathRecursive(
            valueObj[valueLabel], [...parsedValuePath, valueLabel], parsedFunctionPath,
            depth + 1, pathVarsCopy);
        Object.assign(matched, matchedRecur);
      }
    } else {
      if (valueObj[label] !== undefined) {
        const matchedRecur = Functions.matchValueWithFunctionPathRecursive(
            valueObj[label], [...parsedValuePath, label], parsedFunctionPath,
            depth + 1, pathVars);
        Object.assign(matched, matchedRecur);
      }
    }

    return matched;
  }

  static matchValueWithFunctionPath(value, parsedFunctionPath) {
    return Functions.matchValueWithFunctionPathRecursive(value, [], parsedFunctionPath, 0, {});
  }

  static matchValueWithValuePath(value, parsedValuePath) {
    let valueObj = value;
    for (const label of parsedValuePath) {
      if (!CommonUtil.isDict(valueObj)) {
        return null;
      }
      if (valueObj[label] === undefined) {
        return null;
      }
      valueObj = valueObj[label];
    }

    return CommonUtil.isDict(valueObj) ? JSON.parse(JSON.stringify(valueObj)) : valueObj;
  }

  setValueOrLog(valuePath, value, context) {
    const transaction = context.transaction;
    const timestamp = context.timestamp;
    const blockNumber = context.blockNumber;
    const blockTime = context.blockTime;
    const auth = context.auth;
    const newOptions = {
      timestamp,
      blockNumber,
      blockTime,
    };
    const result = this.db.setValue(valuePath, value, auth, transaction, newOptions);
    if (CommonUtil.isFailedTx(result)) {
      logger.error(
          `  ==> Failed to setValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    Functions.addToOpResultList(valuePath, result, context);
    return result;
  }

  incValueOrLog(valuePath, delta, context) {
    const transaction = context.transaction;
    const timestamp = context.timestamp;
    const blockNumber = context.blockNumber;
    const blockTime = context.blockTime;
    const auth = context.auth;
    const newOptions = {
      timestamp,
      blockNumber,
      blockTime,
    };
    const result = this.db.incValue(valuePath, delta, auth, transaction, newOptions);
    if (CommonUtil.isFailedTx(result)) {
      logger.error(
          `  ==> Failed to incValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    Functions.addToOpResultList(valuePath, result, context);
    return result;
  }

  decValueOrLog(valuePath, delta, context) {
    const transaction = context.transaction;
    const timestamp = context.timestamp;
    const blockNumber = context.blockNumber;
    const blockTime = context.blockTime;
    const auth = context.auth;
    const newOptions = {
      timestamp,
      blockNumber,
      blockTime,
    };
    const result = this.db.decValue(valuePath, delta, auth, transaction, newOptions);
    if (CommonUtil.isFailedTx(result)) {
      logger.error(
          `  ==> Failed to decValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    Functions.addToOpResultList(valuePath, result, context);
    return result;
  }

  /**
   * Adds a transfer entry from a service account to a regular account or vice versa. Used by
   * service-related native functions such as payments and staking
   */
  setServiceAccountTransferOrLog(from, to, value, context) {
    const timestamp = context.timestamp;

    const transferPath = PathUtil.getTransferValuePath(from, to, timestamp);
    return this.setValueOrLog(transferPath, value, context);
  }

  setOwnerOrLog(ownerPath, owner, context) {
    const auth = context.auth;
    const timestamp = context.timestamp;
    const blockNumber = context.blockNumber;
    const blockTime = context.blockTime;
    const newOptions = {
      timestamp,
      blockNumber,
      blockTime,
    };
    const result = this.db.setOwner(ownerPath, owner, auth, newOptions);
    if (CommonUtil.isFailedTx(result)) {
      logger.error(
          `  ==> Failed to setOwner on '${ownerPath}' with error: ${JSON.stringify(result)}`);
    }
    Functions.addToOpResultList(ownerPath, result, context);
    return result;
  }

  setRuleOrLog(rulePath, rule, context) {
    const auth = context.auth;
    const timestamp = context.timestamp;
    const blockNumber = context.blockNumber;
    const blockTime = context.blockTime;
    const newOptions = {
      timestamp,
      blockNumber,
      blockTime,
    };
    const result = this.db.setRule(rulePath, rule, auth, newOptions);
    if (CommonUtil.isFailedTx(result)) {
      logger.error(
          `  ==> Failed to setRule on '${rulePath}' with error: ${JSON.stringify(result)}`);
    }
    Functions.addToOpResultList(rulePath, result, context);
    return result;
  }

  buildFuncResultToReturn(context, code, extraGasAmount = 0) {
    const result = {
      code,
      bandwidth_gas_amount: this.nativeFunctionMap[context.fid].extraGasAmount
    };
    if (CommonUtil.isNumber(extraGasAmount) && extraGasAmount > 0) {
      result.bandwidth_gas_amount += extraGasAmount;
    }
    return result;
  }

  buildFuncResultToSave(context, code) {
    // NOTE(platfowner): Allow only node-independent values to avoid state proof hash issues.
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const result = {
      timestamp,
      tx_hash: transaction.hash,
      code,
    };
    return result;
  }

  returnFuncResult(context, code, extraGasAmount = 0) {
    const opResultListObj = CommonUtil.convertListToObj(context.opResultList);
    const funcResultToReturn = {};
    if (!CommonUtil.isEmpty(opResultListObj)) {
      funcResultToReturn.op_results = opResultListObj;
    }
    Object.assign(funcResultToReturn, this.buildFuncResultToReturn(context, code, extraGasAmount));
    return funcResultToReturn;
  }

  /**
   * Saves the transaction's hash to a sibling path.
   * e.g.) For tx's value path 'path/to/value', it saves the tx hash to 'path/to/.last_tx/value'.
   * This is often used for testing purposes.
   */
  _saveLastTx(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const transaction = context.transaction;
    const parsedValuePath = context.valuePath;
    if (parsedValuePath.length === 0) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const lastTxPath = parsedValuePath.slice();
    // Insert '.last_tx' label just before the last label in the path.
    const lastLabel = lastTxPath.pop();
    lastTxPath.push(PredefinedDbPaths.SAVE_LAST_TX_LAST_TX);
    lastTxPath.push(lastLabel);
    const result = this.setValueOrLog(
        CommonUtil.formatPath(lastTxPath), { tx_hash: transaction.hash }, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  /**
   * Overwrite the value with 'erased'.
   * This is often used for testing purposes.
   */
  _eraseValue(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const parsedValuePath = context.valuePath;
    const result = this.setValueOrLog(CommonUtil.formatPath(parsedValuePath), 'erased', context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  /**
   * Does nothing except always fails.
   * This is often used for testing purposes.
   */
  _fail(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    return this.returnFuncResult(context, FunctionResultCode.FAILURE);
  }

  /**
   * Sets owner config on the path.
   * This is often used for testing purposes.
   */
  _setOwnerConfig(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const parsedValuePath = context.valuePath;
    const auth = context.auth;
    const owner = {
      [PredefinedDbPaths.DOT_OWNER]: {
        [OwnerProperties.OWNERS]: {
          [auth.addr]: buildOwnerPermissions(false, true, true, true),
          [OwnerProperties.ANYONE]: buildOwnerPermissions(false, true, true, true),
        }
      }
    };
    const result = this.setOwnerOrLog(CommonUtil.formatPath(parsedValuePath), owner, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  isExistingAccount(addrOrServAcnt) {
    const accountPath = CommonUtil.isServAcntName(addrOrServAcnt) ?
        PathUtil.getServiceAccountPathFromAccountName(addrOrServAcnt) :
        PathUtil.getAccountPath(addrOrServAcnt);
    const curAccountValue = this.db.getValue(accountPath);
    return curAccountValue !== null;
  }

  _transfer(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const from = context.params.from;
    const to = context.params.to;
    const fromBalancePath = CommonUtil.getBalancePath(from);
    const toBalancePath = CommonUtil.getBalancePath(to);
    const fromBalance = this.db.getValue(fromBalancePath);
    if (fromBalance === null || fromBalance < value) {
      return this.returnFuncResult(context, FunctionResultCode.INSUFFICIENT_BALANCE);
    }
    let extraGasAmount = 0;
    if (isEnabledTimerFlag('extend_account_registration_gas_amount', context.blockNumber)) {
      if (!this.isExistingAccount(to)) {  // for either an individual or a service account.
        extraGasAmount = context.accountRegistrationGasAmount;
      }
    } else {
      const toBalance = this.db.getValue(toBalancePath);
      if (toBalance === null) {  // for either an individual or a service account.
        extraGasAmount = context.accountRegistrationGasAmount;
      }
    }
    const decResult = this.decValueOrLog(fromBalancePath, value, context);
    if (CommonUtil.isFailedTx(decResult)) {
      return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
    }
    // TODO(liayoo): Remove the from entry, if it's a service account && if the new balance === 0.
    const incResult = this.incValueOrLog(toBalancePath, value, context);
    if (CommonUtil.isFailedTx(incResult)) {
      return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS, extraGasAmount);
  }

  sanitizeCreateAppConfig(rawVal) {
    const sanitizedVal = {};
    const adminConfig = _.get(rawVal, PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN);
    const billingConfig = _.get(rawVal, PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING);
    const serviceConfig = _.get(rawVal, PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE);
    const isPublic = _.get(rawVal, PredefinedDbPaths.MANAGE_APP_CONFIG_IS_PUBLIC);
    if (!CommonUtil.isDict(adminConfig)) {
      return { errorCode: FunctionResultCode.FAILURE };
    }
    for (const [addr, val] of Object.entries(adminConfig)) {
      if (!CommonUtil.isCksumAddr(addr) || !CommonUtil.isBool(val)) {
        return { errorCode: FunctionResultCode.FAILURE };
      }
    }
    sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN] = adminConfig;
    if (!CommonUtil.isBool(isPublic) && isPublic !== undefined) {
      return { errorCode: FunctionResultCode.FAILURE };
    }
    if (isPublic) {
      sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_IS_PUBLIC] = true;
    }
    if (billingConfig) {
      sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING] = billingConfig;
    }
    if (serviceConfig) {
      sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE] = serviceConfig;
    }
    if (!_.isEqual(sanitizedVal, rawVal)) {
      return { errorCode: FunctionResultCode.FAILURE };
    }
    return { sanitizedVal, errorCode: null };
  }

  _createApp(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const { isValidServiceName } = require('./state-util');
    const appName = context.params.app_name;
    if (!isValidServiceName(appName, context.blockNumber)) {
      return this.returnFuncResult(context, FunctionResultCode.INVALID_SERVICE_NAME);
    }
    const { sanitizedVal, errorCode } = this.sanitizeCreateAppConfig(value);
    if (errorCode) {
      return this.returnFuncResult(context, errorCode);
    }
    let rule;
    const owner = {};
    const adminAddrList = Object.keys(sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN]);
    adminAddrList.forEach((addr) => {
      CommonUtil.setJsObject(
          owner, [PredefinedDbPaths.DOT_OWNER, OwnerProperties.OWNERS, addr],
          buildOwnerPermissions(true, true, true, true));
    });
    if (sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_IS_PUBLIC]) {
      rule = true;
      // Additionally set anyone to have owner permissions, except for the write_owner permission.
      CommonUtil.setJsObject(
          owner, [PredefinedDbPaths.DOT_OWNER, OwnerProperties.OWNERS, OwnerProperties.ANYONE],
          buildOwnerPermissions(true, true, false, true));
    } else {
      rule = adminAddrList.map((addr) => `auth.addr === '${addr}'`).join(' || ');
    }
    const appPath = PathUtil.getAppPath(appName);
    this.setRuleOrLog(appPath, buildRulePermission(rule), context);
    this.setOwnerOrLog(appPath, owner, context);
    const manageAppConfigPath = PathUtil.getManageAppConfigPath(appName);
    for (const [configKey, configVal] of Object.entries(sanitizedVal)) {
      const result = this.setValueOrLog(`${manageAppConfigPath}/${configKey}`, configVal, context);
      if (CommonUtil.isFailedTx(result)) {
        return this.returnFuncResult(context, FunctionResultCode.FAILURE);
      }
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  _collectFee(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const from = context.params.from;
    const gasFeeServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE_UNCLAIMED);
    const result =
        this.setServiceAccountTransferOrLog(from, gasFeeServiceAccountName, value.amount, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      logger.error(`  ===> _collectFee failed: ${JSON.stringify(result)}`);
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  incrementConsensusRewards(address, amount, context) {
    const rewardsPath = PathUtil.getConsensusRewardsPath(address);
    const prevRewards = this.db.getValue(rewardsPath) || {};
    return this.setValueOrLog(rewardsPath, {
      [PredefinedDbPaths.CONSENSUS_REWARDS_UNCLAIMED]: (prevRewards[PredefinedDbPaths.CONSENSUS_REWARDS_UNCLAIMED] || 0) + amount,
      [PredefinedDbPaths.CONSENSUS_REWARDS_CUMULATIVE]: (prevRewards[PredefinedDbPaths.CONSENSUS_REWARDS_CUMULATIVE] || 0) + amount
    }, context);
  }

  getBlockRewardMultiplier(context) {
    const { rewardType, rewardAnnualRate, epochMs } = context;
    switch (rewardType) {
      case 'FIXED':
        const yearMs = 31557600000; // 365.25 * 24 * 60 * 60 * 1000
        return Math.max(rewardAnnualRate * epochMs / yearMs, 0);
    }
    return 0;
  }

  _distributeFee(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    if (!DevFlags.enableGasFeeDistribution) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const blockNumber = context.params.number;
    // NOTE(liayoo): Because we need to have the votes to determine which validators to give the
    //               rewards to, we're distributing the rewards from the (N-1)th block when a
    //               proposal for the Nth block is written. Genesis block doesn't have rewards,
    //               so we can start from block number 2 (= processing block number 1) and so on.
    if (blockNumber <= 1) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const blockRewardMultiplier = this.getBlockRewardMultiplier(context);
    const lastConsensusRound = this.db.getValue(PathUtil.getConsensusNumberPath(blockNumber - 1));
    const gasCostTotal = lastConsensusRound.propose.gas_cost_total;
    const blockHash = lastConsensusRound.propose.block_hash;
    const votes = lastConsensusRound[blockHash].vote;
    const totalAtStake = Object.values(votes).reduce((acc, cur) => acc + cur.stake, 0);
    const validators = Object.keys(votes);
    let txFeeSum = 0;
    for (let index = 0; index < validators.length; index++) {
      const validatorAddr = validators[index];
      const validatorStake = votes[validatorAddr].stake;
      const blockReward = blockRewardMultiplier * validatorStake;
      let txFee = 0;
      if (DevFlags.enableGasFeeCollection && gasCostTotal > 0) {
        if (index === validators.length - 1) {
          txFee = gasCostTotal - txFeeSum;
        } else {
          txFee = gasCostTotal * (validatorStake / totalAtStake);
          txFeeSum += txFee;
        }
      }
      if (txFee + blockReward > 0) {
        this.incrementConsensusRewards(validatorAddr, txFee + blockReward, context);
      }
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  _claimReward(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const addr = context.params.user_addr;
    const unclaimedRewardsPath = PathUtil.getConsensusRewardsUnclaimedPath(addr);
    const unclaimedRewards = this.db.getValue(unclaimedRewardsPath) || 0;
    if (unclaimedRewards < value.amount) {
      return this.returnFuncResult(context, FunctionResultCode.INVALID_AMOUNT);
    }
    const gasFeeServiceAccountName = CommonUtil.toServiceAccountName(
      PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE_UNCLAIMED);
    const transferRes = this.setServiceAccountTransferOrLog(gasFeeServiceAccountName, addr, value.amount, context);
    if (CommonUtil.isFailedTx(transferRes)) {
      logger.error(`  ===> _claimReward failed: ${JSON.stringify(transferRes)}`);
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    const updateUnclaimedRes = this.setValueOrLog(unclaimedRewardsPath, unclaimedRewards - value.amount, context);
    if (CommonUtil.isFailedTx(updateUnclaimedRes)) {
      logger.error(`  ===> _claimReward failed: ${JSON.stringify(updateUnclaimedRes)}`);
      return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  static getLockupExtensionForNewOffenses(numNewOffenses, updatedNumOffenses, stakeLockupExtension) {
    let extension = 0;
    for (let n = updatedNumOffenses - numNewOffenses + 1; n <= updatedNumOffenses; n++) {
      extension += stakeLockupExtension * Math.pow(2, n - 1);
    }
    return extension;
  }

  _handleOffenses(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    if (CommonUtil.isEmpty(value.offenses)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    for (const [offender, offenseList] of Object.entries(value.offenses)) {
      const numNewOffenses = Object.values(offenseList).reduce((acc, cur) => acc + cur, 0);
      const offenseRecordsPath = PathUtil.getConsensusOffenseRecordsAddrPath(offender);
      this.incValueOrLog(offenseRecordsPath, numNewOffenses, context);
      const updatedNumOffenses = this.db.getValue(offenseRecordsPath); // new # of offenses
      const lockupExtension = Functions.getLockupExtensionForNewOffenses(
          numNewOffenses, updatedNumOffenses, context.stakeLockupExtension);
      if (lockupExtension > 0) {
        const expirationPath = PathUtil.getStakingExpirationPath(PredefinedDbPaths.CONSENSUS, offender, 0);
        const currentExpiration = Math.max(Number(this.db.getValue(expirationPath)), context.blockTime);
        this.setValueOrLog(expirationPath, currentExpiration + lockupExtension, context);
      }
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  sumUpStakingBalanceTotal() {
    const appStakes = this.db.getValue(PredefinedDbPaths.STAKING, { isShallow: true }) || {};
    return Object.keys(appStakes).reduce((acc, appName) => {
      return acc + this.db.getValue(PathUtil.getStakingBalanceTotalPath(appName));
    }, 0);
  }

  _stake(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const stakingKey = context.params.staking_key;
    const expirationPath = PathUtil.getStakingExpirationPath(serviceName, user, stakingKey);
    const currentExpiration = Number(this.db.getValue(expirationPath));
    // Use 0 as the default.
    const lockup = this.db.getValue(PathUtil.getStakingLockupDurationPath(serviceName)) || 0;
    if (!CommonUtil.isInteger(lockup) || lockup < 0) {
      return this.returnFuncResult(context, FunctionResultCode.INVALID_LOCKUP_DURATION);
    }
    const newExpiration = context.blockTime + lockup;
    const updateExpiration = newExpiration > currentExpiration;
    if (value === 0) {
      // Just update the expiration time
      if (updateExpiration) {
        this.setValueOrLog(expirationPath, newExpiration, context);
        return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
      }
    }
    const stakingServiceAccountName = CommonUtil.toServiceAccountName(
          PredefinedDbPaths.STAKING, serviceName, `${user}|${stakingKey}`);
    const result =
        this.setServiceAccountTransferOrLog(user, stakingServiceAccountName, value, context);
    if (!CommonUtil.isFailedTx(result)) {
      if (updateExpiration) {
        this.setValueOrLog(expirationPath, newExpiration, context);
      }
      const balanceTotalPath = PathUtil.getStakingBalanceTotalPath(serviceName);
      const balanceTotalSumPath = PathUtil.getStakingBalanceTotalSumPath();
      this.incValueOrLog(balanceTotalPath, value, context);
      if (isEnabledTimerFlag('staking_balance_total_sum', context.blockNumber)) {
        if (this.db.getValue(balanceTotalSumPath) === null) {
          this.setValueOrLog(balanceTotalSumPath, this.sumUpStakingBalanceTotal(), context);
        } else {
          this.incValueOrLog(balanceTotalSumPath, value, context);
        }
      }
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _unstake(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const stakingKey = context.params.staking_key;
    const executedAt = context.executedAt;
    const expireAt =
        this.db.getValue(PathUtil.getStakingExpirationPath(serviceName, user, stakingKey));
    if (expireAt > executedAt) {
      // Still in lock-up period.
      return this.returnFuncResult(context, FunctionResultCode.IN_LOCKUP_PERIOD);
    }
    const stakingServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.STAKING, serviceName, `${user}|${stakingKey}`);
    const result = this.setServiceAccountTransferOrLog(
        stakingServiceAccountName, user, value, context);
    if (!CommonUtil.isFailedTx(result)) {
      const balanceTotalPath = PathUtil.getStakingBalanceTotalPath(serviceName);
      const balanceTotalSumPath = PathUtil.getStakingBalanceTotalSumPath();
      this.decValueOrLog(balanceTotalPath, value, context);
      if (isEnabledTimerFlag('staking_balance_total_sum', context.blockNumber)) {
        if (this.db.getValue(balanceTotalSumPath) === null) {
          this.setValueOrLog(balanceTotalSumPath, this.sumUpStakingBalanceTotal(), context);
        } else {
          this.decValueOrLog(balanceTotalSumPath, value, context);
        }
      }
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _pay(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const paymentKey = context.params.payment_key;
    const transaction = context.transaction;
    if (!this.validatePaymentRecord(transaction.address, value)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    const userServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, serviceName, `${user}|${paymentKey}`);
    const result = this.setServiceAccountTransferOrLog(
        transaction.address, userServiceAccountName, value.amount, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _claim(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const paymentKey = context.params.payment_key;
    const transaction = context.transaction;
    if (!this.validatePaymentRecord(transaction.address, value)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }

    let result;
    const userServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, serviceName, `${user}|${paymentKey}`);
    // NOTE: By specifying `escrow_key`, the claimed payment is held in escrow instead of being
    // transferred directly to the admin account.
    if (value.escrow_key !== undefined) {
      const escrowHoldPath = PathUtil.getEscrowHoldRecordPath(
          userServiceAccountName, value.target, value.escrow_key, context.blockTime);
      result = this.setValueOrLog(escrowHoldPath, { amount: value.amount }, context);
    } else {
      result = this.setServiceAccountTransferOrLog(
          userServiceAccountName, value.target, value.amount, context);
    }
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  validatePaymentRecord(adminAddr, value) {
    if (!adminAddr) {
      return false;
    }
    if (!value || !value.amount || !CommonUtil.isNumber(value.amount)) {
      return false;
    }
    return true;
  }

  _hold(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const sourceAccount = context.params.source_account;
    const targetAccount = context.params.target_account;
    const escrowKey = context.params.escrow_key;
    const amount = _.get(value, 'amount');
    if (!CommonUtil.isNumber(amount)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    const accountKey = CommonUtil.toEscrowAccountName(sourceAccount, targetAccount, escrowKey);
    const escrowServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.ESCROW, PredefinedDbPaths.ESCROW, accountKey);
    const result = this.setServiceAccountTransferOrLog(
        sourceAccount, escrowServiceAccountName, amount, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _release(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const sourceAccount = context.params.source_account;
    const targetAccount = context.params.target_account;
    const escrowKey = context.params.escrow_key;
    const ratio = _.get(value, 'ratio');
    if (!CommonUtil.isNumber(ratio) || ratio < 0 || ratio > 1) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    const accountKey = CommonUtil.toEscrowAccountName(sourceAccount, targetAccount, escrowKey);
    const escrowServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.ESCROW, PredefinedDbPaths.ESCROW, accountKey);
    const serviceAccountBalancePath =
        PathUtil.getServiceAccountBalancePathFromAccountName(escrowServiceAccountName);
    const escrowAmount = this.db.getValue(serviceAccountBalancePath);
    const targetAmount = escrowAmount * ratio;
    const sourceAmount = escrowAmount - targetAmount;
    logger.debug(`  =>> escrowAmount: ${escrowAmount}, ratio: ${ratio}, ` +
        `targetAmount: ${targetAmount}, sourceAmount: ${sourceAmount}`);
    let targetResult = null;
    if (targetAmount > 0) {
      targetResult = this.setServiceAccountTransferOrLog(
          escrowServiceAccountName, targetAccount, targetAmount, context);
      if (CommonUtil.isFailedTx(targetResult)) {
        return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
      }
    }
    let sourceResult = null;
    if (sourceAmount > 0) {
      sourceResult = this.setServiceAccountTransferOrLog(
          escrowServiceAccountName, sourceAccount, sourceAmount, context);
      if (CommonUtil.isFailedTx(sourceResult)) {
        // TODO(liayoo): Revert the release to target_account if there was any.
        return this.returnFuncResult(context, FunctionResultCode.INTERNAL_ERROR);
      }
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  _updateLatestShardReport(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const blockNumberReported = Number(context.params.block_number);
    const parsedValuePath = context.valuePath;
    if (!CommonUtil.isArray(context.functionPath)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    if (!CommonUtil.isString(value)) {
      // Removing old report or invalid reporting
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const latestReportPath = PathUtil.getLatestShardReportPathFromValuePath(parsedValuePath);
    const currentLatestBlockNumber = this.db.getValue(latestReportPath);
    if (currentLatestBlockNumber !== null &&
        Number(currentLatestBlockNumber) >= blockNumberReported) {
      // Nothing to update
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const result = this.setValueOrLog(latestReportPath, blockNumberReported, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  updateStatsForPendingCheckin(
      networkName, chainId, tokenId, sender, tokenPool, amount, isIncrease, context) {
    if (isIncrease) {
      if (CommonUtil.isFailedTx(
          this.incValueOrLog(
              PathUtil.getCheckinPendingAmountPerSenderPath(networkName, chainId, tokenId, sender),
              amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
      if (CommonUtil.isFailedTx(
          this.incValueOrLog(
              PathUtil.getCheckinPendingAmountPerTokenPoolPath(tokenPool), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
    } else {
      if (CommonUtil.isFailedTx(
          this.decValueOrLog(
              PathUtil.getCheckinPendingAmountPerSenderPath(networkName, chainId, tokenId, sender),
              amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
      if (CommonUtil.isFailedTx(
          this.decValueOrLog(
              PathUtil.getCheckinPendingAmountPerTokenPoolPath(tokenPool), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
    }
    return true;
  }

  updateStatsForCompleteCheckin(user, amount, context) {
    if (CommonUtil.isFailedTx(
        this.incValueOrLog(PathUtil.getCheckinCompleteAmountPerAddrPath(user), amount, context))) {
      return FunctionResultCode.INTERNAL_ERROR;
    }
    if (CommonUtil.isFailedTx(
        this.incValueOrLog(PathUtil.getCheckinCompleteAmountTotalPath(), amount, context))) {
      return FunctionResultCode.INTERNAL_ERROR;
    }
    return true;
  }

  validateCheckinSender(sender, networkName) {
    switch (networkName) {
      case 'ETH':
        return CommonUtil.isCksumAddr(sender) ? true : FunctionResultCode.INVALID_SENDER;
      // TODO(liayoo): add 'AIN' case for shards
    }
    return FunctionResultCode.INVALID_SENDER;
  }

  validateCheckinSenderProof(ref, amount, sender, senderProof, tx) {
    try {
      const body = {
        ref,
        amount,
        sender,
        timestamp: _.get(tx, 'tx_body.timestamp'),
        nonce: _.get(tx, 'tx_body.nonce'),
      };
      const ethAccounts = new Accounts();
      if (ethAccounts.recover(ethAccounts.hashMessage(stringify(body)), senderProof) !== sender) {
        return FunctionResultCode.INVALID_SENDER_PROOF;
      }
      return true;
    } catch (e) {
      return FunctionResultCode.INVALID_SENDER_PROOF;
    }
  }

  validateCheckinAmount(networkName, chainId, tokenId, sender, amount, tokenPool) {
    // NOTE(liayoo): pending amounts do NOT include the request's amount yet.
    const pendingSender = this.db.getValue(
        PathUtil.getCheckinPendingAmountPerSenderPath(networkName, chainId, tokenId, sender)) || 0;
    if (pendingSender > 0) {
      return FunctionResultCode.UNPROCESSED_REQUEST_EXISTS;
    }
    const tokenPoolBalance = this.db.getValue(PathUtil.getAccountBalancePath(tokenPool)) || 0;
    const pendingPerTokenPool = this.db.getValue(
        PathUtil.getCheckinPendingAmountPerTokenPoolPath(tokenPool)) || 0;
    if (amount + pendingPerTokenPool > tokenPoolBalance) {
      return FunctionResultCode.INVALID_CHECKIN_AMOUNT;
    }
    return true;
  }

  _openCheckin(value, context) {
    if (value === null) {
      // Does nothing for null value.
      // NOTE(liayoo): It's not a SET_VALUE for a request, but for a cancellation. A request should
      // only happen if the value is NOT null.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const networkName = context.params.network_name;
    const chainId = context.params.chain_id;
    const tokenId = context.params.token_id;
    // NOTE(liayoo): `sender` is the address on `networkName` that will send `tokenId` tokens to the pool.
    //    For example, with the Eth token bridge, it will be an Ethereum address that will send ETH to the pool.
    // NOTE(liayoo): `sender_proof` is a signature of the stringified { ref, amount, sender, timestamp, nonce },
    //    signed with the sender key.
    const { amount, sender, sender_proof: senderProof } = value;
    const {
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_POOL]: tokenPool,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_MIN_CHECKOUT_PER_REQUEST]: minCheckoutPerRequest,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_MAX_CHECKOUT_PER_REQUEST]: maxCheckoutPerRequest,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_MAX_CHECKOUT_PER_DAY]: maxCheckoutPerDay,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_EXCH_RATE]: tokenExchangeRate,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_EXCH_SCHEME]: tokenExchangeScheme,
    } = this.db.getValue(PathUtil.getTokenBridgeConfigPath(networkName, chainId, tokenId));
    // Perform checks
    const tokenBridgeValidated = this.validateTokenBridgeConfig(
        tokenPool, minCheckoutPerRequest, maxCheckoutPerRequest, maxCheckoutPerDay,
        tokenExchangeRate, tokenExchangeScheme);
    if (tokenBridgeValidated !== true) {
      return this.returnFuncResult(context, tokenBridgeValidated);
    }
    const senderValidated = this.validateCheckinSender(sender, networkName);
    if (senderValidated !== true) {
      return this.returnFuncResult(context, senderValidated);
    }
    const senderProofValidated = this.validateCheckinSenderProof(
        CommonUtil.formatPath(context.valuePath), amount, sender, senderProof, context.transaction);
    if (senderProofValidated !== true) {
      return this.returnFuncResult(context, senderProofValidated);
    }
    const amountValidated = this.validateCheckinAmount(
        networkName, chainId, tokenId, sender, amount, tokenPool);
    if (amountValidated !== true) {
      return this.returnFuncResult(context, amountValidated);
    }
    // Increase pending amounts
    const incPendingResultCode = this.updateStatsForPendingCheckin(
        networkName, chainId, tokenId, sender, tokenPool, amount, true, context);
    if (incPendingResultCode !== true) {
      return this.returnFuncResult(context, incPendingResultCode);
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  _cancelCheckin(value, context) {
    if (value !== null) {
      // Does nothing for non-null value.
      // NOTE(liayoo): It's not a SET_VALUE for a cancel, but for a request. A cancel should only 
      // happen if the value is null.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    if (context.auth.fids.length > 1) {
      // NOTE(liayoo): Do not process _cancelCheckin if it's triggered by another function (e.g. _closeCheckin)
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const networkName = context.params.network_name;
    const chainId = context.params.chain_id;
    const tokenId = context.params.token_id;
    const {
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_POOL]: tokenPool
    } = this.db.getValue(PathUtil.getTokenBridgeConfigPath(networkName, chainId, tokenId));
    // Decrease pending amounts
    const decPendingResultCode = this.updateStatsForPendingCheckin(
        networkName, chainId, tokenId, context.prevValue.sender, tokenPool,
        context.prevValue.amount, false, context);
    if (decPendingResultCode !== true) {
      return this.returnFuncResult(context, decPendingResultCode);
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  _closeCheckin(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const networkName = context.params.network_name;
    const chainId = context.params.chain_id;
    const tokenId = context.params.token_id;
    const user = context.params.user_addr;
    const checkinId = context.params.checkin_id;
    const { request, response } = value;
    const {
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_POOL]: tokenPool
    } = this.db.getValue(PathUtil.getTokenBridgeConfigPath(networkName, chainId, tokenId));
    if (response.status === true) {
      // Increase complete amounts
      const updateStatsResultCode = this.updateStatsForCompleteCheckin(user, request.amount, context);
      if (updateStatsResultCode !== true) {
        return this.returnFuncResult(context, updateStatsResultCode);
      }
      // Transfer native tokens: token pool -> user
      const transferRes = this.setServiceAccountTransferOrLog(tokenPool, user, request.amount, context);
      if (CommonUtil.isFailedTx(transferRes)) {
        logger.error(`  ===> _closeCheckin failed: ${JSON.stringify(transferRes)}`);
        return this.returnFuncResult(context, FunctionResultCode.FAILURE);
      }
    }
    // NOTE(liayoo): Remove the original request to avoid keeping the processed requests in the
    //               /checkin/requests and having to read and filter from the growing list.
    const removeRes = this.setValueOrLog(
        PathUtil.getCheckinRequestPath(networkName, chainId, tokenId, user, checkinId), null, context);
    if (CommonUtil.isFailedTx(removeRes)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    // Decrease pending amounts
    const decPendingResultCode = this.updateStatsForPendingCheckin(
        networkName, chainId, tokenId, request.sender, tokenPool, request.amount, false, context);
    if (decPendingResultCode !== true) {
      return this.returnFuncResult(context, decPendingResultCode);
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  updateStatsForPendingCheckout(user, amount, isIncrease, context) {
    if (isIncrease) {
      if (CommonUtil.isFailedTx(
          this.incValueOrLog(PathUtil.getCheckoutPendingAmountPerAddrPath(user), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
      if (CommonUtil.isFailedTx(
          this.incValueOrLog(PathUtil.getCheckoutPendingAmountTotalPath(), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
    } else {
      if (CommonUtil.isFailedTx(
          this.decValueOrLog(PathUtil.getCheckoutPendingAmountPerAddrPath(user), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
      if (CommonUtil.isFailedTx(
          this.decValueOrLog(PathUtil.getCheckoutPendingAmountTotalPath(), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
    }
    return true;
  }

  updateStatsForCompleteCheckout(amount, blockTime, context) {
    const dayTimestamp = CommonUtil.getDayTimestamp(blockTime);
    if (CommonUtil.isFailedTx(
        this.incValueOrLog(PathUtil.getCheckoutCompleteAmountDailyPath(dayTimestamp), amount, context))) {
      return FunctionResultCode.INTERNAL_ERROR;
    }
    if (CommonUtil.isFailedTx(
        this.incValueOrLog(PathUtil.getCheckoutCompleteAmountTotalPath(), amount, context))) {
      return FunctionResultCode.INTERNAL_ERROR;
    }
    return true;
  }

  validateTokenBridgeConfig(tokenPool, minCheckoutPerRequest, maxCheckoutPerRequest,
      maxCheckoutPerDay, tokenExchangeRate, tokenExchangeScheme) {
    if (tokenPool === undefined || minCheckoutPerRequest === undefined ||
        maxCheckoutPerRequest === undefined || maxCheckoutPerDay === undefined ||
        tokenExchangeRate === undefined || tokenExchangeScheme === undefined) {
      return FunctionResultCode.INVALID_TOKEN_BRIDGE_CONFIG;
    }
    return true;
  }

  validateCheckoutRecipient(recipient, networkName) {
    switch (networkName) {
      case 'ETH':
        return CommonUtil.isCksumAddr(recipient) ? true : FunctionResultCode.INVALID_RECIPIENT;
      // TODO(liayoo): add 'AIN' case for shards
    }
    return FunctionResultCode.INVALID_RECIPIENT;
  }

  validateCheckoutAmount(amount, blockTime, minCheckoutPerRequest, maxCheckoutPerRequest, maxCheckoutPerDay) {
    const pendingTotal = this.db.getValue(PathUtil.getCheckoutPendingAmountTotalPath()) || 0; // includes 'amount'
    const checkoutCompleteToday = this.db.getValue(
        PathUtil.getCheckoutCompleteAmountDailyPath(CommonUtil.getDayTimestamp(blockTime))) || 0;
    if (amount < minCheckoutPerRequest || amount > maxCheckoutPerRequest) {
      return FunctionResultCode.INVALID_CHECKOUT_AMOUNT;
    }
    if (pendingTotal + checkoutCompleteToday > maxCheckoutPerDay) {
      return FunctionResultCode.INVALID_CHECKOUT_AMOUNT;
    }
    return true;
  }

  _openCheckout(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const networkName = context.params.network_name;
    const chainId = context.params.chain_id;
    const tokenId = context.params.token_id;
    const user = context.params.user_addr;
    const { amount, recipient } = value;
    // Increase pending amounts
    const incPendingResultCode = this.updateStatsForPendingCheckout(user, amount, true, context);
    if (incPendingResultCode !== true) {
      return this.returnFuncResult(context, incPendingResultCode);
    }
    const {
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_POOL]: tokenPool,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_MIN_CHECKOUT_PER_REQUEST]: minCheckoutPerRequest,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_MAX_CHECKOUT_PER_REQUEST]: maxCheckoutPerRequest,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_MAX_CHECKOUT_PER_DAY]: maxCheckoutPerDay,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_CHECKOUT_FEE_RATE]: checkoutFeeRate,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_EXCH_RATE]: tokenExchangeRate,
      [PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_EXCH_SCHEME]: tokenExchangeScheme,
    } = this.db.getValue(PathUtil.getTokenBridgeConfigPath(networkName, chainId, tokenId));
    // Perform checks
    const tokenBridgeValidated = this.validateTokenBridgeConfig(
        tokenPool, minCheckoutPerRequest, maxCheckoutPerRequest, maxCheckoutPerDay,
        tokenExchangeRate, tokenExchangeScheme);
    if (tokenBridgeValidated !== true) {
      return this.returnFuncResult(context, tokenBridgeValidated);
    }
    const recipientValidated = this.validateCheckoutRecipient(recipient, networkName);
    if (recipientValidated !== true) {
      return this.returnFuncResult(context, recipientValidated);
    }
    const amountValidated = this.validateCheckoutAmount(
        amount, context.blockTime, minCheckoutPerRequest, maxCheckoutPerRequest, maxCheckoutPerDay);
    if (amountValidated !== true) {
      return this.returnFuncResult(context, amountValidated);
    }
    const transferAmount = amount + amount * checkoutFeeRate;
    // Transfer from user to token_pool
    const transferRes = this.setServiceAccountTransferOrLog(user, tokenPool, transferAmount, context);
    if (!CommonUtil.isFailedTx(transferRes)) {
      // NOTE(liayoo): History will be recorded by a checkout server after processing the request.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      logger.error(`  ===> _openCheckout failed: ${JSON.stringify(transferRes)}`);
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  _closeCheckout(value, context) {
    if (value === null) {
      // Does nothing for null value.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const networkName = context.params.network_name;
    const chainId = context.params.chain_id;
    const tokenId = context.params.token_id;
    const user = context.params.user_addr;
    const checkoutId = context.params.checkout_id;
    const { request, response } = value;
    if (response.status === true) {
      // Increase complete amounts
      const updateStatsResultCode = this.updateStatsForCompleteCheckout(request.amount, context.blockTime, context);
      if (updateStatsResultCode !== true) {
        return this.returnFuncResult(context, updateStatsResultCode);
      }
    } else {
      // Refund
      const tokenPool = this.db.getValue(PathUtil.getTokenBridgeTokenPoolPath(networkName, chainId, tokenId));
      const refundAmount = request.amount + request.amount * request.fee_rate;
      const transferRes = this.setServiceAccountTransferOrLog(tokenPool, user, refundAmount, context);
      if (CommonUtil.isFailedTx(transferRes)) {
        return this.returnFuncResult(context, FunctionResultCode.FAILURE);
      }
      const setRefundRes = this.setValueOrLog(
          PathUtil.getCheckoutRefundPath(networkName, chainId, tokenId, user, checkoutId),
          PathUtil.getTransferPath(tokenPool, user, context.timestamp), context);
      if (CommonUtil.isFailedTx(setRefundRes)) {
        return this.returnFuncResult(context, FunctionResultCode.FAILURE);
      }
    }
    // NOTE(liayoo): Remove the original request to avoid keeping the processed requests in the
    //               /checkout/requests and having to read and filter from the growing list.
    const removeRes = this.setValueOrLog(
        PathUtil.getCheckoutRequestPath(networkName, chainId, tokenId, user, checkoutId), null, context);
    if (CommonUtil.isFailedTx(removeRes)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    // Decrease pending amounts
    const decPendingResultCode = this.updateStatsForPendingCheckout(user, request.amount, false, context);
    if (decPendingResultCode !== true) {
      return this.returnFuncResult(context, decPendingResultCode);
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  isTransferTx(txOp) {
    if (txOp.type !== WriteDbOperations.SET_VALUE) {
      return false;
    }
    const parsedPath = CommonUtil.parsePath(txOp.ref);
    return parsedPath.length && parsedPath[0] === PredefinedDbPaths.TRANSFER;
  }
}

module.exports = Functions;
