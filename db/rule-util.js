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

  isIntegerString(value) {
    return this.isString(value) && /^-?\d+$/.test(value);
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

  getConsensusWhitelistSize() {
    this.length(this.values(getValue(PathUtil.getConsensusWhitelistPath())).filter((x) => x === true));
  }

  getTokenBridgeConfig(networkName, chainId, tokenId, getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(PathUtil.getTokenBridgeConfigPath(networkName, chainId, tokenId));
  }

  getTokenPoolAddr(networkName, chainId, tokenId, getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(PathUtil.getTokenBridgeTokenPoolPath(networkName, chainId, tokenId));
  }

  validateCheckoutRequestData(networkName, chainId, tokenId, newData, getValue) {
    if (!this.isDict(newData) || !this.isNumber(newData.amount) || newData.amount <= 0 ||
        !this.isString(newData.recipient)) {
      return false;
    }
    return this.isDict(this.getTokenBridgeConfig(networkName, chainId, tokenId, getValue));
  }

  validateCheckoutHistoryData(networkName, chainId, tokenId, userAddr, checkoutId, newData, getValue) {
    const PathUtil = require('../common/path-util');
    const { FunctionResultCode } = require('../common/constants');
    const request = getValue(
        PathUtil.getCheckoutRequestPath(networkName, chainId, tokenId, userAddr, checkoutId));
    if (!request || !this.isDict(request) || !this.isDict(newData)) {
      return false;
    }
    if (!_.isEqual(request, newData.request)) {
      return false;
    }
    return this.isDict(newData.response) && this.isValidHash(newData.response.tx_hash) &&
        (newData.response.status === FunctionResultCode.SUCCESS ||
        newData.response.status === FunctionResultCode.FAILURE);
  }

  validateCheckinRequestData(networkName, chainId, tokenId, newData, getValue) {
    if (!this.isDict(newData) || !this.isNumber(newData.amount) || newData.amount <= 0 ||
        !this.isString(newData.sender)) {
      return false;
    }
    return this.isDict(this.getTokenBridgeConfig(networkName, chainId, tokenId, getValue));
  }

  validateCheckinHistoryData(networkName, chainId, tokenId, userAddr, checkinId, newData, getValue) {
    const PathUtil = require('../common/path-util');
    const { FunctionResultCode } = require('../common/constants');
    const request = getValue(
        PathUtil.getCheckinRequestPath(networkName, chainId, tokenId, userAddr, checkinId));
    if (!request || !this.isDict(request) || !this.isDict(newData)) {
      return false;
    }
    if (!_.isEqual(request, newData.request)) {
      return false;
    }
    return this.isDict(newData.response) && this.isValidHash(newData.response.tx_hash) &&
        (newData.response.status === FunctionResultCode.SUCCESS ||
        newData.response.status === FunctionResultCode.FAILURE);
  }

  validateClaimRewardData(userAddr, newData, getValue) {
    const PathUtil = require('../common/path-util');
    if (!this.isDict(newData) || !this.isNumber(newData.amount) || newData.amount <= 0) {
      return false;
    }
    const unclaimed = getValue(PathUtil.getConsensusRewardsUnclaimedPath(userAddr)) || 0;
    return newData.amount <= unclaimed;
  }

  validateCollectFeeData(data, newData, from, getValue) {
    return data === null && this.isDict(newData) && this.isNumber(newData.amount) &&
        newData.amount <= this.getBalance(from, getValue);
  }

  validateConsensusVoteData(newData, userAddr, blockHash, lastBlockNumber, getValue) {
    if (!this.isDict(newData) || !this.isBool(newData.is_against) || !this.isNumber(newData.stake)
        || newData.block_hash !== blockHash) {
      return false;
    }
    if (newData.is_against && !this.isValidatorOffenseType(newData.offense_type)) {
      return false;
    }
    return lastBlockNumber < 1 || this.getConsensusStakeBalance(userAddr, getValue) === newData.stake;
  }

  isValidatorOffenseType(type) {
    const { ValidatorOffenseTypes } = require('../consensus/constants');
    return !!ValidatorOffenseTypes[type];
  }

  // NOTE(liayoo): Allows wildcards for function url whitelist items.
  isValidUrlWhitelistItem(url) {
    try {
      new URL(url);
    } catch (e) {
      return false;
    }
    return true;
  }

  // NOTE(liayoo): Applies a stricter rule than isValidUrlWhitelistItem() does.
  // Asterisks are not allowed in the domain name, for instance.
  isValidUrl(url) {
    const strictUrlRegex = /^(?:(?:https?|ftp):\/\/)(?:(?:(?:\S+(?::\S*)?@)?(?:(?!(?:10|127|172)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,}))\.?)|localhost)(?::\d{2,5})?)(?:[/?#]\S*)?$/i
    return this.isString(url) ? strictUrlRegex.test(url) : false;
  }

  isValidPrivateUrl(url) {
    const privateUrlRegex = /(^127\.)|(^192\.168\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^::1$)|(^[fF][cCdD])/;
    return this.isString(url) ? privateUrlRegex.test(url) : false;
  }

  validateRestFunctionsUrlWhitelistData(userAddr, data, newData, getValue) {
    const PathUtil = require('../common/path-util');
    if (getValue(PathUtil.getDevelopersRestFunctionsUserWhitelistUserPath(userAddr)) !== true) {
      return false;
    }
    if (newData !== null && !this.isValidUrlWhitelistItem(newData)) {
      return false;
    }
    const maxUrlsPerDeveloper = getValue(PathUtil.getDevelopersRestFunctionsParamsMaxUrlsPerDeveloperPath());
    const existingUrls = getValue(PathUtil.getDevelopersRestFunctionsUrlWhitelistUserPath(userAddr)) || {};
    return data !== null || newData === null ||
        Object.keys(existingUrls).length < maxUrlsPerDeveloper;
  }
}

module.exports = RuleUtil;
