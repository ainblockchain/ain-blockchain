const logger = require('../logger')('FUNCTIONS');
const axios = require('axios');
const _ = require('lodash');
const {
  PredefinedDbPaths,
  FunctionTypes,
  FunctionResultCode,
  NativeFunctionIds,
  DefaultValues,
  ShardingProperties,
  GenesisSharding,
  WriteDbOperations,
  ShardingProtocols,
  GenesisAccounts,
  AccountProperties,
  TokenExchangeSchemes,
  FunctionProperties,
  MIN_NUM_VALIDATORS,
  MIN_STAKE_PER_VALIDATOR,
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
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
      [NativeFunctionIds.CLAIM]: this._claim.bind(this),
      [NativeFunctionIds.CLOSE_CHECKIN]: this._closeCheckin.bind(this),
      [NativeFunctionIds.DEPOSIT]: this._deposit.bind(this),
      [NativeFunctionIds.HOLD]: this._hold.bind(this),
      [NativeFunctionIds.OPEN_CHECKIN]: this._openCheckin.bind(this),
      [NativeFunctionIds.OPEN_ESCROW]: this._openEscrow.bind(this),
      [NativeFunctionIds.PAY]: this._pay.bind(this),
      [NativeFunctionIds.RELEASE]: this._release.bind(this),
      [NativeFunctionIds.SAVE_LAST_TX]: this._saveLastTx.bind(this),
      [NativeFunctionIds.TRANSFER]: this._transfer.bind(this),
      [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: this._updateLatestShardReport.bind(this),
      [NativeFunctionIds.WITHDRAW]: this._withdraw.bind(this),
    };
    this.callStack= [];
  }

  /**
   * Runs functions of function paths matched with given database path.
   *
   * @param {Array} parsedValuePath parsed value path
   * @param {Object} value value set on the database path
   * @param {Number} timestamp the time at which the transaction was created and signed
   * @param {Number} execTime execution time
   * @param {Object} transaction transaction
   */
  // TODO(seo): Trigger subtree functions.
  triggerFunctions(parsedValuePath, value, auth, timestamp, execTime, transaction) {
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
          parsedValuePath, functionPath, timestamp, execTime, params, value, transaction);
      for (const functionEntry of functionList) {
        if (!functionEntry || !functionEntry.function_type) {
          continue; // Does nothing.
        }
        if (functionEntry.function_type === FunctionTypes.NATIVE) {
          const nativeFunction = this.nativeFunctionMap[functionEntry.function_id];
          if (nativeFunction) {
            // Execute the matched native function.
            logger.info(
                `  ==> Triggering NATIVE function [[ ${functionEntry.function_id} ]] with:\n` +
                formattedParams);
            this.pushCall(
                ChainUtil.formatPath(parsedValuePath), value, ChainUtil.formatPath(functionPath),
                functionEntry.function_id);
            const newAuth = Object.assign(
                {}, auth, { fid: functionEntry.function_id, fids: this.getFids() });
            try {
              nativeFunction(
                  value,
                  {
                    valuePath: parsedValuePath,
                    functionPath,
                    params,
                    timestamp,
                    execTime,
                    transaction,
                    auth: newAuth,
                  });
            } finally {
              // Always pops from the call stack.
              const call = this.popCall();
              if (call.result) {
                const formattedResult =
                    `  ==>| Execution result of NATIVE function [[ ${functionEntry.function_id} ]]: \n` +
                    `${JSON.stringify(call.result, null, 2)}`;
                if (_.get(call, 'result.code') === FunctionResultCode.SUCCESS) {
                  logger.info(formattedResult);
                } else {
                  logger.error(formattedResult);
                }
              }
              triggerCount++;
            }
          }
        } else if (functionEntry.function_type === FunctionTypes.REST) {
          if (functionEntry.event_listener &&
              functionEntry.event_listener in EventListenerWhitelist) {
            logger.info(
                `  ==> Triggering REST function [[ ${functionEntry.function_id} ]] of ` +
                `event listener '${functionEntry.event_listener}' with:\n` +
                formattedParams);
            promises.push(axios.post(functionEntry.event_listener, {
              function: functionEntry,
              transaction,
            }).catch((error) => {
              logger.error(
                  `Failed to trigger REST function [[ ${functionEntry.function_id} ]] of ` +
                  `event listener '${functionEntry.event_listener}' with error: \n` +
                  `${JSON.stringify(error)}` +
                  formattedParams);
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
    this.callStack.push({
      fid,
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

  setCallResult(result) {
    const size = this.callStackSize();
    if (size > 0) {
      this.callStack[size - 1].result = result;
    }
  }

  callStackSize() {
    return this.callStack.length;
  }

  getFids() {
    return this.callStack.reduce((acc, cur) => {
      acc.push(cur.fid);
      return acc;
    }, []);
  }

  static formatFunctionParams(
      parsedValuePath, functionPath, timestamp, execTime, params, value, transaction) {
    return `valuePath: '${ChainUtil.formatPath(parsedValuePath)}', ` +
      `functionPath: '${ChainUtil.formatPath(functionPath)}', ` +
      `timestamp: '${timestamp}', execTime: '${execTime}', ` +
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
   * Returns a new function created by applying the function change to the current function.
   *
   * @param {Object} curFunction current function (modified and returned by this function)
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

  setValueOrLog(valuePath, value, auth, timestamp, transaction = null) {
    const result = this.db.setValue(valuePath, value, auth, timestamp, transaction);
    if (result !== true) {
      logger.error(
          `  ==> Failed to setValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    return result;
  }

  incValueOrLog(valuePath, delta, auth, timestamp) {
    const result = this.db.incValue(valuePath, delta, auth, timestamp);
    if (result !== true) {
      logger.error(
          `  ==> Failed to incValue on '${valuePath}' with error: ${JSON.stringify(result)}`);
    }
    return result;
  }

  decValueOrLog(valuePath, delta, auth, timestamp) {
    const result = this.db.decValue(valuePath, delta, auth, timestamp);
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
    const auth = context.auth;
    return this.setValueOrLog(resultPath, execResult, auth, timestamp);
  }

  /**
   * Adds a transfer entry from a service account to a regular account or vice versa. Used by 
   * service-related native functions such as payments, deposit, and withdraw.
   */
  setServiceAccountTransferOrLog(from, to, value, auth, timestamp, transaction) {
    if (ChainUtil.isServAcntName(to)) {
      const serviceAccountAdminPath = this.getServiceAccountAdminPath(to);
      const serviceAccountAdmin = this.db.getValue(serviceAccountAdminPath);
      if (serviceAccountAdmin === null) {
        // set admin as the from address of the original transaction
        const serviceAccountAdminAddrPath = this.getServiceAccountAdminAddrPath(to, transaction.address);
        const adminSetupResult = this.setValueOrLog(serviceAccountAdminAddrPath, true, auth, timestamp);
        if (adminSetupResult !== true) {
          return adminSetupResult;
        }
      }
    }
    const transferPath = this.getTransferValuePath(from, to, timestamp);
    return this.setValueOrLog(transferPath, value, auth, timestamp, transaction);
  }

  /**
   * Saves the transaction's hash to a sibling path.
   * e.g.) For tx's value path 'path/to/value', it saves the tx hash to 'path/to/.last_tx/value'
   */
  _saveLastTx(value, context) {
    const transaction = context.transaction;
    const timestamp = context.timestamp;
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
        ChainUtil.formatPath(lastTxPath), { tx_hash: transaction.hash }, auth, timestamp);
  }

  // TODO(seo): Add adress validity check.
  _transfer(value, context) {
    const from = context.params.from;
    const to = context.params.to;
    const key = context.params.key;
    const fromBalancePath = ChainUtil.getBalancePath(from);
    const toBalancePath = ChainUtil.getBalancePath(to);
    const resultPath = this.getTransferResultPath(from, to, key);
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

  // TODO(lia): migrate from /deposit_accounts/{serviceName}/{userAddr}/value to
  // /service_accounts/deposit/{serviceName}/{userAddr}/balance.
  _deposit(value, context) {
    const service = context.params.service;
    const user = context.params.user_addr;
    const depositId = context.params.deposit_id;
    const timestamp = context.timestamp;
    const execTime = context.execTime;
    const auth = context.auth;

    const resultPath = this.getDepositResultPath(service, user, depositId);
    const depositCreatedAtPath = this.getDepositCreatedAtPath(service, user, depositId);
    this.setValueOrLog(depositCreatedAtPath, timestamp, auth, timestamp);
    if (timestamp > execTime) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
      return;
    }
    const userBalancePath = ChainUtil.getBalancePath(user);
    const depositAmountPath = this.getDepositAmountPath(service, user);
    const transferResult =
        this.transferInternal(userBalancePath, depositAmountPath, value, context);
    if (transferResult === true) {
      const lockup = this.db.getValue(this.getDepositLockupDurationPath(service)) ||
          DefaultValues.DEPOSIT_LOCKUP_DURATION_MS;
      const expirationPath = this.getDepositExpirationPath(service, user);
      this.setValueOrLog(expirationPath, Number(timestamp) + Number(lockup), auth, timestamp);
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (transferResult === false) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  // TODO(lia): migrate from /deposit_accounts/{serviceName}/{userAddr}/value to
  // /service_accounts/deposit/{serviceName}/{userAddr}/balance.
  _withdraw(value, context) {
    const service = context.params.service;
    const user = context.params.user_addr;
    const withdrawId = context.params.withdraw_id;
    const timestamp = context.timestamp;
    const execTime = context.execTime;
    const auth = context.auth;

    const depositAmountPath = this.getDepositAmountPath(service, user);
    const userBalancePath = ChainUtil.getBalancePath(user);
    const resultPath = this.getWithdrawResultPath(service, user, withdrawId);
    const withdrawCreatedAtPath = this.getWithdrawCreatedAtPath(service, user, withdrawId);
    const expireAt = this.db.getValue(this.getDepositExpirationPath(service, user));
    this.setValueOrLog(withdrawCreatedAtPath, timestamp, auth, timestamp);
    if (expireAt > execTime) {
      // Still in lock-up period.
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.IN_LOCKUP_PERIOD);
      return;
    }
    if (service === PredefinedDbPaths.CONSENSUS) {
      // Reject withdrawing consensus deposits if it reduces the number of validators to less than
      // MIN_NUM_VALIDATORS.
      const whitelist = this.db.getValue(
          ChainUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.WHITELIST]));
      let numValidators = 0;
      Object.keys(whitelist).forEach((address) => {
        const deposit = this.db.getValue(
            ChainUtil.formatPath([PredefinedDbPaths.DEPOSIT_CONSENSUS, address]));
        if (deposit && deposit.value > MIN_STAKE_PER_VALIDATOR) {
          numValidators++;
        }
      });
      if (numValidators <= MIN_NUM_VALIDATORS) {
        this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
        return;
      }
    }
    const transferResult =
        this.transferInternal(depositAmountPath, userBalancePath, value, context);
    if (transferResult === true) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (transferResult === false) {
      // Not enough deposit.
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _pay(value, context) {
    const service = context.params.service;
    const user = context.params.user_addr;
    const paymentKey = context.params.payment_key;
    const recordId = context.params.record_id;
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const execTime = context.execTime;
    const auth = context.auth;
    const resultPath = this.getPaymentPayRecordResultPath(service, user, paymentKey, recordId);

    if (!this.validatePaymentRecord(transaction.address, value, timestamp, execTime)) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
      return;
    }

    const userServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, service, `${user}|${paymentKey}`);
    const transferResult = this.setServiceAccountTransferOrLog(
        transaction.address, userServiceAccountName, value.amount, auth, timestamp, transaction);
    if (transferResult === true) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
    }
  }

  _claim(value, context) {
    const service = context.params.service;
    const user = context.params.user_addr;
    const paymentKey = context.params.payment_key;
    const recordId = context.params.record_id;
    const transaction = context.transaction;
    const timestamp = context.timestamp;
    const execTime = context.execTime;
    const auth = context.auth;
    const resultPath = this.getPaymentClaimRecordResultPath(service, user, paymentKey, recordId);

    if (!this.validatePaymentRecord(transaction.address, value, timestamp, execTime)) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
      return;
    }

    let result;
    const userServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.PAYMENTS, service, `${user}|${paymentKey}`);
    // NOTE: By specifying `escrow_key`, the claimed payment is held in escrow instead of being
    // transferred directly to the admin account
    if (value.escrow_key !== undefined) {
      const escrowHoldPath = this.getEscrowHoldRecordPath(
          userServiceAccountName, value.target, value.escrow_key, timestamp);
      result = this.setValueOrLog(escrowHoldPath, { amount: value.amount }, auth, timestamp, transaction);
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

  validatePaymentRecord(adminAddr, value, timestamp, execTime) {
    if (!adminAddr) {
      return false;
    }
    if (!value || !value.amount || !ChainUtil.isNumber(value.amount)) {
      return false;
    }
    if (timestamp > execTime) {
      return false;
    }
    return true;
  }

  _openEscrow(value, context) {
    const sourceAccount = context.params.source_account;
    const targetAccount = context.params.target_account;
    const escrowKey = context.params.escrow_key;
    const { timestamp, auth } = context;
    const accountKey = ChainUtil.toEscrowAccountName(sourceAccount, targetAccount, escrowKey);
    const serviceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.ESCROW, PredefinedDbPaths.ESCROW, accountKey);
    const serviceAccountPath = this.getServiceAccountPath(serviceAccountName);
    const serviceAccountSetupResult = this.setValueOrLog(serviceAccountPath, value, auth, timestamp);
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
    const resultPath = this.getEscrowHoldRecordResultPath(sourceAccount, targetAccount, escrowKey, recordId);
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
    const resultPath = this.getEscrowReleaseRecordResultPath(sourceAccount, targetAccount, escrowKey, recordId);
    if (!ChainUtil.isNumber(ratio) || ratio < 0 || ratio > 1) {
      this.saveAndSetExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
    }
    const accountKey = ChainUtil.toEscrowAccountName(sourceAccount, targetAccount, escrowKey);
    const escrowServiceAccountName = ChainUtil.toServiceAccountName(
        PredefinedDbPaths.ESCROW, PredefinedDbPaths.ESCROW, accountKey);
    const serviceAccountBalancePath = this.getServiceAccountBalancePath(escrowServiceAccountName);
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

  getLatestShardReportPathFromValuePath(valuePath) {
    const branchPath = ChainUtil.formatPath(valuePath.slice(0, -2));
    return this.getLatestShardReportPath(branchPath);
  }

  _updateLatestShardReport(value, context) {
    const timestamp = context.timestamp;
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
    const latestReportPath = this.getLatestShardReportPathFromValuePath(valuePath);
    const currentLatestBlockNumber = this.db.getValue(latestReportPath);
    if (currentLatestBlockNumber !== null && Number(currentLatestBlockNumber) >= blockNumber) {
      // Nothing to update
      return false;
    }
    this.setValueOrLog(latestReportPath, blockNumber, auth, timestamp);
    this.setExecutionResult(context, FunctionResultCode.SUCCESS);
  }

  getCheckinParentFinalizeResultPathFromValuePath(valuePath, txHash) {
    const branchPath = ChainUtil.formatPath(valuePath.slice(0, -1));
    return this.getCheckinParentFinalizeResultPath(branchPath, txHash);
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
        const action = {
          ref: this.getCheckinParentFinalizeResultPathFromValuePath(valuePath, txHash),
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
    return this.getCheckinPayloadPath(branchPath);
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
    const checkinPayload = this.db.getValue(this.getCheckinPayloadPathFromValuePath(valuePath));
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
    const auth = context.auth;

    const fromBalance = this.db.getValue(fromPath);
    if (fromBalance < value) {
      return false;
    }
    const decResult = this.decValueOrLog(fromPath, value, auth, timestamp);
    if (decResult !== true) {
      return decResult;
    }
    const incResult = this.incValueOrLog(toPath, value, auth, timestamp);
    if (incResult !== true) {
      return incResult;
    }
    return true;
  }

  getServiceAccountPath(accountName) {
    const parsed = ChainUtil.parseServAcntName(accountName);
    return `${PredefinedDbPaths.SERVICE_ACCOUNTS}/${parsed[0]}/${parsed[1]}/${parsed[2]}`;
  }

  getServiceAccountAdminPath(accountName) {
    return `${this.getServiceAccountPath(accountName)}/${PredefinedDbPaths.SERVICE_ACCOUNTS_ADMIN}`;
  }

  getServiceAccountAdminAddrPath(accountName, adminAddr) {
    return `${this.getServiceAccountAdminPath(accountName)}/${adminAddr}`;
  }

  getServiceAccountBalancePath(accountName) {
    return `${this.getServiceAccountPath(accountName)}/${PredefinedDbPaths.BALANCE}`;
  }

  getTransferValuePath(from, to, key) {
    return `${PredefinedDbPaths.TRANSFER}/${from}/${to}/${key}/${PredefinedDbPaths.TRANSFER_VALUE}`;
  }

  getTransferResultPath(from, to, key) {
    return (
      `${PredefinedDbPaths.TRANSFER}/${from}/${to}/${key}/${PredefinedDbPaths.TRANSFER_RESULT}`);
  }

  getDepositLockupDurationPath(service) {
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/` +
        `${PredefinedDbPaths.DEPOSIT_CONFIG}/${PredefinedDbPaths.DEPOSIT_LOCKUP_DURATION}`);
  }

  getDepositAmountPath(service, user) {
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/${user}/` +
        `${PredefinedDbPaths.DEPOSIT_VALUE}`);
  }

  getDepositExpirationPath(service, user) {
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/${user}/` +
        `${PredefinedDbPaths.DEPOSIT_EXPIRE_AT}`);
  }

  getDepositCreatedAtPath(service, user, depositId) {
    return (`${PredefinedDbPaths.DEPOSIT}/${service}/${user}/${depositId}/` +
        `${PredefinedDbPaths.DEPOSIT_CREATED_AT}`);
  }

  getDepositResultPath(service, user, depositId) {
    return (`${PredefinedDbPaths.DEPOSIT}/${service}/${user}/${depositId}/` +
        `${PredefinedDbPaths.DEPOSIT_RESULT}`);
  }

  getWithdrawCreatedAtPath(service, user, withdrawId) {
    return (`${PredefinedDbPaths.WITHDRAW}/${service}/${user}/${withdrawId}/` +
        `${PredefinedDbPaths.WITHDRAW_CREATED_AT}`);
  }

  getWithdrawResultPath(service, user, withdrawId) {
    return (`${PredefinedDbPaths.WITHDRAW}/${service}/${user}/${withdrawId}/` +
        `${PredefinedDbPaths.WITHDRAW_RESULT}`);
  }

  getPaymentServiceAdminPath(service) {
    return (`${PredefinedDbPaths.PAYMENTS}/${service}/${PredefinedDbPaths.PAYMENTS_CONFIG}/` +
        `${PredefinedDbPaths.PAYMENTS_ADMIN}`);
  }

  getPaymentPayRecordPath(service, user, paymentKey, recordId) {
    return (`${PredefinedDbPaths.PAYMENTS}/${service}/${user}/${paymentKey}/` +
        `${PredefinedDbPaths.PAYMENTS_PAY}/${recordId}`);
  }

  getPaymentClaimRecordPath(service, user, paymentKey, recordId) {
    return (`${PredefinedDbPaths.PAYMENTS}/${service}/${user}/${paymentKey}/` +
        `${PredefinedDbPaths.PAYMENTS_CLAIM}/${recordId}`);
  }

  getPaymentPayRecordResultPath(service, user, paymentKey, recordId) {
    return (`${this.getPaymentPayRecordPath(service, user, paymentKey, recordId)}/` +
        `${PredefinedDbPaths.PAYMENTS_RESULT}`);
  }

  getPaymentClaimRecordResultPath(service, user, paymentKey, recordId) {
    return (`${this.getPaymentClaimRecordPath(service, user, paymentKey, recordId)}/` +
        `${PredefinedDbPaths.PAYMENTS_RESULT}`);
  }

  getEscrowHoldRecordPath(source, target, escrowKey, recordId) {
    return (`${PredefinedDbPaths.ESCROW}/${source}/${target}/${escrowKey}/` +
        `${PredefinedDbPaths.ESCROW_HOLD}/${recordId}`);
  }

  getEscrowHoldRecordResultPath(source, target, escrowKey, recordId) {
    return (`${this.getEscrowHoldRecordPath(source, target, escrowKey, recordId)}/` +
        `${PredefinedDbPaths.ESCROW_RESULT}`);
  }

  getEscrowReleaseRecordResultPath(source, target, escrowKey, recordId) {
    return (`${PredefinedDbPaths.ESCROW}/${source}/${target}/${escrowKey}/` +
        `${PredefinedDbPaths.ESCROW_RELEASE}/${recordId}/${PredefinedDbPaths.ESCROW_RESULT}`);
  }

  getLatestShardReportPath(branchPath) {
    return `${branchPath}/${ShardingProperties.LATEST}`;
  }

  getCheckinParentFinalizeResultPath(branchPath, txHash) {
    const shardingPath = this.db.getShardingPath();
    return ChainUtil.appendPath(
        shardingPath,
        `${branchPath}/${PredefinedDbPaths.CHECKIN_PARENT_FINALIZE}/${txHash}/` +
            `${PredefinedDbPaths.REMOTE_TX_ACTION_RESULT}`);
  }

  getCheckinPayloadPath(branchPath) {
    return ChainUtil.appendPath(
        branchPath,
        `${PredefinedDbPaths.CHECKIN_REQUEST}/${PredefinedDbPaths.CHECKIN_PAYLOAD}`);
  }

  getFullValuePath(parsedPath) {
    return this.db.constructor.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
  }
}

module.exports = Functions;
