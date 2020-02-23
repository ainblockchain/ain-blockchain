const fs = require('fs');
const path = require('path');
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
const BLOCKCHAINS_DIR = path.resolve(__dirname, 'blockchain/blockchains');
const PROTOCOL_VERSIONS = path.resolve(__dirname, 'client/protocol_versions.json');
const STAKE = process.env.STAKE ? Number(process.env.STAKE) : null;
const DEBUG = process.env.DEBUG ? process.env.DEBUG.toLowerCase().startsWith('t') : false;
const MAX_TX_BYTES = 10000;
const NETWORK_ID = process.env.NETWORK_ID || 'Testnet'; // TODO (lia): Check network id in all messages

/**
 * Message types for communication between nodes
 * @enum {string}
 */
const MessageTypes = {
  TRANSACTION: 'transaction',
  CHAIN_SUBSECTION: 'chain_subsection',
  CHAIN_SUBSECTION_REQUEST: 'chain_subsection_request',
  VOTING: 'voting',
};

/**
 * Voting types which can trigger
 * @enum {string}
 */
const VotingActionTypes = {
  NEW_VOTING: 'new_voting',
  PROPOSED_BLOCK: 'proposed_block',
  PRE_VOTE: 'pre_vote',
  PRE_COMMIT: 'pre_commit',
};

/**
 * Vote states that nodes can be in when reaching consensus on blocks
 * @enum {string}
 */
const VotingStatus = {
  WAIT_FOR_BLOCK: 'wait_for_block',
  BLOCK_RECEIVED: 'block_received',
  PRE_VOTE: 'pre_vote',
  PRE_COMMIT: 'pre_commit',
  COMMITTED: 'committed',
  SYNCING: 'syncing',
  START_UP: 'start_up',
};

/**
 * Predefined database paths
 * @enum {string}
 */
const PredefinedDbPaths = {
  // Roots
  OWNERS_ROOT: 'owners',
  RULES_ROOT: 'rules',
  FUNCTIONS_ROOT: 'functions',
  VALUES_ROOT: 'values',
  // Consensus
  RECENT_PROPOSERS: '/consensus/recent_proposers',
  VOTING_ROUND: '/consensus/voting',
  VOTING_ROUND_VALIDATORS: '/consensus/voting/validators',
  VOTING_ROUND_PROPOSER: '/consensus/voting/proposer',
  VOTING_ROUND_PRE_COMMITS: '/consensus/voting/pre_commits',
  VOTING_ROUND_PRE_VOTES: '/consensus/voting/pre_votes',
  VOTING_ROUND_THRESHOLD: '/consensus/voting/threshold',
  VOTING_ROUND_NUMBER: '/consensus/voting/number',
  STAKEHOLDER: '/consensus/stakes',
  VOTING_ROUND_BLOCK_HASH: '/consensus/voting/block_hash',
  VOTING_NEXT_ROUND_VALIDATORS: '/consensus/voting/next_round_validators',
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
  FUNCTION: '.function',
};

/**
 * Types of read database operations
 * @enum {string}
 */
const ReadDbOperations = {
  GET_VALUE: 'GET_VALUE',
  GET_RULE: 'GET_RULE',
  GET_FUNCTION: 'GET_FUNCTION',
  GET_OWNER: 'GET_OWNER',
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
  SET_RULE: 'SET_RULE',
  SET_FUNCTION: 'SET_FUNCTION',
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

module.exports = {
  GENESIS_OWNERS,
  ADDITIONAL_OWNERS,
  GENESIS_RULES,
  ADDITIONAL_RULES,
  BLOCKCHAINS_DIR,
  PROTOCOL_VERSIONS,
  STAKE,
  DEBUG,
  MAX_TX_BYTES,
  NETWORK_ID,
  MessageTypes,
  VotingStatus,
  VotingActionTypes,
  PredefinedDbPaths,
  OwnerProperties,
  RuleProperties,
  FunctionProperties,
  ReadDbOperations,
  WriteDbOperations,
  FunctionResultCode,
  TransactionStatus,
  DefaultValues,
  GenesisToken,
  GenesisAccounts
};
