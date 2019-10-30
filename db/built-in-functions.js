const { PredefinedDbPaths, FunctionResultCode, DepositLockupTypes, DefaultValues } = require('../constants');
const ChainUtil = require('../chain-util');

const FUNC_PARAM_PATTERN = /^{(.*)}$/;

const FunctionPaths = {
  TRANSFER: `${PredefinedDbPaths.TRANSFER}/{from}/{to}/{key}/${PredefinedDbPaths.TRANSFER_VALUE}`,
  DEPOSIT: `${PredefinedDbPaths.DEPOSIT}/{service}/{user}/{deposit_id}/${PredefinedDbPaths.DEPOSIT_VALUE}`,
  WITHDRAW: `${PredefinedDbPaths.WITHDRAW}/{service}/{user}/{withdraw_id}/${PredefinedDbPaths.WITHDRAW_VALUE}`,
};

/**
 * Built-in functions with function paths.
 */
class BuiltInFunctions {
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
  runFunctions(parsedValuePath, value, timestamp) {
    const matches = this._matchFunctionPaths(parsedValuePath);
    matches.forEach((elem) => {
      console.log(
        `  ==> Running built-in function '${elem.func.name}' with value '${value}', timestamp '${timestamp}', and params: ` +
        JSON.stringify(elem.params));
      elem.func(value, { params: elem.params, timestamp });
    })
  }

  // TODO(seo): Optimize function path matching (e.g. using Aho-Corasick-like algorithm).
  _matchFunctionPaths(parsedValuePath) {
    let funcs = [];
    Object.keys(this.funcMap).forEach((path) => {
      const parsedFuncPath = ChainUtil.parsePath(path);
      const result = BuiltInFunctions.matchPaths(parsedValuePath, parsedFuncPath);
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

  // TODO(seo): Add adress validity check.
  _transfer(value, context) {
    const from = context.params.from;
    const to = context.params.to;
    const key = context.params.key;
    const fromBalancePath = this._getBalancePath(from);
    const toBalancePath = this._getBalancePath(to);
    let fromBalance = this.db.getValue(fromBalancePath);
    let toBalance = this.db.getValue(toBalancePath);
    const resultPath = this._getTransferResultPath(from, to, key);
    if (fromBalance >= value) {
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(fromBalancePath)),
          fromBalance - value);
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(toBalancePath)),
          toBalance + value);
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.SUCCESS });
    } else {
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.FAILURE });
    }
  }

  _deposit(value, context) {
    const service = context.params.service;
    const user = context.params.user;
    const depositId = context.params.deposit_id;
    const timestamp = context.timestamp;
    const resultPath = this._getDepositResultPath(service, user, depositId);
    if (timestamp > Date.now()) {
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.FAILURE });
      throw Error(`[_deposit] Invalid timestamp (now: ${Date.now()}, timestamp: ${timestamp})`)
    }
    const userBalancePath = this._getBalancePath(user);
    const userBalance = this.db.getValue(userBalancePath);
    if (value > 0 && userBalance >= value) {
      const depositAmountPath = this._getDepositAmountPath(service, user);
      const currentDeposit = this.db.getValue(depositAmountPath);
      const depositCreatedAtPath = this._getDepositCreatedAtPath(service, user, depositId);
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(depositCreatedAtPath)),
          timestamp);
      const configsPath = this._getDepositConfigPath(service);
      const configs = this.db.getValue(configsPath) || {};
      const expirationPath = this._getDepositExpirationPath(service, user);
      const lockup = configs[PredefinedDbPaths.DEPOSIT_LOCKUP_DURATION] !== null ?
          configs[PredefinedDbPaths.DEPOSIT_LOCKUP_DURATION] : DefaultValues.DEPOSIT_LOCKUP_DURATION;
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(expirationPath)),
          Number(timestamp) + Number(lockup));
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(userBalancePath)),
          userBalance - value);
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(depositAmountPath)),
          currentDeposit + value);
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.SUCCESS });
    } else {
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.FAILURE });
      throw Error(`[_deposit] Invalid deposit amount (balance: ${userBalance}, value: ${value})`);
    }
  }

  _withdraw(value, context) {
    const service = context.params.service;
    const user = context.params.user;
    const withdrawId = context.params.withdraw_id;
    const timestamp = context.timestamp;
    const depositAmountPath = this._getDepositAmountPath(service, user);
    const depositAmount = this.db.getValue(depositAmountPath) || 0;
    const expirationPath = this._getDepositExpirationPath(service, user);
    let expireAt = this.db.getValue(expirationPath);
    const resultPath = this._getWithdrawResultPath(service, user, withdrawId);
    const withdrawCreatedAtPath = this._getWithdrawCreatedAtPath(service, user, withdrawId);
    this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(withdrawCreatedAtPath)), timestamp);
    if (value > 0 && depositAmount >= value) {
      if (!expireAt) {
        const configsPath = this._getDepositConfigPath(service);
        const configs = this.db.getValue(configsPath) || {};
        // Get the latest deposit request and set the expiration time accordingly.
        const allDepositsPath = this._getAllDepositsPath(service, user);
        const depositRequests = this.db.getValue(allDepositsPath) || {};
        if (Object.keys(depositRequests).length === 0) {
          this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
              { code: FunctionResultCode.FAILURE });
          throw Error(`[_withdraw] No deposit available`);
        }
        let newest = 0;
        Object.values(depositRequests).forEach(deposit => {
          if (newest < deposit[PredefinedDbPaths.DEPOSIT_CREATED_AT]) {
            newest = deposit[PredefinedDbPaths.DEPOSIT_CREATED_AT];
          }
        });
        const lockup = configs[PredefinedDbPaths.DEPOSIT_LOCKUP_DURATION] !== null ?
            configs[PredefinedDbPaths.DEPOSIT_LOCKUP_DURATION] : DefaultValues.DEPOSIT_LOCKUP_DURATION;
        expireAt = newest + lockup;
        this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(expirationPath)),
            expireAt);
      }
      if (expireAt <= Date.now()) {
        const userBalancePath = this._getBalancePath(user);
        const userBalance = this.db.getValue(userBalancePath);
        this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(depositAmountPath)),
            depositAmount - value);
        this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(userBalancePath)),
            userBalance + value);
        this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
            { code: FunctionResultCode.SUCCESS });
      } else {
        // Still in lock-up period.
        this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
            { code: FunctionResultCode.FAILURE });
        throw Error(`[_withdraw] Deposit still locked up. Will expire in ${expireAt - Date.now()} ms.`);
      }
    } else {
      // Not enough deposit.
      this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(resultPath)),
          { code: FunctionResultCode.FAILURE });
      throw Error(`[_withdraw] Not enough deposit. Requested amount: ${value}, deposit: ${depositAmount}`);
    }
  }

  _getBalancePath(address) {
    return `${PredefinedDbPaths.ACCOUNT}/${address}/${PredefinedDbPaths.BALANCE}`;
  }

  _getTransferResultPath(from, to, key) {
    return (
      `${PredefinedDbPaths.TRANSFER}/${from}/${to}/${key}/${PredefinedDbPaths.TRANSFER_RESULT}`);
  }

  _getAllDepositsPath(service, user) {
    return (`${PredefinedDbPaths.DEPOSIT}/${service}/${user}`);
  }

  _getDepositConfigPath(service) {
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/${PredefinedDbPaths.DEPOSIT_CONFIG}`);
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

module.exports = BuiltInFunctions;
