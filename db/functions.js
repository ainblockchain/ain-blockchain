const logger = require('../logger')('FUNCTIONS');
const axios = require('axios');
const _ = require('lodash');
const {
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
  FeatureFlags,
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const PathUtil = require('./path-util');
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
class Functions {
  constructor(db, tp) {
    this.db = db;
    this.tp = tp;
    this.nativeFunctionMap = {
      [NativeFunctionIds.CLAIM]: {
        func: this._claim.bind(this), ownerOnly: true },
      [NativeFunctionIds.CLOSE_CHECKIN]: {
        func: this._closeCheckin.bind(this), ownerOnly: true },
      [NativeFunctionIds.CREATE_APP]: {
        func: this._createApp.bind(this), ownerOnly: true },
      [NativeFunctionIds.HOLD]: {
        func: this._hold.bind(this), ownerOnly: true },
      [NativeFunctionIds.OPEN_CHECKIN]: {
        func: this._openCheckin.bind(this), ownerOnly: true },
      [NativeFunctionIds.OPEN_ESCROW]: {
        func: this._openEscrow.bind(this), ownerOnly: true },
      [NativeFunctionIds.PAY]: {
        func: this._pay.bind(this), ownerOnly: true },
      [NativeFunctionIds.RELEASE]: {
        func: this._release.bind(this), ownerOnly: true },
      [NativeFunctionIds.SAVE_LAST_TX]: {
        func: this._saveLastTx.bind(this), ownerOnly: false },
      [NativeFunctionIds.STAKE]: {
        func: this._stake.bind(this), ownerOnly: true },
      [NativeFunctionIds.UNSTAKE]: {
        func: this._unstake.bind(this), ownerOnly: true },
      [NativeFunctionIds.TRANSFER]: {
        func: this._transfer.bind(this), ownerOnly: true },
      [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: {
        func: this._updateLatestShardReport.bind(this), ownerOnly: false },
    };
    this.callStack= [];
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
  // NOTE(seo): Validity checks on individual addresses are done by .write rules.
  // TODO(seo): Trigger subtree functions.
  triggerFunctions(parsedValuePath, value, auth, timestamp, transaction) {
    // NOTE(seo): It is assumed that the given transaction is in an executable form.
    const executedAt = transaction.extra.executed_at;
    const matched = this.db.matchFunctionForParsedPath(parsedValuePath);
    const functionPath = matched.matchedFunction.path;
    const functionMap = matched.matchedFunction.config;
    const functionList = Functions.getFunctionList(functionMap);
    const params = Functions.convertPathVars2Params(matched.pathVars);
    let triggerCount = 0;
    let failCount = 0;
    const promises = [];
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
            continue;  // Skips function.
          }
          const nativeFunction = this.nativeFunctionMap[functionEntry.function_id];
          if (nativeFunction) {
            // Execute the matched native function.
            if (FeatureFlags.enableRichFunctionLogging) {
              logger.info(
                  `  ==> Triggering NATIVE function [[ ${functionEntry.function_id} ]] ` +
                  `with call stack ${JSON.stringify(this.getFids())} and params:\n` +
                  formattedParams);
            }
            this.pushCall(
                ChainUtil.formatPath(parsedValuePath), value, ChainUtil.formatPath(functionPath),
                functionEntry.function_id);
            const newAuth = Object.assign(
                {}, auth, { fid: functionEntry.function_id, fids: this.getFids() });
            try {
              nativeFunction.func(
                  value,
                  {
                    valuePath: parsedValuePath,
                    functionPath,
                    params,
                    timestamp,
                    executedAt,
                    transaction,
                    auth: newAuth,
                  });
            } finally {
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
            }
            promises.push(axios.post(functionEntry.event_listener, {
              function: functionEntry,
              transaction,
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
            triggerCount++;
          }
        }
      }
    }
    return Promise.all(promises)
        .then(() => {
          return {
            functionCount: functionList ? functionList.length : 0,
            triggerCount,
            failCount,
          };
        });
  }

  pushCall(valuePath, value, functionPath, fid) {
    const topCall = this.getTopCall();
    const fidList = topCall ? Array.from(topCall.fidList) : [];
    fidList.push(fid);
    this.callStack.push({
      fid,
      fidList,
      functionPath,
      triggered_by: {
        valuePath,
        value
      }
    })
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

  static buildExecutionResult(context, code) {
    // NOTE(seo): Allow only node-independent values to avoid state proof hash issues.
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    return {
      timestamp,
      tx_hash: transaction.hash,
      code,
    };
  }

  setValueOrLog(valuePath, value, auth, timestamp, transaction) {
    const result = this.db.setValue(valuePath, value, auth, timestamp, transaction);
    if (result !== true) {
      logger.error(
          `  ==> Failed to setValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    return result;
  }

  incValueOrLog(valuePath, delta, auth, timestamp, transaction) {
    const result = this.db.incValue(valuePath, delta, auth, timestamp, transaction);
    if (result !== true) {
      logger.error(
          `  ==> Failed to incValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    return result;
  }

  decValueOrLog(valuePath, delta, auth, timestamp, transaction) {
    const result = this.db.decValue(valuePath, delta, auth, timestamp, transaction);
    if (result !== true) {
      logger.error(
          `  ==> Failed to decValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    return result;
  }

  setExecutionResult(context, code) {
    const execResult = Functions.buildExecutionResult(context, code);
    this.setCallResult(execResult);
  }

  saveAndSetExecutionResult(context, resultPath, code) {
    const execResult = Functions.buildExecutionResult(context, code);
    this.setCallResult(execResult);
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const auth = context.auth;
    return this.setValueOrLog(resultPath, execResult, auth, timestamp, transaction);
  }

  /**
   * Adds a transfer entry from a service account to a regular account or vice versa. Used by
   * service-related native functions such as payments and staking
   */
  setServiceAccountTransferOrLog(from, to, value, auth, timestamp, transaction) {
    if (ChainUtil.isServAcntName(to)) {
      const serviceAccountAdminPath = PathUtil.getServiceAccountAdminPathFromAccountName(to);
      const serviceAccountAdmin = this.db.getValue(serviceAccountAdminPath);
      if (serviceAccountAdmin === null) {
        // set admin as the from address of the original transaction
        const serviceAccountAdminAddrPath = PathUtil
            .getServiceAccountAdminAddrPathFromAccountName(to, transaction.address);
        const adminSetupResult = this.setValueOrLog(
            serviceAccountAdminAddrPath, true, auth, timestamp, transaction);
        if (adminSetupResult !== true) {
          return adminSetupResult;
        }
      }
    }
    const transferPath = PathUtil.getTransferValuePath(from, to, timestamp);
    return this.setValueOrLog(transferPath, value, auth, timestamp, transaction);
  }

  /**
   * Saves the transaction's hash to a sibling path.
   * e.g.) For tx's value path 'path/to/value', it saves the tx hash to 'path/to/.last_tx/value'
   */
  _saveLastTx(value, context) {
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const auth = context.auth;

    const valuePath = context.valuePath;
    if (valuePath.length === 0) {
      return false;
    }
    const lastTxPath = valuePath.slice();
    // Insert '.last_tx' label just before the last label in the path.
    const lastLabel = lastTxPath.pop();
    lastTxPath.push(PredefinedDbPaths.SAVE_LAST_TX_LAST_TX);
    lastTxPath.push(lastLabel);

    return this.setValueOrLog(
        ChainUtil.formatPath(lastTxPath), { tx_hash: transaction.hash }, auth, timestamp,
        transaction);
  }

  _transfer(value, context) {
    const from = context.params.from;
    const to = context.params.to;
    const key = context.params.key;
    const fromBalancePath = ChainUtil.getBalancePath(from);
    const toBalancePath = ChainUtil.getBalancePath(to);
    const resultPath = PathUtil.getTransferResultPath(from, to, key);
    const transferResult =
        this.transferInternal(fromBalancePath, toBalancePath, value, context);
    if (transferResult === true) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (transferResult === false) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _createApp(value, context) {
    const appName = context.params.app_name;
    const recordId = context.params.record_id;
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const auth = context.auth;
    const resultPath = PathUtil.getCreateAppResultPath(appName, recordId);
    const lockupDurationKey = `${PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE}.` +
        `${PredefinedDbPaths.STAKING}.${PredefinedDbPaths.STAKING_LOCKUP_DURATION}`;
    const lockupDurationVal = _.get(value, lockupDurationKey);
    if (!ChainUtil.isDict(_.get(value, PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN)) ||
        !ChainUtil.isNumber(lockupDurationVal)) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
      return;
    }
    const sanitizedVal = {};
    const adminConfig = value[PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN];
    const billingUsersConfig = _.get(value,
        `${PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING}.${PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING_USERS}`);
    const serviceConfig = {
      [PredefinedDbPaths.STAKING]: {
        [PredefinedDbPaths.STAKING_LOCKUP_DURATION]: lockupDurationVal
      }
    };
    if (adminConfig) {
      sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN] = adminConfig;
    }
    if (billingUsersConfig) {
      sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING] = billingUsersConfig;
    }
    if (serviceConfig) {
      sanitizedVal[PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE] = serviceConfig;
    };
    const manageAppConfigPath = PathUtil.getManageAppConfigPath(appName);
    const setConfigRes = this.setValueOrLog(
        manageAppConfigPath, sanitizedVal, auth, timestamp, transaction);
    if (setConfigRes === true) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
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
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
      return;
    }
    if (value === 0) {
      // Just update the expiration time
      this.setValueOrLog(
        expirationPath, Number(timestamp) + Number(lockup), auth, timestamp, transaction);
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
      return;
    }
    const stakingServiceAccountName = ChainUtil.toServiceAccountName(
          PredefinedDbPaths.STAKING, serviceName, `${user}|${stakingKey}`);
    const transferResult = this.setServiceAccountTransferOrLog(
        user, stakingServiceAccountName, value, auth, timestamp, transaction);
    if (transferResult === true) {
      this.setValueOrLog(
          expirationPath, Number(timestamp) + Number(lockup), auth, timestamp, transaction);
      const balanceTotalPath = PathUtil.getStakingBalanceTotalPath(serviceName);
      this.incValueOrLog(balanceTotalPath, value, auth, timestamp, transaction);
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (transferResult === false) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.IN_LOCKUP_PERIOD);
      return;
    }
    if (serviceName === PredefinedDbPaths.CONSENSUS) {
      // Reject withdrawing consensus stakes if it reduces the number of validators to less than
      // MIN_NUM_VALIDATORS.
      const whitelist = this.db.getValue(
          ChainUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.WHITELIST]));
      let numValidators = 0;
      Object.keys(whitelist).forEach((address) => {
        const accountName = ChainUtil.toServiceAccountName(
            PredefinedDbPaths.STAKING, serviceName, `${address}|0`);
        const stakingAccount = this.db.getValue(
            ChainUtil.formatPath([PredefinedDbPaths.SERVICE_ACCOUNTS, PredefinedDbPaths.STAKING,
                PredefinedDbPaths.CONSENSUS, accountName]));
        if (stakingAccount && stakingAccount.balance > MIN_STAKE_PER_VALIDATOR) {
          numValidators++;
        }
      });
      if (numValidators <= MIN_NUM_VALIDATORS) {
        this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
        return;
      }
    }
    const stakingServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.STAKING, serviceName, `${user}|${stakingKey}`);
    const transferResult = this.setServiceAccountTransferOrLog(
        stakingServiceAccountName, user, value, auth, timestamp, transaction);
    if (transferResult === true) {
      const balanceTotalPath = PathUtil.getStakingBalanceTotalPath(serviceName);
      this.decValueOrLog(balanceTotalPath, value, auth, timestamp, transaction);
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (transferResult === false) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
      return;
    }

    const userServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, serviceName, `${user}|${paymentKey}`);
    const transferResult = this.setServiceAccountTransferOrLog(
        transaction.address, userServiceAccountName, value.amount, auth, timestamp, transaction);
    if (transferResult === true) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
    const auth = context.auth;
    const resultPath = PathUtil.getPaymentClaimRecordResultPath(serviceName, user, paymentKey, recordId);

    if (!this.validatePaymentRecord(transaction.address, value, timestamp, executedAt)) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
      return;
    }

    let result;
    const userServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, serviceName, `${user}|${paymentKey}`);
    // NOTE: By specifying `escrow_key`, the claimed payment is held in escrow instead of being
    // transferred directly to the admin account
    if (value.escrow_key !== undefined) {
      const escrowHoldPath = PathUtil.getEscrowHoldRecordPath(
          userServiceAccountName, value.target, value.escrow_key, timestamp);
      result = this.setValueOrLog(
          escrowHoldPath, { amount: value.amount }, auth, timestamp, transaction);
    } else {
      result = this.setServiceAccountTransferOrLog(
          userServiceAccountName, value.target, value.amount, auth, timestamp, transaction);
    }
    if (result === true) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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

  _openEscrow(value, context) {
    const sourceAccount = context.params.source_account;
    const targetAccount = context.params.target_account;
    const escrowKey = context.params.escrow_key;
    const { timestamp, auth, transaction } = context;
    const accountKey = ChainUtil.toEscrowAccountName(sourceAccount, targetAccount, escrowKey);
    const serviceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.ESCROW, PredefinedDbPaths.ESCROW, accountKey);
    const serviceAccountPath = PathUtil.getServiceAccountPathFromAccountName(serviceAccountName);
    const serviceAccountSetupResult =
        this.setValueOrLog(serviceAccountPath, value, auth, timestamp, transaction);
    if (serviceAccountSetupResult !== true) {
      logger.error(`  ==> Failed to open escrow`);
      this.setExecutionResult(context, FunctionResultCode.FAILURE);
    } else {
      this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    }
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
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
    }
    const accountKey = ChainUtil.toEscrowAccountName(sourceAccount, targetAccount, escrowKey);
    const escrowServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.ESCROW, PredefinedDbPaths.ESCROW, accountKey);
    const transferResult = this.setServiceAccountTransferOrLog(
        sourceAccount, escrowServiceAccountName, amount, auth, timestamp, transaction);
    if (transferResult === true) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
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
          escrowServiceAccountName, targetAccount, targetAmount, auth, timestamp, transaction);
      if (result !== true) {
        this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
        return;
      }
    }
    if (sourceAmount > 0) {
      const result = this.setServiceAccountTransferOrLog(
          escrowServiceAccountName, sourceAccount, sourceAmount, auth, timestamp, transaction);
      if (result !== true) {
        this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
        // TODO(lia): revert the release to target_account if there was any
        return;
      }
    }
    this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
  }

  _updateLatestShardReport(value, context) {
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const auth = context.auth;

    const blockNumber = Number(context.params.block_number);
    const valuePath = context.valuePath;
    if (!ChainUtil.isArray(context.functionPath)) {
      return false;
    }
    if (!ChainUtil.isString(value)) {
      // Removing old report or invalid reporting
      return false;
    }
    const latestReportPath = PathUtil.getLatestShardReportPathFromValuePath(valuePath);
    const currentLatestBlockNumber = this.db.getValue(latestReportPath);
    if (currentLatestBlockNumber !== null && Number(currentLatestBlockNumber) >= blockNumber) {
      // Nothing to update
      return false;
    }
    this.setValueOrLog(latestReportPath, blockNumber, auth, timestamp, transaction);
    this.setExecutionResult(context, FunctionResultCode.SUCCESS);
  }

  // TODO(seo): Support refund feature.
  _openCheckin(value, context) {
    const valuePath = context.valuePath;
    const payloadTx = _.get(value, 'payload', null);
    const txHash = ChainUtil.hashSignature(payloadTx.signature);
    if (!this.tp || !this.db.isNodeDb) {
      // It's not the backupDb
      logger.info(`  =>> Skip sending signed transaction to the parent blockchain: ${txHash}`);
      return;
    }
    if (!this.validateCheckinParams(context.params)) {
      return;
    }
    if (!this.validateShardConfig()) {
      return;
    }
    if (!payloadTx || !payloadTx.tx_body || !payloadTx.signature) {
      logger.info('  =>> payloadTx is missing required fields');
      return;
    }
    const createdTx = Transaction.create(payloadTx.tx_body, payloadTx.signature);
    if (!createdTx ||
        !Transaction.verifyTransaction(createdTx) ||
        !this.isTransferTx(createdTx.tx_body.operation)) {
      logger.info('  =>> Invalid payloadTx');
      return;
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
          ref: PathUtil.getCheckinParentFinalizeResultPathFromValuePath(shardingPath, valuePath, txHash),
          valueFunction: (success) => !!success,
          is_global: true,
          tx_body: payloadTx.tx_body,
        };
        this.tp.addRemoteTransaction(txHash, action);
      });
    } finally {
      this.setExecutionResult(context, FunctionResultCode.SUCCESS);
    }
  }

  getCheckinPayloadPathFromValuePath(valuePath) {
    const branchPath = ChainUtil.formatPath(valuePath.slice(0, -3));
    return PathUtil.getCheckinPayloadPath(branchPath);
  }

  _closeCheckin(value, context) {
    if (!this.tp || !this.db.isNodeDb) {
      // It's not the backupDb
      logger.info('  =>> Skip sending transfer transaction to the shard blockchain');
      return;
    }
    if (!this.validateCheckinParams(context.params)) {
      return;
    }
    if (!this.validateShardConfig()) {
      return;
    }
    if (value !== true) {
      return;
    }
    // Transfer shard chain token from shard_owner to user_addr
    const user = context.params.user_addr;
    const checkinId = context.params.checkin_id;
    const valuePath = context.valuePath;
    const checkinPayload = this.db.getValue(PathUtil.getCheckinPayloadPathFromValuePath(valuePath));
    const checkinAmount = _.get(checkinPayload, 'tx_body.operation.value', 0);
    const tokenExchRate = GenesisSharding[ShardingProperties.TOKEN_EXCH_RATE];
    const tokenToReceive = checkinAmount * tokenExchRate;
    if (!this.validateCheckinAmount(tokenExchRate, checkinAmount, tokenToReceive)) {
      return;
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
    } finally {
      this.setExecutionResult(context, FunctionResultCode.SUCCESS);
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
    if (fromBalance < value) {
      return false;
    }
    const decResult = this.decValueOrLog(fromPath, value, auth, timestamp, transaction);
    if (decResult !== true) {
      return decResult;
    }
    const incResult = this.incValueOrLog(toPath, value, auth, timestamp, transaction);
    if (incResult !== true) {
      return incResult;
    }
    return true;
  }
}

module.exports = Functions;
