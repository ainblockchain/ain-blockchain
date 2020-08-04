const ConsensusConsts = {
  MAJORITY: 2 / 3,
  DAY_MS: 86400000,
  EPOCH_MS: 1000,
  MAX_CONSENSUS_STATE_DB: 1000,
  INITIAL_NUM_VALIDATORS: process.env.NUM_VALIDATORS ? Number(process.env.NUM_VALIDATORS) : 5,
  INITIAL_STAKE: 250,
  HEALTH_THRESHOLD_EPOCH: 600 // 600 epochs = 10 minutes
}

const ConsensusMessageTypes = {
  PROPOSE: 'propose',
  VOTE: 'vote'
};

const ConsensusStatus = {
  STARTING: 0,
  RUNNING: 1,
  STOPPED: 2
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