const ConsensusConsts = {
  MAJORITY: 2 / 3,
  HEALTH_THRESHOLD_EPOCH: 10,
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
