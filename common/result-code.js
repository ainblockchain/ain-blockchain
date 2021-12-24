/**
 * Transaction result code.
 *
 * @enum {number}
 */
const TxResultCode = {
  // Common code
  SUCCESS: 0,
  // SET_VALUE
  SET_VALUE_INVALID_VALUE_STATES: 10101,
  SET_VALUE_INVALID_VALUE_PATH: 10102,
  SET_VALUE_NO_WRITABLE_PATH_WITH_SHARD_CONFIG: 10103,
  SET_VALUE_TRIGGERED_FUNCTION_CALL_FAILED: 10104,
  SET_VALUE_TRIGGERED_SUBTREE_FUNCTION_CALL_FAILED: 10105,
  // INC_VALUE
  INC_VALUE_NOT_A_NUMBER_TYPE: 10201,
  // DEC_VALUE
  DEC_VALUE_NOT_A_NUMBER_TYPE: 10301,
  // SET_FUNCTION
  SET_FUNCTION_INVALID_FUNCTION_STATES: 10401,
  SET_FUNCTION_INVALID_FUNCTION_PATH: 10402,
  SET_FUNCTION_INVALID_FUNCTION_TREE: 10403,
  SET_FUNCTION_OWNER_ONLY_FUNCTION: 10404,
  // SET_RULE
  SET_RULE_INVALID_RULE_STATES: 10501,
  SET_RULE_INVALID_RULE_PATH: 10502,
  SET_RULE_INVALID_RULE_TREE: 10503,
  // SET_OWNER
  SET_OWNER_INVALID_OWNER_STATES: 10601,
  SET_OWNER_INVALID_OWNER_PATH: 10602,
  SET_OWNER_INVALID_OWNER_TREE: 10603,
  // Transaction
  TX_ALREADY_RECEIVED: 10701,
  TX_INVALID: 10702,
  TX_INVALID_SIGNATURE: 10703,
  TX_POOL_NOT_ENOUGH_ROOM: 10704,
  TX_POOL_NOT_ENOUGH_ROOM_FOR_ACCOUNT: 10705,
  TX_NO_TX_BODY: 10706,
  TX_NOT_EXECUTABLE: 10707,
  TX_INVALID_OPERATION: 10708,
  TX_INVALID_OPERATION_TYPE: 10709,
  TX_NON_NUMERIC_NONCE: 10710,
  TX_NON_NUMERIC_TIMESTAMP: 10711,
  TX_INVALID_NONCE_FOR_ACCOUNT: 10712,
  TX_INVALID_TIMESTAMP_FOR_ACCOUNT: 10713,
  // Billing
  BILLING_INVALID_PARAM: 10801,
  BILLING_NO_ACCOUNT_PERMISSION: 10802,
  BILLING_MULTI_APP_DEPENDENCY: 10803,
  BILLING_INVALID_BILLING_ACCOUNT: 10804,
  BILLING_BALANCE_TOO_LOW: 10805,
  BILLING_APP_STAKE_TOO_LOW: 10806,
  // Gas
  GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_ALL_SERVICES: 10901,
  GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_ALL_APPS: 10902,
  GAS_EXCEED_STATE_TREE_SIZE_LIMIT_FOR_ALL_SERVICES: 10903,
  GAS_EXCEED_STATE_TREE_SIZE_LIMIT_FOR_ALL_APPS: 10904,
  GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_FREE_TIER: 10905,
  GAS_EXCEED_STATE_TREE_SIZE_LIMIT_FOR_FREE_TIER: 10906,
  GAS_EXCEED_STATE_BUDGET_LIMIT_FOR_APP: 10907,
  GAS_EXCEED_STATE_TREE_SIZE_LIMIT_FOR_APP: 10908,
  // Fee
  FEE_BALANCE_TOO_LOW: 11001,
  FEE_FAILED_TO_COLLECT_GAS_FEE: 11002,
  // Tree
  TREE_OUT_OF_TREE_HEIGHT_LIMIT: 11101,
  TREE_OUT_OF_TREE_SIZE_LIMIT: 11102,
  // Eval rule
  EVAL_RULE_NON_EMPTY_SUBTREE_RULES: 12101,
  EVAL_RULE_INTERNAL_ERROR: 12102,
  EVAL_RULE_FALSE_WRITE_RULE_EVAL: 12103,
  EVAL_RULE_FALSE_STATE_RULE_EVAL: 12104,
  // Eval owner
  EVAL_OWNER_INVALID_PERMISSION: 12201,
  // Eval owner - for rule
  EVAL_OWNER_NON_EMPTY_SUBTREE_OWNERS_FOR_RULE: 12301,
  EVAL_OWNER_FALSE_PERMISSION_CHECK_FOR_RULE: 12302,
  // Eval owner - for function
  EVAL_OWNER_NON_EMPTY_SUBTREE_OWNERS_FOR_FUNCTION: 12401,
  EVAL_OWNER_FALSE_PERMISSION_CHECK_FOR_FUNCTION: 12402,
  // Eval owner - for owner
  EVAL_OWNER_NON_EMPTY_SUBTREE_OWNERS_FOR_OWNER: 12501,
  EVAL_OWNER_FALSE_PERMISSION_CHECK_FOR_OWNER: 12502,
  // DB
  DB_FAILED_TO_BACKUP_DB: 16001,
  // Blockchain node
  BLOCKCHAIN_NODE_NOT_SERVING: 18001,
};

