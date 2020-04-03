const ConsensusConsts = {
  DAY_MS: 86400000,
  PROPOSAL_TIMEOUT_MS: 10000,
  TRANSITION_TIMEOUT_MS: 100,
  MAX_CONSENSUS_STATE_DB: 10
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

  blockHash(number) {
    return `${this.baseForNumber(number)}/block_hash`;
  }

  validators(number) {
    return `${this.baseForNumber(number)}/validators`;
  }

  nextRoundValidators(number) {
    return `${this.baseForNumber(number)}/next_round_validators`;
  }

  proposer(number) {
    return `${this.baseForNumber(number)}/proposer`;
  }
  
  totalAtStake(number) {
    return `${this.baseForNumber(number)}/total_at_stake`;
  }
}

module.exports = {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStatus,
  ConsensusRef: new Ref(),
}