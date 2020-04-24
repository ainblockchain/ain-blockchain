const ConsensusConsts = {
  DAY_MS: 86400000,
  PROPOSAL_TIMEOUT_MS: 10000,
  TRANSITION_TIMEOUT_MS: 7000,
  MAX_CONSENSUS_STATE_DB: 1000 // TODO(lia): decrease to 10 and update rule-util for /consensus/number/{number}/propose
}

const ConsensusMessageTypes = {
  PROPOSE: 'propose',
};

const ConsensusStatus = {
  STARTING: 0,
  INITIALIZED: 1,
  RUNNING: 2,
  STOPPED: 3
}

const ConsensusDbPaths = {
  CONSENSUS: 'consensus',
  NUMBER: 'number',
  PROPOSE: 'propose',
  PROPOSER: 'proposer',
  VALIDATORS: 'validators',
  TOTAL_AT_STAKE: 'total_at_stake',
  REGISTER: 'register',
  BLOCK_HASH: 'block_hash',
  STAKE: 'stake'
}

module.exports = {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStatus,
  ConsensusDbPaths
}