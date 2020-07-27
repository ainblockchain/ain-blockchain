const fs = require('fs');
const path = require('path');
const moment = require('moment');
const GENESIS_TOKEN = path.resolve(__dirname, 'blockchain/genesis_token.json');
const GENESIS_ACCOUNTS = path.resolve(__dirname, 'blockchain/genesis_accounts.json');
const GENESIS_OWNERS = path.resolve(__dirname, 'blockchain/genesis_owners.json');
const ADDITIONAL_OWNERS = process.env.ADDITIONAL_OWNERS ? {
  dbPath: process.env.ADDITIONAL_OWNERS.split(':')[0],
  filePath: path.resolve(__dirname, process.env.ADDITIONAL_OWNERS.split(':')[1])
} : null;
const GENESIS_RULES = path.resolve(__dirname, 'blockchain/genesis_rules.json');
const ADDITIONAL_RULES = process.env.ADDITIONAL_RULES ? {
  dbPath: process.env.ADDITIONAL_RULES.split(':')[0],
  filePath: path.resolve(__dirname, process.env.ADDITIONAL_RULES.split(':')[1])
} : null;
const GENESIS_FUNCTIONS = path.resolve(__dirname, 'blockchain/genesis_functions.json');
const ADDITIONAL_FUNCTIONS = process.env.ADDITIONAL_FUNCTIONS ? {
  dbPath: process.env.ADDITIONAL_FUNCTIONS.split(':')[0],
  filePath: path.resolve(__dirname, process.env.ADDITIONAL_FUNCTIONS.split(':')[1])
} : null;
const {ConsensusConsts} = require('./consensus/constants');
const BLOCKCHAINS_DIR = path.resolve(__dirname, 'blockchain/blockchains');
const PROTOCOL_VERSIONS = path.resolve(__dirname, 'client/protocol_versions.json');
const STAKE = process.env.STAKE ? Number(process.env.STAKE) : null;
const DEBUG = process.env.DEBUG ? process.env.DEBUG.toLowerCase().startsWith('t') : false;
const MAX_TX_BYTES = 10000;
const TRANSACTION_POOL_TIME_OUT_MS = moment.duration(1, 'hours').as('milliseconds');
const TRANSACTION_TRACKER_TIME_OUT_MS = moment.duration(24, 'hours').as('milliseconds');
// TODO (lia): Check network id in all messages
const NETWORK_ID = process.env.NETWORK_ID || 'Testnet';
// HOSTING_ENV is a variable used in extracting the ip address of the host machine,
// of which value could be either 'local', 'default', or 'gcp'.
const HOSTING_ENV = process.env.HOSTING_ENV || 'default';
const ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || null;
const TRACKER_WS_ADDR = process.env.TRACKER_WS_ADDR || 'ws://localhost:5000';
const PORT = getPortNumber(8080, 8081);
const P2P_PORT = getPortNumber(5000, 5001);

function getPortNumber(defaultValue, baseValue) {
  if (HOSTING_ENV == 'local') {
    return baseValue + (ACCOUNT_INDEX !== null ? Number(ACCOUNT_INDEX) : 0);
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
  CONSENSUS: 'consensus'
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
  DEPOSIT: '/deposit',
  DEPOSIT_ACCOUNTS: '/deposit_accounts',
  DEPOSIT_CONFIG: 'config',
  DEPOSIT_CREATED_AT: 'created_at',
  DEPOSIT_EXPIRE_AT: 'expire_at',
  DEPOSIT_LOCKUP_DURATION: 'lockup_duration',
  DEPOSIT_RESULT: 'result',
  DEPOSIT_VALUE: 'value',
  WITHDRAW: '/withdraw',
  WITHDRAW_CREATED_AT: 'created_at',
  WITHDRAW_RESULT: 'result',
  WITHDRAW_VALUE: 'value',
  DEPOSIT_ACCOUNTS_CONSENSUS: '/deposit_accounts/consensus',
  DEPOSIT_CONSENSUS: '/deposit/consensus',
  WITHDRAW_CONSENSUS: '/withdraw/consensus'
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
 * IDs of native functions
 * @enum {string}
 */
const NativeFunctionIds = {
  DEPOSIT: '_deposit',
  TRANSFER: '_transfer',
  WITHDRAW: '_withdraw',
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
};

/**
 * Default values
 */
const DefaultValues = {
  DEPOSIT_LOCKUP_DURATION_MS: 2592000000 // 30 days
}

const GenesisToken = fs.existsSync(GENESIS_TOKEN) ?
    JSON.parse(fs.readFileSync(GENESIS_TOKEN)) : null;
const GenesisAccounts = fs.existsSync(GENESIS_ACCOUNTS) ?
    JSON.parse(fs.readFileSync(GENESIS_ACCOUNTS)) : null;

const GenesisWhitelist = {};
for (let i = 0; i < ConsensusConsts.INITIAL_NUM_VALIDATORS; i++) {
  GenesisWhitelist[GenesisAccounts.others[i].address] = ConsensusConsts.INITIAL_STAKE;
}

module.exports = {
  GENESIS_OWNERS,
  ADDITIONAL_OWNERS,
  GENESIS_RULES,
  ADDITIONAL_RULES,
  GENESIS_FUNCTIONS,
  ADDITIONAL_FUNCTIONS,
  BLOCKCHAINS_DIR,
  PROTOCOL_VERSIONS,
  STAKE,
  DEBUG,
  MAX_TX_BYTES,
  TRANSACTION_POOL_TIME_OUT_MS,
  TRANSACTION_TRACKER_TIME_OUT_MS,
  NETWORK_ID,
  HOSTING_ENV,
  ACCOUNT_INDEX,
  PORT,
  P2P_PORT,
  TRACKER_WS_ADDR,
  MessageTypes,
  PredefinedDbPaths,
  OwnerProperties,
  RuleProperties,
  FunctionProperties,
  FunctionTypes,
  FunctionResultCode,
  NativeFunctionIds,
  ReadDbOperations,
  WriteDbOperations,
  TransactionStatus,
  DefaultValues,
  GenesisToken,
  GenesisAccounts,
  GenesisWhitelist
};
