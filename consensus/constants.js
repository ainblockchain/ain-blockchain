const ConsensusConsts = {
  DAY_MS: 86400000,
  PROPOSAL_TIMEOUT_MS: 10000,
  TRANSITION_TIMEOUT_MS: 5000,
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

class Ref {
  base() {
    return '/consensus/number';
  }

  baseForNumber(number) {
    return `${this.base()}/${number}`;
  }

  propose(number) {
    return `${this.baseForNumber(number)}/propose/`;
  }

  proposer(number) {
    return `${this.propose(number)}/proposer`;
  }

  validators(number) {
    return `${this.propose(number)}/validators`;
  }
  
  totalAtStake(number) {
    return `${this.propose(number)}/total_at_stake`;
  }

  register(number) {
    return `${this.baseForNumber(number)}/register`;
  }
}

module.exports = {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStatus,
  ConsensusRef: new Ref(),
}