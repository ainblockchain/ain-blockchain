const Validator = require('./validator');

class ValidatorSet {
  constructor() {
    this.validators = {};
    this.totalVotingPower = 0;
    this.newValidators = {};
  }

  get validatorList() {
    return Object.keys(this.validators);
  }

  getProposer(seed) {

  }

  update(newValidatorSnap) {
    let newValidators = {};
    if (!!newValidatorSnap) {
      for (let address in newValidatorSnap) {
        const val = newValidatorSnap[address];
        if (val.expire_at > Date.now() && val.value > 0) {
          if (this.validators[address] &&
              val.value === this.validators[address].votingPower) {
            newValidators[address] = this.validators[address];
          } else {
            newValidators[address] = new Validator(address, val.value, val.expire_at);
          }
        }
      }
    }
    this.validators = newValidators;
    this.setTotalVotingPower();
  }

  setTotalVotingPower() {
    let sum = 0;
    for (let address in this.validators) {
      if (this.validators[address].expiration > Date.now()) {
        sum += validator.votingPower;
      }
    }
    this.totalVotingPower = sum;
  }

  decreaseProposerPriority(lastProposer) {
    if (!this.validators[lastProposer]) {
      throw Error('Last proposer is not in the validator set');
    }
    this.validators[lastProposer].priority -= this.totalVotingPower;
  }

  increaseAllPriorities() {
    for (let address in this.validators) {
      this.validators[address].priority += this.validators[address].votingPower;
    }
  }

  addValidator() {

  }

  addValidatorList() {

  }

  removeValidator() {

  }

  removeValidatorList() {

  }
}

module.exports = ValidatorSet;