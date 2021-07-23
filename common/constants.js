const fs = require('fs');
const path = require('path');
const semver = require('semver');
const CommonUtil = require('./common-util');

// ** Genesis configs **
const DEFAULT_GENESIS_CONFIGS_DIR = 'genesis-configs/base';
const CUSTOM_GENESIS_CONFIGS_DIR = process.env.GENESIS_CONFIGS_DIR ?
    process.env.GENESIS_CONFIGS_DIR : null;
const GenesisParams = getGenesisConfig('genesis_params.json');
const GenesisToken = getGenesisConfig('genesis_token.json');
const GenesisAccounts = getGenesisConfig('genesis_accounts.json');

// ** Feature flags **
// NOTE(platfowner): If there is a corresponding env variable (e.g. force... flags),
//                   the flag value will be OR-ed to the value.
const FeatureFlags = {
  // Enables state version optimization.
  enableStateVersionOpt: true,
  // Enables state tree transfer.
  enableStateTreeTransfer: true,
  // Enables rich logging for functions.
  enableRichFunctionLogging: false,
  // Enables rich logging for transactions.
  enableRichTransactionLogging: false,
  // Enables rich logging for p2p communication.
  enableRichP2pCommunicationLogging: false,
  // Enables rich logging for tx selection in tx pool.
  enableRichTxSelectionLogging: false,
};

// ** Environment variables **
const DEBUG = CommonUtil.convertEnvVarInputToBool(process.env.DEBUG);
const CONSOLE_LOG = CommonUtil.convertEnvVarInputToBool(process.env.CONSOLE_LOG);
const ENABLE_DEV_SET_CLIENT_API = CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_DEV_SET_CLIENT_API);
const ENABLE_TX_SIG_VERIF_WORKAROUND =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_TX_SIG_VERIF_WORKAROUND);
const ENABLE_GAS_FEE_WORKAROUND =
    CommonUtil.convertEnvVarInputToBool(process.env.ENABLE_GAS_FEE_WORKAROUND, true);
const COMCOM_HOST_EXTERNAL_IP = process.env.COMCOM_HOST_EXTERNAL_IP ?
    process.env.COMCOM_HOST_EXTERNAL_IP : '';
const ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || null;
const PORT = process.env.PORT || getPortNumber(8080, 8080);
const P2P_PORT = process.env.P2P_PORT || getPortNumber(5000, 5000);
const LIGHTWEIGHT = CommonUtil.convertEnvVarInputToBool(process.env.LIGHTWEIGHT);
const SYNC_MODE = process.env.SYNC_MODE || 'full';
const MAX_NUM_BLOCKS_RECEIPTS = process.env.MAX_NUM_BLOCKS_RECEIPTS ?
    Number(process.env.MAX_NUM_BLOCKS_RECEIPTS) : 1000;

