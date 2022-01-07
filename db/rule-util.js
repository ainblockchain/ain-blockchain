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

  values(value) {
    if (this.isDict(value)) {
      return Object.values(value);
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

  // TODO(platfowner): Update related write rule and pass blockNumber as a parameter.
  isServAcntName(name, blockNumber = null) {
    const { isServiceAccountServiceType } = require('../common/constants');
    const { isValidServiceName } = require('./state-util');

    if (!this.isString(name)) {
      return false;
    }
    const parsed = name.split('|');
    if (parsed.length < 3) {
      return false;
    }
    return isServiceAccountServiceType(parsed[0]) && isValidServiceName(parsed[1], blockNumber);
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

  getMinStakeAmount(getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(
        PathUtil.getSingleBlockchainParamPath('consensus', 'min_stake_for_proposer'));
  }

  getMaxStakeAmount(getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(
        PathUtil.getSingleBlockchainParamPath('consensus', 'max_stake_for_proposer'));
  }

  getMinNumValidators(getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(
        PathUtil.getSingleBlockchainParamPath('consensus', 'min_num_validators'));
  }

  getConsensusProposerWhitelistSize(getValue) {
    const PathUtil = require('../common/path-util');
    const whitelist = getValue(PathUtil.getConsensusProposerWhitelistPath()) || {};
    return this.length(this.values(whitelist).filter((x) => x === true));
  }

  getConsensusValidatorWhitelistSize(getValue) {
    const PathUtil = require('../common/path-util');
    const whitelist = getValue(PathUtil.getConsensusValidatorWhitelistPath()) || {};
    return this.length(this.values(whitelist).filter((x) => x === true));
  }

  getTokenBridgeConfig(networkName, chainId, tokenId, getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(PathUtil.getTokenBridgeConfigPath(networkName, chainId, tokenId));
  }

  getTokenPoolAddr(networkName, chainId, tokenId, getValue) {
    const PathUtil = require('../common/path-util');
    return getValue(PathUtil.getTokenBridgeTokenPoolPath(networkName, chainId, tokenId));
  }

  validateCheckoutRefundData(networkName, chainId, tokenId, userAddr, checkoutId, auth, newData, getValue) {
    const PathUtil = require('../common/path-util');
    if (!this.isString(newData)) {
      return false;
    }
    if (auth.fid !== '_closeCheckout' && auth.addr !== this.getTokenPoolAddr(networkName, chainId, tokenId, getValue)) {
      return false;
    }
    if (!getValue(PathUtil.getCheckoutHistoryPath(networkName, chainId, tokenId, userAddr, checkoutId))) {
      return false;
    }
    return true;
  }

  validateCheckoutRequestData(networkName, chainId, tokenId, userAddr, checkoutId, newData, currentTime, getValue) {
    const { PredefinedDbPaths } = require('../common/constants');
    const PathUtil = require('../common/path-util');
    // NOTE(liayoo): checkoutId should be the same as the transaction's timestamp to prevent duplicates.
    if (!this.isDict(newData) || !this.isNumber(newData.amount) || newData.amount <= 0 ||
        !this.isString(newData.recipient) || !this.isNumber(newData.fee_rate) ||
        Number(checkoutId) !== currentTime) {
      return false;
    }
    const tokenBridgeConfig = this.getTokenBridgeConfig(networkName, chainId, tokenId, getValue);
    if (!this.isDict(tokenBridgeConfig)) {
      return false;
    }
    if (tokenBridgeConfig[PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_CHECKOUT_FEE_RATE] !== newData.fee_rate) {
      return false;
    }
    if (getValue(PathUtil.getCheckoutHistoryPath(networkName, chainId, tokenId, userAddr, checkoutId))) {
      return false;
    }
    return true;
  }

  validateCheckoutHistoryData(networkName, chainId, tokenId, userAddr, checkoutId, newData, getValue) {
    const PathUtil = require('../common/path-util');
    const request = getValue(
        PathUtil.getCheckoutRequestPath(networkName, chainId, tokenId, userAddr, checkoutId));
    if (!request || !this.isDict(request) || !this.isDict(newData)) {
      return false;
    }
    if (!_.isEqual(request, newData.request)) {
      return false;
    }
    // NOTE(liayoo): tx_hash could be undefined if the checkout failed/rejected without a tx generated.
    return this.isDict(newData.response) && this.isBool(newData.response.status) &&
        (newData.response.tx_hash === undefined || this.isValidHash(newData.response.tx_hash));
  }

  validateCheckinRequestData(networkName, chainId, tokenId, userAddr, checkinId, newData, currentTime, getValue) {
    const PathUtil = require('../common/path-util');
    // NOTE(liayoo): checkinId should be the same as the transaction's timestamp to prevent duplicates.
    if (!this.isDict(newData) || !this.isNumber(newData.amount) || newData.amount <= 0 ||
        !this.isString(newData.sender) || !this.isString(newData.sender_proof) ||
        Number(checkinId) !== currentTime) {
      return false;
    }
    if (getValue(PathUtil.getCheckinHistoryPath(networkName, chainId, tokenId, userAddr, checkinId))) {
      return false;
    }
    return this.isDict(this.getTokenBridgeConfig(networkName, chainId, tokenId, getValue));
  }

  validateCheckinHistoryData(networkName, chainId, tokenId, userAddr, checkinId, newData, getValue) {
    const PathUtil = require('../common/path-util');
    const request = getValue(
        PathUtil.getCheckinRequestPath(networkName, chainId, tokenId, userAddr, checkinId));
    if (!request || !this.isDict(request) || !this.isDict(newData)) {
      return false;
    }
    if (!_.isEqual(request, newData.request)) {
      return false;
    }
    return this.isDict(newData.response) && this.isValidHash(newData.response.tx_hash) &&
        this.isBool(newData.response.status);
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

  validateConsensusProposalData(newData, userAddr, blockNumber, getValue) {
    const PathUtil = require('../common/path-util');
    if (!this.isDict(newData) || Number(blockNumber) !== newData.number ||
        !this.isNumber(newData.gas_cost_total)) {
      return false;
    }
    if (newData.proposer !== userAddr ||
        getValue(PathUtil.getConsensusProposerWhitelistAddrPath(userAddr)) !== true) {
      return false;
    }
    const stake = this.getConsensusStakeBalance(userAddr, getValue);
    return stake >= this.getMinStakeAmount(getValue) && stake <= this.getMaxStakeAmount(getValue);
  }

  validateConsensusVoteData(newData, userAddr, blockHash, getValue) {
    const PathUtil = require('../common/path-util');
    if (getValue(PathUtil.getConsensusValidatorWhitelistAddrPath(userAddr)) !== true &&
        getValue(PathUtil.getConsensusProposerWhitelistAddrPath(userAddr)) !== true) {
      return false;
    }
    if (!this.isDict(newData) || !this.isBool(newData.is_against) || !this.isNumber(newData.stake)
        || newData.block_hash !== blockHash) {
      return false;
    }
    if (newData.is_against && !this.isValidatorOffenseType(newData.offense_type)) {
      return false;
    }
    return this.getConsensusStakeBalance(userAddr, getValue) === newData.stake;
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
    const privateUrlRegex = /^(https?:\/\/)?(((127\.)|(10\.))((?:1\d{2}|2[0-4]\d|[1-9]?\d|25[0-5])\.){2}(?:1\d{2}|2[0-4]\d|[1-9]?\d|25[0-5])|((192\.168\.)|(172\.1[6-9]\.)|(172\.2[0-9]\.)|(172\.3[0-1]\.))((?:1\d{2}|2[0-4]\d|[1-9]?\d|25[0-5])\.)(?:1\d{2}|2[0-4]\d|[1-9]?\d|25[0-5])|(::1$)|([fF][cCdD])|localhost)(:(6553[0-5]|655[0-2](\d)|65[0-4](\d){2}|6[0-4](\d){3}|[1-5](\d){4}|[1-9](\d){0,3}))?$/;
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
    const maxUrlsPerDeveloper = getValue(PathUtil.getBlockchainParamsMaxUrlsPerDeveloperPath());
    const existingUrls = getValue(PathUtil.getDevelopersRestFunctionsUrlWhitelistUserPath(userAddr)) || {};
    return data !== null || newData === null ||
        Object.keys(existingUrls).length < maxUrlsPerDeveloper;
  }

  validateManageAppAdminConfig(newData) {
    if (!this.isDict(newData)) {
      return false;
    }
    for (const [addr, val] of Object.entries(newData)) {
      if (!this.isCksumAddr(addr) || !this.isBool(val)) {
        return false;
      }
    }
    return true;
  }

  validateManageAppBillingConfig(newData) {
    if (!this.isDict(newData)) {
      return false;
    }
    for (const billingConfig of Object.values(newData)) {
      if (!this.isDict(billingConfig) || !this.isDict(billingConfig.users)) {
        return false;
      }
      for (const [user, permission] of Object.entries(billingConfig.users)) {
        if (!this.isCksumAddr(user) || !this.isBool(permission)) {
          return false;
        }
      }
    }
    return true;
  }

  validateManageAppIsPublicConfig(newData) {
    return newData === null || this.isBool(newData);
  }

  validateManageAppServiceConfig(newData) {
    const { PredefinedDbPaths } = require('../common/constants');
    const sanitizedVal = {};
    if (!this.isDict(newData) || !this.isDict(newData[PredefinedDbPaths.STAKING])) {
      return false;
    }
    const stakingConfig = newData[PredefinedDbPaths.STAKING];
    if (stakingConfig) {
      const lockupDuration = stakingConfig[PredefinedDbPaths.STAKING_LOCKUP_DURATION];
      if (!this.isInteger(lockupDuration) || lockupDuration < 0) {
        return false;
      }
      sanitizedVal[PredefinedDbPaths.STAKING] = {
        [PredefinedDbPaths.STAKING_LOCKUP_DURATION]: lockupDuration
      };
    } else {
      return false;
    }
    return _.isEqual(sanitizedVal, newData);
  }

  checkValuePathLen(parsedValuePath, expectedLen) {
    return this.isArray(parsedValuePath) && this.length(parsedValuePath) === expectedLen;
  }
}

module.exports = RuleUtil;
