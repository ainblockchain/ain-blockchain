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
      [NativeFunctionIds.OPEN_CHECKIN]: this._openCheckin.bind(this),
      [NativeFunctionIds.PAY]: this._pay.bind(this),
      [NativeFunctionIds.SAVE_LAST_TX]: this._saveLastTx.bind(this),
      [NativeFunctionIds.TRANSFER]: this._transfer.bind(this),
      [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: this._updateLatestShardReport.bind(this),
      [NativeFunctionIds.WITHDRAW]: this._withdraw.bind(this),
    };
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
            logger.info(
                `  ==> Triggering NATIVE function '${functionEntry.function_id}' with\n` +
                formattedParams);
            const newAuth = Object.assign({}, auth, { fid: functionEntry.function_id });
            // Execute the matched native function.
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
            triggerCount++;
            failCount++;
          }
        } else if (functionEntry.function_type === FunctionTypes.REST) {
          if (functionEntry.event_listener &&
              functionEntry.event_listener in EventListenerWhitelist) {
            logger.info(
                `  ==> Triggering REST function '${functionEntry.function_id}' of ` +
                `event listener '${functionEntry.event_listener}' with\n` +
                formattedParams);
            promises.push(axios.post(functionEntry.event_listener, {
              function: functionEntry,
              transaction,
            }).catch((error) => {
              logger.error(
                  `Failed to trigger REST function '${functionEntry.function_id}' of ` +
                  `event listener '${functionEntry.event_listener}' with\n` +
                  `error: ${JSON.stringify(error)}` +
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

  static buildExecutionResult(timestamp, txHash, code) {
    // NOTE(seo): Allow only node-independent values to avoid state proof hash issues.
    return {
      timestamp,
      tx_hash: txHash,
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

  setExecutionResult(context, resultPath, code) {
    const timestamp = context.timestamp;
    const transaction = context.transaction;
    const auth = context.auth;
    const execResult = Functions.buildExecutionResult(timestamp, transaction.hash, code);
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
      this.setExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (transferResult === false) {
      this.setExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      this.setExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
      this.setExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
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
      this.setExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (transferResult === false) {
      this.setExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      this.setExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
      this.setExecutionResult(context, resultPath, FunctionResultCode.IN_LOCKUP_PERIOD);
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
        this.setExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
        return;
      }
    }
    const transferResult =
        this.transferInternal(depositAmountPath, userBalancePath, value, context);
    if (transferResult === true) {
      this.setExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else if (transferResult === false) {
      // Not enough deposit.
      this.setExecutionResult(context, resultPath, FunctionResultCode.INSUFFICIENT_BALANCE);
    } else {
      this.setExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
    const resultPath = this.getPaymentPayRecordsResultPath(service, user, paymentKey, recordId);

    if (!this.validatePaymentRecord(transaction.address, value, timestamp, execTime)) {
      this.setExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
      return;
    }

    const userServiceAccountName = ChainUtil.toServiceAccountName('payments', service, `${user}|${paymentKey}`);
    const transferResult = this.setServiceAccountTransferOrLog(
      transaction.address, userServiceAccountName, value.amount, auth, timestamp, transaction);
    if (transferResult === true) {
      this.setExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      this.setExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
    const resultPath = this.getPaymentClaimRecordsResultPath(service, user, paymentKey, recordId);

    if (!this.validatePaymentRecord(transaction.address, value, timestamp, execTime)) {
      this.setExecutionResult(context, resultPath, FunctionResultCode.FAILURE);
      return;
    }

    const userServiceAccountName = ChainUtil.toServiceAccountName('payments', service, `${user}|${paymentKey}`);
    const transferResult = this.setServiceAccountTransferOrLog(
        userServiceAccountName, value.target, value.amount, auth, timestamp, transaction);
    if (transferResult === true) {
      this.setExecutionResult(context, resultPath, FunctionResultCode.SUCCESS);
    } else {
      this.setExecutionResult(context, resultPath, FunctionResultCode.INTERNAL_ERROR);
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
    return this.setValueOrLog(latestReportPath, blockNumber, auth, timestamp);
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
    sendSignedTx(parentChainEndpoint, payloadTx)
    .then((result) => {
      if (!_.get(result, 'success', false) === true) {
        logger.info(`  =>> Failed to send signed transaction to the parent blockchain: ${txHash}`);
        return;
      }
      logger.info(`  =>> Successfully sent signed transaction to the parent blockchain: ${txHash}`);
    });
    const action = {
      ref: this.getCheckinParentFinalizeResultPathFromValuePath(valuePath, txHash),
      valueFunction: (success) => !!success,
      is_global: true,
      tx_body: payloadTx.tx_body,
    };
    this.tp.addRemoteTransaction(txHash, action);
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
    const checkinAmount = _.get(checkinPayload, 'transaction.tx_body.operation.value', 0);
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
    return signAndSendTx(endpoint, transferTx, ownerPrivateKey);
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

  getServiceAccountAdminPath(accountName) {
    const parsed = ChainUtil.parseServAcntName(accountName);
    return `${PredefinedDbPaths.SERVICE_ACCOUNTS}/${parsed[0]}/${parsed[1]}/${parsed[2]}/` +
        `${PredefinedDbPaths.SERVICE_ACCOUNTS_ADMIN}`;
  }

  getServiceAccountAdminAddrPath(accountName, adminAddr) {
    return `${this.getServiceAccountAdminPath(accountName)}/${adminAddr}`;
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

  getPaymentPayRecordsResultPath(service, user, paymentKey, recordId) {
    return (`${PredefinedDbPaths.PAYMENTS}/${service}/${user}/${paymentKey}/` +
        `${PredefinedDbPaths.PAYMENTS_PAY}/${recordId}/${PredefinedDbPaths.PAYMENTS_RESULT}`);
  }

  getPaymentClaimRecordsResultPath(service, user, paymentKey, recordId) {
    return (`${PredefinedDbPaths.PAYMENTS}/${service}/${user}/${paymentKey}/` +
        `${PredefinedDbPaths.PAYMENTS_CLAIM}/${recordId}/${PredefinedDbPaths.PAYMENTS_RESULT}`);
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
