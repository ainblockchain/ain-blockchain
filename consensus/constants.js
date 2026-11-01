const ConsensusConsts = {
  MAJORITY: 2 / 3,
  // Clock-skew tolerance for voting on a block whose epoch is ahead of the local epoch
  // (enforced only under the 'reward_by_elapsed_epochs' timer flag).
  MAX_FUTURE_EPOCHS_TO_VOTE: 2,
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