// ** Constants **
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;
if (!semver.valid(CURRENT_PROTOCOL_VERSION)) {
  throw Error('Wrong version format is specified in package.json');
}
const PROTOCOL_VERSIONS = path.resolve(__dirname, '../client/protocol_versions.json');
if (!fs.existsSync(PROTOCOL_VERSIONS)) {
  throw Error('Missing protocol versions file: ' + PROTOCOL_VERSIONS);
}
const PROTOCOL_VERSION_MAP = JSON.parse(fs.readFileSync(PROTOCOL_VERSIONS));
const DATA_PROTOCOL_VERSION = "1.0.0";
if (!semver.valid(DATA_PROTOCOL_VERSION)) {
  throw Error('Wrong data version format is specified for DATA_PROTOCOL_VERSION');
}
const CONSENSUS_PROTOCOL_VERSION = "1.0.0";
if (!semver.valid(CONSENSUS_PROTOCOL_VERSION)) {
  throw Error('Wrong data version format is specified for CONSENSUS_PROTOCOL_VERSION');
}
const LOGS_DIR = path.resolve(__dirname, '../logs');
const BLOCKCHAIN_DATA_DIR = process.env.BLOCKCHAIN_DATA_DIR || path.resolve(__dirname, '../ain_blockchain_data');
if (!fs.existsSync(BLOCKCHAIN_DATA_DIR)) {
  fs.mkdirSync(BLOCKCHAIN_DATA_DIR, { recursive: true });
}
const CHAINS_DIR = path.resolve(BLOCKCHAIN_DATA_DIR, 'chains');
const CHAINS_N2B_DIR_NAME = 'n2b'; // NOTE: Block number to block.
const CHAINS_H2N_DIR_NAME = 'h2n'; // NOTE: Block hash to block number.
const CHAINS_N2B_MAX_NUM_FILES = 100000;
const CHAINS_H2N_HASH_PREFIX_LENGTH = 5;
const SNAPSHOTS_ROOT_DIR = path.resolve(BLOCKCHAIN_DATA_DIR, 'snapshots');
const SNAPSHOTS_N2S_DIR_NAME = 'n2s'; // NOTE: Block number to snapshot.
const SNAPSHOTS_INTERVAL_BLOCK_NUMBER = 1000; // NOTE: How often the snapshot is made
const MAX_NUM_SNAPSHOTS = 10; // NOTE: max number of snapshots to keep
const HASH_DELIMITER = '#';
const JS_REF_SIZE_IN_BYTES = 8;
const TX_NONCE_ERROR_CODE = 900;
const TX_TIMESTAMP_ERROR_CODE = 901;
const MILLI_AIN = 10**-3; // 1,000 milliain = 1 ain
const MICRO_AIN = 10**-6; // 1,000,000 microain = 1 ain
const SERVICE_BANDWIDTH_BUDGET_RATIO = 0.5;
const APPS_BANDWIDTH_BUDGET_RATIO = 0.45;
const FREE_BANDWIDTH_BUDGET_RATIO = 0.05;
const SERVICE_STATE_BUDGET_RATIO = 0.5;
const APPS_STATE_BUDGET_RATIO = 0.45;
const FREE_STATE_BUDGET_RATIO = 0.05;
const bandwidthBudgetPerBlock = GenesisParams.resource.BANDWIDTH_BUDGET_PER_BLOCK;
const stateTreeBytesLimit = GenesisParams.resource.STATE_TREE_BYTES_LIMIT; // = Total state budget
const SERVICE_BANDWIDTH_BUDGET_PER_BLOCK = bandwidthBudgetPerBlock * SERVICE_BANDWIDTH_BUDGET_RATIO;
const APPS_BANDWIDTH_BUDGET_PER_BLOCK = bandwidthBudgetPerBlock * APPS_BANDWIDTH_BUDGET_RATIO;
const FREE_BANDWIDTH_BUDGET_PER_BLOCK = bandwidthBudgetPerBlock * FREE_BANDWIDTH_BUDGET_RATIO;
const SERVICE_STATE_BUDGET = stateTreeBytesLimit * SERVICE_STATE_BUDGET_RATIO;
const APPS_STATE_BUDGET = stateTreeBytesLimit * APPS_STATE_BUDGET_RATIO;
const FREE_STATE_BUDGET = stateTreeBytesLimit * FREE_STATE_BUDGET_RATIO;
const STATE_GAS_CONSTANT = 1;

// ** Enums **
/**
 * Message types for communication between nodes.
 *
 * @enum {string}
 */
const MessageTypes = {
  ADDRESS_REQUEST: 'ADDRESS_REQUEST',
  ADDRESS_RESPONSE: 'ADDRESS_RESPONSE',
  CHAIN_SEGMENT_REQUEST: 'CHAIN_SEGMENT_REQUEST',
  CHAIN_SEGMENT_RESPONSE: 'CHAIN_SEGMENT_RESPONSE',
  TRANSACTION: 'TRANSACTION',
  CONSENSUS: 'CONSENSUS',
  HEARTBEAT: 'HEARTBEAT'
};

/**
 * Status of blockchain nodes.
 *
 * @enum {string}
 */
const BlockchainNodeStates = {
  STARTING: 'STARTING',
  SYNCING: 'SYNCING',
  SERVING: 'SERVING',
};

