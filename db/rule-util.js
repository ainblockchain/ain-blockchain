const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');

// NOTE(platfowner): To keep the blockchain deterministic as much as possible over time,
//                   we keep util functions here self-contained as much as possible.
class RuleUtil {
  isBool(value) {
    return typeof value === 'boolean';
  }

  isNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  isInteger(value) {
    return Number.isInteger(value);
  }

  isString(value) {
    return typeof value === 'string';
  }

  isArray(value) {
    return Array.isArray(value);
  }

  isDict(value) {
    return (typeof value === 'object' && value !== null && !this.isArray(value));
  }

  isEmpty(value) {
    return value === null || value === undefined ||
        (this.isArray(value) && value.length === 0) ||
        (this.isDict(value) && Object.keys(value).length === 0);
  }

  isHexString(value) {
    return this.isString(value) && /^0x[0-9A-Fa-f]*$/.test(value);
  }

  isValidHash(value) {
    return this.isHexString(value) && value.length === 66;
  }

  keys(value) {
    if (this.isDict(value)) {
      return Object.keys(value);
    }
    return [];
  }

  length(value) {
    if (this.isString(value) || this.isArray(value)) {
      return value.length;
    }
    if (this.isDict(value)) {
      return this.keys(value).length;
    }
    return 0;
  }

  includes(arr, value) {
    if (!this.isArray(arr)) {
      return false;
    }
    return arr.includes(value);
  }

  isValAddr(addr) {
    return this.isString(addr) && ainUtil.isValidAddress(addr);
  }

  isCksumAddr(addr) {
    return this.isValAddr(addr) && addr === ainUtil.toChecksumAddress(addr);
  }

  isServAcntName(name) {
    const { isServiceAccountServiceType } = require('../common/constants');
    const { isValidServiceName } = require('./state-util');

    if (!this.isString(name)) {
      return false;
    }
    const parsed = name.split('|');
    if (parsed.length < 3) {
      return false;
    }
    return isServiceAccountServiceType(parsed[0]) && isValidServiceName(parsed[1]);
  }

  isValShardProto(value) {
    const { ShardingProtocols } = require('../common/constants');

    return value === ShardingProtocols.NONE || value === ShardingProtocols.POA;
  }

  boolOrFalse(value) {
    return this.isBool(value) ? value : false;
  }

  numberOrZero(num) {
    return this.isNumber(num) ? num : 0;
  }

  stringOrEmpty(str) {
    return this.isString(str) ? str : '';
  }

  toBool(value) {
    return this.isBool(value) ? value : value === 'true';
  }

  toNumberOrNaN(value) {
    return this.isNumber(value) ? value : Number(value);
  }

  toCksumAddr(addr) {
    try {
      return ainUtil.toChecksumAddress(addr);
    } catch (err) {
      return '';
    }
  }

  toEscrowAccountName(source, target, escrowKey) {
    return `${source}:${target}:${escrowKey}`;
  }

  toServiceAccountName(serviceType, serviceName, key) {
    return `${serviceType}|${serviceName}|${key}`;
  }

  areSameAddrs(addr1, addr2) {
    return ainUtil.areSameAddresses(addr1, addr2);
  }

  parseServAcntName(accountName) {
    if (this.isString(accountName)) {
      const parsed = accountName.split('|');
      const arr = [_.get(parsed, '0', null), _.get(parsed, '1', null)];
      if (parsed.length <= 3) {
        arr.push(_.get(parsed, '2', null));
      } else {
        arr.push(parsed.slice(2).join('|'));
      }
      return arr;
    } else {
      return [null, null, null];
    }
  }

  getServiceNameFromServAcntName(accountName) {
    const parsed = this.parseServAcntName(accountName);
    return parsed[1];
  }

  isAppAdmin(appName, address, getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(`${PathUtil.getManageAppConfigAdminPath(appName)}/${address}`) === true;
  }

  isAppAdminFromServAcntName(accountName, address, getValue) {
    const appName = this.getServiceNameFromServAcntName(accountName);
    return this.isAppAdmin(appName, address, getValue);
  }

  getBalancePath(addrOrServAcnt) {
    const PathUtil = require('../common/path-util');
    if (this.isServAcntName(addrOrServAcnt)) {
      const parsed = this.parseServAcntName(addrOrServAcnt);
      return PathUtil.getServiceAccountBalancePath(parsed[0], parsed[1], parsed[2]);
    } else {
      return PathUtil.getAccountBalancePath(addrOrServAcnt);
    }
  }

  getBalance(addrOrServAcnt, getValue) {
    return getValue(this.getBalancePath(addrOrServAcnt)) || 0;
  }

  isBillingUser(billingServAcntName, userAddr, getValue) {
    const PathUtil = require('../common/path-util');
    const parsed = this.parseServAcntName(billingServAcntName);
    const appName = parsed[1];
    const billingId = parsed[2];
    return getValue(`${PathUtil.getManageAppBillingUsersPath(appName, billingId)}/${userAddr}`) === true;
  }

