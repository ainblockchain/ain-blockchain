const path = require('path');
const RULES_FILE_PATH = path.resolve(__dirname, 'db', 'database.rules.json');
const BLOCKCHAINS_DIR = path.resolve(__dirname, 'blockchain', '.blockchains');
// TODO (lia): remove this after changing the way genesis block is produced
// (first node creates it and broadcasts to others)
const GENESIS_INFO = path.resolve(__dirname, 'blockchain', 'genesis_info.json');
const STAKE = process.env.STAKE ? Number(process.env.STAKE) : null;
const DEBUG = process.env.DEBUG ? process.env.DEBUG.toLowerCase().startsWith('t') : false;

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
  // Account & Transfer
  ACCOUNT: 'account',
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
};

/**
 * Properties of rules
 * @enum {string}
 */
const RuleProperties = {
  WRITE: '.write',
};

/**
 * Types of read database operations
 * @enum {string}
 */
const ReadDbOperations = {
  GET_VALUE: 'GET_VALUE',
  GET_RULE: 'GET_RULE',
  GET_OWNER: 'GET_OWNER',
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

module.exports = {
  RULES_FILE_PATH,
  BLOCKCHAINS_DIR,
  GENESIS_INFO,
  STAKE,
  DEBUG,
  MessageTypes,
  VotingStatus,
  VotingActionTypes,
  PredefinedDbPaths,
  RuleProperties,
  ReadDbOperations,
  WriteDbOperations,
  FunctionResultCode,
  TransactionStatus,
  DefaultValues,
};
