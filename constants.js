const path = require('path');
const RULES_FILE_PATH = path.resolve(__dirname, 'db', 'database.rules.json');
const BLOCKCHAINS_DIR = path.resolve(__dirname, 'blockchain', '.blockchains');
const STAKE = process.env.STAKE ? Number(process.env.STAKE) : null;

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
  // Consensus
  RECENT_FORGERS: '/consensus/recent_forgers',
  VOTING_ROUND: '/consensus/voting',
  VOTING_ROUND_VALIDATORS: '/consensus/voting/validators',
  VOTING_ROUND_FORGER: '/consensus/voting/forger',
  VOTING_ROUND_PRE_COMMITS: '/consensus/voting/pre_commits',
  VOTING_ROUND_PRE_VOTES: '/consensus/voting/pre_votes',
  VOTING_ROUND_THRESHOLD: '/consensus/voting/threshold',
  VOTING_ROUND_HEIGHT: '/consensus/voting/height',
  STAKEHOLDER: '/consensus/stakes',
  VOTING_ROUND_BLOCK_HASH: '/consensus/voting/block_hash',
  VOTING_NEXT_ROUND_VALIDATORS: '/consensus/voting/next_round_validators',
  // Account & Transfer
  ACCOUNT: 'account',
  BALANCE: 'balance',
  TRANSFER: 'transfer',
  TRANSFER_VALUE: 'value',
  TRANSFER_RESULT: 'result',
};

/**
 * Types of write operations supported by Db
 * @enum {string}
 */
const DbOperations = {
  INCREASE: 'INCREASE',
  SET: 'SET',
  UPDATES: 'UPDATES',
  SET_VALUE: 'SET_VALUE',
  INC_VALUE: 'INC_VALUE',
  DEC_VALUE: 'DEC_VALUE',
  BATCH: 'BATCH',
  UPDATE: 'UPDATE',
  GET: 'GET',
};

/**
 * Types of updates
 * @enum {string}
 */
const UpdateTypes = {
  SET_VALUE: 'SET_VALUE',
  INC_VALUE: 'INC_VALUE',
  DEC_VALUE: 'DEC_VALUE',
};

/**
 * Function result code
 * @enum {string}
 */
const FunctionResultCode = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
};

module.exports = {
  RULES_FILE_PATH,
  BLOCKCHAINS_DIR,
  MessageTypes,
  VotingStatus,
  STAKE,
  VotingActionTypes,
  PredefinedDbPaths,
  DbOperations,
  UpdateTypes,
  FunctionResultCode,
};
