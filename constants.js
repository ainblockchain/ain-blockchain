const fs = require('fs');
const path = require('path');
const moment = require('moment');
const {
  ConsensusConsts,
  ConsensusDbPaths,
} = require('./consensus/constants');
const ChainUtil = require('./chain-util');

const DEFAULT_GENESIS_CONFIGS_DIR = 'blockchain';
const CUSTOM_GENESIS_CONFIGS_DIR = process.env.GENESIS_CONFIGS_DIR ?
    process.env.GENESIS_CONFIGS_DIR : null;
const BLOCKCHAINS_DIR = path.resolve(__dirname, 'blockchain/blockchains');
const PROTOCOL_VERSIONS = path.resolve(__dirname, 'client/protocol_versions.json');
const DEBUG = process.env.DEBUG ? process.env.DEBUG.toLowerCase().startsWith('t') : false;
const MAX_TX_BYTES = 10000;
const TRANSACTION_POOL_TIME_OUT_MS = moment.duration(1, 'hours').as('milliseconds');
const TRANSACTION_TRACKER_TIME_OUT_MS = moment.duration(24, 'hours').as('milliseconds');
// TODO (lia): Check network id in all messages
const NETWORK_ID = process.env.NETWORK_ID || 'Testnet';
// HOSTING_ENV is a variable used in extracting the ip address of the host machine,
// of which value could be either 'local', 'default', or 'gcp'.
const HOSTING_ENV = process.env.HOSTING_ENV || 'default';
const COMCOM_HOST_EXTERNAL_IP = process.env.COMCOM_HOST_EXTERNAL_IP ?
    process.env.COMCOM_HOST_EXTERNAL_IP : '';
const COMCOM_HOST_INTERNAL_IP_MAP = {
  aincom1: '192.168.1.13',
  aincom2: '192.168.1.14',
}
const ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || null;
const TRACKER_WS_ADDR = process.env.TRACKER_WS_ADDR || 'ws://localhost:5000';
const PORT = process.env.PORT || getPortNumber(8080, 8081);
const P2P_PORT = process.env.P2P_PORT || getPortNumber(5000, 5001);
const HASH_DELIMITER = '#';
const MAX_SHARD_REPORT = 100;
const LIGHTWEIGHT = process.env.LIGHTWEIGHT ?
    process.env.LIGHTWEIGHT.toLowerCase().startsWith('t') : false;

function getPortNumber(defaultValue, baseValue) {
  if (HOSTING_ENV === 'local') {
    return Number(baseValue) + (ACCOUNT_INDEX !== null ? Number(ACCOUNT_INDEX) : 0);
  }
  return defaultValue;
}

/**
 * Message types for communication between nodes
 * @enum {string}
 */
const MessageTypes = {
  TRANSACTION: 'transaction',
  CHAIN_SUBSECTION: 'chain_subsection',
  CHAIN_SUBSECTION_REQUEST: 'chain_subsection_request',
  CONSENSUS: 'consensus',
  HEARTBEAT: 'heartbeat'
};

/**
 * Predefined database paths
 * @enum {string}
 */
