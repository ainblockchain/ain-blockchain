const ConsensusConsts = {
  MAJORITY: 2 / 3,
  DAY_MS: 86400000,
  MAX_CONSENSUS_LOGS_IN_STATES: 1000,
  MAX_FINALIZED_BLOCK_INFO_ON_MEM: 10000,
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

module.exports = {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStates,
  ValidatorOffenseTypes,
}