/**
 * Predefined database paths.
 * @enum {string}
 */
// TODO(platfowner): Move '.something' paths to here from '[Owner|Function|Rule|Value]Properties'.
const PredefinedDbPaths = {
  // Roots
  OWNERS_ROOT: 'owners',
  RULES_ROOT: 'rules',
  FUNCTIONS_ROOT: 'functions',
  VALUES_ROOT: 'values',
  // Entry point labels (.*)
  DOT_RULE: '.rule',
  DOT_FUNCTION: '.function',
  DOT_OWNER: '.owner',
  DOT_SHARD: '.shard',
  // Consensus
  CONSENSUS: 'consensus',
  WHITELIST: 'whitelist',
  NUMBER: 'number',
  PROPOSE: 'propose',
  PROPOSER: 'proposer',
  VALIDATORS: 'validators',
  TOTAL_AT_STAKE: 'total_at_stake',
  VOTE: 'vote',
  BLOCK_HASH: 'block_hash',
  STAKE: 'stake',
  PROPOSAL_RIGHT: 'proposal_right',
  // Receipts
  RECEIPTS: 'receipts',
  RECEIPTS_ADDRESS: 'address',
  RECEIPTS_BILLING: 'billing',
  RECEIPTS_BLOCK_NUMBER: 'block_number',
  RECEIPTS_EXEC_RESULT: 'exec_result',
  RECEIPTS_GAS_COST_TOTAL: 'gas_cost_total',
  // Gas fee
  GAS_FEE: 'gas_fee',
  COLLECT: 'collect',
  BILLING: 'billing',
  GAS_FEE_AMOUNT: 'amount',
  // Token
  TOKEN: 'token',
  TOKEN_NAME: 'name',
  TOKEN_SYMBOL: 'symbol',
  TOKEN_TOTAL_SUPPLY: 'total_supply',
  // Save last tx
  SAVE_LAST_TX_LAST_TX: '.last_tx',
  // Erase value
  ERASE_VALUE_ERASED: 'erased',
  // Accounts & Transfer
  ACCOUNTS: 'accounts',
  ACCOUNTS_NONCE: 'nonce',
  ACCOUNTS_TIMESTAMP: 'timestamp',
  SERVICE_ACCOUNTS: 'service_accounts',
  BALANCE: 'balance',
  TRANSFER: 'transfer',
  TRANSFER_VALUE: 'value',
  TRANSFER_RESULT: 'result',
  // Apps & Manage app
  APPS: 'apps',
  MANAGE_APP: 'manage_app',
  MANAGE_APP_CONFIG: 'config',
  MANAGE_APP_CONFIG_ADMIN: 'admin',
  MANAGE_APP_CONFIG_BILLING: 'billing',
  MANAGE_APP_CONFIG_BILLING_USERS: 'users',
  MANAGE_APP_CONFIG_IS_PUBLIC: 'is_public',
  MANAGE_APP_CONFIG_SERVICE: 'service',
  MANAGE_APP_CREATE: 'create',
  MANAGE_APP_RESULT: 'result',
  // Staking
  STAKING: 'staking',
  STAKING_BALANCE_TOTAL: 'balance_total',
  STAKING_EXPIRE_AT: 'expire_at',
  STAKING_LOCKUP_DURATION: 'lockup_duration',
  STAKING_RESULT: 'result',
  STAKING_STAKE: 'stake',
  STAKING_UNSTAKE: 'unstake',
  STAKING_VALUE: 'value',
  // Payments
  PAYMENTS: 'payments',
  PAYMENTS_ADMIN: 'admin',
  PAYMENTS_CLAIM: 'claim',
  PAYMENTS_CONFIG: 'config',
  PAYMENTS_PAY: 'pay',
  PAYMENTS_RESULT: 'result',
  // Escrow
  ESCROW: 'escrow',
  ESCROW_ADMIN: 'admin',
  ESCROW_HOLD: 'hold',
  ESCROW_OPEN: 'open',
  ESCROW_RELEASE: 'release',
  ESCROW_RESULT: 'result',
  // Remote transaction action
  REMOTE_TX_ACTION_RESULT: 'result',
  // Sharding
  SHARDING: 'sharding',
  SHARDING_CONFIG: 'config',
  SHARDING_SHARD: 'shard',
  // Check-in & Check-out
  CHECKIN: 'checkin',
  CHECKIN_REQUEST: 'request',
  CHECKIN_PAYLOAD: 'payload',
  CHECKIN_PARENT_FINALIZE: 'parent_finalize',
  CHECKOUT: 'checkout',
};