// TODO (lia): Pick one convention: full-paths (e.g. /deposit/consensus) or keys (e.g. token)
const PredefinedDbPaths = {
  // Roots
  OWNERS_ROOT: 'owners',
  RULES_ROOT: 'rules',
  FUNCTIONS_ROOT: 'functions',
  VALUES_ROOT: 'values',
  // Consensus
  CONSENSUS: 'consensus',
  // Token
  TOKEN: 'token',
  TOKEN_NAME: 'name',
  TOKEN_SYMBOL: 'symbol',
  TOKEN_TOTAL_SUPPLY: 'total_supply',
  // Accounts & Transfer
  ACCOUNTS: 'accounts',
  BALANCE: 'balance',
  TRANSFER: 'transfer',
  TRANSFER_VALUE: 'value',
  TRANSFER_RESULT: 'result',
  // Deposit & Withdraw
  DEPOSIT: 'deposit',
  DEPOSIT_ACCOUNTS: 'deposit_accounts',
  DEPOSIT_CONFIG: 'config',
  DEPOSIT_CREATED_AT: 'created_at',
  DEPOSIT_EXPIRE_AT: 'expire_at',
  DEPOSIT_LOCKUP_DURATION: 'lockup_duration',
  DEPOSIT_RESULT: 'result',
  DEPOSIT_VALUE: 'value',
  WITHDRAW: 'withdraw',
  WITHDRAW_CREATED_AT: 'created_at',
  WITHDRAW_RESULT: 'result',
  WITHDRAW_VALUE: 'value',
  DEPOSIT_ACCOUNTS_CONSENSUS: 'deposit_accounts/consensus',
  DEPOSIT_CONSENSUS: 'deposit/consensus',
  WITHDRAW_CONSENSUS: 'withdraw/consensus',
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
 * Properties of token configs
 * @enum {string}
 */
const TokenProperties = {
  NAME: 'name',
  SYMBOL: 'symbol',
  TOTAL_SUPPLY: 'total_supply',
};

/**
 * Properties of account configs
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
 * Properties of owner configs
 * @enum {string}
 */
const OwnerProperties = {
  ANYONE: '*',
  BRANCH_OWNER: 'branch_owner',
  OWNER: '.owner',
  OWNERS: 'owners',
  WRITE_FUNCTION: 'write_function',
  WRITE_OWNER: 'write_owner',
  WRITE_RULE: 'write_rule',
};

/**
 * Properties of rule configs
 * @enum {string}
 */
const RuleProperties = {
  WRITE: '.write',
};

/**
 * Properties of function configs
 * @enum {string}
 */
const FunctionProperties = {
  EVENT_LISTENER: 'event_listener',
  FUNCTION: '.function',
  FUNCTION_ID: 'function_id',
  FUNCTION_TYPE: 'function_type',
  SERVICE_NAME: 'service_name',
};

/**
 * Types of functions
 * @enum {string}
 */
const FunctionTypes = {
  NATIVE: 'NATIVE',
  REST: 'REST',
};

/**
 * Properties of proof configs
 * @enum {string}
 */
const ProofProperties = {
  PROOF_HASH: '.proof_hash',
};

/**
 * IDs of native functions
 * @enum {string}
 */
const NativeFunctionIds = {
  DEPOSIT: '_deposit',
  TRANSFER: '_transfer',
  WITHDRAW: '_withdraw',
  UPDATE_LATEST_SHARD_REPORT: '_updateLatestShardReport',
  OPEN_CHECKIN: '_openCheckin',
  CLOSE_CHECKIN: '_closeCheckin',
};

/**
 * Properties of sharding configs
 * @enum {string}
 */
const ShardingProperties = {
  LATEST: 'latest',
  LATEST_BLOCK_NUMBER: 'latest_block_number',
  PARENT_CHAIN_POC: 'parent_chain_poc',
  PROOF_HASH: 'proof_hash',
  PROOF_HASH_MAP: 'proof_hash_map',
  REPORTING_PERIOD: 'reporting_period',
  SHARD: '.shard',
  SHARD_OWNER: 'shard_owner',
  SHARD_REPORTER: 'shard_reporter',
  SHARDING_ENABLED: 'sharding_enabled',
  SHARDING_PATH: 'sharding_path',
  SHARDING_PROTOCOL: 'sharding_protocol',
  TOKEN_EXCH_SCHEME: 'token_exchange_scheme',
  TOKEN_EXCH_RATE: 'token_exchange_rate',
};

/**
 * Sharding protocols
 * @enum {string}
 */
const ShardingProtocols = {
  NONE: 'NONE',
  POA: 'POA',
};

/**
 * Token exchange schemes
 * @enum {string}
 */
const TokenExchangeSchemes = {
  NONE: 'NONE',
  FIXED: 'FIXED',
};

/**
 * Types of read database operations
 * @enum {string}
 */
const ReadDbOperations = {
  GET_VALUE: 'GET_VALUE',
  GET_FUNCTION: 'GET_FUNCTION',
  GET_RULE: 'GET_RULE',
  GET_OWNER: 'GET_OWNER',
  GET_PROOF: 'GET_PROOF',
  MATCH_FUNCTION: 'MATCH_FUNCTION',
  MATCH_RULE: 'MATCH_RULE',
  MATCH_OWNER: 'MATCH_OWNER',
  EVAL_RULE: 'EVAL_RULE',
  EVAL_OWNER: 'EVAL_OWNER',
  GET: 'GET',
};

/**
 * Types of write database operations
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
 * Function result code
 * @enum {string}
 */
const FunctionResultCode = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  IN_LOCKUP_PERIOD: 'IN_LOCKUP_PERIOD',
};

