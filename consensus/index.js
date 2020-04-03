const seedrandom = require('seedrandom');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger');
const { Block } = require('../blockchain/block');
const ChainUtil = require('../chain-util');
const PushId = require('../db/push-id');
const { MessageTypes, STAKE, WriteDbOperations, PredefinedDbPaths}
  = require('../constants');
const { ConsensusMessageTypes, ConsensusConsts, ConsensusStatus, ConsensusRef }
  = require('./constants');

class Consensus {
  constructor(server, node) {
    this.server = server;
    this.node = node;
    this.status = ConsensusStatus.STARTING;
    this.timeoutId = null;
    this.timeoutInfo = null;
    this.state = {
      number: 0,
      round: 0,  // To use in creating a seed for the prng (proposer selection)
      proposer: null
    }
  }

  init() {
    let currentStake;
    this.state.number = this.node.bc.lastBlockNumber() + 1;
    this.status = ConsensusStatus.INITIALIZED;
    if (this.state.number === 1) {
      logger.debug("[Consensus:init] this.state.number = 1");
      currentStake = this.getValidConsensusDeposit(this.node.account.address);
    } else {
      logger.debug("[Consensus:init] this.state.number = " + this.state.number);
      currentStake = this.getStakeAtNumber(this.state.number, this.node.account.address);
    }
    logger.info("[Consensus:init] Current stake: " + currentStake);
    if (!currentStake) {
      if (STAKE && STAKE > 0) {
        this.stake(STAKE);
      } else {
        logger.info(`[Consensus:init] Exiting consensus initialization: Node doesn't have any stakes`);
        return;
      }
    }
    this.start();
    logger.info(`[Consensus:init] Initialized to number ${this.state.number} and round ${this.state.round}`);
  }

  start() {
    this.status = ConsensusStatus.RUNNING;
    this.updateToState();
  }

  stop() {
    this.status = ConsensusStatus.STOPPED;
    if (this.timeoutInfo) {
      clearTimeout(this.timeoutInfo);
      this.timeoutInfo = null;
    }
    // XXX: reset consensus state?
  }

  updateToState() {
    if (this.state.number > this.node.bc.lastBlockNumber() + 1) {
      logger.debug(`[Consensus:updateToState] Nothing to update`);
      return;
    }
    logger.info(`[Consensus:updateToState] Current: ${this.state.number}/${this.state.round}`);
    this.state.number = this.node.bc.lastBlockNumber() + 1;
    this.state.round = 0;
    logger.info(`[Consensus:updateToState] Updated: ${this.state.number}/${this.state.round}`);
    this.state.proposer = this.selectProposer();
    // To avoid call stack exceeded errors
    setTimeout(() => {
      this.tryToPropose();
    }, ConsensusConsts.TRANSITION_TIMEOUT_MS);
  }

  // If I haven't received a proposal for the number, move onto the next round and another proposer
  handleTimeout(timeoutInfo) {
    const { number, round } = timeoutInfo;
    if (number !== this.state.number || round < this.state.round) {
      logger.debug(`[Consensus:handleTimeout] Ignoring timeout because we're ahead (${this.state.number}/${this.state.round}) vs (${number}/${round})`);
      return;
    }
    logger.info(`[Consensus:handleTimeout] Current: ${this.state.number}/${this.state.round}/${this.state.proposer}\n`);
    this.state.round += 1;
    this.state.proposer = this.selectProposer();
    logger.info(`[Consensus:handleTimeout] Changed: ${number}/${this.state.round}/${this.state.proposer}`);
    this.tryToPropose();
  }

  // Currently the only type of consensus messages is proposal: { value: Block, type = 'PROPOSE' }
  handleConsensusMessage(msg) {
    if (this.status !== ConsensusStatus.RUNNING) {
      return;
    }
    if (msg.type !== ConsensusMessageTypes.PROPOSE) {
      logger.error(`[Consensus:handleConsensusMessage] Invalid message type: ${msg.type}`);
      return;
    }
    if (!msg.value) {
      logger.error(`[Consensus:handleConsensusMessage] Invalid message value: ${msg.value}`);
      return;
    }
    if (msg.value.number !== this.state.number) {
      logger.debug(`[Consensus:handleConsensusMessage] Invalid number: Expected: ${this.state.number}, Actual: ${msg.value.number}`);
      if (msg.value.number > this.state.number) {
        // I might be falling behind. Try to catch up
        this.server.requestChainSubsection(this.node.bc.lastBlock());
      }
      return;
    }
    logger.info(`[Consensus:handleConsensusMessage] Consensus state: ${this.state.number}/${this.state.round}, Blockchain state: ${this.node.bc.lastBlockNumber()}, Message: ${msg.value.number}`);
    if (this.checkProposal(msg.value)) {
      this.commit(msg.value);
      this.server.broadcastConsensusMessage(msg);
    }
  }