/**
 * Properties of token configs.
 *
 * @enum {string}
 */
const TokenProperties = {
  NAME: 'name',
  SYMBOL: 'symbol',
  TOTAL_SUPPLY: 'total_supply',
};

/**
 * Properties of account configs.
 *
 * @enum {string}
 */
const AccountProperties = {
  ADDRESS: 'address',
  OTHERS: 'others',
  OWNER: 'owner',
  PRIVATE_KEY: 'private_key',
  PUBLIC_KEY: 'public_key',
  SHARES: 'shares',
  TIMESTAMP: 'timestamp',
};

/**
 * Properties of owner configs.
 *
 * @enum {string}
 */
const OwnerProperties = {
  ANYONE: '*',
  BRANCH_OWNER: 'branch_owner',
  FID_PREFIX: 'fid:',
  OWNERS: 'owners',
  WRITE_FUNCTION: 'write_function',
  WRITE_OWNER: 'write_owner',
  WRITE_RULE: 'write_rule',
};

/**
 * Properties of rule configs.
 *
 * @enum {string}
 */
const RuleProperties = {
  WRITE: 'write',
};

/**
 * Properties of function configs.
 *
 * @enum {string}
 */
const FunctionProperties = {
  EVENT_LISTENER: 'event_listener',
  FUNCTION_ID: 'function_id',
  FUNCTION_TYPE: 'function_type',
  SERVICE_NAME: 'service_name',
};

/**
 * Types of functions.
 *
 * @enum {string}
 */
const FunctionTypes = {
  NATIVE: 'NATIVE',
  REST: 'REST',
};

/**
 * Properties of state proof.
 *
 * @enum {string}
 */
const ProofProperties = {
  PROOF_HASH: '.proof_hash',
};

/**
 * Properties of state info.
 *
 * @enum {string}
 */
const StateInfoProperties = {
  TREE_HEIGHT: 'tree_height',
  TREE_SIZE: 'tree_size',
  TREE_BYTES: 'tree_bytes',
};

/**
 * IDs of native functions.
 *
 * @enum {string}
 */
const NativeFunctionIds = {
  CLAIM: '_claim',
  CLOSE_CHECKIN: '_closeCheckin',
  COLLECT_FEE: '_collectFee',
  CREATE_APP: '_createApp',
  DISTRIBUTE_FEE: '_distributeFee',
  ERASE_VALUE: '_eraseValue',
  HOLD: '_hold',
  OPEN_CHECKIN: '_openCheckin',
  PAY: '_pay',
  RELEASE: '_release',
  SAVE_LAST_TX: '_saveLastTx',
  SET_OWNER_CONFIG: '_setOwnerConfig',
  STAKE: '_stake',
  TRANSFER: '_transfer',
  UNSTAKE: '_unstake',
  UPDATE_LATEST_SHARD_REPORT: '_updateLatestShardReport',
};

function isNativeFunctionId(fid) {
  const fidList = Object.values(NativeFunctionIds);
  return fidList.includes(fid);
}

/**
 * Properties of sharding configs.
 *
 * @enum {string}
 */
const ShardingProperties = {
  LATEST: 'latest',
  LATEST_BLOCK_NUMBER: 'latest_block_number',
  PARENT_CHAIN_POC: 'parent_chain_poc',
  PROOF_HASH: 'proof_hash',
  PROOF_HASH_MAP: 'proof_hash_map',
  REPORTING_PERIOD: 'reporting_period',
  SHARD_OWNER: 'shard_owner',
  SHARD_REPORTER: 'shard_reporter',
  SHARDING_ENABLED: 'sharding_enabled',
  SHARDING_PATH: 'sharding_path',
  SHARDING_PROTOCOL: 'sharding_protocol',
  TOKEN_EXCH_SCHEME: 'token_exchange_scheme',
  TOKEN_EXCH_RATE: 'token_exchange_rate',
};