/**
 * Constant values for transactionTracker
 * @enum {string}
 */
const TransactionStatus = {
  BLOCK_STATUS: 'BLOCK',
  POOL_STATUS: 'POOL',
  TIMEOUT_STATUS: 'TIMEOUT',
  FAIL_STATUS: 'FAIL'
};

/**
 * Default values
 */
const DefaultValues = {
  DEPOSIT_LOCKUP_DURATION_MS: 2592000000 // 30 days
}

/**
 * State versions.
 * @enum {string}
 */
const StateVersions = {
  BACKUP: 'BACKUP',
  BLOCK: 'BLOCK',
  EMPTY: 'EMPTY',
  NODE: 'NODE',
  SNAP: 'SNAP',
  TEMP: 'TEMP',
};

/**
 * Feature flags.
 */
const FeatureFlags = {
  // Enables state version optimization.
  enableStateVersionOpt: true,
}

const GenesisToken = getGenesisConfig('genesis_token.json');
const GenesisAccounts = getGenesisConfig('genesis_accounts.json');
const GenesisSharding = getGenesisSharding();
const GenesisWhitelist = getGenesisWhitelist();
const GenesisValues = getGenesisValues();
const GenesisFunctions = getGenesisFunctions();
const GenesisRules = getGenesisRules();
const GenesisOwners = getGenesisOwners();

function getGenesisConfig(filename, additionalEnv) {
  let config = null;
  if (CUSTOM_GENESIS_CONFIGS_DIR) {
    const configPath = path.resolve(__dirname, CUSTOM_GENESIS_CONFIGS_DIR, filename);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath));
    }
  }
  if (!config) {
    const configPath = path.resolve(__dirname, DEFAULT_GENESIS_CONFIGS_DIR, filename);
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath));
    } else {
      throw Error(`Missing genesis config file: ${configPath}`);
    }
  }
  if (additionalEnv) {
    const parts = additionalEnv.split(':');
    const dbPath = parts[0];
    const additionalFilePath = path.resolve(__dirname, parts[1])
    if (fs.existsSync(additionalFilePath)) {
      const additionalConfig = JSON.parse(fs.readFileSync(additionalFilePath));
      ChainUtil.setJsObject(config, [dbPath], additionalConfig);
    } else {
      throw Error(`Missing additional genesis config file: ${additionalFilePath}`);
    }
  }
  return config;
}

function getGenesisSharding() {
  const config = getGenesisConfig('genesis_sharding.json');
  if (config[ShardingProperties.SHARDING_PROTOCOL] === ShardingProtocols.POA) {
    const ownerAddress = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
    const reporterAddress =
        GenesisAccounts[AccountProperties.OTHERS][0][AccountProperties.ADDRESS];
    ChainUtil.setJsObject(config, [ShardingProperties.SHARD_OWNER], ownerAddress);
    ChainUtil.setJsObject(config, [ShardingProperties.SHARD_REPORTER], reporterAddress);
  }
  return config;
}

// TODO(lia): Increase this list to 10.
function getGenesisWhitelist() {
  const whitelist = {};
  for (let i = 0; i < ConsensusConsts.INITIAL_NUM_VALIDATORS; i++) {
    const accountAddress = GenesisAccounts[AccountProperties.OTHERS][i][AccountProperties.ADDRESS];
    ChainUtil.setJsObject(whitelist, [accountAddress], ConsensusConsts.INITIAL_STAKE);
  }
  return whitelist;
}

