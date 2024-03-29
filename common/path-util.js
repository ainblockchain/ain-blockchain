const {
  PredefinedDbPaths,
  ShardingProperties
} = require('./constants');
const CommonUtil = require('./common-util');
const RuleUtil = require('../db/rule-util');
const ruleUtil = new RuleUtil();

class PathUtil {
  static getAccountPath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.ACCOUNTS, address]);
  }

  static getAccountBalancePath(address) {
    return `${PathUtil.getAccountPath(address)}/${PredefinedDbPaths.BALANCE}`;
  }

  static getAccountNoncePath(address) {
    return `${PathUtil.getAccountPath(address)}/${PredefinedDbPaths.ACCOUNTS_NONCE}`;
  }

  static getAccountTimestampPath(address) {
    return `${PathUtil.getAccountPath(address)}/${PredefinedDbPaths.ACCOUNTS_TIMESTAMP}`;
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

  static getTokenBridgeConfigPath(networkName, chainId, tokenId) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.BLOCKCHAIN_PARAMS, PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN,
        PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_BRIDGE, networkName, chainId, tokenId]);
  }

  static getTokenBridgeTokenPoolPath(networkName, chainId, tokenId) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.BLOCKCHAIN_PARAMS, PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN,
        PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_BRIDGE, networkName, chainId, tokenId,
        PredefinedDbPaths.BLOCKCHAIN_PARAMS_TOKEN_POOL]);
  }

  static getTransferPath(from, to, key) {
    return CommonUtil.formatPath([PredefinedDbPaths.TRANSFER, from, to, key]);
  }

  static getTransferValuePath(from, to, key) {
    return CommonUtil.appendPath(PathUtil.getTransferPath(from, to, key), PredefinedDbPaths.TRANSFER_VALUE);
  }

  static getTransferResultPath(from, to, key) {
    return CommonUtil.appendPath(PathUtil.getTransferPath(from, to, key), PredefinedDbPaths.TRANSFER_RESULT);
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

  static getManageAppConfigAdminPath(appName) {
    return `${PathUtil.getManageAppConfigPath(appName)}/${PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN}`;
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

  static getStakingBalanceTotalSumPath() {
    return CommonUtil.formatPath([PredefinedDbPaths.STAKING, PredefinedDbPaths.STAKING_BALANCE_TOTAL_SUM]);
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
    return CommonUtil.appendPath(branchPath, ShardingProperties.LATEST_BLOCK_NUMBER);
  }

  static getLatestShardReportPathFromValuePath(valuePath) {
    const branchPath = CommonUtil.formatPath(valuePath.slice(0, -3));
    return PathUtil.getLatestShardReportPath(branchPath);
  }

  static getCheckinRequestPath(networkName, chainId, tokenId, address, checkinId) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKIN, PredefinedDbPaths.CHECKIN_REQUESTS, networkName, chainId,
        tokenId, address, checkinId]);
  }

  static getCheckinHistoryPath(networkName, chainId, tokenId, address, checkinId) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKIN, PredefinedDbPaths.CHECKIN_HISTORY, networkName, chainId,
        tokenId, address, checkinId]);
  }

  static getCheckinPendingAmountPerTokenPoolPath(tokenPoolAddr) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKIN, PredefinedDbPaths.CHECKIN_STATS,
        PredefinedDbPaths.CHECKIN_STATS_PENDING, PredefinedDbPaths.CHECKIN_TOKEN_POOL, tokenPoolAddr]);
  }

  static getCheckinPendingAmountPerSenderPath(networkName, chainId, tokenId, sender) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKIN, PredefinedDbPaths.CHECKIN_STATS,
        PredefinedDbPaths.CHECKIN_STATS_PENDING, networkName, chainId, tokenId, sender]);
  }

  static getCheckinCompleteAmountTotalPath() {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKIN, PredefinedDbPaths.CHECKIN_STATS,
        PredefinedDbPaths.CHECKIN_STATS_COMPLETE, PredefinedDbPaths.CHECKIN_STATS_TOTAL]);
  }

  static getCheckinCompleteAmountPerAddrPath(address) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKIN, PredefinedDbPaths.CHECKIN_STATS,
        PredefinedDbPaths.CHECKIN_STATS_COMPLETE, address]);
  }

  static getCheckoutRequestPath(networkName, chainId, tokenId, address, checkoutId) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKOUT, PredefinedDbPaths.CHECKOUT_REQUESTS, networkName, chainId,
        tokenId, address, checkoutId]);
  }

  static getCheckoutHistoryPath(networkName, chainId, tokenId, address, checkoutId) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKOUT, PredefinedDbPaths.CHECKOUT_HISTORY, networkName, chainId,
        tokenId, address, checkoutId]);
  }

  static getCheckoutRefundPath(networkName, chainId, tokenId, address, checkoutId) {
    return CommonUtil.formatPath([
      PredefinedDbPaths.CHECKOUT, PredefinedDbPaths.CHECKOUT_REFUNDS, networkName, chainId,
      tokenId, address, checkoutId]);
  }

  static getCheckoutPendingAmountTotalPath() {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKOUT, PredefinedDbPaths.CHECKOUT_STATS,
        PredefinedDbPaths.CHECKOUT_STATS_PENDING, PredefinedDbPaths.CHECKOUT_STATS_TOTAL]);
  }

  static getCheckoutPendingAmountPerAddrPath(address) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKOUT, PredefinedDbPaths.CHECKOUT_STATS,
        PredefinedDbPaths.CHECKOUT_STATS_PENDING, address]);
  }

  static getCheckoutCompleteAmountTotalPath() {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKOUT, PredefinedDbPaths.CHECKOUT_STATS,
        PredefinedDbPaths.CHECKOUT_STATS_COMPLETE, PredefinedDbPaths.CHECKOUT_STATS_TOTAL]);
  }

  static getCheckoutCompleteAmountDailyPath(dayTimestamp) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CHECKOUT, PredefinedDbPaths.CHECKOUT_STATS,
        PredefinedDbPaths.CHECKOUT_STATS_COMPLETE, dayTimestamp]);
  }

  static getConsensusOffenseRecordsPath() {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_OFFENSE_RECORDS]);
  }

  static getConsensusOffenseRecordsAddrPath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_OFFENSE_RECORDS, address]);
  }

  static getConsensusProposerWhitelistPath() {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_PROPOSER_WHITELIST]);
  }

  static getConsensusProposerWhitelistAddrPath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_PROPOSER_WHITELIST, address]);
  }

  static getConsensusValidatorWhitelistPath() {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_VALIDATOR_WHITELIST]);
  }

  static getConsensusValidatorWhitelistAddrPath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_VALIDATOR_WHITELIST, address]);
  }

  static getConsensusStakingAccountPath(address) {
    return PathUtil.getServiceAccountPath(PredefinedDbPaths.STAKING, PredefinedDbPaths.CONSENSUS, `${address}|0`);
  }

  static getConsensusStakingAccountBalancePath(address) {
    const accountPath = PathUtil.getServiceAccountPath(PredefinedDbPaths.STAKING, PredefinedDbPaths.CONSENSUS, `${address}|0`);
    return CommonUtil.appendPath(accountPath, PredefinedDbPaths.BALANCE)
  }

  static getConsensusRewardsPath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_REWARDS, address]);
  }

  static getConsensusRewardsUnclaimedPath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_REWARDS, address, PredefinedDbPaths.CONSENSUS_REWARDS_UNCLAIMED]);
  }

  static getConsensusRewardsCumulativePath(address) {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_REWARDS, address, PredefinedDbPaths.CONSENSUS_REWARDS_CUMULATIVE]);
  }

  static getConsensusNumberPath(blockNumber) {
    return CommonUtil.formatPath([PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_NUMBER, blockNumber]);
  }

  static getConsensusProposePath(blockNumber) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_NUMBER, blockNumber, PredefinedDbPaths.CONSENSUS_PROPOSE]);
  }

  static getConsensusVotePath(blockNumber, blockHash, address) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_NUMBER, blockNumber, blockHash,
        PredefinedDbPaths.CONSENSUS_VOTE, address]);
  }

  static getGasFeeClaimPath(userAddr, recordId) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE_CLAIM, userAddr, recordId]);
  }

  static getGasFeeCollectPath(blockNumber, userAddr, txHash) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.GAS_FEE, PredefinedDbPaths.GAS_FEE_COLLECT, blockNumber, userAddr, txHash]);
  }

  static getReceiptPath(txHash) {
    return CommonUtil.formatPath([PredefinedDbPaths.RECEIPTS, txHash]);
  }

  static getDevelopersRestFunctionsUrlWhitelistPath() {
    return CommonUtil.formatPath([
        PredefinedDbPaths.DEVELOPERS, PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS,
        PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS_URL_WHITELIST]);
  }

  static getDevelopersRestFunctionsUrlWhitelistUserPath(address) {
    return CommonUtil.appendPath(PathUtil.getDevelopersRestFunctionsUrlWhitelistPath(), address);
  }

  static getDevelopersRestFunctionsUserWhitelistUserPath(address) {
    return CommonUtil.formatPath([
        PredefinedDbPaths.DEVELOPERS, PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS,
        PredefinedDbPaths.DEVELOPERS_REST_FUNCTIONS_USER_WHITELIST, address]);
  }

  static getBlockchainParamsMaxUrlsPerDeveloperPath() {
    return CommonUtil.formatPath([
        PredefinedDbPaths.BLOCKCHAIN_PARAMS, PredefinedDbPaths.BLOCKCHAIN_PARAMS_RESOURCE,
        PredefinedDbPaths.BLOCKCHAIN_PARAMS_MAX_FUNCTION_URLS_PER_DEVELOPER]);
  }

  static getBlockchainParamsRootPath() {
    return CommonUtil.formatPath([PredefinedDbPaths.BLOCKCHAIN_PARAMS]);
  }

  static getSingleBlockchainParamPath(category, name) {
    return CommonUtil.formatPath([PredefinedDbPaths.BLOCKCHAIN_PARAMS, category, name]);
  }
}

module.exports = PathUtil;