/**
 * Sharding protocols.
 *
 * @enum {string}
 */
const ShardingProtocols = {
  NONE: 'NONE',
  POA: 'POA',
};

/**
 * Token exchange schemes.
 *
 * @enum {string}
 */
const TokenExchangeSchemes = {
  NONE: 'NONE',
  FIXED: 'FIXED',
};

/**
 * Types of read database operations.
 *
 * @enum {string}
 */
const ReadDbOperations = {
  GET_VALUE: 'GET_VALUE',
  GET_FUNCTION: 'GET_FUNCTION',
  GET_RULE: 'GET_RULE',
  GET_OWNER: 'GET_OWNER',
  MATCH_FUNCTION: 'MATCH_FUNCTION',
  MATCH_RULE: 'MATCH_RULE',
  MATCH_OWNER: 'MATCH_OWNER',
  EVAL_RULE: 'EVAL_RULE',
  EVAL_OWNER: 'EVAL_OWNER',
  GET: 'GET',
};

/**
 * Types of write database operations.
 *
 * @enum {string}
 */
const WriteDbOperations = {
  SET_VALUE: 'SET_VALUE',
  INC_VALUE: 'INC_VALUE',
  DEC_VALUE: 'DEC_VALUE',
  SET_FUNCTION: 'SET_FUNCTION',
  SET_RULE: 'SET_RULE',
  SET_OWNER: 'SET_OWNER',
  SET: 'SET',
};

/**
 * Function result code.
 *
 * @enum {string}
 */
const FunctionResultCode = {
  FAILURE: 'FAILURE',  // Normal failure
  IN_LOCKUP_PERIOD: 'IN_LOCKUP_PERIOD',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',  // Something went wrong but don't know why
  INVALID_ACCOUNT_NAME: 'INVALID_ACCOUNT_NAME',
  INVALID_SERVICE_NAME: 'INVALID_SERVICE_NAME',
  SUCCESS: 'SUCCESS',
};

/**
 * Transaction states.
 *
 * @enum {string}
 */
const TransactionStates = {
  IN_BLOCK: 'IN_BLOCK',
  EXECUTED: 'EXECUTED',
  FAILED: 'FAILED',
  PENDING: 'PENDING',
  TIMED_OUT: 'TIMED_OUT',
};

/**
 * State versions.
 *
 * @enum {string}
 */
const StateVersions = {
  BACKUP: 'BACKUP',
  CONSENSUS_CREATE: 'CONSENSUS_CREATE',
  CONSENSUS_PROPOSE: 'CONSENSUS_PROPOSE',
  CONSENSUS_VOTE: 'CONSENSUS_VOTE',
  EMPTY: 'EMPTY',
  FINAL: 'FINAL',
  NODE: 'NODE',
  POOL: 'POOL',
  SEGMENT: 'SEGMENT',
  SNAP: 'SNAP',
  START: 'START',
  TX_POOL: 'TX_POOL',
};

/**
 * Gas fee constants.
 *
 * @enum {number}
 */
const GasFeeConstants = {
  ACCOUNT_REGISTRATION_GAS_AMOUNT: 1000,
  REST_FUNCTION_CALL_GAS_AMOUNT: 10,
};

// ** Lists **

/**
 * Root labels of service paths.
 */
const SERVICE_TYPES = [
  PredefinedDbPaths.ACCOUNTS,
  PredefinedDbPaths.CHECKIN,
  PredefinedDbPaths.ESCROW,
  PredefinedDbPaths.GAS_FEE,
  PredefinedDbPaths.MANAGE_APP,
  PredefinedDbPaths.PAYMENTS,
  PredefinedDbPaths.SERVICE_ACCOUNTS,
  PredefinedDbPaths.SHARDING,
  PredefinedDbPaths.STAKING,
  PredefinedDbPaths.TRANSFER,
];

