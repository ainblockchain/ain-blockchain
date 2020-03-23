const logger = require('../logger');
const {
  PredefinedDbPaths, FunctionProperties, FunctionTypes, FunctionResultCode, NativeFunctionIds,
  DefaultValues
} = require('../constants');
const ChainUtil = require('../chain-util');
const axios = require('axios');

const EventListenerWhitelist = {
  'https://events.ainetwork.ai/trigger': true,
  'http://localhost:3000/trigger': true
};

/**
 * Built-in functions with function paths.
 */
class Functions {
  constructor(db) {
    this.db = db;
    this.nativeFunctionMap = {
      [NativeFunctionIds.TRANSFER]: this._transfer.bind(this),
      [NativeFunctionIds.DEPOSIT]: this._deposit.bind(this),
      [NativeFunctionIds.WITHDRAW]: this._withdraw.bind(this),
    };
  }

  /**
   * Runs functions of function paths matched with given database path.
   *
   * @param {Array} parsedValuePath parsed value path
   * @param {*} value value set on the database path
   * @param {Number} timestamp the time at which the transaction was created and signed
   * @param {Number} currentTime current time
   * @param {Number} context context
   */
  runFunctions(parsedValuePath, value, timestamp, currentTime, context) {
    const matched = this.db.matchFunctionForParsedPath(parsedValuePath);
    const functionConfig = matched.matchedFunction.config;
    if (functionConfig) {
      if (functionConfig.function_type === FunctionTypes.NATIVE) {
        const nativeFunction = this.nativeFunctionMap[functionConfig.function_id];
        if (nativeFunction) {
          const params = Functions.convertPathVars2Params(matched.pathVars);
          logger.info(
            `  ==> Running native function '${functionConfig.function_id}' ` +
            `with value '${value}', timestamp '${timestamp}',
            currentTime '${currentTime}' and params: ` + JSON.stringify(params));
          nativeFunction(value, { params, timestamp, currentTime });
        }
      } else if (functionConfig.function_type === FunctionTypes.REST) {
        if (functionConfig.event_listener &&
            functionConfig.event_listener in EventListenerWhitelist) {
          logger.info(
            `  ==> Triggering an event for function '${functionConfig.function_id}' ` +
            `of '${functionConfig.event_listener}' ` +
            `with transaction: ${JSON.stringify(context.transaction, null, 2)}`)
          return axios.post(functionConfig.event_listener, {
            transaction: context.transaction,
            function: functionConfig
          });
        }
      }
    }
    return true;
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

  // TODO(seo): Add adress validity check.
  _transfer(value, context) {
    const from = context.params.from;
    const to = context.params.to;
    const key = context.params.key;
    const fromBalancePath = this._getBalancePath(from);
    const toBalancePath = this._getBalancePath(to);
    const resultPath = this._getTransferResultPath(from, to, key);
    if (this._transferInternal(fromBalancePath, toBalancePath, value)) {
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.SUCCESS });
    } else {
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.INSUFFICIENT_BALANCE });
    }
  }

  _deposit(value, context) {
    const service = context.params.service;
    const user = context.params.user_addr;
    const depositId = context.params.deposit_id;
    const timestamp = context.timestamp;
    const currentTime = context.currentTime;
    const resultPath = this._getDepositResultPath(service, user, depositId);
    const depositCreatedAtPath = this._getDepositCreatedAtPath(service, user, depositId);
    this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(depositCreatedAtPath)), timestamp);
    if (timestamp > currentTime) { // TODO (lia): move this check to when we first receive the transaction
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.FAILURE });
      return;
    }
    const userBalancePath = this._getBalancePath(user);
    const depositAmountPath = this._getDepositAmountPath(service, user);
    if (this._transferInternal(userBalancePath, depositAmountPath, value)) {
      const lockup = this.db.getValue(this._getDepositLockupDurationPath(service)) ||
          DefaultValues.DEPOSIT_LOCKUP_DURATION_MS;
      const expirationPath = this._getDepositExpirationPath(service, user);
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(expirationPath)),
          Number(timestamp) + Number(lockup));
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.SUCCESS });
    } else {
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.INSUFFICIENT_BALANCE });
    }
  }

  _withdraw(value, context) {
    const service = context.params.service;
    const user = context.params.user_addr;
    const withdrawId = context.params.withdraw_id;
    const timestamp = context.timestamp;
    const currentTime = context.currentTime;
    const depositAmountPath = this._getDepositAmountPath(service, user);
    const userBalancePath = this._getBalancePath(user);
    const resultPath = this._getWithdrawResultPath(service, user, withdrawId);
    const withdrawCreatedAtPath = this._getWithdrawCreatedAtPath(service, user, withdrawId);
    this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(withdrawCreatedAtPath)), timestamp);
    if (this._transferInternal(depositAmountPath, userBalancePath, value)) {
      const expireAt = this.db.getValue(this._getDepositExpirationPath(service, user));
      if (expireAt <= currentTime) {
        this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
            { code: FunctionResultCode.SUCCESS });
      } else {
        // Still in lock-up period.
        this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
            { code: FunctionResultCode.IN_LOCKUP_PERIOD });
      }
    } else {
      // Not enough deposit.
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.INSUFFICIENT_BALANCE });
    }
  }

  _transferInternal(fromPath, toPath, value) {
    const fromBalance = this.db.getValue(fromPath);
    if (fromBalance < value) return false;
    const toBalance = this.db.getValue(toPath);
    this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(fromPath)), fromBalance - value);
    this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(toPath)), toBalance + value);
    return true;
  }

  _getBalancePath(address) {
    return `${PredefinedDbPaths.ACCOUNTS}/${address}/${PredefinedDbPaths.BALANCE}`;
  }

  _getTransferResultPath(from, to, key) {
    return (
      `${PredefinedDbPaths.TRANSFER}/${from}/${to}/${key}/${PredefinedDbPaths.TRANSFER_RESULT}`);
  }

  _getDepositLockupDurationPath(service) {
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/${PredefinedDbPaths.DEPOSIT_CONFIG}/${PredefinedDbPaths.DEPOSIT_LOCKUP_DURATION}`);
  }

  _getDepositAmountPath(service, user) {
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/${user}/${PredefinedDbPaths.DEPOSIT_VALUE}`);
  }

  _getDepositExpirationPath(service, user) {
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/${user}/${PredefinedDbPaths.DEPOSIT_EXPIRE_AT}`);
  }

  _getDepositCreatedAtPath(service, user, depositId) {
    return (`${PredefinedDbPaths.DEPOSIT}/${service}/${user}/${depositId}/${PredefinedDbPaths.DEPOSIT_CREATED_AT}`);
  }

  _getDepositResultPath(service, user, depositId) {
    return (`${PredefinedDbPaths.DEPOSIT}/${service}/${user}/${depositId}/${PredefinedDbPaths.DEPOSIT_RESULT}`);
  }

  _getWithdrawCreatedAtPath(service, user, withdrawId) {
    return (`${PredefinedDbPaths.WITHDRAW}/${service}/${user}/${withdrawId}/${PredefinedDbPaths.WITHDRAW_CREATED_AT}`);
  }

  _getWithdrawResultPath(service, user, withdrawId) {
    return (`${PredefinedDbPaths.WITHDRAW}/${service}/${user}/${withdrawId}/${PredefinedDbPaths.WITHDRAW_RESULT}`);
  }

  _getFullValuePath(parsedPath) {
    return this.db.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
  }
}

module.exports = Functions;
