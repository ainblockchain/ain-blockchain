const ConsensusConsts = {
  MAJORITY: 2 / 3,
  DAY_MS: 86400000,
  EPOCH_MS: 3000,
  MAX_CONSENSUS_STATE_DB: 1000,
  HEALTH_THRESHOLD_EPOCH: 600
}

const ConsensusMessageTypes = {
  PROPOSE: 'propose',
  VOTE: 'vote'
};

const ConsensusStatus = {
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
}

const ConsensusDbPaths = {
  CONSENSUS: 'consensus',
  WHITELIST: 'whitelist',
  NUMBER: 'number',
  PROPOSE: 'propose',
  PROPOSER: 'proposer',
  VALIDATORS: 'validators',
  TOTAL_AT_STAKE: 'total_at_stake',
  VOTE: 'vote',
  BLOCK_HASH: 'block_hash',
  STAKE: 'stake'
}

module.exports = {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStatus,
  ConsensusDbPaths
}
