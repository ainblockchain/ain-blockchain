
const shuffleSeed = require('shuffle-seed');
const seedrandom = require('seedrandom');
const { VotingStatus, PredefinedDbPaths, OperationTypes } = require('../constants');
const MAX_RECENT_FORGERS = 20;

class VotingUtil {
  constructor(db) {
    this.db = db;
    this.status = VotingStatus.START_UP;
    this.block = null;
    this.validatorTransactions = [];
  }

  resolveDbPath(pathSubKeys) {
    return pathSubKeys.join('/');
  }

  registerValidatingTransaction(transaction) {
    // Transactions can be null (when cascading from proposed_block) and duplicate (when cascading from pre_cote)
    if (transaction && !this.validatorTransactions.find((trans) => {
      return trans.hash === transaction.hash;
    })) {
      this.validatorTransactions.push(transaction);
    }
  }

  checkPreVotes() {
    const total = Object.values(this.db.getValue(PredefinedDbPaths.VOTING_ROUND_VALIDATORS)).reduce(function(a, b) {
      return a + b;
    }, 0);
    console.log(`Total prevotes from validators : ${total}\nReceived prevotes ${this.db.getValue(PredefinedDbPaths.VOTING_ROUND_PRE_VOTES)}`);
    return (this.db.getValue(PredefinedDbPaths.VOTING_ROUND_PRE_VOTES) > (total *.6666)) || total === 0;
  }

  addValidatorTransactionsToBlock() {
    for (let i = 0; i < this.validatorTransactions.length; i++) {
      this.block.validatorTransactions.push(this.validatorTransactions[i]);
    }
  }

  preVote() {
    const stake = this.db.getValue(this.resolveDbPath([PredefinedDbPaths.VOTING_ROUND_VALIDATORS, this.db.publicKey]));
    this.status = VotingStatus.PRE_VOTE;
    console.log(`Current prevotes are ${this.db.db.consensus.voting.pre_votes}`);
    const transaction = this.db.createTransaction({
      type: OperationTypes.INC_VALUE,
      ref: PredefinedDbPaths.VOTING_ROUND_PRE_VOTES,
      value: stake
    });
    this.registerValidatingTransaction(transaction);
    return transaction;
  }

  isCommit() {
    console.log(`Checking status ${this.status}`);
    return this.status !== VotingStatus.COMMITTED && this.checkPreCommits();
  }

  reset() {
    this.status = VotingStatus.COMMITTED;
    this.block = null;
    this.validatorTransactions.length = [];
  }

  isSyncedWithNetwork(bc) {
    // This does not currently take in to a count the situation where consensus is not reached.
    // Need to add logic to account for this situation
    const sync = (VotingStatus.COMMITTED === this.status && bc.height() + 1 === Number(this.db.getValue(PredefinedDbPaths.VOTING_ROUND_HEIGHT)));
    if (!sync) {
      this.status = VotingStatus.SYNCING;
    }
    return sync;
  }


  preCommit() {
    if (this.status !== VotingStatus.PRE_VOTE) {
      return null;
    }
    const stake = this.db.getValue(this.resolveDbPath([PredefinedDbPaths.VOTING_ROUND_VALIDATORS, this.db.publicKey]));
    console.log(`Current precommits are ${this.db.db.consensus.voting.pre_commits}`);
    this.status = VotingStatus.PRE_COMMIT;
    const transaction = this.db.createTransaction({
      type: OperationTypes.INC_VALUE,
      ref: PredefinedDbPaths.VOTING_ROUND_PRE_COMMITS,
      value: stake
    });
    this.registerValidatingTransaction(transaction);
    return transaction;
  }

  checkPreCommits() {
    const total = Object.values(this.db.getValue(PredefinedDbPaths.VOTING_ROUND_VALIDATORS)).reduce(function(a, b) {
      return a + b;
    }, 0);
    console.log(`Total pre_commits from validators : ${total}\nReceived pre_commits ${this.db.getValue(PredefinedDbPaths.VOTING_ROUND_PRE_COMMITS)}`);
    return (this.db.getValue(PredefinedDbPaths.VOTING_ROUND_PRE_COMMITS) > (total *.6666)) || total === 0;
  }


  instantiate(bc) {
    console.log('Initialising voting !!');
    // This method should only be called by the very first node on the network !!
    // This user should establish themselves as the first node on the network, instantiate the first /consensus/voting entry t db
    // and commit this to the blockchain so it will be picked up by new peers on the network
    const time = Date.now();
    const firstVotingData = {validators: {}, next_round_validators: {}, threshold: -1, forger: this.db.publicKey, pre_votes: 0,
      pre_commits: 0, time, block_hash: '', height: bc.lastBlock().height + 1, lastHash: bc.lastBlock().hash};
    return this.db.createTransaction({
      type: OperationTypes.SET_VALUE,
      ref: PredefinedDbPaths.VOTING_ROUND,
      value: firstVotingData
    });
  }