function isServiceType(type) {
  return SERVICE_TYPES.includes(type);
}

/**
 * Service types allowed to create service accounts.
 */
const SERVICE_ACCOUNT_SERVICE_TYPES = [
  PredefinedDbPaths.BILLING,
  PredefinedDbPaths.ESCROW,
  PredefinedDbPaths.GAS_FEE,
  PredefinedDbPaths.PAYMENTS,
  PredefinedDbPaths.STAKING,
];

function isServiceAccountServiceType(type) {
  return SERVICE_ACCOUNT_SERVICE_TYPES.includes(type);
}

/**
 * Service types that are app-dependent.
 */
const APP_DEPENDENT_SERVICE_TYPES = [
  PredefinedDbPaths.MANAGE_APP,
  PredefinedDbPaths.PAYMENTS,
  PredefinedDbPaths.STAKING,
];

function isAppDependentServiceType(type) {
  return APP_DEPENDENT_SERVICE_TYPES.includes(type);
}

/**
 * Sync mode options.
 *
 * @enum {string}
 */
const SyncModeOptions = {
  FULL: 'full',
  FAST: 'fast',
}

/**
 * Overwriting environment variables.
 * These parameters are defined in genesis_params.json, but if specified as environment variables,
 * the env vars take precedence.
 * (priority: base params < genesis_params.json in GENESIS_CONFIGS_DIR < env var)
 */
const OVERWRITING_BLOCKCHAIN_PARAMS = ['TRACKER_WS_ADDR', 'HOSTING_ENV'];
const OVERWRITING_CONSENSUS_PARAMS = ['MIN_NUM_VALIDATORS', 'MAX_NUM_VALIDATORS', 'EPOCH_MS'];

function overwriteGenesisParams(overwritingParams, type) {
  for (const key of overwritingParams) {
    if (process.env[key]) {
      GenesisParams[type][key] = process.env[key];
    }
  }

  if (type === 'consensus') {
    const whitelist = {};
    const validators = {};
    for (let i = 0; i < GenesisParams.consensus.MIN_NUM_VALIDATORS; i++) {
      const addr = GenesisAccounts[AccountProperties.OTHERS][i][AccountProperties.ADDRESS];
      CommonUtil.setJsObject(whitelist, [addr], true);
      CommonUtil.setJsObject(validators, [addr], {
          [PredefinedDbPaths.STAKE]: GenesisParams.consensus.MIN_STAKE_PER_VALIDATOR,
          [PredefinedDbPaths.PROPOSAL_RIGHT]: true
        });
    }
    GenesisParams.consensus.GENESIS_WHITELIST = whitelist;
    GenesisParams.consensus.GENESIS_VALIDATORS = validators;
  }
}

overwriteGenesisParams(OVERWRITING_BLOCKCHAIN_PARAMS, 'blockchain');
overwriteGenesisParams(OVERWRITING_CONSENSUS_PARAMS, 'consensus');

// NOTE(minsulee2): If NETWORK_OPTIMIZATION env is set, it tightly limits the outbound connections.
// The minimum network connections are set based on the MAX_NUM_VALIDATORS otherwise.
function initializeNetworkEnvronments() {
  if (process.env.NETWORK_OPTIMIZATION) {
    return GenesisParams.network;
  } else {
    return {
      // NOTE(minsulee2): Need a discussion that MAX_NUM_VALIDATORS and MAX_INBOUND_LIMIT
      // should not be related to one another.
      P2P_MESSAGE_TIMEOUT_MS: 600000,
      MAX_OUTBOUND_LIMIT: GenesisParams.consensus.MAX_NUM_VALIDATORS - 1,
      MAX_INBOUND_LIMIT: GenesisParams.consensus.MAX_NUM_VALIDATORS - 1,
      DEFAULT_MAX_OUTBOUND: GenesisParams.consensus.MAX_NUM_VALIDATORS - 1,
      DEFAULT_MAX_INBOUND: GenesisParams.consensus.MAX_NUM_VALIDATORS - 1
    }
  }
}

