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

module.exports = {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStatus,
}
