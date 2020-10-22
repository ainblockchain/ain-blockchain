const logger = require('../logger');
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
  ACCOUNT_INDEX,
} = require('../constants');
const ChainUtil = require('../chain-util');
const { sendSignedTx } = require('../server/util');

const parentChainEndpoint = GenesisSharding[ShardingProperties.PARENT_CHAIN_POC] + '/json-rpc';

const EventListenerWhitelist = {
  'https://events.ainetwork.ai/trigger': true,
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
      [NativeFunctionIds.TRANSFER]: this._transfer.bind(this),
      [NativeFunctionIds.DEPOSIT]: this._deposit.bind(this),
      [NativeFunctionIds.WITHDRAW]: this._withdraw.bind(this),
      [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: this._updateLatestShardReport.bind(this),
      [NativeFunctionIds.OPEN_CHECKIN]: this._openCheckin.bind(this),
      [NativeFunctionIds.CLOSE_CHECKIN]: this._closeCheckin.bind(this),
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
            `  ==> Running native function '${functionConfig.function_id}' with\n` +
            `valuePath: '${ChainUtil.formatPath(parsedValuePath)}', ` +
            `functionPath: '${ChainUtil.formatPath(functionPath)}', ` +
            `value: '${JSON.stringify(value, null, 2)}', timestamp: '${timestamp}', ` +
            `currentTime: '${currentTime}', and params: ${JSON.stringify(params, null, 2)}`);
          // Execute the matched native function.
          nativeFunction(
              value,
              {
                valuePath: parsedValuePath,
                functionPath,
                params,
                timestamp,
                currentTime,
                transaction
              });
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

  getLatestShardReportPathFromValuePath(valuePath) {
    const branchPath = ChainUtil.formatPath(valuePath.slice(0, -2));
    return this._getLatestShardReportPath(branchPath);
  }

  _updateLatestShardReport(value, context) {
    const blockNumber = Number(context.params.block_number);
    const valuePath = context.valuePath;
    if (!ChainUtil.isArray(context.functionPath)) {
      return;
    }
    if (!ChainUtil.isString(value)) {
      // Removing old report or invalid reporting
      return;
    }
    const latestReportPath = this.getLatestShardReportPathFromValuePath(valuePath);
    const currentLatestBlockNumber = this.db.getValue(latestReportPath);
    if (currentLatestBlockNumber !== null && Number(currentLatestBlockNumber) >= blockNumber) {
      // Nothing to update
      return;
    }
    this.db.writeDatabase(
        this._getFullValuePath(ChainUtil.parsePath(latestReportPath)), blockNumber);
  }

  getCheckinParentFinalizePathFromValuePath(valuePath) {
    const branchPath = ChainUtil.formatPath(valuePath.slice(0, -1));
    return this._getCheckinParentFinalizePath(branchPath);
  }

  // TODO(seo): Support refund feature.
  _openCheckin(value, context) {
    // TODO(lia): implement this
    const valuePath = context.valuePath;
    const payloadTx = _.get(value, 'payload', null);
    const txHash = ChainUtil.hashSignature(payloadTx.signature);
    if (this.tp && this.db.isFinalizedState &&
        payloadTx && payloadTx.transaction && payloadTx.signature) {
      sendSignedTx(parentChainEndpoint, payloadTx)
      .then(result => {
        if (!_.get(result, 'success', false) === true) {
          logger.info(
              `  =>> Failed to send signed transaction to the parent blockchain: ${txHash}`);
          return;
        }
        logger.info(
            `  =>> Successfully sent signed transaction to the parent blockchain: ${txHash}`);
        const action = {
          ref: this.getCheckinParentFinalizePathFromValuePath(valuePath),
          value: {
            tx_hash: txHash,
          },
          transaction: payloadTx.transaction,
        };
        this.tp.addRemoteTransaction(txHash, action);
      });
    } else {
      logger.info(`  =>> Skip sending signed transaction to the parent blockchain: ${txHash}`);
    }
  }

  _closeCheckin(value, context) {
    // TODO(lia): implement this
    console.log(`!!!!!_closeCheckin(): ${ACCOUNT_INDEX}`)
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
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/` +
        `${PredefinedDbPaths.DEPOSIT_CONFIG}/${PredefinedDbPaths.DEPOSIT_LOCKUP_DURATION}`);
  }

  _getDepositAmountPath(service, user) {
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/${user}/` +
        `${PredefinedDbPaths.DEPOSIT_VALUE}`);
  }

  _getDepositExpirationPath(service, user) {
    return (`${PredefinedDbPaths.DEPOSIT_ACCOUNTS}/${service}/${user}/` +
        `${PredefinedDbPaths.DEPOSIT_EXPIRE_AT}`);
  }

  _getDepositCreatedAtPath(service, user, depositId) {
    return (`${PredefinedDbPaths.DEPOSIT}/${service}/${user}/${depositId}/` +
        `${PredefinedDbPaths.DEPOSIT_CREATED_AT}`);
  }

  _getDepositResultPath(service, user, depositId) {
    return (`${PredefinedDbPaths.DEPOSIT}/${service}/${user}/${depositId}/` +
        `${PredefinedDbPaths.DEPOSIT_RESULT}`);
  }

  _getWithdrawCreatedAtPath(service, user, withdrawId) {
    return (`${PredefinedDbPaths.WITHDRAW}/${service}/${user}/${withdrawId}/` +
        `${PredefinedDbPaths.WITHDRAW_CREATED_AT}`);
  }

  _getWithdrawResultPath(service, user, withdrawId) {
    return (`${PredefinedDbPaths.WITHDRAW}/${service}/${user}/${withdrawId}/` +
        `${PredefinedDbPaths.WITHDRAW_RESULT}`);
  }

  _getLatestShardReportPath(branchPath) {
    return `${branchPath}/${ShardingProperties.LATEST}`;
  }

  _getCheckinParentFinalizePath(branchPath) {
    return `${branchPath}/${PredefinedDbPaths.CHECKIN_PARENT_FINALIZE}`;
  }

  _getFullValuePath(parsedPath) {
    return this.db.getFullPath(parsedPath, PredefinedDbPaths.VALUES_ROOT);
  }
}

module.exports = Functions;