/**
 * Set of failed tx precheck code.
 * The transactions don't pass the precheck with the code in this set are not charged nor
 * included in blocks.
 */
const FailedTxPrecheckCodeSet = new Set([
  TxResultCode.TX_NOT_EXECUTABLE,
  TxResultCode.TX_NO_TX_BODY,
  TxResultCode.TX_NON_NUMERIC_NONCE,
  TxResultCode.TX_NON_NUMERIC_TIMESTAMP,
  TxResultCode.TX_INVALID_NONCE_FOR_ACCOUNT,
  TxResultCode.TX_INVALID_TIMESTAMP_FOR_ACCOUNT,
  TxResultCode.DB_FAILED_TO_BACKUP_DB,
  TxResultCode.BILLING_INVALID_PARAM,
  TxResultCode.BILLING_NO_ACCOUNT_PERMISSION,
  TxResultCode.BILLING_MULTI_APP_DEPENDENCY,
  TxResultCode.BILLING_INVALID_BILLING_ACCOUNT,
  TxResultCode.BILLING_BALANCE_TOO_LOW,
  TxResultCode.BILLING_APP_STAKE_TOO_LOW,
]);

/**
 * Function result code.
 *
 * @enum {number}
 */
const FunctionResultCode = {
  SUCCESS: 0,
  FAILURE: 20001,  // Normal failure
  INTERNAL_ERROR: 20002,  // Something went wrong but don't know why
  // Transfer
  INSUFFICIENT_BALANCE: 20101,
  // Staking
  IN_LOCKUP_PERIOD: 20201,
  // Create app
  INVALID_SERVICE_NAME: 20301,
  // Check-in & Check-out
  INVALID_ACCOUNT_NAME: 20401,
  INVALID_CHECKOUT_AMOUNT: 20402,
  INVALID_RECIPIENT: 20403,
  INVALID_TOKEN_BRIDGE_CONFIG: 20404,
  INVALID_SENDER: 20405,
  UNPROCESSED_REQUEST_EXISTS: 20406,
  INVALID_CHECKIN_AMOUNT: 20407,
  INVALID_SENDER_PROOF: 20408,
  // Claim reward
  INVALID_AMOUNT: 20501,
};

/**
 * JSON RPC API result code.
 *
 * @enum {number}
 */
const JsonRpcApiResultCode = {
  // Common code
  SUCCESS: 0,
  // ain_checkProtocolVersion
  PROTO_VERSION_NOT_SPECIFIED: 30101,
  PROTO_VERSION_INVALID: 30102,
  PROTO_VERSION_INCOMPATIBLE: 30103,
  // ain_get
  GET_INVALID_OPERATION: 30201,
  // ain_sendSignedTransaction
  TX_EXCEEDS_SIZE_LIMIT: 30301,
  TX_MISSING_PROPERTIES: 30302,
  TX_INVALID_FORMAT: 30303,
  // ain_sendSignedTransactionBatch
  BATCH_INVALID_FORMAT: 30401,
  BATCH_TX_LIST_EXCEEDS_SIZE_LIMIT: 30402,
  BATCH_TX_EXCEEDS_SIZE_LIMIT: 30403,
  BATCH_TX_MISSING_PROPERTIES: 30404,
  BATCH_TX_INVALID_FORMAT: 30405,
  // ain_addToDevClientApiIpWhitelist
  INVALID_IP: 30501,
  IP_ALREADY_IN_WHITELIST: 30502,
  // ain_removeFromDevClientApiIpWhitelist
  IP_NOT_IN_WHITELIST: 30601,
};

