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
  TokenExchangeSchemes,
  FunctionProperties,
  GasFeeConstants,
  ExecResultProperties,
  REST_FUNCTION_CALL_TIMEOUT_MS,
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const PathUtil = require('../common/path-util');
const {
  sendSignedTx,
  signAndSendTx
} = require('../p2p/util');
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
// NOTE(platfowner): execGasAmount means the amount of gas required to execute the function, which
//                   reflects the number of database write operations and external RPC calls.
class Functions {
  constructor(db, tp) {
    this.db = db;
    this.tp = tp;
    this.nativeFunctionMap = {
      [NativeFunctionIds.CLAIM]: {
        func: this._claim.bind(this), ownerOnly: true, execGasAmount: 2 },
      [NativeFunctionIds.CLOSE_CHECKIN]: {
        func: this._closeCheckin.bind(this), ownerOnly: true, execGasAmount: 11 },
      [NativeFunctionIds.COLLECT_FEE]: {
        func: this._collectFee.bind(this), ownerOnly: true, execGasAmount: 0 },
      [NativeFunctionIds.CREATE_APP]: {
        func: this._createApp.bind(this), ownerOnly: true, execGasAmount: 2 },
      [NativeFunctionIds.DISTRIBUTE_FEE]: {
        func: this._distributeFee.bind(this), ownerOnly: true, execGasAmount: 0 },
      [NativeFunctionIds.ERASE_VALUE]: {
        func: this._eraseValue.bind(this), ownerOnly: false, execGasAmount: 1 },
      [NativeFunctionIds.HOLD]: {
        func: this._hold.bind(this), ownerOnly: true, execGasAmount: 2 },
      [NativeFunctionIds.OPEN_CHECKIN]: {
        func: this._openCheckin.bind(this), ownerOnly: true, execGasAmount: 62 },
      [NativeFunctionIds.PAY]: {
        func: this._pay.bind(this), ownerOnly: true, execGasAmount: 2 },
      [NativeFunctionIds.RELEASE]: {
        func: this._release.bind(this), ownerOnly: true, execGasAmount: 3 },
      [NativeFunctionIds.SAVE_LAST_TX]: {
        func: this._saveLastTx.bind(this), ownerOnly: false, execGasAmount: 1 },
      [NativeFunctionIds.STAKE]: {
        func: this._stake.bind(this), ownerOnly: true, execGasAmount: 4 },
      [NativeFunctionIds.UNSTAKE]: {
        func: this._unstake.bind(this), ownerOnly: true, execGasAmount: 3 },
      [NativeFunctionIds.TRANSFER]: {
        func: this._transfer.bind(this), ownerOnly: true, execGasAmount: 2 },
      [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: {
        func: this._updateLatestShardReport.bind(this), ownerOnly: false, execGasAmount: 2 },
    };
    this.callStack = [];
    this.functionGasAmount = {};
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
  // TODO(platfowner): Add account registration gas amount.
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

    if (this.callStackSize() === 0) {
      this.clearFunctionGasAmount();
    }
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
                ChainUtil.formatPath(parsedValuePath), value, ChainUtil.formatPath(functionPath),
                functionEntry.function_id, nativeFunction);
            if (FeatureFlags.enableRichFunctionLogging) {
              logger.info(
                  `  ==> Triggering NATIVE function [[ ${functionEntry.function_id} ]] ` +
                  `with call stack ${JSON.stringify(this.getFids())} and params:\n` +
                  formattedParams);
              logger.info(
                  `    functionGasAmount: ${JSON.stringify(this.getFunctionGasAmount())} ` +
                  `with pushed call: ${JSON.stringify(this.getTopCall(), null, 2)}\n`);
            }
            const newAuth = Object.assign(
                {}, auth, { fid: functionEntry.function_id, fids: this.getFids() });
            let funcResult = null;
            try {
              funcResult = nativeFunction.func(
                  value,
                  {
                    valuePath: parsedValuePath,
                    functionPath,
                    params,
                    timestamp,
                    executedAt,
                    transaction,
                    auth: newAuth,
                    opResultList: [],
                  });
            } finally {
              funcResults[functionEntry.function_id] = funcResult;
              // Always pops from the call stack.
              const call = this.popCall();
              if (FeatureFlags.enableRichFunctionLogging) {
                if (call.result) {
                  const formattedResult =
                      `  ==>| Execution result of NATIVE function [[ ${functionEntry.function_id} ]] ` +
                      `with call stack ${JSON.stringify(this.getFids())}:\n` +
                      `${JSON.stringify(call.result, null, 2)}`;
                  if (_.get(call, 'result.code') === FunctionResultCode.SUCCESS) {
                    logger.info(formattedResult);
                  } else {
                    logger.error(formattedResult);
                  }
                  logger.info(
                      `    functionGasAmount: ${JSON.stringify(this.getFunctionGasAmount())} ` +
                      `with popped call: ${JSON.stringify(call, null, 2)}\n`);
                }
              }
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
              logger.info(
                  `    functionGasAmount: ${JSON.stringify(this.getFunctionGasAmount())} ` +
                  `before adding REST function: ${functionEntry.function_id}\n`);
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
            this.addToFunctionGasAmount({
              service: GasFeeConstants.REST_FUNCTION_CALL_GAS_AMOUNT,
            });
            if (FeatureFlags.enableRichFunctionLogging) {
              logger.info(
                  `    functionGasAmount: ${JSON.stringify(this.getFunctionGasAmount())} ` +
                  `after adding REST function: ${functionEntry.function_id}\n`);
            }
            triggerCount++;
          }
        }
      }
    }
    Promise.all(promises)
        .then(() => {
          return {
            functionCount: functionList ? functionList.length : 0,
            triggerCount,
            failCount,
          };
        });
    return funcResults;
  }

  pushCall(valuePath, value, functionPath, fid, nativeFunction) {
    const topCall = this.getTopCall();
    const fidList = topCall ? Array.from(topCall.fidList) : [];
    fidList.push(fid);
    const callDepth = this.callStackSize();
    const gasAmount = {
      service: nativeFunction.execGasAmount
    };
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
    const call = this.callStack.pop();
    this.addToFunctionGasAmount(call.gasAmount);
    return call;
  }

  getTopCall() {
    const size = this.callStackSize();
    if (size > 0) {
      return this.callStack[size - 1];
    }
    return null;
  }

  setCallResult(result) {
    const call = this.getTopCall();
    if (call) {
      call.result = result;
    }
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

  getFunctionGasAmount() {
    return this.functionGasAmount;
  }

  clearFunctionGasAmount() {
    this.functionGasAmount = {};
  }

  addToFunctionGasAmount(amount) {
    ChainUtil.mergeNumericJsObjects(this.functionGasAmount, amount);
  }

  static getOpResultList(context) {
    return JSON.parse(JSON.stringify(context.opResultList));
  }

  static addToOpResultList(path, result, context) {
    context.opResultList.push({
      [ExecResultProperties.PATH]: path,
      [ExecResultProperties.RESULT]: result,
    });
  }

  static formatFunctionParams(
      parsedValuePath, functionPath, timestamp, executedAt, params, value, transaction) {
    return `valuePath: '${ChainUtil.formatPath(parsedValuePath)}', ` +
      `functionPath: '${ChainUtil.formatPath(functionPath)}', ` +
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
    if (!ChainUtil.isDict(obj) || ChainUtil.isEmpty(obj)) {
      return null;
    }

    for (const key in obj) {
      const childObj = obj[key];
      if (key === FunctionProperties.FUNCTION) {
        if (ChainUtil.isDict(childObj) && !ChainUtil.isEmpty(childObj)) {
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

  /**
   * Returns a new function created by applying the function change to the current function.
   *
   * @param {Object} curFunction current function (to be modified and returned by this function)
   * @param {Object} functionChange function change
   */
  static applyFunctionChange(curFunction, functionChange) {
    if (curFunction === null) {
      // Just write the function change.
      return functionChange;
    }
    if (functionChange === null) {
      // Just delete the existing value.
      return null;
    }
    const funcChangeMap = ChainUtil.getJsObject(functionChange, [FunctionProperties.FUNCTION]);
    if (!funcChangeMap || Object.keys(funcChangeMap).length === 0) {
      return curFunction;
    }
    const newFunction =
        ChainUtil.isDict(curFunction) ? JSON.parse(JSON.stringify(curFunction)) : {};
    let newFuncMap = ChainUtil.getJsObject(newFunction, [FunctionProperties.FUNCTION]);
    if (!newFuncMap || !ChainUtil.isDict(newFunction)) {
      // Add a place holder.
      ChainUtil.setJsObject(newFunction, [FunctionProperties.FUNCTION], {});
      newFuncMap = ChainUtil.getJsObject(newFunction, [FunctionProperties.FUNCTION]);
    }
    for (const functionKey in funcChangeMap) {
      const functionValue = funcChangeMap[functionKey];
      if (functionValue === null) {
        delete newFuncMap[functionKey];
      } else {
        newFuncMap[functionKey] = functionValue;
      }
    }

    return newFunction;
  }

  static convertPathVars2Params(pathVars) {
    const params = {};
    if (ChainUtil.isDict(pathVars)) {
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
    if (ChainUtil.isFailedTx(result)) {
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
    if (ChainUtil.isFailedTx(result)) {
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
    if (ChainUtil.isFailedTx(result)) {
      logger.error(
          `  ==> Failed to decValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    Functions.addToOpResultList(valuePath, result, context);
    return result;
  }

  buildExecutionResult(context, code) {
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

  setExecutionResult(context, code) {
    const opResultList = Functions.getOpResultList(context);
    const execResultToReturn = { code };
    if (!ChainUtil.isEmpty(opResultList)) {
      execResultToReturn[ExecResultProperties.OP_RESULTS] = opResultList;
    }
    this.setCallResult(execResultToReturn);
    return execResultToReturn;
  }

  saveAndSetExecutionResult(context, resultPath, code) {
    const execResultToSave = this.buildExecutionResult(context, code);
    this.setValueOrLog(resultPath, execResultToSave, context);
    return this.setExecutionResult(context, code);
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

  /**
   * Saves the transaction's hash to a sibling path.
   * e.g.) For tx's value path 'path/to/value', it saves the tx hash to 'path/to/.last_tx/value'
   */
  _saveLastTx(value, context) {
    const transaction = context.transaction;

    const parsedValuePath = context.valuePath;
    if (parsedValuePath.length === 0) {
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    }
    const lastTxPath = parsedValuePath.slice();
    // Insert '.last_tx' label just before the last label in the path.
    const lastLabel = lastTxPath.pop();
    lastTxPath.push(PredefinedDbPaths.SAVE_LAST_TX_LAST_TX);
    lastTxPath.push(lastLabel);
    const result = this.setValueOrLog(
        ChainUtil.formatPath(lastTxPath), { tx_hash: transaction.hash }, context);
    if (!ChainUtil.isFailedTx(result)) {
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
  }

  /**
   * Erases the value.
   */
  _eraseValue(value, context) {
    const parsedValuePath = context.valuePath;
    const result = this.setValueOrLog(ChainUtil.formatPath(parsedValuePath), 'erased', context);
    if (!ChainUtil.isFailedTx(result)) {
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
  }


  _transfer(value, context) {
    const from = context.params.from;
    const to = context.params.to;
    const key = context.params.key;
    const fromBalancePath = ChainUtil.getBalancePath(from);
    const toBalancePath = ChainUtil.getBalancePath(to);
    const resultPath = PathUtil.getTransferResultPath(from, to, key);
    const result = this.transferInternal(fromBalancePath, toBalancePath, value, context);
    if (!ChainUtil.isFailedTx(result)) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (result.code === 1001) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _createApp(value, context) {
    const appName = context.params.app_name;
    const recordId = context.params.record_id;
    const resultPath = PathUtil.getCreateAppResultPath(appName, recordId);
    const sanitizedVal = {};
    const adminConfig = value[PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN];
    const billingConfig = _.get(value, PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING);
    const serviceConfig = _.get(value, PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE);
    if (!ChainUtil.isDict(adminConfig)) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
    }
    if (adminConfig) {
      sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN] = adminConfig;
    }
    if (billingConfig) {
      sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING] = billingConfig;
    }
    if (serviceConfig) {
      sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE] = serviceConfig;
    }
    const manageAppConfigPath = PathUtil.getManageAppConfigPath(appName);
    const result = this.setValueOrLog(manageAppConfigPath, sanitizedVal, context);
    if (!ChainUtil.isFailedTx(result)) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
    }
  }

  _collectFee(value, context) {
    const from = context.params.from;
    const blockNumber = context.params.block_number;
    const gasFeeServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE, blockNumber);
    const result =
        this.setServiceAccountTransferOrLog(from, gasFeeServiceAccountName, value.amount, context);
    if (!ChainUtil.isFailedTx(result)) {
      logger.error(`  ===> _collectFee failed: ${JSON.stringify(result)}`);
      // TODO(lia): return error, check in setValue(), revert changes
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
  }

  _distributeFee(value, context) {
    const blockNumber = context.params.number;
    const gasCostTotal = value.gas_cost_total;
    const proposer = value.proposer;
    if (gasCostTotal <= 0) {
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    }
    const gasFeeServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE, blockNumber);
    const result = this.setServiceAccountTransferOrLog(
        gasFeeServiceAccountName, proposer, gasCostTotal, context);
    if (!ChainUtil.isFailedTx(result)) {
      logger.error(`  ===> _distributeFee failed: ${JSON.stringify(result)}`);
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
  }

  _stake(value, context) {
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const stakingKey = context.params.staking_key;
    const recordId = context.params.record_id;
    const timestamp = context.timestamp;
    const executedAt = context.executedAt;
    const transaction = context.transaction;
    const auth = context.auth;
    const resultPath = PathUtil.getStakingStakeResultPath(serviceName, user, stakingKey, recordId);
    const expirationPath = PathUtil.getStakingExpirationPath(serviceName, user, stakingKey);
    const lockup = this.db.getValue(PathUtil.getStakingLockupDurationPath(serviceName));
    if (timestamp > executedAt) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
    }
    if (value === 0) {
      // Just update the expiration time
      this.setValueOrLog(expirationPath, Number(timestamp) + Number(lockup), context);
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    }
    const stakingServiceAccountName = ChainUtil.toServiceAccountName(
          PredefinedDbPaths.STAKING, serviceName, `${user}|${stakingKey}`);
    const result =
        this.setServiceAccountTransferOrLog(user, stakingServiceAccountName, value, context);
    if (!ChainUtil.isFailedTx(result)) {
      this.setValueOrLog(expirationPath, Number(timestamp) + Number(lockup), context);
      const balanceTotalPath = PathUtil.getStakingBalanceTotalPath(serviceName);
      this.incValueOrLog(balanceTotalPath, value, context);
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (result.code === 1001) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _unstake(value, context) {
    const serviceName = context.params.service_name;
    const user = context.params.user_addr;
    const stakingKey = context.params.staking_key;
    const recordId = context.params.record_id;
    const timestamp = context.timestamp;
    const executedAt = context.executedAt;
    const transaction = context.transaction;
    const auth = context.auth;
    const resultPath = PathUtil.getStakingUnstakeResultPath(serviceName, user, stakingKey, recordId);
    const expireAt = this.db.getValue(PathUtil.getStakingExpirationPath(serviceName, user, stakingKey));
    if (expireAt > executedAt) {
      // Still in lock-up period.
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.IN_LOCKUP_PERIOD);
    }
    const stakingServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.STAKING, serviceName, `${user}|${stakingKey}`);
    const result = this.setServiceAccountTransferOrLog(
        stakingServiceAccountName, user, value, context);
    if (!ChainUtil.isFailedTx(result)) {
      const balanceTotalPath = PathUtil.getStakingBalanceTotalPath(serviceName);
      this.decValueOrLog(balanceTotalPath, value, context);
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (result.code === 1001) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
    const auth = context.auth;
    const resultPath = PathUtil.getPaymentPayRecordResultPath(serviceName, user, paymentKey, recordId);

    if (!this.validatePaymentRecord(transaction.address, value, timestamp, executedAt)) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
    }

    const userServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, serviceName, `${user}|${paymentKey}`);
    const result = this.setServiceAccountTransferOrLog(
        transaction.address, userServiceAccountName, value.amount, context);
    if (!ChainUtil.isFailedTx(result)) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
    const resultPath = PathUtil.getPaymentClaimRecordResultPath(serviceName, user, paymentKey, recordId);

    if (!this.validatePaymentRecord(transaction.address, value, timestamp, executedAt)) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
    }

    let result;
    const userServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, serviceName, `${user}|${paymentKey}`);
    // NOTE: By specifying `escrow_key`, the claimed payment is held in escrow instead of being
    // transferred directly to the admin account
    if (value.escrow_key !== undefined) {
      const escrowHoldPath = PathUtil.getEscrowHoldRecordPath(
          userServiceAccountName, value.target, value.escrow_key, timestamp);
      result = this.setValueOrLog(escrowHoldPath, { amount: value.amount }, context);
    } else {
      result = this.setServiceAccountTransferOrLog(
          userServiceAccountName, value.target, value.amount, context);
    }
    if (!ChainUtil.isFailedTx(result)) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  validatePaymentRecord(adminAddr, value, timestamp, executedAt) {
    if (!adminAddr) {
      return false;
    }
    if (!value || !value.amount || !ChainUtil.isNumber(value.amount)) {
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
    const { transaction, timestamp, auth } = context;
    const amount = _.get(value, 'amount');
    const resultPath = PathUtil.getEscrowHoldRecordResultPath(sourceAccount, targetAccount, escrowKey, recordId);
    if (!ChainUtil.isNumber(amount)) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
    }
    const accountKey = ChainUtil.toEscrowAccountName(sourceAccount, targetAccount, escrowKey);
    const escrowServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.ESCROW, PredefinedDbPaths.ESCROW, accountKey);
    const result = this.setServiceAccountTransferOrLog(
        sourceAccount, escrowServiceAccountName, amount, context);
    if (!ChainUtil.isFailedTx(result)) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _release(value, context) {
    const sourceAccount = context.params.source_account;
    const targetAccount = context.params.target_account;
    const escrowKey = context.params.escrow_key;
    const recordId = context.params.record_id;
    const { transaction, timestamp, auth } = context;
    const ratio = _.get(value, 'ratio');
    const resultPath = PathUtil.getEscrowReleaseRecordResultPath(sourceAccount, targetAccount, escrowKey, recordId);
    if (!ChainUtil.isNumber(ratio) || ratio < 0 || ratio > 1) {
      return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
    }
    const accountKey = ChainUtil.toEscrowAccountName(sourceAccount, targetAccount, escrowKey);
    const escrowServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.ESCROW, PredefinedDbPaths.ESCROW, accountKey);
    const serviceAccountBalancePath = PathUtil.getServiceAccountBalancePathFromAccountName(escrowServiceAccountName);
    const escrowAmount = this.db.getValue(serviceAccountBalancePath);
    const targetAmount = escrowAmount * ratio;
    const sourceAmount = escrowAmount - targetAmount;
    logger.debug(`  =>> escrowAmount: ${escrowAmount}, ratio: ${ratio}, ` +
        `targetAmount: ${targetAmount}, sourceAmount: ${sourceAmount}`);
    if (targetAmount > 0) {
      const result = this.setServiceAccountTransferOrLog(
          escrowServiceAccountName, targetAccount, targetAmount, context);
      if (ChainUtil.isFailedTx(result)) {
        return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
      }
    }
    if (sourceAmount > 0) {
      const result = this.setServiceAccountTransferOrLog(
          escrowServiceAccountName, sourceAccount, sourceAmount, context);
      if (ChainUtil.isFailedTx(result)) {
        // TODO(lia): revert the release to target_account if there was any
        return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
      }
    }
    return this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
  }

  _updateLatestShardReport(value, context) {
    const blockNumber = Number(context.params.block_number);
    const parsedValuePath = context.valuePath;
    if (!ChainUtil.isArray(context.functionPath)) {
      return false;
    }
    if (!ChainUtil.isString(value)) {
      // Removing old report or invalid reporting
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    }
    const latestReportPath = PathUtil.getLatestShardReportPathFromValuePath(parsedValuePath);
    const currentLatestBlockNumber = this.db.getValue(latestReportPath);
    if (currentLatestBlockNumber !== null && Number(currentLatestBlockNumber) >= blockNumber) {
      // Nothing to update
      return false;
    }
    const result = this.setValueOrLog(latestReportPath, blockNumber, context);
    if (!ChainUtil.isFailedTx(result)) {
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    } else {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
  }

  // TODO(platfowner): Support refund feature.
  _openCheckin(value, context) {
    const parsedValuePath = context.valuePath;
    const payloadTx = _.get(value, 'payload', null);
    const txHash = ChainUtil.hashSignature(payloadTx.signature);
    if (!this.tp || !this.db.isNodeDb) {
      // It's not the backupDb
      logger.info(`  =>> Skip sending signed transaction to the parent blockchain: ${txHash}`);
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    }
    if (!this.validateCheckinParams(context.params)) {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
    if (!this.validateShardConfig()) {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
    if (!payloadTx || !payloadTx.tx_body || !payloadTx.signature) {
      logger.info('  =>> payloadTx is missing required fields');
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
    const createdTx = Transaction.create(payloadTx.tx_body, payloadTx.signature);
    if (!createdTx ||
        !Transaction.verifyTransaction(createdTx) ||
        !this.isTransferTx(createdTx.tx_body.operation)) {
      logger.info('  =>> Invalid payloadTx');
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
    // Forward payload tx to parent chain
    try {
      sendSignedTx(parentChainEndpoint, payloadTx)
      .then((result) => {
        if (!_.get(result, 'success', false) === true) {
          logger.info(`  =>> Failed to send signed transaction to the parent blockchain: ${txHash}`);
          return;
        }
        logger.info(`  =>> Successfully sent signed transaction to the parent blockchain: ${txHash}`);
        const shardingPath = this.db.getShardingPath();
        const action = {
          ref: PathUtil.getCheckinParentFinalizeResultPathFromValuePath(shardingPath, parsedValuePath, txHash),
          valueFunction: (success) => !!success,
          is_global: true,
          tx_body: payloadTx.tx_body,
        };
        this.tp.addRemoteTransaction(txHash, action);
      });
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    } catch (err) {
      logger.error(`  => _openCheckin failed with error: ${JSON.stringify(err)}`);
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
  }

  _closeCheckin(value, context) {
    if (!this.tp || !this.db.isNodeDb) {
      // It's not the backupDb
      logger.info('  =>> Skip sending transfer transaction to the shard blockchain');
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    }
    if (!this.validateCheckinParams(context.params)) {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
    if (!this.validateShardConfig()) {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
    if (value !== true) {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
    // Transfer shard chain token from shard_owner to user_addr
    const user = context.params.user_addr;
    const checkinId = context.params.checkin_id;
    const parsedValuePath = context.valuePath;
    const checkinPayload = this.db.getValue(PathUtil.getCheckinPayloadPathFromValuePath(parsedValuePath));
    const checkinAmount = _.get(checkinPayload, 'tx_body.operation.value', 0);
    const tokenExchRate = GenesisSharding[ShardingProperties.TOKEN_EXCH_RATE];
    const tokenToReceive = checkinAmount * tokenExchRate;
    if (!this.validateCheckinAmount(tokenExchRate, checkinAmount, tokenToReceive)) {
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
    const shardOwner = GenesisSharding[ShardingProperties.SHARD_OWNER];
    const ownerPrivateKey = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);
    const shardingPath = this.db.shardingPath;
    const transferTx = {
      operation: {
        type: WriteDbOperations.SET_VALUE,
        ref: ChainUtil.formatPath([
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
      return this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    } catch (err) {
      logger.error(`  => _closeCheckin failed with error: ${JSON.stringify(err)}`);
      return this.setExecutionResult(context, FunctionResultCode.FAILURE);
    }
  }

  validateCheckinParams(params) {
    const user = params.user_addr;
    const checkInId = params.checkin_id;
    if (!user || !ChainUtil.isCksumAddr(user)) {
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
    if (!ChainUtil.isNumber(tokenExchRate) || tokenExchRate <= 0 || checkinAmount <= 0 ||
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
    const parsedPath = ChainUtil.parsePath(txOp.ref);
    return parsedPath.length && parsedPath[0] === PredefinedDbPaths.TRANSFER;
  }

  transferInternal(fromPath, toPath, value, context) {
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const auth = context.auth;

    const fromBalance = this.db.getValue(fromPath);
    if (fromBalance === null || fromBalance < value) {
      return ChainUtil.returnTxResult(1001, `Insufficient balance: ${fromBalance}`);
    }
    const toBalance = this.db.getValue(toPath);
    if (toBalance === null) {
      this.addToFunctionGasAmount({
        service: GasFeeConstants.ACCOUNT_REGISTRATION_GAS_AMOUNT
      });
    }
    const decResult = this.decValueOrLog(fromPath, value, context);
    if (ChainUtil.isFailedTx(decResult)) {
      return decResult;
    }
    // TODO(lia): remove the from entry, if it's a service account && if the new balance === 0
    const incResult = this.incValueOrLog(toPath, value, context);
    if (ChainUtil.isFailedTx(incResult)) {
      return incResult;
    }
    return ChainUtil.returnTxResult(0);
  }
}

module.exports = Functions;
