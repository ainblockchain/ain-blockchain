const logger = require('../logger');
const {
  PredefinedDbPaths, FunctionTypes, FunctionResultCode, FunctionProperties, NativeFunctionIds,
  DefaultValues, ShardingProperties, OwnerProperties, buildOwnerPermissions, RuleProperties
} = require('../constants');
const ChainUtil = require('../chain-util');
const axios = require('axios');
const ainUtil = require('@ainblockchain/ain-util');

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
      [NativeFunctionIds.INIT_SHARD]: this._initializeShard.bind(this),
      [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: this._updateLatestShardReport.bind(this),
    };
  }

  /**
   * Runs functions of function paths matched with given database path.
   *
   * @param {Array} parsedValuePath parsed value path
   * @param {Object} value value set on the database path
   * @param {Number} timestamp the time at which the transaction was created and signed
   * @param {Number} currentTime current time
   * @param {Object} transaction transaction
   */
  // TODO(seo): Support multiple-functions per path.
  // TODO(seo): Trigger subtree functions.
  triggerFunctions(parsedValuePath, value, timestamp, currentTime, transaction) {
    const matched = this.db.matchFunctionForParsedPath(parsedValuePath);
    const functionConfig = matched.matchedFunction.config;
    if (functionConfig) {
      if (functionConfig.function_type === FunctionTypes.NATIVE) {
        const nativeFunction = this.nativeFunctionMap[functionConfig.function_id];
        if (nativeFunction) {
          const functionPath = matched.matchedFunction.path;
          const params = Functions.convertPathVars2Params(matched.pathVars);
          logger.info(
            `  ==> Running native function '${functionConfig.function_id}' ` +
            `with value '${value}', timestamp '${timestamp}',
            currentTime '${currentTime}', params: ` + JSON.stringify(params) + 
            ` and functionPath: ` + JSON.stringify(functionPath, null, 2));
          nativeFunction(value, { params, timestamp, currentTime, functionPath });
        }
      } else if (functionConfig.function_type === FunctionTypes.REST) {
        if (functionConfig.event_listener &&
            functionConfig.event_listener in EventListenerWhitelist) {
          logger.info(
            `  ==> Triggering an event for function '${functionConfig.function_id}' ` +
            `of '${functionConfig.event_listener}' ` +
            `with transaction: ${JSON.stringify(transaction, null, 2)}`)
          return axios.post(functionConfig.event_listener, {
            transaction,
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
    this.db.writeDatabase(
        this._getFullValuePath(ChainUtil.parsePath(depositCreatedAtPath)), timestamp);
    // TODO (lia): move this check to when we first receive the transaction
    if (timestamp > currentTime) {
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
    this.db.writeDatabase(
        this._getFullValuePath(ChainUtil.parsePath(withdrawCreatedAtPath)), timestamp);
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

  _initializeShard(value, context) {
    if (!Functions.isValidShardingConfig(value)) {
      // Shard owner trying to remove the shard
      // TODO(lia): support modification of the shard config (update owners, rules, functions, values)
      return;
    }
    const shardingPath = ChainUtil.parsePath(ainUtil.decode(context.params.sharding_path));
    if (ChainUtil.formatPath(shardingPath) !== value[ShardingProperties.SHARDING_PATH]) {
      return;
    }
    const shardOwner = value[ShardingProperties.SHARD_OWNER];
    const shardReporter = value[ShardingProperties.SHARD_REPORTER];
    // Set owners
    this.db.writeDatabase(this._getFullOwnerPath(shardingPath), {
      [OwnerProperties.OWNER]: {
        [OwnerProperties.OWNERS]: {
          [shardOwner]: buildOwnerPermissions(false, true, true, true),
          [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
        }
      }
    });
    // Set rules
    // TODO(lia): make this rule tighter (e.g. only allow writing at /$sharding_path/$block_number, values should be strings prefixed with '0x', and cannot write at /$sharding_path/latest)
    this.db.writeDatabase(this._getFullRulePath(shardingPath), {
      [RuleProperties.WRITE]: `auth === '${shardReporter}'`,
    });
    // Reset functions
    this.db.writeDatabase(this._getFullFunctionPath(shardingPath), null);
    // Reset values
    this.db.writeDatabase(this._getFullValuePath(shardingPath), null);
    // Add a native function for shard proof hash reporting
    this.db.writeDatabase(
      this._getFullFunctionPath([...shardingPath, '$block_number', PredefinedDbPaths.SHARDING_PROOF_HASH]),
      {
        [FunctionProperties.FUNCTION]: {
          [FunctionProperties.FUNCTION_TYPE]: FunctionTypes.NATIVE,
          [FunctionProperties.FUNCTION_ID]: NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT
        }
      }
    );
  }

  static isValidShardingConfig(shardingConfig) {
    return ChainUtil.isDict(shardingConfig) &&
      ChainUtil.isString(shardingConfig[ShardingProperties.SHARDING_PATH]) &&
      ChainUtil.isString(shardingConfig[ShardingProperties.PARENT_CHAIN_POC]) &&
      ChainUtil.isNumber(shardingConfig[ShardingProperties.REPORTING_PERIOD]) &&
      ChainUtil.isValAddr(shardingConfig[ShardingProperties.SHARD_OWNER]) &&
      ChainUtil.isValAddr(shardingConfig[ShardingProperties.SHARD_REPORTER]) &&
      ChainUtil.isValShardProto(shardingConfig[ShardingProperties.SHARDING_PROTOCOL]);
  }

  _updateLatestShardReport(value, context) {
    const blockNumber = Number(context.params.block_number);
    if (!ChainUtil.isArray(context.functionPath)) {
      return null;
    }
    const index = context.functionPath.findIndex((el) => el === '$block_number');
    if (index < 0) {
      // Invalid function path
      return;
    }
    if (!ChainUtil.isString(value)) {
      // Invalid hash reporting
      return;
    }
    const shardingPath = ChainUtil.formatPath(context.functionPath.slice(0, index));
    const latestReportPath = this._getLatestShardReportPath(shardingPath);
    const currentLatestBlockNumber = this.db.getValue(latestReportPath);
    if (currentLatestBlockNumber !== null && Number(currentLatestBlockNumber) >= blockNumber) {
      // Nothing to update
      return;
    }
    this.db.writeDatabase(this._getFullValuePath(ChainUtil.parsePath(latestReportPath)), blockNumber);
  }

  _transferInternal(fromPath, toPath, value) {
    const fromBalance = this.db.getValue(fromPath);
    if (fromBalance < value) return false;
    const toBalance = this.db.getValue(toPath);
    this.db.writeDatabase(
        this._getFullValuePath(ChainUtil.parsePath(fromPath)), fromBalance - value);
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

  _getLatestShardReportPath(shardingPath) {
    return `${shardingPath}/${PredefinedDbPaths.SHARDING_LATEST}`;
  }

  _getFullOwnerPath(parsedPath) {
    return this.db.getFullPath(parsedPath, PredefinedDbPaths.OWNERS_ROOT);
  }

  _getFullFunctionPath(parsedPath) {
    return this.db.getFullPath(parsedPath, PredefinedDbPaths.FUNCTIONS_ROOT);
  }

  _getFullRulePath(parsedPath) {
    return this.db.getFullPath(parsedPath, PredefinedDbPaths.RULES_ROOT);
  }

  _getFullValuePath(parsedPath) {
    return this.db.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
  }
}

module.exports = Functions;