/**
 * Dev Client API result code.
 *
 * @enum {number}
 */
const DevClientApiResultCode = {
  // Common code
  SUCCESS: 0,
  FAILURE: 40001,
  PROTO_VERSION_NOT_SPECIFIED: 40101,
  INVALID_PROTO_VERSION: 40102,
  INCOMPATIBLE_PROTO_VERSION: 40103,
};

/**
 * Consensus error code.
 *
 * @enum {number}
 */
const ConsensusErrorCode = {
  PARSING_PROPOSAL_BLOCK_FAILURE: 90001,
  NOT_EXTENDING_LNC_ERROR: 90002,
  TEMP_DB_CREATION_FAILURE: 90003,
  INVALID_CONSENSUS_TX: 90100,
  PROPOSER_MISMATCH: 90103,
  BLOCK_HASH_MISMATCH: 90104,
  MISSING_PREV_BLOCK: 90200,
  MISSING_DB_FOR_PREV_BLOCK: 90201,
  ILL_FORMED_BLOCK: 90300,
  INVALID_GENESIS_BLOCK: 90301,
  INVALID_CHAIN: 90302,
  INVALID_EPOCH: 90303,
  INVALID_VALIDATORS_SIZE: 90304,
  INVALID_PROPOSER: 90305,
  EXECUTING_LAST_VOTES_FAILURE: 90306,
  INVALID_LAST_VOTES_STAKES: 90307,
  MISSING_PROPOSAL_IN_LAST_VOTES: 90308,
  OFFENSES_EVIDENCE_MISMATCH: 90309,
  INVALID_OFFENSE_TYPE: 90310,
  INVALID_EVIDENCE_VOTES_STAKES: 90311,
  EXECUTING_EVIDENCE_VOTES_FAILURE: 90312,
  INVALID_OFFENSE_COUNTS: 90313,
  EXECUTING_TX_FAILURE: 90314,
  INVALID_RECEIPTS: 90315,
  INVALID_GAS_AMOUNT_TOTAL: 90316,
  INVALID_GAS_COST_TOTAL: 90317,
  INVALID_STATE_PROOF_HASH: 90318,
  ILL_FORMED_PROPOSAL_TX: 90319,
  EXECUTING_PROPOSAL_FAILURE: 90320,
  ADDING_TO_BLOCK_POOL_FAILURE: 90400,
}

/**
 * Set of consensus error code that a validator node should vote against.
 */
const ConsensusErrorCodeSetToVoteAgainst = new Set([
  ConsensusErrorCode.ADDING_TO_BLOCK_POOL_FAILURE,
  ConsensusErrorCode.INVALID_EPOCH,
  ConsensusErrorCode.MISSING_PROPOSAL_IN_LAST_VOTES,
  ConsensusErrorCode.EXECUTING_LAST_VOTES_FAILURE,
  ConsensusErrorCode.INVALID_LAST_VOTES_STAKES,
  ConsensusErrorCode.INVALID_PROPOSER,
  ConsensusErrorCode.BLOCK_HASH_MISMATCH,
  ConsensusErrorCode.INVALID_VALIDATORS_SIZE,
  ConsensusErrorCode.ILL_FORMED_BLOCK,
  ConsensusErrorCode.OFFENSES_EVIDENCE_MISMATCH,
  ConsensusErrorCode.INVALID_OFFENSE_TYPE,
  ConsensusErrorCode.INVALID_EVIDENCE_VOTES_STAKES,
  ConsensusErrorCode.EXECUTING_EVIDENCE_VOTES_FAILURE,
  ConsensusErrorCode.INVALID_OFFENSE_COUNTS,
  ConsensusErrorCode.EXECUTING_TX_FAILURE,
  ConsensusErrorCode.INVALID_RECEIPTS,
  ConsensusErrorCode.INVALID_GAS_AMOUNT_TOTAL,
  ConsensusErrorCode.INVALID_GAS_COST_TOTAL,
  ConsensusErrorCode.INVALID_CONSENSUS_TX,
  ConsensusErrorCode.ILL_FORMED_PROPOSAL_TX,
  ConsensusErrorCode.EXECUTING_PROPOSAL_FAILURE,
  ConsensusErrorCode.INVALID_STATE_PROOF_HASH,
]);

module.exports = {
  DevClientApiResultCode,
  JsonRpcApiResultCode,
  TxResultCode,
  FailedTxPrecheckCodeSet,
  FunctionResultCode,
  ConsensusErrorCode,
  ConsensusErrorCodeSetToVoteAgainst,
};
