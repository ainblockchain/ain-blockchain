const logger = require('../logger')('FUNCTIONS');
const axios = require('axios');
const _ = require('lodash');
const {
  FeatureFlags,
  PredefinedDbPaths,
  FunctionTypes,
  FunctionResultCode,
  NativeFunctionIds,
  ShardingProperties,
  GenesisSharding,
  WriteDbOperations,
  ShardingProtocols,
  GenesisAccounts,
  AccountProperties,
  TokenBridgeProperties,
  TokenExchangeSchemes,
  OwnerProperties,
  GasFeeConstants,
  REST_FUNCTION_CALL_TIMEOUT_MS,
  buildOwnerPermissions,
  buildRulePermission,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const PathUtil = require('../common/path-util');
const {
  sendSignedTx,
  signAndSendTx
} = require('../common/network-util');
const Transaction = require('../tx-pool/transaction');

const parentChainEndpoint = GenesisSharding[ShardingProperties.PARENT_CHAIN_POC] + '/json-rpc';

const EventListenerWhitelist = {
  'https://events.ainetwork.ai/trigger': true,
  'https://events.ainize.ai/trigger': true,
  'http://localhost:3000/trigger': true
};

/**
 * Built-in functions with function paths.
 */
// NOTE(platfowner): ownerOnly means that the function can be set only by the blockchain owner.
// NOTE(platfowner): extraGasAmount means the extra gas amount required to execute the function,
// which often reflects the external RPC calls needed.
class Functions {
  constructor(db, tp) {
    this.db = db;
    this.tp = tp;
    this.nativeFunctionMap = {
      [NativeFunctionIds.CLAIM]: {
        func: this._claim.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.CLOSE_CHECKIN]: {
        func: this._closeCheckin.bind(this), ownerOnly: true, extraGasAmount: 10 },
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
      [NativeFunctionIds.HOLD]: {
        func: this._hold.bind(this), ownerOnly: true, extraGasAmount: 0 },
      [NativeFunctionIds.OPEN_CHECKIN]: {
        func: this._openCheckin.bind(this), ownerOnly: true, extraGasAmount: 60 },
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
   * @param {Number} timestamp the time at which the transaction was created and signed
   * @param {Number} executedAt execution time
   * @param {Object} transaction transaction
   */
  // NOTE(platfowner): Validity checks on individual addresses are done by .write rules.
  // TODO(platfowner): Trigger subtree functions.
  triggerFunctions(parsedValuePath, value, auth, timestamp, transaction) {
    // NOTE(platfowner): It is assumed that the given transaction is in an executable form.
    const executedAt = transaction.extra.executed_at;
    const matched = this.db.matchFunctionForParsedPath(parsedValuePath);
    const functionPath = matched.matchedFunction.path;
    const functionMap = matched.matchedFunction.config;
    const functionList = Functions.getFunctionList(functionMap);
    const params = Functions.convertPathVars2Params(matched.pathVars);
    let triggerCount = 0;
    let failCount = 0;
    const promises = [];
    const funcResults = {};

    if (functionList && functionList.length > 0) {
      const formattedParams = Functions.formatFunctionParams(
          parsedValuePath, functionPath, timestamp, executedAt, params, value, transaction);
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
                CommonUtil.formatPath(parsedValuePath), value, CommonUtil.formatPath(functionPath),
                functionEntry.function_id, nativeFunction);
            if (FeatureFlags.enableRichFunctionLogging) {
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
                    valuePath: parsedValuePath,
                    functionPath,
                    params,
                    timestamp,
                    executedAt,
                    transaction,
                    auth: newAuth,
                    opResultList: [],
                    otherGasAmount: 0,
                  });
              funcResults[functionEntry.function_id] = result;
              if (FeatureFlags.enableRichFunctionLogging) {
                const formattedResult =
                    `  ==>| Execution result of NATIVE function [[ ${functionEntry.function_id} ]] ` +
                    `with call stack ${JSON.stringify(this.getFids())}:\n` +
                    `${JSON.stringify(result, null, 2)}`;
                if (result.code === FunctionResultCode.SUCCESS) {
                  logger.info(formattedResult);
                } else {
                  logger.error(formattedResult);
                }
              }
            } finally {
              // Always pops from the call stack.
              this.popCall();
              triggerCount++;
            }
          }
        } else if (functionEntry.function_type === FunctionTypes.REST) {
          if (functionEntry.event_listener &&
              functionEntry.event_listener in EventListenerWhitelist) {
            if (FeatureFlags.enableRichFunctionLogging) {
              logger.info(
                  `  ==> Triggering REST function [[ ${functionEntry.function_id} ]] of ` +
                  `event listener '${functionEntry.event_listener}' with:\n` +
                  formattedParams);
            }
            promises.push(axios.post(functionEntry.event_listener, {
              function: functionEntry,
              transaction,
            }, {
              timeout: REST_FUNCTION_CALL_TIMEOUT_MS
            }).catch((error) => {
              if (FeatureFlags.enableRichFunctionLogging) {
                logger.error(
                    `Failed to trigger REST function [[ ${functionEntry.function_id} ]] of ` +
                    `event listener '${functionEntry.event_listener}' with error: \n` +
                    `${JSON.stringify(error)}` +
                    formattedParams);
              }
              failCount++;
              return true;
            }));
            funcResults[functionEntry.function_id] = {
              code: FunctionResultCode.SUCCESS,
              bandwidth_gas_amount: GasFeeConstants.REST_FUNCTION_CALL_GAS_AMOUNT,
            };
            triggerCount++;
          }
        }
      }
    }
    const promiseResults = Promise.all(promises).then(() => {
      return {
        func_count: functionList ? functionList.length : 0,
        trigger_count: triggerCount,
        fail_count: failCount,
      };
    });
    return {
      func_results: funcResults,
      promise_results: promiseResults,
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
      parsedValuePath, functionPath, timestamp, executedAt, params, value, transaction) {
    return `valuePath: '${CommonUtil.formatPath(parsedValuePath)}', ` +
      `functionPath: '${CommonUtil.formatPath(functionPath)}', ` +
      `timestamp: '${timestamp}', executedAt: '${executedAt}', ` +
      `params: ${JSON.stringify(params, null, 2)}, ` +
      `value: '${JSON.stringify(value, null, 2)}', ` +
      `transaction: ${JSON.stringify(transaction, null, 2)}`;
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

  setValueOrLog(valuePath, value, context) {
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const auth = context.auth;
    const result = this.db.setValue(valuePath, value, auth, timestamp, transaction);
    if (CommonUtil.isFailedTx(result)) {
      logger.error(
          `  ==> Failed to setValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    Functions.addToOpResultList(valuePath, result, context);
    return result;
  }

  incValueOrLog(valuePath, delta, context) {
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const auth = context.auth;
    const result = this.db.incValue(valuePath, delta, auth, timestamp, transaction);
    if (CommonUtil.isFailedTx(result)) {
      logger.error(
          `  ==> Failed to incValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    Functions.addToOpResultList(valuePath, result, context);
    return result;
  }

  decValueOrLog(valuePath, delta, context) {
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const auth = context.auth;

    const result = this.db.decValue(valuePath, delta, auth, timestamp, transaction);
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
    const result = this.db.setOwner(ownerPath, owner, auth);
    if (CommonUtil.isFailedTx(result)) {
      logger.error(
          `  ==> Failed to setOwner on '${ownerPath}' with error: ${JSON.stringify(result)}`);
    }
    Functions.addToOpResultList(ownerPath, result, context);
    return result;
  }

  setRuleOrLog(rulePath, rule, context) {
    const auth = context.auth;
    const result = this.db.setRule(rulePath, rule, auth);
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

  saveAndReturnFuncResult(context, resultPath, code, extraGasAmount = 0) {
    const funcResultToSave = this.buildFuncResultToSave(context, code);
    this.setValueOrLog(resultPath, funcResultToSave, context);
    return this.returnFuncResult(context, code, extraGasAmount);
  }

  /**
   * Saves the transaction's hash to a sibling path.
   * e.g.) For tx's value path 'path/to/value', it saves the tx hash to 'path/to/.last_tx/value'.
   * This is often used for testing purposes.
   */
  _saveLastTx(value, context) {
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
    const parsedValuePath = context.valuePath;
    const result = this.setValueOrLog(CommonUtil.formatPath(parsedValuePath), 'erased', context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  /**
   * Sets owner config on the path.
   * This is often used for testing purposes.
   */
  _setOwnerConfig(value, context) {
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

  _transfer(value, context) {
    const from = context.params.from;
    const to = context.params.to;
    const key = context.params.key;
    const fromBalancePath = CommonUtil.getBalancePath(from);
    const toBalancePath = CommonUtil.getBalancePath(to);
    const resultPath = PathUtil.getTransferResultPath(from, to, key);
    let extraGasAmount = 0;
    const fromBalance = this.db.getValue(fromBalancePath);
    if (fromBalance === null || fromBalance < value) {
      return this.saveAndReturnFuncResult(
          context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    }
    const toBalance = this.db.getValue(toBalancePath);
    if (toBalance === null) {
      extraGasAmount = GasFeeConstants.ACCOUNT_REGISTRATION_GAS_AMOUNT;
    }
    const decResult = this.decValueOrLog(fromBalancePath, value, context);
    if (CommonUtil.isFailedTx(decResult)) {
      return this.saveAndReturnFuncResult(
          context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
    // TODO(liayoo): Remove the from entry, if it's a service account && if the new balance === 0.
    const incResult = this.incValueOrLog(toBalancePath, value, context);
    if (CommonUtil.isFailedTx(incResult)) {
      return this.saveAndReturnFuncResult(
          context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
    return this.saveAndReturnFuncResult(
        context, resultPath, FunctionResultCode.SUCCESS, extraGasAmount);
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
    if (!_.isEqual(sanitizedVal, rawVal, { strict: true })) {
      return { errorCode: FunctionResultCode.FAILURE };
    }
    return { sanitizedVal, errorCode: null };
  }

  _createApp(value, context) {
    const { isValidServiceName } = require('./state-util');
    const appName = context.params.app_name;
    const recordId = context.params.record_id;
    const resultPath = PathUtil.getCreateAppResultPath(appName, recordId);
    if (!isValidServiceName(appName)) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.INVALID_SERVICE_NAME);
    }
    const { sanitizedVal, errorCode } = this.sanitizeCreateAppConfig(value);
    if (errorCode) {
      return this.saveAndReturnFuncResult(context, resultPath, errorCode);
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
    const result = this.setValueOrLog(manageAppConfigPath, sanitizedVal, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.FAILURE);
    }
  }

  _collectFee(value, context) {
    const from = context.params.from;
    const blockNumber = context.params.block_number;
    const gasFeeServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE, blockNumber);
    const result =
        this.setServiceAccountTransferOrLog(from, gasFeeServiceAccountName, value.amount, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      logger.error(`  ===> _collectFee failed: ${JSON.stringify(result)}`);
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  _distributeFee(value, context) {
    const blockNumber = context.params.number;
    const gasCostTotal = value.gas_cost_total;
    const proposer = value.proposer;
    if (gasCostTotal <= 0) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const gasFeeServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE, blockNumber);
    const result = this.setServiceAccountTransferOrLog(
        gasFeeServiceAccountName, proposer, gasCostTotal, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      logger.error(`  ===> _distributeFee failed: ${JSON.stringify(result)}`);
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  _stake(value, context) {
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const stakingKey = context.params.staking_key;
    const recordId = context.params.record_id;
    const timestamp = context.timestamp;
    const executedAt = context.executedAt;
    const resultPath = PathUtil.getStakingStakeResultPath(serviceName, user, stakingKey, recordId);
    const expirationPath = PathUtil.getStakingExpirationPath(serviceName, user, stakingKey);
    const lockup = this.db.getValue(PathUtil.getStakingLockupDurationPath(serviceName));
    if (timestamp > executedAt) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.FAILURE);
    }
    if (value === 0) {
      // Just update the expiration time
      this.setValueOrLog(expirationPath, Number(timestamp) + Number(lockup), context);
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.SUCCESS);
    }
    const stakingServiceAccountName = CommonUtil.toServiceAccountName(
          PredefinedDbPaths.STAKING, serviceName, `${user}|${stakingKey}`);
    const result =
        this.setServiceAccountTransferOrLog(user, stakingServiceAccountName, value, context);
    if (!CommonUtil.isFailedTx(result)) {
      this.setValueOrLog(expirationPath, Number(timestamp) + Number(lockup), context);
      const balanceTotalPath = PathUtil.getStakingBalanceTotalPath(serviceName);
      this.incValueOrLog(balanceTotalPath, value, context);
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (result.code === 1001) {
      return this.saveAndReturnFuncResult(
          context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _unstake(value, context) {
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const stakingKey = context.params.staking_key;
    const recordId = context.params.record_id;
    const executedAt = context.executedAt;
    const resultPath =
        PathUtil.getStakingUnstakeResultPath(serviceName, user, stakingKey, recordId);
    const expireAt =
        this.db.getValue(PathUtil.getStakingExpirationPath(serviceName, user, stakingKey));
    if (expireAt > executedAt) {
      // Still in lock-up period.
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.IN_LOCKUP_PERIOD);
    }
    const stakingServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.STAKING, serviceName, `${user}|${stakingKey}`);
    const result = this.setServiceAccountTransferOrLog(
        stakingServiceAccountName, user, value, context);
    if (!CommonUtil.isFailedTx(result)) {
      const balanceTotalPath = PathUtil.getStakingBalanceTotalPath(serviceName);
      this.decValueOrLog(balanceTotalPath, value, context);
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (result.code === 1001) {
      return this.saveAndReturnFuncResult(
          context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _pay(value, context) {
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const paymentKey = context.params.payment_key;
    const recordId = context.params.record_id;
    const timestamp = context.timestamp;
    const executedAt = context.executedAt;
    const transaction = context.transaction;
    const resultPath =
        PathUtil.getPaymentPayRecordResultPath(serviceName, user, paymentKey, recordId);

    if (!this.validatePaymentRecord(transaction.address, value, timestamp, executedAt)) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.FAILURE);
    }

    const userServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, serviceName, `${user}|${paymentKey}`);
    const result = this.setServiceAccountTransferOrLog(
        transaction.address, userServiceAccountName, value.amount, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _claim(value, context) {
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const paymentKey = context.params.payment_key;
    const recordId = context.params.record_id;
    const timestamp = context.timestamp;
    const executedAt = context.executedAt;
    const transaction = context.transaction;
    const resultPath =
        PathUtil.getPaymentClaimRecordResultPath(serviceName, user, paymentKey, recordId);

    if (!this.validatePaymentRecord(transaction.address, value, timestamp, executedAt)) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.FAILURE);
    }

    let result;
    const userServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, serviceName, `${user}|${paymentKey}`);
    // NOTE: By specifying `escrow_key`, the claimed payment is held in escrow instead of being
    // transferred directly to the admin account.
    if (value.escrow_key !== undefined) {
      const escrowHoldPath = PathUtil.getEscrowHoldRecordPath(
          userServiceAccountName, value.target, value.escrow_key, timestamp);
      result = this.setValueOrLog(escrowHoldPath, { amount: value.amount }, context);
    } else {
      result = this.setServiceAccountTransferOrLog(
          userServiceAccountName, value.target, value.amount, context);
    }
    if (!CommonUtil.isFailedTx(result)) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  validatePaymentRecord(adminAddr, value, timestamp, executedAt) {
    if (!adminAddr) {
      return false;
    }
    if (!value || !value.amount || !CommonUtil.isNumber(value.amount)) {
      return false;
    }
    if (timestamp > executedAt) {
      return false;
    }
    return true;
  }

  _hold(value, context) {
    const sourceAccount = context.params.source_account;
    const targetAccount = context.params.target_account;
    const escrowKey = context.params.escrow_key;
    const recordId = context.params.record_id;
    const amount = _.get(value, 'amount');
    const resultPath =
        PathUtil.getEscrowHoldRecordResultPath(sourceAccount, targetAccount, escrowKey, recordId);
    if (!CommonUtil.isNumber(amount)) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.FAILURE);
    }
    const accountKey = CommonUtil.toEscrowAccountName(sourceAccount, targetAccount, escrowKey);
    const escrowServiceAccountName = CommonUtil.toServiceAccountName(
        PredefinedDbPaths.ESCROW, PredefinedDbPaths.ESCROW, accountKey);
    const result = this.setServiceAccountTransferOrLog(
        sourceAccount, escrowServiceAccountName, amount, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _release(value, context) {
    const sourceAccount = context.params.source_account;
    const targetAccount = context.params.target_account;
    const escrowKey = context.params.escrow_key;
    const recordId = context.params.record_id;
    const ratio = _.get(value, 'ratio');
    const resultPath = PathUtil.getEscrowReleaseRecordResultPath(
        sourceAccount, targetAccount, escrowKey, recordId);
    if (!CommonUtil.isNumber(ratio) || ratio < 0 || ratio > 1) {
      return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.FAILURE);
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
        return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
      }
    }
    let sourceResult = null;
    if (sourceAmount > 0) {
      sourceResult = this.setServiceAccountTransferOrLog(
          escrowServiceAccountName, sourceAccount, sourceAmount, context);
      if (CommonUtil.isFailedTx(sourceResult)) {
        // TODO(liayoo): Revert the release to target_account if there was any.
        return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
      }
    }
    return this.saveAndReturnFuncResult(context, resultPath, FunctionResultCode.SUCCESS);
  }

  _updateLatestShardReport(value, context) {
    const blockNumber = Number(context.params.block_number);
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
    if (currentLatestBlockNumber !== null && Number(currentLatestBlockNumber) >= blockNumber) {
      // Nothing to update
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const result = this.setValueOrLog(latestReportPath, blockNumber, context);
    if (!CommonUtil.isFailedTx(result)) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  // TODO(platfowner): Support refund feature.
  _openCheckin(value, context) {
    const parsedValuePath = context.valuePath;
    const payloadTx = _.get(value, 'payload', null);
    const txHash = CommonUtil.hashSignature(payloadTx.signature);
    if (!this.tp || !this.db.isNodeDb) {
      // It's not the backupDb
      logger.info(`  =>> Skip sending signed transaction to the parent blockchain: ${txHash}`);
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    if (!this.validateCheckinParams(context.params)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    if (!this.validateShardConfig()) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    if (!payloadTx || !payloadTx.tx_body || !payloadTx.signature) {
      logger.info('  =>> payloadTx is missing required fields');
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    const createdTx = Transaction.create(payloadTx.tx_body, payloadTx.signature);
    if (!createdTx ||
        !Transaction.verifyTransaction(createdTx) ||
        !this.isTransferTx(createdTx.tx_body.operation)) {
      logger.info('  =>> Invalid payloadTx');
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    // Forward payload tx to parent chain
    try {
      sendSignedTx(parentChainEndpoint, payloadTx)
      .then((result) => {
        if (!_.get(result, 'success', false) === true) {
          logger.info(
              `  =>> Failed to send signed transaction to the parent blockchain: ${txHash}`);
          return;
        }
        logger.info(
            `  =>> Successfully sent signed transaction to the parent blockchain: ${txHash}`);
        const shardingPath = this.db.getShardingPath();
        const action = {
          ref: PathUtil.getCheckinParentFinalizeResultPathFromValuePath(
              shardingPath, parsedValuePath, txHash),
          valueFunction: (success) => !!success,
          is_global: true,
          tx_body: payloadTx.tx_body,
        };
        this.tp.addRemoteTransaction(txHash, action);
      });
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } catch (err) {
      logger.error(`  => _openCheckin failed with error: ${err} ${err.stack}`);
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  _closeCheckin(value, context) {
    if (!this.tp || !this.db.isNodeDb) {
      // It's not the backupDb
      logger.info('  =>> Skip sending transfer transaction to the shard blockchain');
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    if (!this.validateCheckinParams(context.params)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    if (!this.validateShardConfig()) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    if (value !== true) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    // Transfer shard chain token from shard_owner to user_addr
    const user = context.params.user_addr;
    const checkinId = context.params.checkin_id;
    const parsedValuePath = context.valuePath;
    const checkinPayload =
        this.db.getValue(PathUtil.getCheckinPayloadPathFromValuePath(parsedValuePath));
    const checkinAmount = _.get(checkinPayload, 'tx_body.operation.value', 0);
    const tokenExchRate = GenesisSharding[ShardingProperties.TOKEN_EXCH_RATE];
    const tokenToReceive = checkinAmount * tokenExchRate;
    if (!this.validateCheckinAmount(tokenExchRate, checkinAmount, tokenToReceive)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    const shardOwner = GenesisSharding[ShardingProperties.SHARD_OWNER];
    const ownerPrivateKey = CommonUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);
    const shardingPath = this.db.shardingPath;
    const transferTx = {
      operation: {
        type: WriteDbOperations.SET_VALUE,
        ref: CommonUtil.formatPath([
          ...shardingPath,
          PredefinedDbPaths.TRANSFER,
          shardOwner,
          user,
          `checkin_${checkinId}`,
          PredefinedDbPaths.TRANSFER_VALUE
        ]),
        value: tokenToReceive,
        is_global: true
      },
      timestamp: Date.now(),
      nonce: -1
    };
    // Sign and send transferTx to the node itself
    const endpoint = `${this.tp.node.urlInternal}/json-rpc`;
    try {
      signAndSendTx(endpoint, transferTx, ownerPrivateKey);
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } catch (err) {
      logger.error(`  => _closeCheckin failed with error: ${err} ${err.stack}`);
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  updatePendingCheckout(user, amount, isIncrease, context) {
    if (isIncrease) {
      if (CommonUtil.isFailedTx(
          this.incValueOrLog(PathUtil.getCheckoutPendingAmountForAddrPath(user), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
      if (CommonUtil.isFailedTx(
          this.incValueOrLog(PathUtil.getCheckoutPendingAmountTotalPath(), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
    } else {
      if (CommonUtil.isFailedTx(
          this.decValueOrLog(PathUtil.getCheckoutPendingAmountForAddrPath(user), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
      if (CommonUtil.isFailedTx(
          this.decValueOrLog(PathUtil.getCheckoutPendingAmountTotalPath(), amount, context))) {
        return FunctionResultCode.INTERNAL_ERROR;
      }
    }
    return true;
  }

  updateCompleteCheckout(amount, timestamp, context) {
    const dayTimestamp = CommonUtil.getDayTimestamp(timestamp);
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
      return FunctionResultCode.FAILURE;
    }
    return true;
  }

  validateRecipient(recipient, tokenType) {
    switch (tokenType) {
      case 'AIN':
      case 'ETH':
        return CommonUtil.isCksumAddr(recipient) ? true : FunctionResultCode.FAILURE;
    }
    return FunctionResultCode.FAILURE;
  }

  validateCheckoutAmount(amount, timestamp, minCheckoutPerRequest, maxCheckoutPerRequest, maxCheckoutPerDay) {
    const pendingTotal = this.db.getValue(PathUtil.getCheckoutPendingAmountTotalPath()) || 0; // includes 'amount'
    const checkoutCompleteToday = this.db.getValue(
        PathUtil.getCheckoutCompleteAmountDailyPath(CommonUtil.getDayTimestamp(timestamp))) || 0;
    if (amount < minCheckoutPerRequest || amount > maxCheckoutPerRequest) {
      return FunctionResultCode.FAILURE;
    }
    if (pendingTotal + checkoutCompleteToday > maxCheckoutPerDay) {
      return FunctionResultCode.FAILURE;
    }
    return true;
  }

  _openCheckout(value, context) {
    if (value === null) {
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    }
    const user = context.params.user_addr;
    const { amount, type, token_id: tokenId, recipient } = value;
    // Increase pending amounts
    const incPendingResultCode = this.updatePendingCheckout(user, amount, true, context);
    if (incPendingResultCode !== true) {
      return this.returnFuncResult(context, incPendingResultCode);
    }
    const {
      [TokenBridgeProperties.TOKEN_POOL]: tokenPool,
      [TokenBridgeProperties.MIN_CHECKOUT_PER_REQUEST]: minCheckoutPerRequest,
      [TokenBridgeProperties.MAX_CHECKOUT_PER_REQUEST]: maxCheckoutPerRequest,
      [TokenBridgeProperties.MAX_CHECKOUT_PER_DAY]: maxCheckoutPerDay,
      [TokenBridgeProperties.TOKEN_EXCH_RATE]: tokenExchangeRate,
      [TokenBridgeProperties.TOKEN_EXCH_SCHEME]: tokenExchangeScheme,
    } = this.db.getValue(PathUtil.getTokenBridgeConfigPath(type, tokenId));
    // Perform checks
    const tokenBridgeValidated = this.validateTokenBridgeConfig(
        tokenPool, minCheckoutPerRequest, maxCheckoutPerRequest, maxCheckoutPerDay,
        tokenExchangeRate, tokenExchangeScheme);
    if (tokenBridgeValidated !== true) {
      return this.returnFuncResult(context, tokenBridgeValidated);
    }
    const recipientValidated = this.validateRecipient(recipient, type);
    if (recipientValidated !== true) {
      return this.returnFuncResult(context, recipientValidated);
    }
    const amountValidated = this.validateCheckoutAmount(
        amount, context.timestamp, minCheckoutPerRequest, maxCheckoutPerRequest, maxCheckoutPerDay);
    if (amountValidated !== true) {
      return this.returnFuncResult(context, amountValidated);
    }
    // Transfer from user to token_pool
    const transferRes = this.setServiceAccountTransferOrLog(user, tokenPool, amount, context);
    if (!CommonUtil.isFailedTx(transferRes)) {
      // NOTE(liayoo): History will be recorded by a checkout server after processing the request.
      return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
    } else {
      logger.error(`  ===> _openCheckout failed: ${JSON.stringify(transferRes)}`);
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
  }

  _closeCheckout(value, context) {
    const user = context.params.user_addr;
    const checkoutId = context.params.checkout_id;
    const { request, response } = value;
    if (response.status === FunctionResultCode.FAILURE) {
      // Refund
      const tokenPool = this.db.getValue(PathUtil.getTokenBridgeTokenPoolPath(request.type, request.token_id));
      const transferRes = this.setServiceAccountTransferOrLog(tokenPool, user, request.amount, context);
      if (CommonUtil.isFailedTx(transferRes)) {
        return this.returnFuncResult(context, FunctionResultCode.FAILURE);
      }
      const setRefundRes = this.setValueOrLog(
            PathUtil.getCheckoutHistoryRefundPath(user, checkoutId),
            PathUtil.getTransferPath(tokenPool, user, context.timestamp), context);
      if (CommonUtil.isFailedTx(setRefundRes)) {
        return this.returnFuncResult(context, FunctionResultCode.FAILURE);
      }
    } else if (response.status === FunctionResultCode.SUCCESS) {
      // Increase complete amounts
      const updateStatsResultCode = this.updateCompleteCheckout(request.amount, context.timestamp, context);
      if (updateStatsResultCode !== true) {
        return this.returnFuncResult(context, updateStatsResultCode);
      }
    }
    // Remove the original request
    const removeRes = this.setValueOrLog(PathUtil.getCheckoutRequestPath(user, checkoutId), null, context);
    if (CommonUtil.isFailedTx(removeRes)) {
      return this.returnFuncResult(context, FunctionResultCode.FAILURE);
    }
    // Decrease pending amounts
    const decPendingResultCode = this.updatePendingCheckout(user, request.amount, false, context);
    if (decPendingResultCode !== true) {
      return this.returnFuncResult(context, decPendingResultCode);
    }
    return this.returnFuncResult(context, FunctionResultCode.SUCCESS);
  }

  validateCheckinParams(params) {
    const user = params.user_addr;
    const checkInId = params.checkin_id;
    if (!user || !CommonUtil.isCksumAddr(user)) {
      logger.debug('  =>> Invalid user_addr param');
      return false;
    }
    if (checkInId == null) {
      logger.debug('  =>> Invalid checkin_id param');
      return false;
    }
    return true;
  }

  validateShardConfig() {
    if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] === ShardingProtocols.NONE) {
      logger.debug('  =>> Not a shard');
      return false;
    }
    if (GenesisSharding[ShardingProperties.TOKEN_EXCH_SCHEME] !== TokenExchangeSchemes.FIXED) {
      logger.debug('  =>> Unsupported token exchange scheme');
      return false;
    }
    return true;
  }

  validateCheckinAmount(tokenExchRate, checkinAmount, tokenToReceive) {
    if (!CommonUtil.isNumber(tokenExchRate) || tokenExchRate <= 0 || checkinAmount <= 0 ||
        tokenToReceive <= 0) {
      logger.debug('  =>> Invalid exchange rate or checkin amount');
      return false;
    }
    // tokenToReceive = tokenExchRate * checkinAmount
    if (tokenExchRate !== tokenToReceive / checkinAmount ||
        checkinAmount !== tokenToReceive / tokenExchRate) {
      logger.debug('  =>> Number overflow');
      return false;
    }
    return true;
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