const networkEnv = initializeNetworkEnvronments();

/**
 * Port number helper.
 * @param {number} defaultValue
 * @param {number} baseValue
 */
function getPortNumber(defaultValue, baseValue) {
  if (GenesisParams.blockchain.HOSTING_ENV === 'local') {
    return Number(baseValue) + (ACCOUNT_INDEX !== null ? Number(ACCOUNT_INDEX) + 1 : 0);
  }
  return defaultValue;
}

/**
 * Genesis DB & sharding config.
 */
const GenesisSharding = getGenesisSharding();
const GenesisValues = getGenesisValues();
const GenesisFunctions = getGenesisFunctions();
const GenesisRules = getGenesisRules();
const GenesisOwners = getGenesisOwners();

function getGenesisConfig(filename, additionalEnv) {
  let config = null;
  if (CUSTOM_GENESIS_CONFIGS_DIR) {
    const configPath = path.resolve(__dirname, '..', CUSTOM_GENESIS_CONFIGS_DIR, filename);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath));
    }
  }
  if (!config) {
    const configPath = path.resolve(__dirname, '..', DEFAULT_GENESIS_CONFIGS_DIR, filename);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath));
    } else {
      throw Error(`Missing genesis config file: ${configPath}`);
    }
  }
  if (additionalEnv) {
    const parts = additionalEnv.split(':');
    const dbPath = parts[0];
    const additionalFilePath = path.resolve(__dirname, '..', parts[1])
    if (fs.existsSync(additionalFilePath)) {
      const additionalConfig = JSON.parse(fs.readFileSync(additionalFilePath));
      CommonUtil.setJsObject(config, [dbPath], additionalConfig);
    } else {
      throw Error(`Missing additional genesis config file: ${additionalFilePath}`);
    }
  }
  return config;
}

function getGenesisSharding() {
  const config = getGenesisConfig('genesis_sharding.json');
  if (config[ShardingProperties.SHARDING_PROTOCOL] === ShardingProtocols.POA) {
    const ownerAddress = CommonUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
    const reporterAddress =
        GenesisAccounts[AccountProperties.OTHERS][0][AccountProperties.ADDRESS];
    CommonUtil.setJsObject(config, [ShardingProperties.SHARD_OWNER], ownerAddress);
    CommonUtil.setJsObject(config, [ShardingProperties.SHARD_REPORTER], reporterAddress);
  }
  return config;
}

function getGenesisValues() {
  const values = {};
  CommonUtil.setJsObject(values, [PredefinedDbPaths.TOKEN], GenesisToken);
  const ownerAddress = CommonUtil.getJsObject(
      GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
  CommonUtil.setJsObject(
      values,
      [PredefinedDbPaths.ACCOUNTS, ownerAddress, PredefinedDbPaths.BALANCE],
      GenesisToken[TokenProperties.TOTAL_SUPPLY]);
  CommonUtil.setJsObject(
      values, [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG], GenesisSharding);
  CommonUtil.setJsObject(
      values, [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.WHITELIST], GenesisParams.consensus.GENESIS_WHITELIST);
  return values;
}

function getGenesisFunctions() {
  const functions = getGenesisConfig('genesis_functions.json', process.env.ADDITIONAL_FUNCTIONS);
  return functions;
}

function getGenesisRules() {
  const rules = getGenesisConfig('genesis_rules.json', process.env.ADDITIONAL_RULES);
  if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    CommonUtil.setJsObject(
        rules, [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG], getShardingRule());
  }
  return rules;
}

function getGenesisOwners() {
  let owners = getGenesisConfig('genesis_owners.json', process.env.ADDITIONAL_OWNERS);
  CommonUtil.setJsObject(owners, [], getRootOwner());
  if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    CommonUtil.setJsObject(
        owners, [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG],
        getShardingOwner());
  }
  CommonUtil.setJsObject(
      owners, [PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.WHITELIST], getWhitelistOwner());
  return owners;
}