  getConsensusStakeBalance(address, getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(PathUtil.getConsensusStakingAccountBalancePath(address)) || 0;
  }

  getOwnerAddr() {
    const { GenesisAccounts, AccountProperties } = require('../common/constants');
    return _.get(GenesisAccounts, `${AccountProperties.OWNER}.${AccountProperties.ADDRESS}`, null);
  }

  getMinStakeAmount() {
    const { MIN_STAKE_PER_VALIDATOR } = require('../common/constants');
    return MIN_STAKE_PER_VALIDATOR;
  }

  getMaxStakeAmount() {
    const { MAX_STAKE_PER_VALIDATOR } = require('../common/constants');
    return MAX_STAKE_PER_VALIDATOR;
  }

  getMinNumValidators() {
    const { MIN_NUM_VALIDATORS } = require('../common/constants');
    return MIN_NUM_VALIDATORS;
  }

  getTokenBridgeConfig(networkName, chainId, tokenId, getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(PathUtil.getTokenBridgeConfigPath(networkName, chainId, tokenId));
  }

  getTokenPoolAddr(networkName, chainId, tokenId, getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(PathUtil.getTokenBridgeTokenPoolPath(networkName, chainId, tokenId));
  }

  validateCheckoutRequestData(networkName, chainId, tokenId, data, getValue) {
    if (!this.isDict(data) || !this.isNumber(data.amount) || data.amount <= 0 ||
        !this.isString(data.recipient)) {
      return false;
    }
    return this.isDict(this.getTokenBridgeConfig(networkName, chainId, tokenId, getValue));
  }

  validateCheckoutHistoryData(networkName, chainId, tokenId, userAddr, checkoutId, data, getValue) {
    const PathUtil = require('../common/path-util');
    const { FunctionResultCode } = require('../common/constants');
    const request = getValue(
        PathUtil.getCheckoutRequestPath(networkName, chainId, tokenId, userAddr, checkoutId));
    if (!request || !this.isDict(request) || !this.isDict(data)) {
      return false;
    }
    if (!_.isEqual(request, data.request)) {
      return false;
    }
    return this.isDict(data.response) && this.isValidHash(data.response.tx_hash) &&
        (data.response.status === FunctionResultCode.SUCCESS ||
        data.response.status === FunctionResultCode.FAILURE);
  }

  validateCheckinRequestData(networkName, chainId, tokenId, data, getValue) {
    if (!this.isDict(data) || !this.isNumber(data.amount) || data.amount <= 0 ||
        !this.isString(data.sender)) {
      return false;
    }
    return this.isDict(this.getTokenBridgeConfig(networkName, chainId, tokenId, getValue));
  }

  validateCheckinHistoryData(networkName, chainId, tokenId, userAddr, checkinId, data, getValue) {
    const PathUtil = require('../common/path-util');
    const { FunctionResultCode } = require('../common/constants');
    const request = getValue(
        PathUtil.getCheckinRequestPath(networkName, chainId, tokenId, userAddr, checkinId));
    if (!request || !this.isDict(request) || !this.isDict(data)) {
      return false;
    }
    if (!_.isEqual(request, data.request)) {
      return false;
    }
    return this.isDict(data.response) && this.isValidHash(data.response.tx_hash) &&
        (data.response.status === FunctionResultCode.SUCCESS ||
        data.response.status === FunctionResultCode.FAILURE);
  }

  validateClaimRewardData(userAddr, data, getValue) {
    const PathUtil = require('../common/path-util');
    if (!this.isDict(data) || !this.isNumber(data.amount) || data.amount <= 0) {
      return false;
    }
    const unclaimed = getValue(PathUtil.getConsensusRewardsUnclaimedPath(userAddr)) || 0;
    return data.amount <= unclaimed;
  }

  validateCollectFeeData(data, newData, from, getValue) {
    return data === null && this.isDict(newData) && this.isNumber(newData.amount) &&
        newData.amount <= this.getBalance(from, getValue);
  }

  validateConsensusVoteData(data, userAddr, blockHash, lastBlockNumber, getValue) {
    if (!this.isDict(data) || !this.isBool(data.is_against) || !this.isNumber(data.stake) || data.block_hash !== blockHash) {
      return false;
    }
    if (data.is_against && !this.isValidatorOffenseType(data.offense_type)) {
      return false;
    }
    return lastBlockNumber < 1 || this.getConsensusStakeBalance(userAddr, getValue) === data.stake;
  }

  isValidatorOffenseType(type) {
    const { ValidatorOffenseTypes } = require('../consensus/constants');
    return !!ValidatorOffenseTypes[type];
  }
}

module.exports = RuleUtil;
