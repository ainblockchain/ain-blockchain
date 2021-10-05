const ConsensusConsts = {
  MAJORITY: 2 / 3,
  DAY_MS: 86400000,
  MAX_CONSENSUS_LOGS_IN_STATES: 1000,
  HEALTH_THRESHOLD_EPOCH: 600,
  STAKE_LOCKUP_EXTENSION: 2592000000, // 30 days as ms
};

const ConsensusMessageTypes = {
  PROPOSE: 'propose',
  VOTE: 'vote',
};

const ConsensusStates = {
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
};

const ValidatorOffenseTypes = {
  INVALID_PROPOSAL: 'INVALID_PROPOSAL',
}

const ConsensusErrorCode = {
  PARSING_PROPOSAL_BLOCK_FAILURE: 1,
  ADDING_TO_BLOCK_POOL_FAILURE: 2,
  NOT_EXTENDING_LNC_ERROR: 3,
  TEMP_DB_CREATION_FAILURE: 4,
  RECEIVED_PROPOSAL: 100,
  OUTDATED_BLOCK: 101,
  PROPOSER_MISMATCH: 102,
  BLOCK_HASH_MISMATCH: 103,
  INVALID_VALIDATORS_SIZE: 104,
  ILL_FORMED_BLOCK: 105,
  INVALID_PREV_BLOCK: 200,
  MISSING_DB_FOR_PREV_BLOCK: 201,
  INVALID_EPOCH: 202,
  MISSING_PROPOSAL_IN_LAST_VOTES: 203,
  MISSING_PROPOSAL_IN_BLOCK_POOL: 204,
  INVALID_PROPOSER: 300,
  EXECUTING_LAST_VOTES_FAILURE: 301,
  INVALID_LAST_VOTES_STAKES: 302,
  OFFENSES_EVIDENCE_MISMATCH: 400,
  INVALID_OFFENSE_TYPE: 401,
  INVALID_EVIDENCE_VOTES_STAKES: 402,
  EXECUTING_EVIDENCE_VOTES_FAILURE: 403,
  INVALID_OFFENSE_COUNTS: 404,
  EXECUTING_TX_FAILURE: 500,
  INVALID_RECEIPTS: 501,
  INVALID_GAS_AMOUNT_TOTAL: 502,
  INVALID_GAS_COST_TOTAL: 503,
  ILL_FORMED_PROPOSAL_TX: 600,
  EXECUTING_PROPOSAL_FAILURE: 601,
  INVALID_STATE_PROOF_HASH: 602,
}

const ConsensusErrorCodesToVoteAgainst = new Set([
  ConsensusErrorCode.ADDING_TO_BLOCK_POOL_FAILURE,
  ConsensusErrorCode.MISSING_DB_FOR_PREV_BLOCK,
  ConsensusErrorCode.INVALID_EPOCH,
  ConsensusErrorCode.MISSING_PROPOSAL_IN_LAST_VOTES,
  ConsensusErrorCode.EXECUTING_LAST_VOTES_FAILURE,
  ConsensusErrorCode.INVALID_LAST_VOTES_STAKES,
  ConsensusErrorCode.INVALID_PROPOSER,
  ConsensusErrorCode.BLOCK_HASH_MISMATCH,
  ConsensusErrorCode.INVALID_VALIDATORS_SIZE,
  ConsensusErrorCode.ILL_FORMED_BLOCK,
  ConsensusErrorCode.INVALID_PREV_BLOCK,
  ConsensusErrorCode.INVALID_PROPOSER,
  ConsensusErrorCode.OFFENSES_EVIDENCE_MISMATCH,
  ConsensusErrorCode.INVALID_OFFENSE_TYPE,
  ConsensusErrorCode.INVALID_EVIDENCE_VOTES_STAKES,
  ConsensusErrorCode.EXECUTING_EVIDENCE_VOTES_FAILURE,
  ConsensusErrorCode.INVALID_OFFENSE_COUNTS,
  ConsensusErrorCode.EXECUTING_TX_FAILURE,
  ConsensusErrorCode.INVALID_RECEIPTS,
  ConsensusErrorCode.INVALID_GAS_AMOUNT_TOTAL,
  ConsensusErrorCode.INVALID_GAS_COST_TOTAL,
  ConsensusErrorCode.ILL_FORMED_PROPOSAL_TX,
  ConsensusErrorCode.EXECUTING_PROPOSAL_FAILURE,
  ConsensusErrorCode.INVALID_STATE_PROOF_HASH,
]);

module.exports = {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStates,
  ValidatorOffenseTypes,
  ConsensusErrorCode,
  ConsensusErrorCodesToVoteAgainst,
}
