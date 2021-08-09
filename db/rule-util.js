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

  isValidHash(value) {
    return this.isString(value) && /^0x([A-Fa-f0-9]{64})$/.test(value);
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
    const { PredefinedDbPaths } = require('../common/constants');
    return getValue(`/${PredefinedDbPaths.MANAGE_APP}/${appName}/${PredefinedDbPaths.MANAGE_APP_CONFIG}/` +
        `${PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN}/${address}`) === true;
  }

  isAppAdminFromServAcntName(accountName, address, getValue) {
    const appName = this.getServiceNameFromServAcntName(accountName);
    return this.isAppAdmin(appName, address, getValue);
  }

  getBalancePath(addrOrServAcnt) {
    const { PredefinedDbPaths } = require('../common/constants');
    if (this.isServAcntName(addrOrServAcnt)) {
      const parsed = this.parseServAcntName(addrOrServAcnt);
      return `/${PredefinedDbPaths.SERVICE_ACCOUNTS}/${parsed[0]}/${parsed[1]}/${parsed[2]}/${PredefinedDbPaths.BALANCE}`;
    } else {
      return `/${PredefinedDbPaths.ACCOUNTS}/${addrOrServAcnt}/${PredefinedDbPaths.BALANCE}`;
    }
  }

  getBalance(addrOrServAcnt, getValue) {
    return getValue(this.getBalancePath(addrOrServAcnt)) || 0;
  }

  isBillingUser(billingServAcntName, userAddr, getValue) {
    const { PredefinedDbPaths } = require('../common/constants');
    const parsed = this.parseServAcntName(billingServAcntName);
    const appName = parsed[1];
    const billingId = parsed[2];
    return getValue(
        `/${PredefinedDbPaths.MANAGE_APP}/${appName}/${PredefinedDbPaths.MANAGE_APP_CONFIG}/` +
        `${PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING}/${billingId}/` +
        `${PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING_USERS}/${userAddr}`) === true;
  }

  isGasFeeCollected(address, newData, txHash, getValue) {
    const { PredefinedDbPaths } = require('../common/constants');
    const blockNumber = newData[PredefinedDbPaths.RECEIPTS_BLOCK_NUMBER];
    const gasCost = _.get(newData, `${PredefinedDbPaths.RECEIPTS_EXEC_RESULT}.${PredefinedDbPaths.RECEIPTS_GAS_COST_TOTAL}`);
    if (gasCost === undefined) {
      return false;
    }
    const billing = _.get(newData, `${PredefinedDbPaths.RECEIPTS_BILLING}`);
    const collectedFrom = billing ? `${PredefinedDbPaths.BILLING}|${billing}` : address;
    const feeCollected = getValue(
        `/${PredefinedDbPaths.GAS_FEE}/${PredefinedDbPaths.COLLECT}/${collectedFrom}` +
        `/${blockNumber}/${txHash}/${PredefinedDbPaths.GAS_FEE_AMOUNT}`) || 0;
    return feeCollected === gasCost;
  }

  getConsensusStakeBalance(address, getValue) {
    const { PredefinedDbPaths } = require('../common/constants');
    return getValue(
        `/${PredefinedDbPaths.SERVICE_ACCOUNTS}/${PredefinedDbPaths.STAKING}/` +
        `${PredefinedDbPaths.CONSENSUS}/${address}|0/${PredefinedDbPaths.BALANCE}`) || 0;
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

  getTokenBridgeConfig(type, tokenId, getValue) {
    const { PredefinedDbPaths } = require('../common/constants');
    return getValue(`/${PredefinedDbPaths.TOKEN}/${PredefinedDbPaths.TOKEN_BRIDGE}/${type}/${tokenId}`);
  }

  getTokenPoolAddr(type, tokenId, getValue) {
    const { PredefinedDbPaths } = require('../common/constants');
    return getValue(
        `/${PredefinedDbPaths.TOKEN}/${PredefinedDbPaths.TOKEN_BRIDGE}/${type}/${tokenId}/` +
        `${PredefinedDbPaths.TOKEN_BRIDGE_TOKEN_POOL}`);
  }

  getTokenPoolAddrFromHistoryData(userAddr, checkoutId, getValue) {
    const request = getValue(`/checkout/history/${userAddr}/${checkoutId}/request`);
    if (!request || !request.type || !request.token_id) {
      return null;
    }
    return this.getTokenPoolAddr(request.type, request.token_id, getValue);
  }

  validateCheckoutRequestData(data, getValue) {
    if (!this.isDict(data) || !this.isNumber(data.amount) || data.amount <= 0 ||
        !this.isString(data.type) || !this.isString(data.token_id) || !this.isString(data.recipient)) {
      return false;
    }
    return this.isDict(this.getTokenBridgeConfig(data.type, data.token_id, getValue));
  }

  validateCheckoutHistoryData(userAddr, checkoutId, data, getValue) {
    const { FunctionResultCode } = require('../common/constants');
    const request = getValue(`/checkout/requests/${userAddr}/${checkoutId}`);
    if (!request || !this.isDict(request) || !this.isDict(data)) {
      return false;
    }
    if (!_.isEqual(request, data.request, { strict: true })) {
      return false;
    }
    return this.isDict(data.response) && this.isString(data.response.tx_hash) &&
        (data.response.status === FunctionResultCode.SUCCESS ||
        data.response.status === FunctionResultCode.FAILURE);
  }
}

module.exports = RuleUtil;