  scheduleTimeout(newTimeoutInfo, durationMs) {
    logger.debug(`[Consensus:scheduleTimeout] ${JSON.stringify(newTimeoutInfo)} / ${JSON.stringify(this.timeoutInfo)}`);
    if (this.timeoutInfo) {
      const ti = this.timeoutInfo;
      if (newTimeoutInfo.number < ti.number || (newTimeoutInfo.number === ti.number && newTimeoutInfo.round < ti.round)) {
        logger.debug(`[Consensus.scheduleTimeout] Ignoring old number/round`);
        return;
      }
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }
    }
    this.timeoutInfo = newTimeoutInfo;
    this.timeoutId = setTimeout(() => {
      this.handleTimeout(newTimeoutInfo);
    }, durationMs);
  }

  tryToPropose() {
    if (ainUtil.areSameAddresses(this.state.proposer, this.node.account.address)) {
      logger.debug(`[Consensus:tryToPropose] I'm the proposer`);
      this.handleConsensusMessage({ value: this.createProposalBlock(), type: ConsensusMessageTypes.PROPOSE });
    } else {
      logger.debug(`[Consensus:tryToPropose] Not my turn`);
    }
    this.scheduleTimeout({ number: this.state.number, round: this.state.round }, ConsensusConsts.PROPOSAL_TIMEOUT_MS);
  }

  createProposalBlock() {
    const blockNumber = this.state.number; // Should be equal to lastBlockNumber + 1
    const transactions = this.node.tp.getValidTransactions();
    const proposer = this.node.account.address;
    const validators = this.getValidatorsAtNumber(blockNumber);
    if (blockNumber === 1) {
      validators[proposer] = this.getValidConsensusDeposit(proposer);
    }
    const totalAtStake = Object.values(validators).reduce(function(a, b) { return a + b; }, 0);
    // This should be part of the proposals, but to reduce complexity, we're including it in transactions for now
    // TODO(lia): Make proposals SET_VALUE transactions and include it in last_votes of the next block
    // TODO(lia): Include block_hash in the proposal tx's value
    const consensusUpdateTx = this.node.createTransaction({
      operation: {
        type: WriteDbOperations.SET_VALUE,
        ref: ConsensusRef.baseForNumber(blockNumber % ConsensusConsts.MAX_CONSENSUS_STATE_DB),
        value: {
          number: blockNumber,
          validators,
          total_at_stake: totalAtStake,
          proposer,
          next_round_validators: this.getEligibleValidators()
        }
      }
    }, false);
    transactions.push(consensusUpdateTx);
    // FIXME: This should be fixed with the proposal revamp
    this.server.executeTransaction(consensusUpdateTx, MessageTypes.TRANSACTION);
    return Block.createBlock(this.node.bc.lastBlock().hash, [], transactions, blockNumber, proposer, validators);
  }

  checkProposal(block) {
    logger.debug(`[Consensus:checkProposal]\nlastBlock: ${JSON.stringify(this.node.bc.lastBlock(), null, 2)}` +
        `\nIncoming proposal: ${JSON.stringify(block, null, 2)}`);
    if (!Block.validateProposedBlock(block, this.node.bc)) {
      logger.error(`[Consensus:checkProposal] Proposed block didn't pass the basic checks`);
      return false;
    }
    logger.debug(`[Consensus:checkProposal] Proposed block passed the basic checks`);
    return true;
  }

  commit(block) {
    // TODO(lia): Use fianlized state snapshot to verify the block first, and update the finalized state
    if (this.node.bc.addNewBlock(block)) {
      logger.info(`[Consensus:commit] Committing a block of number ${block.number} and hash ${block.hash}`);
      this.node.tp.cleanUpForNewBlock(block);
      this.node.reconstruct();
      this.updateToState();
    } else {
      logger.error("[Consensus:commit] Failed to commit a block:" + JSON.stringify(this.state.proposedBlock, null, 2));
    }
  }

  selectProposer() {
    logger.debug(`[Consensus:selectProposer] ${this.state.number}/${this.state.round}`);
    const validators = this.getValidatorsAtNumber(this.state.number);
    if (!validators || !Object.keys(validators).length) {
      logger.debug(`[Consensus:selectProposer] Failed to select a proposer: no validators given.`);
      return null;
    }
    const seed = this.node.bc.lastBlock().hash + this.state.round;
    const alphabeticallyOrderedValidators = Object.keys(validators).sort();
    const totalAtStake = Object.values(validators).reduce((a, b) => { return a + b; }, 0);
    const randomNumGenerator = seedrandom(seed);
    const targetValue = randomNumGenerator() * totalAtStake;
    let cumulative = 0;
    for (let i = 0; i < alphabeticallyOrderedValidators.length; i++) {
      cumulative += validators[alphabeticallyOrderedValidators[i]];
      if (cumulative > targetValue) {
        logger.debug(`Proposer is ${alphabeticallyOrderedValidators[i]}`);
        return alphabeticallyOrderedValidators[i];
      }
    }
    logger.error(`Failed to get the proposer.\nvalidators: ${alphabeticallyOrderedValidators}\n` +
        `totalAtStake: ${totalAtStake}\nseed: ${seed}\ntargetValue: ${targetValue}`);
    return null;
  }

  getValidatorsAtNumber(number) {
    // XXX: Is there a better way?
    if (number === 1) {
      return STAKE > 0 ? { [this.node.account.address]:  STAKE } : {};
    }
    const storedAt = (number - 1) % ConsensusConsts.MAX_CONSENSUS_STATE_DB;
    return this.node.db.getValue(ConsensusRef.nextRoundValidators(storedAt));
  }

  getValidConsensusDeposit(address) {
    const deposit = this.node.db.getValue(ChainUtil.formatPath([
      PredefinedDbPaths.DEPOSIT_ACCOUNTS_CONSENSUS,
      address
    ]));
    if (deposit && deposit.value > 0 && deposit.expire_at > Date.now() + ConsensusConsts.DAY_MS) {
      return deposit.value;
    }
    return 0;
  }

  getStakeAtNumber(currentNum, address) {
    if (currentNum <= 1) return 0;
    const storedAt = (currentNum - 1) % ConsensusConsts.MAX_CONSENSUS_STATE_DB;
    const ref = ChainUtil.formatPath([ConsensusRef.nextRoundValidators(storedAt), address]);
    return this.node.db.getValue(ref) || 0;
  }
  
  getEligibleValidators() {
    const allDeposits = this.node.db.getValue(PredefinedDbPaths.DEPOSIT_ACCOUNTS_CONSENSUS);
    logger.debug(`\n[Consensus:getEligibleValidators] allDeposits: ${JSON.stringify(allDeposits)}\n`);
    if (!allDeposits) {
      return null;
    }
    const validators = {};
    for (let addr of Object.keys(allDeposits)) {
      const deposit = allDeposits[addr];
      if (deposit.value > 0 && deposit.expire_at > Date.now() + ConsensusConsts.DAY_MS) {
        validators[addr] = deposit.value;
      }
    }
    logger.debug(`\n[Consensus:getEligibleValidators] validators: ${JSON.stringify(validators)}\n`);
    return validators;
  }

  stake(amount) {
    if (!amount || amount <= 0) {
      logger.debug(`Invalid staking amount received: ${amount}`);
      return null;
    }
    const depositTx = this.node.createTransaction({
      operation: {
        type: WriteDbOperations.SET_VALUE,
        ref: ChainUtil.formatPath([
            PredefinedDbPaths.DEPOSIT_CONSENSUS,
            this.node.account.address,
            PushId.generate(),
            PredefinedDbPaths.DEPOSIT_VALUE
          ]),
        value: amount
      }
    }, false);
    return this.server.executeAndBroadcastTransaction(depositTx, MessageTypes.TRANSACTION);
  }
}

module.exports = Consensus;