const { PredefinedDbPaths, FunctionResultCode, DefaultValues } = require('../constants');
const ChainUtil = require('../chain-util');
const {FunctionProperties} = require('../constants')
const axios = require('axios')

const FUNC_PARAM_PATTERN = /^{(.*)}$/;
const EventListenerWhitelist = {'https://events.ainetwork.ai': true}

const FunctionPaths = {
  TRANSFER: `${PredefinedDbPaths.TRANSFER}/{from}/{to}/{key}/${PredefinedDbPaths.TRANSFER_VALUE}`,
  DEPOSIT: `${PredefinedDbPaths.DEPOSIT}/{service}/{user}/{deposit_id}/${PredefinedDbPaths.DEPOSIT_VALUE}`,
  WITHDRAW: `${PredefinedDbPaths.WITHDRAW}/{service}/{user}/{withdraw_id}/${PredefinedDbPaths.WITHDRAW_VALUE}`,
};

/**
 * Built-in functions with function paths.
 */
class Functions {
  constructor(db) {
    this.db = db;
    this.funcMap = {
      [FunctionPaths.TRANSFER]: this._transfer.bind(this),
      [FunctionPaths.DEPOSIT]: this._deposit.bind(this),
      [FunctionPaths.WITHDRAW]: this._withdraw.bind(this),
    };
  }

  /**
   * Runs functions of function paths matched with given database path.
   *
   * @param {Array} parsedValuePath parsed value path
   * @param {*} value value set on the database path
   * @param {Number} timestamp the time at which the transaction was created and signed
   */
  runBuiltInFunctions(parsedValuePath, value, timestamp, currentTime) {
    const matches = this._matchFunctionPaths(parsedValuePath);
    matches.forEach((elem) => {
      console.log(
        `  ==> Running built-in function '${elem.func.name}' with value '${value}', timestamp '${timestamp}', currentTime '${currentTime}' and params: ` +
        JSON.stringify(elem.params));
      elem.func(value, { params: elem.params, timestamp, currentTime });
    })
  }

  triggerEvent(transaction) {
    const parsedValuePath = ChainUtil.parsePath(transaction.operation.ref);
    const match = this.matchTriggerPaths(parsedValuePath);
    if (match && match.event_listener) {
      if (match.event_listener in EventListenerWhitelist) {
        console.log(
          `  ==> Triggering function event'${match}' with transaction '${transaction}'`)
        return axios.post(match.event_listener, {
          transaction: transaction,
          function: match
        })
      }
    }
  }

  // TODO(seo): Optimize function path matching (e.g. using Aho-Corasick-like algorithm).
  _matchFunctionPaths(parsedValuePath) {
    let funcs = [];
    Object.keys(this.funcMap).forEach((path) => {
      const parsedFuncPath = ChainUtil.parsePath(path);
      const result = Functions.matchPaths(parsedValuePath, parsedFuncPath);
      if (result !== null) {
        funcs.push({ func: this.funcMap[path], params: result.params })
      }
    });
    return funcs;
  }

  static matchPaths(parsedValuePath, parsedFuncPath) {
    if (parsedFuncPath.length === parsedValuePath.length) {
      let params = {};
      let matched = true;
      for (let i = 0; i < parsedFuncPath.length; i++) {
        if (parsedFuncPath[i].match(FUNC_PARAM_PATTERN)) {
          const paramName = parsedFuncPath[i].replace(FUNC_PARAM_PATTERN, '$1');
          params[paramName] = parsedValuePath[i];
        } else if (parsedFuncPath[i] !== parsedValuePath[i]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return { params };
      }
    }
    return null
  }

  matchTriggerPaths(parsedValuePath) {
    let params = {};
    let matched = true;
    let currentRef = this.db.getRefForReading([PredefinedDbPaths.FUNCTIONS_ROOT])
    for (let i = 0; i < parsedValuePath.length; i++) {
      // TODO(minhyun): Support $key
      if (currentRef[parsedValuePath[i]]) {
        currentRef = currentRef[parsedValuePath[i]]
      }
    }
    return currentRef[FunctionProperties.FUNCTION]
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
    const user = context.params.user;
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
    const user = context.params.user;
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

  _getAllDepositsPath(service, user) {
    return (`${PredefinedDbPaths.DEPOSIT}/${service}/${user}`);
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
