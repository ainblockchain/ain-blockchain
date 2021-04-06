const { PredefinedDbPaths, ShardingProperties } = require('./constants');
const ChainUtil = require('./chain-util');

function getAccountBalancePath(address) {
  return ChainUtil.formatPath([PredefinedDbPaths.ACCOUNTS, address, balance]);
}

function getServiceAccountPath(serviceType, serviceName, accountKey) {
  return ChainUtil.formatPath([PredefinedDbPaths.SERVICE_ACCOUNTS, serviceType, serviceName, accountKey]);
}

function getServiceAccountBalancePath(serviceType, serviceName, accountKey) {
  return `${getServiceAccountPath(serviceType, serviceName, accountKey)}/${PredefinedDbPaths.BALANCE}`;
}

function getServiceAccountPathFromAccountName(accountName) {
  const parsed = ChainUtil.parseServAcntName(accountName);
  return ChainUtil.formatPath([PredefinedDbPaths.SERVICE_ACCOUNTS, parsed[0], parsed[1], parsed[2]]);
}

function getServiceAccountAdminPathFromAccountName(accountName) {
  return `${getServiceAccountPathFromAccountName(accountName)}/${PredefinedDbPaths.SERVICE_ACCOUNTS_ADMIN}`;
}

function getServiceAccountAdminAddrPathFromAccountName(accountName, adminAddr) {
  return `${getServiceAccountAdminPathFromAccountName(accountName)}/${adminAddr}`;
}

function getServiceAccountBalancePathFromAccountName(accountName) {
  return `${getServiceAccountPathFromAccountName(accountName)}/${PredefinedDbPaths.BALANCE}`;
}

function getTransferValuePath(from, to, key) {
  return ChainUtil.formatPath([PredefinedDbPaths.TRANSFER, from, to, key, PredefinedDbPaths.TRANSFER_VALUE]);
}

function getTransferResultPath(from, to, key) {
  return ChainUtil.formatPath([PredefinedDbPaths.TRANSFER, from, to, key, PredefinedDbPaths.TRANSFER_RESULT]);
}

function getCreateAppRecordPath(appName, recordId) {
  return ChainUtil.formatPath([
      PredefinedDbPaths.MANAGE_APP, appName, PredefinedDbPaths.MANAGE_APP_CREATE, recordId]);
}

function getCreateAppResultPath(appName, recordId) {
  return `${getCreateAppRecordPath(appName, recordId)}/${PredefinedDbPaths.MANAGE_APP_RESULT}`;
}

function getManageAppConfigPath(appName) {
  return ChainUtil.formatPath([PredefinedDbPaths.MANAGE_APP, appName, PredefinedDbPaths.MANAGE_APP_CONFIG]);
}

function getStakingLockupDurationPath(serviceName) {
  return ChainUtil.formatPath([PredefinedDbPaths.MANAGE_APP, serviceName,
      PredefinedDbPaths.MANAGE_APP_CONFIG, PredefinedDbPaths.MANAGE_APP_CONFIG_SERVICE,
      PredefinedDbPaths.STAKING, PredefinedDbPaths.STAKING_LOCKUP_DURATION]);
}

function getStakingExpirationPath(serviceName, user, stakingKey) {
  return ChainUtil.formatPath([PredefinedDbPaths.STAKING, serviceName, user, stakingKey,
      PredefinedDbPaths.STAKING_EXPIRE_AT]);
}

function getStakingStakeRecordPath(serviceName, user, stakingKey, recordId) {
  return ChainUtil.formatPath([PredefinedDbPaths.STAKING, serviceName, user, stakingKey,
      PredefinedDbPaths.STAKING_STAKE, recordId]);
}

function getStakingUnstakeRecordPath(serviceName, user, stakingKey, recordId) {
  return ChainUtil.formatPath([PredefinedDbPaths.STAKING, serviceName, user, stakingKey,
      PredefinedDbPaths.STAKING_UNSTAKE, recordId]);
}

function getStakingStakeRecordValuePath(serviceName, user, stakingKey, recordId) {
  return `${getStakingStakeRecordPath(serviceName, user, stakingKey, recordId)}/` +
      `${PredefinedDbPaths.STAKING_VALUE}`;
}

function getStakingStakeResultPath(serviceName, user, stakingKey, recordId) {
  return `${getStakingStakeRecordPath(serviceName, user, stakingKey, recordId)}/` +
      `${PredefinedDbPaths.STAKING_RESULT}`;
}

function getStakingUnstakeResultPath(serviceName, user, stakingKey, recordId) {
  return `${getStakingUnstakeRecordPath(serviceName, user, stakingKey, recordId)}/` +
      `${PredefinedDbPaths.STAKING_RESULT}`;
}

function getStakingBalanceTotalPath(serviceName) {
  return ChainUtil.formatPath([PredefinedDbPaths.STAKING, serviceName, PredefinedDbPaths.STAKING_BALANCE_TOTAL]);
}

function getPaymentServiceAdminPath(serviceName) {
  return ChainUtil.formatPath([PredefinedDbPaths.PAYMENTS, serviceName, PredefinedDbPaths.PAYMENTS_CONFIG,
      PredefinedDbPaths.PAYMENTS_ADMIN]);
}