function getGenesisValues() {
  const values = {};
  ChainUtil.setJsObject(values, [PredefinedDbPaths.TOKEN], GenesisToken);
  const ownerAddress = ChainUtil.getJsObject(
      GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
  ChainUtil.setJsObject(
      values,
      [PredefinedDbPaths.ACCOUNTS, ownerAddress, PredefinedDbPaths.BALANCE],
      GenesisToken[TokenProperties.TOTAL_SUPPLY]);
  ChainUtil.setJsObject(
      values, [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG], GenesisSharding);
  ChainUtil.setJsObject(
      values, [ConsensusDbPaths.CONSENSUS, ConsensusDbPaths.WHITELIST], GenesisWhitelist);
  return values;
}

function getGenesisFunctions() {
  const functions = getGenesisConfig('genesis_functions.json', process.env.ADDITIONAL_FUNCTIONS);
  return functions;
}

function getGenesisRules() {
  const rules = getGenesisConfig('genesis_rules.json', process.env.ADDITIONAL_RULES);
  if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    ChainUtil.setJsObject(
        rules, [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG], getShardingRule());
  }
  ChainUtil.setJsObject(
      rules, [ConsensusDbPaths.CONSENSUS, ConsensusDbPaths.WHITELIST], getWhitelistRule());
  return rules;
}

function getGenesisOwners() {
  const owners = getGenesisConfig('genesis_owners.json', process.env.ADDITIONAL_OWNERS);
  if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] !== ShardingProtocols.NONE) {
    ChainUtil.setJsObject(
        owners, [PredefinedDbPaths.SHARDING, PredefinedDbPaths.SHARDING_CONFIG],
        getShardingOwner());
  }
  ChainUtil.setJsObject(
      owners, [ConsensusDbPaths.CONSENSUS, ConsensusDbPaths.WHITELIST], getWhitelistOwner());
  return owners;
}

function getShardingRule() {
  const ownerAddress =
      ChainUtil.getJsObject(GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
  return {
    [RuleProperties.WRITE]: `auth === '${ownerAddress}'`,
  };
}

function getWhitelistRule() {
  const ownerAddress =
      ChainUtil.getJsObject(GenesisAccounts, [AccountProperties.OWNER, AccountProperties.ADDRESS]);
  return {
    [RuleProperties.WRITE]: `auth === '${ownerAddress}'`,
  };
}

function getShardingOwner() {
  return {
    [OwnerProperties.OWNER]: {
      [OwnerProperties.OWNERS]: {
        [GenesisAccounts.owner.address]: buildOwnerPermissions(false, true, true, true),
        [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
      }
    }
  };
}

function getWhitelistOwner() {
  return {
    [OwnerProperties.OWNER]: {
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

module.exports = {
  BLOCKCHAINS_DIR,
  PROTOCOL_VERSIONS,
  DEBUG,
  MAX_TX_BYTES,
  TRANSACTION_POOL_TIME_OUT_MS,
  TRANSACTION_TRACKER_TIME_OUT_MS,
  NETWORK_ID,
  HOSTING_ENV,
  COMCOM_HOST_EXTERNAL_IP,
  COMCOM_HOST_INTERNAL_IP_MAP,
  ACCOUNT_INDEX,
  PORT,
  P2P_PORT,
  TRACKER_WS_ADDR,
  MAX_SHARD_REPORT,
  LIGHTWEIGHT,
  HASH_DELIMITER,
  MessageTypes,
  PredefinedDbPaths,
  TokenProperties,
  AccountProperties,
  OwnerProperties,
  RuleProperties,
  FunctionProperties,
  FunctionTypes,
  FunctionResultCode,
  ProofProperties,
  NativeFunctionIds,
  ShardingProperties,
  ShardingProtocols,
  TokenExchangeSchemes,
  ReadDbOperations,
  WriteDbOperations,
  TransactionStatus,
  DefaultValues,
  StateVersions,
  FeatureFlags,
  GenesisToken,
  GenesisAccounts,
  GenesisSharding,
  GenesisWhitelist,
  GenesisValues,
  GenesisFunctions,
  GenesisRules,
  GenesisOwners,
  buildOwnerPermissions,
};
