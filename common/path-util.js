const {
  FeatureFlags,
  PredefinedDbPaths,
  ShardingProperties
} = require('./constants');
const CommonUtil = require('./common-util');
const RuleUtil = require('../db/rule-util');
const ruleUtil = new RuleUtil();

class PathUtil {
  static getAccountBalancePath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.ACCOUNTS, address, PredefinedDbPaths.BALANCE]);
  }

  static getAccountNoncePath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.ACCOUNTS, address, PredefinedDbPaths.ACCOUNTS_NONCE]);
  }

  static getAccountTimestampPath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.ACCOUNTS, address, PredefinedDbPaths.ACCOUNTS_TIMESTAMP]);
  }

  static getServiceAccountPath(serviceType, serviceName, accountKey) {
    return CommonUtil.formatPath([PredefinedDbPaths.SERVICE_ACCOUNTS, serviceType, serviceName, accountKey]);
  }

  static getServiceAccountBalancePath(serviceType, serviceName, accountKey) {
    return `${PathUtil.getServiceAccountPath(serviceType, serviceName, accountKey)}/${PredefinedDbPaths.BALANCE}`;
  }

  static getServiceAccountPathFromAccountName(accountName) {
    const parsed = CommonUtil.parseServAcntName(accountName);
    return CommonUtil.formatPath([PredefinedDbPaths.SERVICE_ACCOUNTS, parsed[0], parsed[1], parsed[2]]);
  }

  static getServiceAccountBalancePathFromAccountName(accountName) {
    return `${PathUtil.getServiceAccountPathFromAccountName(accountName)}/${PredefinedDbPaths.BALANCE}`;
  }

  static getTransferValuePath(from, to, key) {
    return CommonUtil.formatPath([PredefinedDbPaths.TRANSFER, from, to, key, PredefinedDbPaths.TRANSFER_VALUE]);
  }

  static getTransferResultPath(from, to, key) {
    return CommonUtil.formatPath([PredefinedDbPaths.TRANSFER, from, to, key, PredefinedDbPaths.TRANSFER_RESULT]);
  }

  static getCreateAppRecordPath(appName, recordId) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.MANAGE_APP, appName, PredefinedDbPaths.MANAGE_APP_CREATE, recordId]);
  }

  static getCreateAppResultPath(appName, recordId) {
    return `${PathUtil.getCreateAppRecordPath(appName, recordId)}/${PredefinedDbPaths.MANAGE_APP_RESULT}`;
  }

  static getManageAppConfigPath(appName) {
    return CommonUtil.formatPath([PredefinedDbPaths.MANAGE_APP, appName, PredefinedDbPaths.MANAGE_APP_CONFIG]);
  }

  static getManageAppBillingUsersPath(appName, billingId) {
    return `${PathUtil.getManageAppConfigPath(appName)}/${PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING}/` +
        `${billingId}/${PredefinedDbPaths.MANAGE_APP_CONFIG_BILLING_USERS}`;
  }

  static getAppPath(appName) {
    return CommonUtil.formatPath([PredefinedDbPaths.APPS, appName]);
  }

  static getAppAdminPathFromServiceAccountName(accountName) {
    return ruleUtil.getAppAdminPath(accountName);
  }

  static getStakingLockupDurationPath(serviceName) {
    return CommonUtil.formatPath([PredefinedDbPaths.MANAGE_APP, serviceName,
        PredefinedDbPaths.MANAGE_APP_CONFIG, PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE,
        PredefinedDbPaths.STAKING, PredefinedDbPaths.STAKING_LOCKUP_DURATION]);
  }

  static getStakingServicePath(serviceName) {
    return CommonUtil.formatPath([PredefinedDbPaths.STAKING, serviceName]);
  }

  static getStakingExpirationPath(serviceName, user, stakingKey) {
    return CommonUtil.formatPath([PredefinedDbPaths.STAKING, serviceName, user, stakingKey,
        PredefinedDbPaths.STAKING_EXPIRE_AT]);
  }

  static getStakingStakeRecordPath(serviceName, user, stakingKey, recordId) {
    return CommonUtil.formatPath([PredefinedDbPaths.STAKING, serviceName, user, stakingKey,
        PredefinedDbPaths.STAKING_STAKE, recordId]);
  }

  static getStakingUnstakeRecordPath(serviceName, user, stakingKey, recordId) {
    return CommonUtil.formatPath([PredefinedDbPaths.STAKING, serviceName, user, stakingKey,
        PredefinedDbPaths.STAKING_UNSTAKE, recordId]);
  }

  static getStakingStakeRecordValuePath(serviceName, user, stakingKey, recordId) {
    return `${PathUtil.getStakingStakeRecordPath(serviceName, user, stakingKey, recordId)}/` +
        `${PredefinedDbPaths.STAKING_VALUE}`;
  }

  static getStakingStakeResultPath(serviceName, user, stakingKey, recordId) {
    return `${PathUtil.getStakingStakeRecordPath(serviceName, user, stakingKey, recordId)}/` +
        `${PredefinedDbPaths.STAKING_RESULT}`;
  }

  static getStakingUnstakeResultPath(serviceName, user, stakingKey, recordId) {
    return `${PathUtil.getStakingUnstakeRecordPath(serviceName, user, stakingKey, recordId)}/` +
        `${PredefinedDbPaths.STAKING_RESULT}`;
  }

  static getStakingBalanceTotalPath(serviceName) {
    return CommonUtil.formatPath([PredefinedDbPaths.STAKING, serviceName, PredefinedDbPaths.STAKING_BALANCE_TOTAL]);
  }

  static getPaymentServiceAdminPath(serviceName) {
    return CommonUtil.formatPath([PredefinedDbPaths.PAYMENTS, serviceName, PredefinedDbPaths.PAYMENTS_CONFIG,
        PredefinedDbPaths.PAYMENTS_ADMIN]);
  }

  static getPaymentPayRecordPath(serviceName, user, paymentKey, recordId) {
    return CommonUtil.formatPath([PredefinedDbPaths.PAYMENTS, serviceName, user, paymentKey,
        PredefinedDbPaths.PAYMENTS_PAY, recordId]);
  }

  static getPaymentClaimRecordPath(serviceName, user, paymentKey, recordId) {
    return CommonUtil.formatPath([PredefinedDbPaths.PAYMENTS, serviceName, user, paymentKey,
        PredefinedDbPaths.PAYMENTS_CLAIM, recordId]);
  }

  static getPaymentPayRecordResultPath(serviceName, user, paymentKey, recordId) {
    return `${PathUtil.getPaymentPayRecordPath(serviceName, user, paymentKey, recordId)}/` +
        `${PredefinedDbPaths.PAYMENTS_RESULT}`;
  }

  static getPaymentClaimRecordResultPath(serviceName, user, paymentKey, recordId) {
    return `${PathUtil.getPaymentClaimRecordPath(serviceName, user, paymentKey, recordId)}/` +
        `${PredefinedDbPaths.PAYMENTS_RESULT}`;
  }

  static getEscrowHoldRecordPath(source, target, escrowKey, recordId) {
    return CommonUtil.formatPath([PredefinedDbPaths.ESCROW, source, target, escrowKey,
        PredefinedDbPaths.ESCROW_HOLD, recordId]);
  }

  static getEscrowHoldRecordResultPath(source, target, escrowKey, recordId) {
    return `${PathUtil.getEscrowHoldRecordPath(source, target, escrowKey, recordId)}/` +
        `${PredefinedDbPaths.ESCROW_RESULT}`;
  }

  static getEscrowReleaseRecordResultPath(source, target, escrowKey, recordId) {
    return CommonUtil.formatPath([PredefinedDbPaths.ESCROW, source, target, escrowKey,
        PredefinedDbPaths.ESCROW_RELEASE, recordId, PredefinedDbPaths.ESCROW_RESULT]);
  }

  static getLatestShardReportPath(branchPath) {
    return CommonUtil.appendPath(branchPath, ShardingProperties.LATEST);
  }

  static getLatestShardReportPathFromValuePath(valuePath) {
    const branchPath = CommonUtil.formatPath(valuePath.slice(0, -2));
    return PathUtil.getLatestShardReportPath(branchPath);
  }

  static getCheckinParentFinalizeResultPath(shardingPath, branchPath, txHash) {
    return CommonUtil.appendPath(
        shardingPath,
        `${branchPath}/${PredefinedDbPaths.CHECKIN_PARENT_FINALIZE}/${txHash}/` +
            `${PredefinedDbPaths.REMOTE_TX_ACTION_RESULT}`);
  }

  static getCheckinParentFinalizeResultPathFromValuePath(shardingPath, valuePath, txHash) {
    const branchPath = CommonUtil.formatPath(valuePath.slice(0, -1));
    return PathUtil.getCheckinParentFinalizeResultPath(shardingPath, branchPath, txHash);
  }

  static getCheckinPayloadPath(branchPath) {
    return CommonUtil.appendPath(
        branchPath,
        `${PredefinedDbPaths.CHECKIN_REQUEST}/${PredefinedDbPaths.CHECKIN_PAYLOAD}`);
  }

  static getCheckinPayloadPathFromValuePath(valuePath) {
    const branchPath = CommonUtil.formatPath(valuePath.slice(0, -3));
    return PathUtil.getCheckinPayloadPath(branchPath);
  }

  static getConsensusWhitelistPath() {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.WHITELIST]);
  }

  static getConsensusWhitelistAddrPath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.WHITELIST, address]);
  }

  static getConsensusStakingAccountPath(address) {
    return PathUtil.getServiceAccountPath(PredefinedDbPaths.STAKING, PredefinedDbPaths.CONSENSUS, `${address}|0`);
  }

  static getConsensusStakingAccountBalancePath(address) {
    const accountPath = PathUtil.getServiceAccountPath(PredefinedDbPaths.STAKING, PredefinedDbPaths.CONSENSUS, `${address}|0`);
    return CommonUtil.appendPath(accountPath, PredefinedDbPaths.BALANCE)
  }

  static getConsensusProposePath(blockNumber) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.NUMBER, blockNumber, PredefinedDbPaths.PROPOSE]);
  }

  static getConsensusVotePath(blockNumber, address) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.NUMBER, blockNumber, PredefinedDbPaths.VOTE, address]);
  }

  static getGasFeeCollectPath(userAddr, blockNumber, txHash) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.COLLECT, userAddr, blockNumber, txHash]);
  }

  static getReceiptPath(txHash) {
    const hashPath =
        FeatureFlags.enableReceiptPathPrefixLabels ? PathUtil.getPrefixedHashPath(txHash) : txHash;
    return CommonUtil.formatPath([PredefinedDbPaths.RECEIPTS, hashPath]);
  }

  static getPrefixedHashPath(hash) {
    const PREFIXED_HASH_PATH_LABEL_LENGTH = 2;
    const NUM_PREFIXED_HASH_PATH_LABELS = 2;
    if (!CommonUtil.isString(hash) ||
        hash.length <= 2 + NUM_PREFIXED_HASH_PATH_LABELS * PREFIXED_HASH_PATH_LABEL_LENGTH) {
      return hash;
    }
    const prefixLabels = [];
    for (let i = 0; i < NUM_PREFIXED_HASH_PATH_LABELS; i++) {
      const from = i === 0 ? 0 : 2 + i * PREFIXED_HASH_PATH_LABEL_LENGTH;
      const to = 2 + (i + 1) * PREFIXED_HASH_PATH_LABEL_LENGTH;
      prefixLabels.push(hash.substring(from, to));
    }
console.error(`!!!!!!!!!!!!!!!!! prefixLabels: `, prefixLabels);
    return CommonUtil.formatPath([...prefixLabels, hash]);
  }
}

module.exports = PathUtil;