  startNewRound(bc) {
    const lastRound = this.db.getValue(PredefinedDbPaths.VOTING_ROUND);
    const time = Date.now();
    let forger;
    if (Object.keys(lastRound.next_round_validators).length) {
      forger = this.getForger(lastRound.next_round_validators, bc);
      delete lastRound.next_round_validators[forger];
    } else {
      forger = this.db.publicKey;
    }
    const threshold = Math.round(Object.values(lastRound.next_round_validators).reduce(function(a, b) {
      return a + b;
    }, 0) * .666) - 1;
    let nextRound = {validators: lastRound.next_round_validators, next_round_validators: {}, threshold, forger: forger, pre_votes: 0, pre_commits: 0, time, block_hash: null};
    if (this.checkPreCommits()) {
      // Should be1
      nextRound = Object.assign({}, nextRound, {height: lastRound.height + 1, lastHash: lastRound.block_hash});
    } else {
      // Start same round
      nextRound = Object.assign({}, nextRound, {height: lastRound.height, lastHash: lastRound.lastHash});
    }

    return this.db.createTransaction({
      type: OperationTypes.SET_VALUE,
      ref: PredefinedDbPaths.VOTING_ROUND,
      value: nextRound
    }, false);
  }

  registerForNextRound(height) {
    const votingRound = this.db.getValue(PredefinedDbPaths.VOTING_ROUND);
    console.log(`${height + 1} is the expected height and actual info is ${votingRound.height + 1}`);
    if (height !== votingRound.height) {
      throw Error('Not valid height');
    }

    const value = this.db.getValue(this.resolveDbPath([PredefinedDbPaths.STAKEHOLDER, this.db.publicKey]));
    return this.db.createTransaction({
      type: OperationTypes.SET_VALUE,
      ref: this.resolveDbPath([PredefinedDbPaths.VOTING_NEXT_ROUND_VALIDATORS, this.db.publicKey]),
      value
    });
  }

  setBlock(block) {
    console.log(`Setting block ${block.hash.substring(0, 5)} at height ${block.height}`);
    this.block = block;
    this.status = VotingStatus.BLOCK_RECEIVED;
    this.validatorTransactions.length = 0;
  }

  getForger(stakeHolders, bc) {
    const alphabeticallyOrderedStakeHolders = Object.keys(stakeHolders).sort();
    const totalStakedAmount = Object.values(stakeHolders).reduce(function(a, b) {
      return a + b;
    }, 0);
    const seed = bc.chain.length > 5 ? bc.chain[bc.chain.length - 4].hash : bc.chain[0].hash;

    let cumulativeStakeFromPotentialValidators = 0;
    const randomNumGenerator = seedrandom(seed);
    const targetValue = randomNumGenerator() * totalStakedAmount;
    for (let i=0; i < alphabeticallyOrderedStakeHolders.length; i++) {
      cumulativeStakeFromPotentialValidators += stakeHolders[alphabeticallyOrderedStakeHolders[i]];
      if (targetValue < cumulativeStakeFromPotentialValidators) {
        console.log(`Forger is ${alphabeticallyOrderedStakeHolders[i]}`);
        return alphabeticallyOrderedStakeHolders[i];
      }
    }
    throw Error(`No forger was selected frok stakeholder dict ${stakeHolders} `);
  }

  stake(stakeAmount) {
    console.log(`Successfully staked ${stakeAmount}`);
    return this.db.createTransaction({
      type: OperationTypes.SET_VALUE,
      ref: this.resolveDbPath([PredefinedDbPaths.STAKEHOLDER, this.db.publicKey]),
      value: stakeAmount
    });
  }

  isForger() {
    this.status = VotingStatus.WAIT_FOR_BLOCK;
    return this.db.getValue(PredefinedDbPaths.VOTING_ROUND_FORGER) === this.db.publicKey;
  }

  isValidator() {
    return Boolean(this.db.getValue(this.resolveDbPath([PredefinedDbPaths.VOTING_ROUND_VALIDATORS, this.db.publicKey])));
  }

  isStaked() {
    return Boolean(this.db.getValue(this.resolveDbPath([PredefinedDbPaths.STAKEHOLDER, this.db.publicKey])));
  }

  writeSuccessfulForge() {
    let recentForgers = JSON.parse(JSON.stringify(this.db.getValue(PredefinedDbPaths.RECENT_FORGERS)));
    if (recentForgers == null) {
      recentForgers = [];
    } else if (recentForgers.length == MAX_RECENT_FORGERS) {
      recentForgers.shift();
    }

    if (recentForgers.indexOf(this.db.publicKey) >= 0) {
      recentForgers.splice(recentForgers.indexOf(this.db.publicKey), 1);
    }
    recentForgers.push(this.db.publicKey);
    return this.db.createTransaction({
      type: OperationTypes.SET_VALUE,
      ref: PredefinedDbPaths.RECENT_FORGERS,
      value: recentForgers
    });
  }
}

module.exports = VotingUtil;