function getShardingRule() {
  const ownerAddress =
      CommonUtil.getJsObject(GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
  return {
    [PredefinedDbPaths.DOT_RULE]: {
      [RuleProperties.WRITE]: `auth.addr === '${ownerAddress}'`,
    }
  };
}

function getRootOwner() {
  return {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        [GenesisAccounts.owner.address]: buildOwnerPermissions(true, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function getShardingOwner() {
  return {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        [GenesisAccounts.owner.address]: buildOwnerPermissions(false, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function getWhitelistOwner() {
  return {
    [PredefinedDbPaths.DOT_OWNER]: {
      [OwnerProperties.OWNERS]: {
        [GenesisAccounts.owner.address]: buildOwnerPermissions(false, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function buildOwnerPermissions(branchOwner, writeFunction, writeOwner, writeRule) {
  return {
    [OwnerProperties.BRANCH_OWNER]: branchOwner,
    [OwnerProperties.WRITE_FUNCTION]: writeFunction,
    [OwnerProperties.WRITE_OWNER]: writeOwner,
    [OwnerProperties.WRITE_RULE]: writeRule
  };
}

function buildRulePermission(rule) {
  return {
    [PredefinedDbPaths.DOT_RULE]: {
      [RuleProperties.WRITE]: rule
    }
  };
}

module.exports = {
  FeatureFlags,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP,
  DATA_PROTOCOL_VERSION,
  CONSENSUS_PROTOCOL_VERSION,
  LOGS_DIR,
  CHAINS_DIR,
  CHAINS_N2B_DIR_NAME,
  CHAINS_H2N_DIR_NAME,
  CHAINS_N2B_MAX_NUM_FILES,
  CHAINS_H2N_HASH_PREFIX_LENGTH,
  SNAPSHOTS_ROOT_DIR,
  SNAPSHOTS_N2S_DIR_NAME,
  SNAPSHOTS_INTERVAL_BLOCK_NUMBER,
  MAX_NUM_SNAPSHOTS,
  MAX_NUM_BLOCKS_RECEIPTS,
  DEBUG,
  CONSOLE_LOG,
  ENABLE_DEV_SET_CLIENT_API,
  ENABLE_TX_SIG_VERIF_WORKAROUND,
  ENABLE_GAS_FEE_WORKAROUND,
  COMCOM_HOST_EXTERNAL_IP,
  ACCOUNT_INDEX,
  PORT,
  P2P_PORT,
  LIGHTWEIGHT,
  SYNC_MODE,
  HASH_DELIMITER,
  JS_REF_SIZE_IN_BYTES,
  TX_NONCE_ERROR_CODE,
  TX_TIMESTAMP_ERROR_CODE,
  MICRO_AIN,
  MILLI_AIN,
  SERVICE_BANDWIDTH_BUDGET_PER_BLOCK,
  APPS_BANDWIDTH_BUDGET_PER_BLOCK,
  FREE_BANDWIDTH_BUDGET_PER_BLOCK,
  SERVICE_STATE_BUDGET,
  APPS_STATE_BUDGET,
  FREE_STATE_BUDGET,
  STATE_GAS_CONSTANT,
  MessageTypes,
  BlockchainNodeStates,
  PredefinedDbPaths,
  TokenProperties,
  AccountProperties,
  OwnerProperties,
  RuleProperties,
  FunctionProperties,
  FunctionTypes,
  FunctionResultCode,
  ProofProperties,
  StateInfoProperties,
  NativeFunctionIds,
  isNativeFunctionId,
  ShardingProperties,
  ShardingProtocols,
  TokenExchangeSchemes,
  ReadDbOperations,
  WriteDbOperations,
  TransactionStates,
  StateVersions,
  GenesisToken,
  GenesisAccounts,
  GenesisSharding,
  GenesisValues,
  GenesisFunctions,
  GenesisRules,
  GenesisOwners,
  GasFeeConstants,
  SyncModeOptions,
  isServiceType,
  isServiceAccountServiceType,
  isAppDependentServiceType,
  buildOwnerPermissions,
  buildRulePermission,
  ...GenesisParams.blockchain,
  ...GenesisParams.consensus,
  ...GenesisParams.resource,
  ...networkEnv
};