function getPaymentPayRecordPath(serviceName, user, paymentKey, recordId) {
  return ChainUtil.formatPath([PredefinedDbPaths.PAYMENTS, serviceName, user, paymentKey,
      PredefinedDbPaths.PAYMENTS_PAY, recordId]);
}

function getPaymentClaimRecordPath(serviceName, user, paymentKey, recordId) {
  return ChainUtil.formatPath([PredefinedDbPaths.PAYMENTS, serviceName, user, paymentKey,
      PredefinedDbPaths.PAYMENTS_CLAIM, recordId]);
}

function getPaymentPayRecordResultPath(serviceName, user, paymentKey, recordId) {
  return `${getPaymentPayRecordPath(serviceName, user, paymentKey, recordId)}/` +
      `${PredefinedDbPaths.PAYMENTS_RESULT}`;
}

function getPaymentClaimRecordResultPath(serviceName, user, paymentKey, recordId) {
  return `${getPaymentClaimRecordPath(serviceName, user, paymentKey, recordId)}/` +
      `${PredefinedDbPaths.PAYMENTS_RESULT}`;
}

function getEscrowHoldRecordPath(source, target, escrowKey, recordId) {
  return ChainUtil.formatPath([PredefinedDbPaths.ESCROW, source, target, escrowKey,
      PredefinedDbPaths.ESCROW_HOLD, recordId]);
}

function getEscrowHoldRecordResultPath(source, target, escrowKey, recordId) {
  return `${getEscrowHoldRecordPath(source, target, escrowKey, recordId)}/` +
      `${PredefinedDbPaths.ESCROW_RESULT}`;
}

function getEscrowReleaseRecordResultPath(source, target, escrowKey, recordId) {
  return ChainUtil.formatPath([PredefinedDbPaths.ESCROW, source, target, escrowKey,
      PredefinedDbPaths.ESCROW_RELEASE, recordId, PredefinedDbPaths.ESCROW_RESULT]);
}

function getLatestShardReportPath(branchPath) {
  return ChainUtil.formatPath([branchPath, ShardingProperties.LATEST]);
}

function getLatestShardReportPathFromValuePath(valuePath) {
  const branchPath = ChainUtil.formatPath(valuePath.slice(0, -2));
  return getLatestShardReportPath(branchPath);
}

function getCheckinParentFinalizeResultPath(shardingPath, branchPath, txHash) {
  return ChainUtil.appendPath(
      shardingPath,
      `${branchPath}/${PredefinedDbPaths.CHECKIN_PARENT_FINALIZE}/${txHash}/` +
          `${PredefinedDbPaths.REMOTE_TX_ACTION_RESULT}`);
}

function getCheckinParentFinalizeResultPathFromValuePath(shardingPath, valuePath, txHash) {
  const branchPath = ChainUtil.formatPath(valuePath.slice(0, -1));
  return getCheckinParentFinalizeResultPath(shardingPath, branchPath, txHash);
}

function getCheckinPayloadPath(branchPath) {
  return ChainUtil.appendPath(
      branchPath,
      `${PredefinedDbPaths.CHECKIN_REQUEST}/${PredefinedDbPaths.CHECKIN_PAYLOAD}`);
}

function getConsensusWhitelistPath() {
  return ChainUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.WHITELIST]);
}

function getConsensusWhitelistAddrPath(address) {
  return ChainUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.WHITELIST, address]);
}

function getConsensusStakingAccountPath(address) {
  return getServiceAccountPath(PredefinedDbPaths.STAKING, PredefinedDbPaths.CONSENSUS, `${address}|0`);
}

function getConsensusProposePath(blockNumber) {
  return ChainUtil.formatPath([
      PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.NUMBER, blockNumber, PredefinedDbPaths.PROPOSE]);
}

function getConsensusVotePath(blockNumber, address) {
  return ChainUtil.formatPath([
      PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.NUMBER, blockNumber, PredefinedDbPaths.VOTE, address]);
}

module.exports = {
  getAccountBalancePath,
  getServiceAccountPath,
  getServiceAccountBalancePath,
  getServiceAccountPathFromAccountName,
  getServiceAccountAdminPathFromAccountName,
  getServiceAccountAdminAddrPathFromAccountName,
  getServiceAccountBalancePathFromAccountName,
  getTransferValuePath,
  getTransferResultPath,
  getCreateAppRecordPath,
  getCreateAppResultPath,
  getManageAppConfigPath,
  getStakingLockupDurationPath,
  getStakingExpirationPath,
  getStakingStakeRecordPath,
  getStakingUnstakeRecordPath,
  getStakingStakeRecordValuePath,
  getStakingStakeResultPath,
  getStakingUnstakeResultPath,
  getStakingBalanceTotalPath,
  getPaymentServiceAdminPath,
  getPaymentPayRecordPath,
  getPaymentClaimRecordPath,
  getPaymentPayRecordResultPath,
  getPaymentClaimRecordResultPath,
  getEscrowHoldRecordPath,
  getEscrowHoldRecordResultPath,
  getEscrowReleaseRecordResultPath,
  getLatestShardReportPath,
  getLatestShardReportPathFromValuePath,
  getCheckinParentFinalizeResultPath,
  getCheckinParentFinalizeResultPathFromValuePath,
  getCheckinPayloadPath,
  getConsensusWhitelistPath,
  getConsensusWhitelistAddrPath,
  getConsensusStakingAccountPath,
  getConsensusProposePath,
  getConsensusVotePath,
}