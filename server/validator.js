class Validator {
  constructor(address, stake, expiration) {
    this.address = addres;
    this.votingPower = stake;
    this.expiration = expiration;
    this.priority = stake;
  }

  setStake(stake, expiration) {
    this.votingPower = stake;
    this.expiration = expiration;
  }

  setPriority(priority) {
    this.priority = priority;
  }
}

module.exports = Validator;