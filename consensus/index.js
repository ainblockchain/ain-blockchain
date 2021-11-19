const logger = new (require('../logger'))('CONSENSUS');

const seedrandom = require('seedrandom');
const _ = require('lodash');
const ntpsync = require('ntpsync');
const semver = require('semver');
const Blockchain = require('../blockchain');
const { Block } = require('../blockchain/block');
const Transaction = require('../tx-pool/transaction');
const DB = require('../db');
const PushId = require('../db/push-id');
const {
  WriteDbOperations,
  PredefinedDbPaths,
  StateVersions,
  GENESIS_WHITELIST,
  LIGHTWEIGHT,
  MIN_NUM_VALIDATORS,
  MAX_NUM_VALIDATORS,
  MIN_STAKE_PER_VALIDATOR,
  MAX_STAKE_PER_VALIDATOR,
  EPOCH_MS,
  CONSENSUS_PROTOCOL_VERSION,
  FeatureFlags,
} = require('../common/constants');
const {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStates,
  ValidatorOffenseTypes,
  ConsensusErrorCode,
} = require('./constants');
const CommonUtil = require('../common/common-util');
const ConsensusUtil = require('./consensus-util');
const PathUtil = require('../common/path-util');
const VersionUtil = require('../common/version-util');
const FileUtil = require('../common/file-util');


class ConsensusError extends Error {
  constructor({ code, level, message }) {
    super(message);
    this.name = 'ConsensusException';
    this.code = code;
    this.level = level;
    this.message = message;
  }

  log() {
    switch (this.level) {
      case 'info':
        logger.info(this.message);
        return;
      case 'debug':
        logger.debug(this.message);
        return;
      default:
        logger.error(this.message);
    }
  }
}

class Consensus {
  constructor(server, node) {
    this.server = server;
    this.node = node;
    this.state = null;
    this.stateChangedBlockNumber = null;
    this.setState(ConsensusStates.STARTING);
    this.consensusProtocolVersion = CONSENSUS_PROTOCOL_VERSION;
    this.majorConsensusProtocolVersion = VersionUtil.toMajorVersion(CONSENSUS_PROTOCOL_VERSION);
    this.epochInterval = null;
    this.startingTime = 0;
    this.timeAdjustment = 0;
    this.isInEpochTransition = false;
    this.proposer = null;
    // NOTE(liayoo): epoch increases by 1 every EPOCH_MS,
    // and at each epoch a new proposer is pseudo-randomly selected.
    this.epoch = 1;

    // Values used for status reporting
    this.validators = {};
    this.ntpData = {};

    // This feature is only used when LIGHTWEIGHT=true.
    this.cache = {};
  }

  initConsensus() {
    const LOG_HEADER = 'initConsensus';
    const finalizedNumber = this.node.bc.lastBlockNumber();
    const genesisBlock = this.node.bc.getBlockByNumber(0);
    if (!genesisBlock) {
      logger.error(`[${LOG_HEADER}] Init error: genesis block is not found`);
      return;
    }
    this.genesisHash = genesisBlock.hash;
    const myAddr = this.node.account.address;
    try {
      const targetStake = process.env.STAKE ? Number(process.env.STAKE) : 0;
      const currentStake =
          this.getConsensusStakeFromAddr(this.node.stateManager.getFinalVersion(), myAddr);
      logger.info(`[${LOG_HEADER}] Current stake: ${currentStake} / Target stake: ${targetStake}`);
      if (!targetStake && !currentStake) {
        logger.info(`[${LOG_HEADER}] Node doesn't have any stakes. ` +
            'Initialized as a non-validator.');
      } else if (targetStake > 0 && currentStake < targetStake) {
        const stakeAmount = targetStake - currentStake;
        const stakeTx = this.stake(stakeAmount);
        this.server.executeAndBroadcastTransaction(stakeTx);
      }
      this.setState(ConsensusStates.RUNNING);
      this.startEpochTransition();
      this.server.client.setIntervalForShardProofHashReports();
      logger.info(
          `[${LOG_HEADER}] Initialized to number ${finalizedNumber} and epoch ${this.epoch}`);
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Init error: ${err} ${err.stack}`);
      this.setState(ConsensusStates.STARTING);
    }
  }

  startEpochTransition() {
    const LOG_HEADER = 'startEpochTransition';
    const genesisBlock = this.node.bc.genesisBlock;
    this.startingTime = genesisBlock.timestamp;
    this.epoch = Math.ceil((Date.now() - this.startingTime) / EPOCH_MS);
    logger.info(`[${LOG_HEADER}] Epoch initialized to ${this.epoch}`);

    this.setEpochTransition();
  }

  setEpochTransition() {
    const LOG_HEADER = 'setEpochTransition';
    if (this.epochInterval) {
      clearInterval(this.epochInterval);
    }
    this.epochInterval = setInterval(async () => {
      if (this.isInEpochTransition) {
        return;
      }
      this.isInEpochTransition = true;
      this.node.tryFinalizeChain();
      let currentTime = Date.now();
      if (FeatureFlags.enableNtpSync && this.epoch % 100 === 0) {
        // adjust time
        try {
          const iNTPData = await ntpsync.ntpLocalClockDeltaPromise();
          logger.debug(`(Local Time - NTP Time) Delta = ${iNTPData.minimalNTPLatencyDelta} ms`);
          this.timeAdjustment = iNTPData.minimalNTPLatencyDelta;
          this.ntpData = { ...iNTPData, syncedAt: Date.now() };
        } catch (err) {
          logger.error(`ntpsync error: ${err} ${err.stack}`);
        }
      }
      currentTime -= this.timeAdjustment;
      const absEpoch = Math.floor((currentTime - this.startingTime) / EPOCH_MS);
      if (this.epoch + 1 < absEpoch) {
        logger.debug(`[${LOG_HEADER}] Epoch is too low: ${this.epoch} / ${absEpoch}`);
      } else if (this.epoch + 1 > absEpoch) {
        logger.debug(`[${LOG_HEADER}] Epoch is too high: ${this.epoch} / ${absEpoch}`);
      }
      logger.debug(
          `[${LOG_HEADER}] Updating epoch at ${currentTime}: ${this.epoch} => ${absEpoch}`);
      // re-adjust and update epoch
      this.epoch = absEpoch;
      if (this.epoch > 1) {
        this.updateProposer();
        this.tryPropose();
      }
      this.isInEpochTransition = false;
    }, EPOCH_MS);
  }

  stop() {
    logger.info(`Stop epochInterval.`);
    this.setState(ConsensusStates.STOPPED);
    if (this.epochInterval) {
      clearInterval(this.epochInterval);
      this.epochInterval = null;
    }
    // FIXME: reset consensus state or store last state?
  }

  updateProposer() {
    const LOG_HEADER = 'updateProposer';
    const lastNotarizedBlock = this.getLastNotarizedBlock();
    if (!lastNotarizedBlock) {
      logger.error(`[${LOG_HEADER}] Empty lastNotarizedBlock (${this.epoch})`);
      return;
    }
    const validators = this.getValidators(
        lastNotarizedBlock.hash, lastNotarizedBlock.number, this.node.stateManager.getFinalVersion());
    this.validators = validators;

    // FIXME(liayoo): Make the seeds more secure and unpredictable.
    const seed = '' + lastNotarizedBlock.last_votes_hash + this.epoch;
    this.proposer = Consensus.selectProposer(seed, validators);
    logger.debug(`[${LOG_HEADER}] proposer for epoch ${this.epoch}: ${this.proposer}`);
  }

  checkConsensusProtocolVersion(msg) {
    const LOG_HEADER = 'checkConsensusProtocolVersion';
    const consensusProtoVer = _.get(msg, 'consensusProtoVer');
    if (!consensusProtoVer || !semver.valid(consensusProtoVer)) {
      logger.error(`[${LOG_HEADER}] CONSENSUS_PROTOCOL_VERSION cannot be empty or invalid.`);
      return false;
    }
    const majorVersion = VersionUtil.toMajorVersion(consensusProtoVer);
    const isGreater = semver.gt(this.majorConsensusProtocolVersion, majorVersion);
    if (isGreater) {
      logger.error(`[${LOG_HEADER}] The given consensus message version is old. ` +
          `See: (${this.majorConsensusProtocolVersion}, ${majorVersion})`);
      return false;
    }
    const isLower = semver.lt(this.majorConsensusProtocolVersion, majorVersion);
    if (isLower) {
      logger.error(`[${LOG_HEADER}] My consensus protocol version is old. ` +
          `See: (${this.majorConsensusProtocolVersion}, ${majorVersion})`);
      return false;
    }
    return true;
  }

  // Types of consensus messages:
  //  1. Proposal { value: { proposalBlock, proposalTx }, type = 'PROPOSE' }
  //  2. Vote { value: <voting tx>, type = 'VOTE' }
  handleConsensusMessage(msg) {
    const LOG_HEADER = 'handleConsensusMessage';

    if (!this.checkConsensusProtocolVersion(msg)) {
      logger.error(`[${LOG_HEADER}] CONSENSUS_PROTOCOL_VERSION is not compatible. ` +
          `Discard the consensus message.`);
      return;
    }
    if (this.state !== ConsensusStates.RUNNING) {
      logger.debug(`[${LOG_HEADER}] Consensus state (${this.state}) is not RUNNING ` +
          `(${ConsensusStates.RUNNING})`);
      return;
    }
    if (!Object.values(ConsensusMessageTypes).includes(msg.type)) {
      logger.error(`[${LOG_HEADER}] Invalid message type: ${msg.type}`);
      return;
    }
    if (CommonUtil.isEmpty(msg.value)) {
      logger.error(`[${LOG_HEADER}] Invalid message value: ${msg.value}`);
      return;
    }
    logger.debug(
        `[${LOG_HEADER}] Consensus state - Finalized block: ` +
        `${this.node.bc.lastBlockNumber()} / ${this.epoch}`);
    logger.debug(`Message: ${JSON.stringify(msg.value, null, 2)}`);
    if (msg.type === ConsensusMessageTypes.PROPOSE) {
      const lastNotarizedBlock = this.getLastNotarizedBlock();
      const {proposalBlock, proposalTx} = msg.value;
      if (!proposalBlock || !proposalTx) {
        logger.error(`[${LOG_HEADER}] Proposal is missing required fields: ${msg.value}`);
        return;
      }
      if (this.node.tp.transactionTracker[proposalTx.hash]) {
        logger.debug(`[${LOG_HEADER}] Already have the proposal in my tx tracker`);
        return;
      }
      if (this.node.bp.hasSeenBlock(proposalBlock.hash)) {
        logger.error(`[${LOG_HEADER}] Already have the block in my block pool`);
        return;
      }
      if (proposalBlock.number > lastNotarizedBlock.number + 1) {
        logger.info(`[${LOG_HEADER}] Trying to sync. Current last block number: ` +
            `${lastNotarizedBlock.number}, proposal block number ${proposalBlock.number}`);
        // I might be falling behind. Try to catch up.
        // FIXME(liayoo): This has a possibility of being exploited by an attacker. The attacker
        // can keep sending messages with higher numbers, making the node's status unsynced, and
        // prevent the node from getting/handling messages properly.
        // this.node.state = BlockchainNodeStates.SYNCING;
        Object.values(this.server.client.outbound).forEach((peer) => {
          setTimeout(() => {
            this.server.client.requestChainSegment(peer.socket, this.node.bc.lastBlockNumber());
          }, EPOCH_MS);
        });
        return;
      }
      try {
        this.checkProposalBlockAndTx(proposalBlock, proposalTx);
      } catch (e) {
        if (e instanceof ConsensusError) {
          e.log();
          if (ConsensusUtil.isVoteAgainstBlockError(e.code)) {
            this.node.bp.addSeenBlock(proposalBlock, proposalTx, false);
            this.server.client.broadcastConsensusMessage(msg);
            this.tryVoteAgainstInvalidBlock(proposalBlock);
          }
        } else {
          logger.error(`[${LOG_HEADER}] Error while checking proposal: ${e.stack}`);
        }
        return;
      }
      this.server.client.broadcastConsensusMessage(msg);
      this.tryVoteForValidBlock(proposalBlock);
    } else if (msg.type === ConsensusMessageTypes.VOTE) {
      if (this.node.tp.transactionTracker[msg.value.hash]) {
        logger.debug(`[${LOG_HEADER}] Already have the vote in my tx tracker`);
        return;
      }
      if (!this.checkVoteTx(msg.value)) {
        logger.error(`[${LOG_HEADER}] Invalid vote tx: ${JSON.stringify(msg.value)}`);
        return;
      }
      this.server.client.broadcastConsensusMessage(msg);
    }
  }

  executeAndGetValidTransactions(longestNotarizedChain, blockNumber, blockTime, tempDb) {
    const candidates = this.node.tp.getValidTransactions(longestNotarizedChain, tempDb.stateVersion);
    const transactions = [];
    const invalidTransactions = [];
    const resList = [];
    for (const tx of candidates) {
      const res = tempDb.executeTransaction(Transaction.toExecutable(tx), false, true, blockNumber, blockTime);
      if (CommonUtil.txPrecheckFailed(res)) {
        logger.debug(`[${LOG_HEADER}] failed to execute transaction:\n${JSON.stringify(tx, null, 2)}\n${JSON.stringify(res, null, 2)})`);
        invalidTransactions.push(tx);
      } else {
        transactions.push(tx);
        resList.push(res);
      }
    }
    tempDb.removeOldReceipts();
    // Once successfully executed txs (when submitted to tx pool) can become invalid
    // after some blocks are created. Remove those transactions from tx pool.
    this.node.tp.removeInvalidTxsFromPool(invalidTransactions);
    const { gasAmountTotal, gasCostTotal } =
        CommonUtil.getServiceGasCostTotalFromTxList(transactions, resList);
    const receipts = CommonUtil.txResultsToReceipts(resList);
    return { transactions, receipts, gasAmountTotal, gasCostTotal };
  }

  getProposalTx(blockNumber, validators, totalAtStake, gasCostTotal, offenses, proposalBlock) {
    const proposeOp = {
      type: WriteDbOperations.SET_VALUE,
      ref: PathUtil.getConsensusProposePath(blockNumber),
      value: {
        number: blockNumber,
        epoch: this.epoch,
        validators,
        total_at_stake: totalAtStake,
        proposer: this.node.account.address,
        block_hash: proposalBlock.hash,
        last_hash: proposalBlock.last_hash,
        timestamp: proposalBlock.timestamp,
        gas_cost_total: gasCostTotal
      }
    }
    if (!CommonUtil.isEmpty(offenses)) {
      proposeOp.value.offenses = offenses;
    }
    const setOp = {
      type: WriteDbOperations.SET,
      op_list: [proposeOp]
    };
    return this.node.createTransaction({ operation: setOp, nonce: -1, gas_price: 1 });
  }

  // proposing for block #N :
  //    1. create a block (with last_votes)
  //    2. create a tx (/consensus/number/N/propose: { block_hash, ... })
  //    3. broadcast tx + block (i.e. call handleConsensusMessage())
  //    4. verify block
  //    5. execute propose tx
  //    6. Nth propose tx should be included in the N+1th block's last_votes
  createProposal(epoch) {
    const LOG_HEADER = 'createProposal';
    const { chain: longestNotarizedChain, recordedInvalidBlockHashSet } = this.getLongestNotarizedChain();
    const lastBlock = longestNotarizedChain && longestNotarizedChain.length ?
        longestNotarizedChain[longestNotarizedChain.length - 1] : this.node.bc.lastBlock();
    const blockNumber = lastBlock.number + 1;
    if (LIGHTWEIGHT && blockNumber > 1 && this.cache[blockNumber]) {
      throw Error(`[${LOG_HEADER}] Already proposed ${blockNumber} / ${this.cache[blockNumber]}`);
    }
    if (lastBlock.epoch >= epoch) {
      throw Error(`[${LOG_HEADER}] Last block's epoch is greater than or equal to my current epoch.`);
    }
    const baseVersion = lastBlock.number === this.node.bc.lastBlockNumber() ?
        this.node.stateManager.getFinalVersion() :
            this.node.bp.hashToDb.get(lastBlock.hash).stateVersion;
    const tempDb = this.node.createTempDb(
        baseVersion, `${StateVersions.CONSENSUS_CREATE}:${lastBlock.number}:${blockNumber}`,
        lastBlock.number - 1);
    if (!tempDb) {
      throw Error(`[${LOG_HEADER}] Failed to create a temp database with state version: ${baseVersion}.`);
    }
    const blockTime = Date.now();
    const lastVotes = this.node.bp.getValidLastVotes(lastBlock, blockNumber, blockTime, tempDb);
    const validators = this.getValidators(lastBlock.hash, lastBlock.number, tempDb.stateVersion);
    const numValidators = Object.keys(validators).length;
    if (!validators || !numValidators) {
      tempDb.destroyDb();
      throw Error(`[${LOG_HEADER}] No whitelisted validators`);
    }
    if (numValidators < MIN_NUM_VALIDATORS) {
      tempDb.destroyDb();
      throw Error(`[${LOG_HEADER}] Not enough validators: ${JSON.stringify(validators)}`);
    }
    const totalAtStake = ConsensusUtil.getTotalAtStake(validators);
    const { offenses, evidence } = this.node.bp.getOffensesAndEvidence(
        validators, recordedInvalidBlockHashSet, blockTime, tempDb);
    const { transactions, receipts, gasAmountTotal, gasCostTotal } = this.executeAndGetValidTransactions(
        longestNotarizedChain, blockNumber, blockTime, tempDb);
    const stateProofHash = LIGHTWEIGHT ? '' : tempDb.getProofHash('/');
    const proposalBlock = Block.create(
        lastBlock.hash, lastVotes, evidence, transactions, receipts, blockNumber, epoch,
        stateProofHash, this.node.account.address, validators, gasAmountTotal, gasCostTotal, blockTime);
    const proposalTx = this.getProposalTx(blockNumber, validators, totalAtStake, gasCostTotal, offenses, proposalBlock);
    if (LIGHTWEIGHT) {
      this.cache[blockNumber] = proposalBlock.hash;
    }
    tempDb.destroyDb();
    return { proposalBlock, proposalTx: Transaction.toJsObject(proposalTx) };
  }

  /**
   * Proposal block and transaction validation functions
   */

  static validateProposalTx(proposalTx, proposer, hash) {
    if (proposalTx) {
      if (!ConsensusUtil.isValidConsensusTx(proposalTx)) {
        throw new ConsensusError({
          code: ConsensusErrorCode.INVALID_CONSENSUS_TX,
          message: `Proposal is an invalid consensus tx: ${JSON.stringify(proposalTx)}`,
          level: 'error'
        });
      }
      if (proposalTx.address !== proposer) {
        throw new ConsensusError({
          code: ConsensusErrorCode.PROPOSER_MISMATCH,
          message: `Transaction signer and proposer are different: ${JSON.stringify(proposalTx)} !== ${proposer}`,
          level: 'error'
        });
      }
      const blockHashFromTx = ConsensusUtil.getBlockHashFromConsensusTx(proposalTx);
      if (blockHashFromTx !== hash) {
        throw new ConsensusError({
          code: ConsensusErrorCode.BLOCK_HASH_MISMATCH,
          message: `The block_hash value in proposalTx (${blockHashFromTx}) and ` +
              `the actual proposalBlock's hash (${hash}) don't match`,
          level: 'error'
        });
      }
    }
  }

  static getPrevBlockInfo(number, lastHash, lastFinalizedBlock, bp) {
    if (number === 0) return { block: null };
    const prevBlockInfo = lastFinalizedBlock && number === lastFinalizedBlock.number + 1 ?
        { block: lastFinalizedBlock } : bp.hashToBlockInfo[lastHash];
    if (!prevBlockInfo || !prevBlockInfo.block) {
      throw new ConsensusError({
        code: ConsensusErrorCode.INVALID_PREV_BLOCK,
        message: `No notarized block at number ${number - 1} with hash ${lastHash}`,
        level: 'error'
      });
    }
    return prevBlockInfo;
  }

  static getBaseStateVersion(prevBlock, lastHash, lastFinalizedNumber, finalVersion, bp) {
    let baseVersion;
    if (!prevBlock || prevBlock.number === lastFinalizedNumber) {
      // Genesis block or block extending the last finalized block
      baseVersion = finalVersion;
    } else if (bp.hashToDb.has(lastHash)) {
      baseVersion = bp.hashToDb.get(lastHash).stateVersion;
    } else {
      throw new ConsensusError({
        code: ConsensusErrorCode.MISSING_DB_FOR_PREV_BLOCK,
        message: `Previous db state doesn't exist`,
        level: 'error'
      });
    }
    return baseVersion;
  }

  static getNewDbForProposal(number, baseVersion, stateVersionPrefix, node) {
    const newDb = node.createTempDb(
        baseVersion, `${stateVersionPrefix}:${number - 1}:${number}`, number - 1);
    if (!newDb) {
      throw new ConsensusError({
        code: ConsensusErrorCode.TEMP_DB_CREATION_FAILURE,
        message: `Failed to create a temp database with state version: ${baseVersion}.`,
        level: 'error'
      });
    }
    return newDb;
  }

  static validateBlockNumberAndHashes(block, prevBlock, genesisBlockHash) {
    if (!LIGHTWEIGHT) {
      return;
    }
    if (!Blockchain.validateBlock(block)) {
      throw new ConsensusError({
        code: ConsensusErrorCode.ILL_FORMED_BLOCK,
        message: `Proposed block didn't pass the basic checks`,
        level: 'error'
      });
    }
    const { number, hash, last_hash } = block;
    if (number === 0) {
      if (hash !== genesisBlockHash) {
        throw new ConsensusError({
          code: ConsensusErrorCode.INVALID_GENESIS_BLOCK,
          message: `Invalid genesis block`,
          level: 'error'
        });
      }
    } else {
      if (number === 1) {
        if (last_hash !== genesisBlockHash) {
          throw new ConsensusError({
            code: ConsensusErrorCode.INVALID_CHAIN,
            message: `Received a block on a wrong chain`,
            level: 'error'
          });
        }
      }
      if (prevBlock.epoch >= epoch) {
        throw new ConsensusError({
          code: ConsensusErrorCode.INVALID_EPOCH,
          message: `Previous block's epoch (${prevBlock.epoch}) ` +
              `is greater than or equal to incoming block's (${epoch})`,
          level: 'error'
        });
      }
    }
  }

  static validateValidators(validators) {
    if (Object.keys(validators).length < MIN_NUM_VALIDATORS || Object.keys(validators).length > MAX_NUM_VALIDATORS) {
      throw new ConsensusError({
        code: ConsensusErrorCode.INVALID_VALIDATORS_SIZE,
        message: `Invalid validator set size (${JSON.stringify(validators)})\n` +
            `MIN_NUM_VALIDATORS: ${MIN_NUM_VALIDATORS}, MAX_NUM_VALIDATORS: ${MAX_NUM_VALIDATORS}`,
        level: 'error'
      });
    }
  }

  static validateProposer(number, prevBlockLastVotesHash, epoch, validators, proposer) {
    if (number === 0) return;
    const seed = '' + prevBlockLastVotesHash + epoch;
    const expectedProposer = Consensus.selectProposer(seed, validators);
    if (expectedProposer !== proposer) {
      throw new ConsensusError({
        code: ConsensusErrorCode.INVALID_PROPOSER,
        message: `Proposer is not the expected node (expected: ${expectedProposer} / actual: ${proposer})`,
        level: 'error'
      });
    }
  }

  static validateAndExecuteLastVotes(lastVotes, lastHash, number, blockTime, db, blockPool) {
    if (number === 0) return;
    if (!db.executeTransactionList(lastVotes, true, false, 0, blockTime)) {
      throw new ConsensusError({
        code: ConsensusErrorCode.EXECUTING_LAST_VOTES_FAILURE,
        message: `Failed to execute last votes`,
        level: 'error'
      });
    }
    for (const vote of lastVotes) {
      blockPool.addSeenVote(vote);
    }
    if (!blockPool.hashToBlockInfo[lastHash].notarized) {
      throw new ConsensusError({
        code: ConsensusErrorCode.INVALID_LAST_VOTES_STAKES,
        message: `Block's last_votes don't correctly notarize its previous block of number ` +
            `${number - 1} with hash ${lastHash}:\n` +
            `${JSON.stringify(blockPool.hashToBlockInfo[lastHash], null, 2)}`,
        level: 'error'
      });
    }
    const prevBlockProposal = ConsensusUtil.filterProposalFromVotes(lastVotes);
    if (number > 1 && (!prevBlockProposal || !blockPool.hashToBlockInfo[lastHash].proposal)) { // No proposalTx for the genesis block.
      throw new ConsensusError({
        code: ConsensusErrorCode.MISSING_PROPOSAL_IN_LAST_VOTES,
        message: `Proposal block is missing its prev block's proposal in last_votes`,
        level: 'error'
      });
    }
  }

  // Cross-check the offenses in proposalTx & the evidence in proposalBlock
  static validateAndExecuteOffensesAndEvidence(evidence, validators, prevBlockMajority, blockTime, proposalTx, db) {
    const offenses = proposalTx ? ConsensusUtil.getOffensesFromProposalTx(proposalTx) : null;
    if (proposalTx) {
      if (CommonUtil.isEmpty(offenses) !== CommonUtil.isEmpty(evidence)) {
        throw new ConsensusError({
          code: ConsensusErrorCode.OFFENSES_EVIDENCE_MISMATCH,
          message: `Offenses and evidence don't match: ` +
              `${JSON.stringify(offenses)} / ${JSON.stringify(evidence)}`,
          level: 'error'
        });
      }
    }
    if (CommonUtil.isEmpty(evidence)) {
      return;
    }
    for (const [offender, evidenceList] of Object.entries(evidence)) {
      const tempOffenses = {};
      for (const evidenceForOffense of evidenceList) {
        if (!CommonUtil.isValidatorOffenseType(evidenceForOffense.offense_type)) {
          throw new ConsensusError({
            code: ConsensusErrorCode.INVALID_OFFENSE_TYPE,
            message: `Invalid offense type: ${evidenceForOffense.offense_type}`,
            level: 'error'
          });
        }
        const tallied = evidenceForOffense.votes.reduce((acc, vote) => {
          return acc + _.get(validators, `${vote.address}.stake`, 0);
        }, 0);
        if (prevBlockMajority !== -1 && tallied < prevBlockMajority) {
          throw new ConsensusError({
            code: ConsensusErrorCode.INVALID_EVIDENCE_VOTES_STAKES,
            message: `Evidence votes don't meet the majority`,
            level: 'error'
          });
        }
        const txsRes = db.executeTransactionList(evidenceForOffense.votes, true, false, 0, blockTime);
        if (!txsRes) {
          throw new ConsensusError({
            code: ConsensusErrorCode.EXECUTING_EVIDENCE_VOTES_FAILURE,
            message: `Failed to execute evidence votes`,
            level: 'error'
          });
        }
        if (!tempOffenses[evidenceForOffense.offense_type]) {
          tempOffenses[evidenceForOffense.offense_type] = 0;
        }
        tempOffenses[evidenceForOffense.offense_type] += 1;
      }
      if (proposalTx) {
        if (!_.isEqual(offenses[offender], tempOffenses, { strict: true })) {
          throw new ConsensusError({
            code: ConsensusErrorCode.INVALID_OFFENSE_COUNTS,
            message: `Invalid offense counts`,
            level: 'error'
          });
        }
      }
    }
  }

  static validateAndExecuteTransactions(transactions, receipts, number, blockTime, expectedGasAmountTotal, expectedGasCostTotal, db) {
    const txsRes = db.executeTransactionList(transactions, number === 0, true, number, blockTime);
    if (!txsRes) {
      throw new ConsensusError({
        code: ConsensusErrorCode.EXECUTING_TX_FAILURE,
        message: `Failed to execute transactions`,
        level: 'error'
      });
    }
    if (!_.isEqual(receipts, CommonUtil.txResultsToReceipts(txsRes))) {
      throw new ConsensusError({
        code: ConsensusErrorCode.INVALID_RECEIPTS,
        message: `Invalid receipts`,
        level: 'error'
      });
    }
    const { gasAmountTotal, gasCostTotal } =
        CommonUtil.getServiceGasCostTotalFromTxList(transactions, txsRes);
    if (gasAmountTotal !== expectedGasAmountTotal) {
      throw new ConsensusError({
        code: ConsensusErrorCode.INVALID_GAS_AMOUNT_TOTAL,
        message: `Invalid gas_amount_total`,
        level: 'error'
      });
    }
    if (gasCostTotal !== expectedGasCostTotal) {
      throw new ConsensusError({
        code: ConsensusErrorCode.INVALID_GAS_COST_TOTAL,
        message: `Invalid gas_cost_total`,
        level: 'error'
      });
    }
    db.removeOldReceipts();
  }

  static validateStateProofHash(expectedStateProofHash, number, db, node, takeSnapshot) {
    if (LIGHTWEIGHT) return;
    const stateProofHash = db.getProofHash('/');
    if (stateProofHash !== expectedStateProofHash) {
      if (takeSnapshot) {
        // NOTE(platfowner): Write the current snapshot for debugging.
        const snapshot = node.buildBlockchainSnapshot(number, db.stateRoot);
        FileUtil.writeSnapshot(node.snapshotDir, number, snapshot, true);
      }
      throw new ConsensusError({
        code: ConsensusErrorCode.INVALID_STATE_PROOF_HASH,
        message: `State proof hashes don't match: ${stateProofHash} / ${expectedStateProofHash}`,
        level: 'error'
      });
    }
  }

  static executeProposalTx(proposalTx, number, blockTime, db, node) {
    if (!proposalTx) return;
    const executableTx = Transaction.toExecutable(proposalTx);
    if (!executableTx) {
      throw new ConsensusError({
        code: ConsensusErrorCode.ILL_FORMED_PROPOSAL_TX,
        message: `Failed to create a transaction with a proposal: ${JSON.stringify(proposalTx, null, 2)}`,
        level: 'error'
      });
    }
    const tempDb = node.createTempDb(
        db.stateVersion, `${StateVersions.CONSENSUS_PROPOSE}:${number - 1}:${number}`, number - 2);
    if (!tempDb) {
      throw new ConsensusError({
        code: ConsensusErrorCode.TEMP_DB_CREATION_FAILURE,
        message: `Failed to create a temp database with state version: ${db.stateVersion}`,
        level: 'error'
      });
    }
    // Try executing the proposal tx on the proposal block's db state
    const proposalTxExecRes = tempDb.executeTransaction(executableTx, true, false, 0, blockTime);
    tempDb.destroyDb();
    if (CommonUtil.isFailedTx(proposalTxExecRes)) {
      throw new ConsensusError({
        code: ConsensusErrorCode.EXECUTING_PROPOSAL_FAILURE,
        message: `Failed to execute the proposal tx: ${JSON.stringify(proposalTxExecRes)}`,
        level: 'error'
      });
    }
    node.tp.addTransaction(executableTx);
    db.blockNumberSnapshot += 1;
  }

  static addBlockToBlockPool(block, proposalTx, db, blockPool) {
    if (!blockPool.addSeenBlock(block, proposalTx)) {
      throw new ConsensusError({
        code: ConsensusErrorCode.ADDING_TO_BLOCK_POOL_FAILURE,
        message: `Unable to add block to block pool: ${block.hash}`,
        level: 'error'
      });
    }
    blockPool.addToHashToDbMap(block.hash, db);
  }

  static validateAndExecuteBlockOnDb(rawBlock, node, stateVersionPrefix, proposalTx = null, takeSnapshot = false) {
    const block = Block.parse(rawBlock);
    if (!block) {
      throw new ConsensusError({
        code: ConsensusErrorCode.PARSING_PROPOSAL_BLOCK_FAILURE,
        message: `Unable to parse block: ${JSON.stringify(rawBlock)}`,
        level: 'error'
      });
    }
    if (node.bp.hasSeenBlock(block.hash)) {
      return; // Do nothing
    }
    const { hash, number, epoch, timestamp, transactions, receipts, gas_amount_total, gas_cost_total,
        proposer, validators, last_votes, evidence, last_hash, state_proof_hash } = block;
    Consensus.validateProposalTx(proposalTx, proposer, hash);

    const prevBlockInfo = Consensus.getPrevBlockInfo(number, last_hash, node.bc.lastBlock(), node.bp);
    const prevBlock = prevBlockInfo.block;
    const prevBlockTotalAtStake = prevBlock ? ConsensusUtil.getTotalAtStake(prevBlock.validators) : -1;
    const prevBlockMajority = prevBlock ? prevBlockTotalAtStake * ConsensusConsts.MAJORITY : -1;
    const prevBlockLastVotesHash = prevBlock ? prevBlock.last_votes_hash : null;
    const baseVersion = Consensus.getBaseStateVersion(prevBlock, last_hash,
        node.bc.lastBlockNumber(), node.stateManager.getFinalVersion(), node.bp);
    const db = Consensus.getNewDbForProposal(number, baseVersion, stateVersionPrefix, node);

    try {
      Consensus.validateBlockNumberAndHashes(block, prevBlock, node.bc.genesisBlockHash);
      Consensus.validateValidators(validators);
      Consensus.validateProposer(number, prevBlockLastVotesHash, epoch, validators, proposer);
      Consensus.validateAndExecuteLastVotes(last_votes, last_hash, number, timestamp, db, node.bp);
      Consensus.validateAndExecuteOffensesAndEvidence(
          evidence, validators, prevBlockMajority, timestamp, proposalTx, db);
      Consensus.validateAndExecuteTransactions(
          transactions, receipts, number, timestamp, gas_amount_total, gas_cost_total, db);
      Consensus.validateStateProofHash(state_proof_hash, number, db, node, takeSnapshot);
      Consensus.executeProposalTx(proposalTx, number, timestamp, db, node);
      Consensus.addBlockToBlockPool(block, proposalTx, db, node.bp);
    } catch (e) {
      db.destroyDb();
      throw e;
    }
  }

  /**
   * Performs various checks on the proposalBlock and proposalTx. Throws ConsensusError if a check
   * fails. If the ConsensusError's code is one of the `ConsensusErrorCodesToVoteAgainst`,
   * the node will try to vote against the block.
   * @param {Block} proposalBlock
   * @param {Transaction} proposalTx
   */
  checkProposalBlockAndTx(proposalBlock, proposalTx) {
    const LOG_HEADER = 'checkProposal';
    logger.info(`[${LOG_HEADER}] Checking proposal block and tx: ` +
        `${proposalBlock.number} / ${proposalBlock.epoch} / ${proposalBlock.hash} / ${proposalBlock.proposer}\n` +
        `${proposalTx.hash} / ${proposalTx.address}`);

    Consensus.validateAndExecuteBlockOnDb(proposalBlock, this.node, StateVersions.POOL, proposalTx);

    if (proposalBlock.number > 1 && !this.node.bp.longestNotarizedChainTips.includes(proposalBlock.last_hash)) {
      throw new ConsensusError({
        code: ConsensusErrorCode.NOT_EXTENDING_LNC_ERROR,
        message: `Block is not extending one of the longest notarized chains ` +
            `(${JSON.stringify(this.node.bp.longestNotarizedChainTips, null, 2)})`,
        level: 'info'
      });
    }
    logger.info(`[${LOG_HEADER}] Verifed block proposal: ${proposalBlock.number} / ${proposalBlock.hash}`);
  }

  checkVoteTx(voteTx) {
    const LOG_HEADER = 'checkVoteTx';
    if (!ConsensusUtil.isValidConsensusTx(voteTx)) {
      logger.error(`[${LOG_HEADER}] Invalid consensus tx: ${JSON.stringify(voteTx)}`);
      return false;
    }
    const blockHash = ConsensusUtil.getBlockHashFromConsensusTx(voteTx);
    const isAgainst = ConsensusUtil.isAgainstVoteTx(voteTx);
    const voteTimestamp = ConsensusUtil.getTimestampFromVoteTx(voteTx);
    const blockInfo = this.node.bp.hashToBlockInfo[blockHash] ||
        this.node.bp.hashToInvalidBlockInfo[blockHash];
    let block;
    if (blockInfo && blockInfo.block) {
      block = blockInfo.block;
    } else if (blockHash === this.node.bc.lastBlock().hash) {
      block = this.node.bc.lastBlock();
    }
    if (!block) {
      logger.debug(`[${LOG_HEADER}] Cannot verify the vote without the block it's voting for: ` +
          `${blockHash} / ${JSON.stringify(blockInfo, null, 2)}`);
      // FIXME: ask for the block from peers
      return false;
    }
    if (voteTimestamp < block.timestamp) {
      logger.debug(`[${LOG_HEADER}] Invalid timestamp in vote: ${JSON.stringify(voteTx)}`);
      return false;
    }
    const executableTx = Transaction.toExecutable(voteTx);
    if (!executableTx) {
      logger.error(`[${LOG_HEADER}] Ill-formed vote tx: ${JSON.stringify(voteTx, null, 2)}`);
      return false;
    }
    let tempDb;
    if (isAgainst) {
      const offenseType = ConsensusUtil.getOffenseTypeFromVoteTx(voteTx);
      if (!CommonUtil.isValidatorOffenseType(offenseType)) {
        logger.debug(`[${LOG_HEADER}] Invalid offense type: ${offenseType}`);
        return false;
      }
      const lastBlock = this.node.bc.lastBlock();
      tempDb = this.node.createTempDb(
          this.node.stateManager.getFinalVersion(),
          `${StateVersions.SNAP}:${lastBlock.number}`, lastBlock.number);
    } else {
      const snapDb = this.getSnapDb(block);
      if (!snapDb) {
        logger.debug(
            `[${LOG_HEADER}] No state snapshot available for vote ${JSON.stringify(executableTx)}`);
        return false;
      }
      tempDb = this.node.createTempDb(
          snapDb.stateVersion, `${StateVersions.SNAP}:${block.number - 1}`, block.number - 1);
    }
    if (!tempDb) {
      logger.debug(
          `[${LOG_HEADER}] Failed to create a temp state snapshot for vote ${JSON.stringify(executableTx)}`);
      return false;
    }
    const voteTxRes = tempDb.executeTransaction(executableTx, true, false, 0, block.timestamp);
    tempDb.destroyDb();
    if (CommonUtil.isFailedTx(voteTxRes)) {
      logger.error(`[${LOG_HEADER}] Failed to execute the voting tx: ${JSON.stringify(voteTxRes)}`);
      return false;
    }
    this.node.tp.addTransaction(executableTx);
    this.node.bp.addSeenVote(voteTx);
    return true;
  }

  tryPropose() {
    const LOG_HEADER = 'tryPropose';

    const epoch = this.epoch;
    if (this.votedForEpoch(epoch)) {
      logger.info(
          `[${LOG_HEADER}] Already voted for ${this.node.bp.epochToBlock[epoch]} ` +
          `at epoch ${epoch} but trying to propose at the same epoch`);
      return;
    }
    if (this.proposer && CommonUtil.areSameAddrs(this.proposer, this.node.account.address)) {
      logger.info(`[${LOG_HEADER}] I'm the proposer ${this.node.account.address}`);
      try {
        const consensusMsg = this.encapsulateConsensusMessage(
            this.createProposal(epoch), ConsensusMessageTypes.PROPOSE);
        this.handleConsensusMessage(consensusMsg);
      } catch (err) {
        logger.error(`[${LOG_HEADER}] Error while creating a proposal: ${err.stack}`);
      }
    } else {
      logger.info(`[${LOG_HEADER}] Not my turn ${this.node.account.address}`);
    }
  }

  tryVoteForValidBlock(proposalBlock) {
    const LOG_HEADER = 'tryVoteForValidBlock';
    logger.info(`[${LOG_HEADER}] Trying to vote for ${proposalBlock.number} / ` +
        `${proposalBlock.epoch} / ${proposalBlock.hash}`);
    if (this.votedForEpoch(proposalBlock.epoch)) {
      logger.info(`[${LOG_HEADER}] Already voted for epoch ${proposalBlock.epoch}`);
      return;
    }
    if (proposalBlock.epoch < this.epoch) {
      logger.info(
          `[${LOG_HEADER}] Possibly a stale proposal (${proposalBlock.epoch} / ${this.epoch})`);
    }
    const myAddr = this.node.account.address;
    const validatorInfo = proposalBlock.validators[myAddr];
    if (!validatorInfo) {
      return;
    }
    const timestamp = Date.now();
    const operation = {
      type: WriteDbOperations.SET_VALUE,
      ref: PathUtil.getConsensusVotePath(proposalBlock.number, proposalBlock.hash, myAddr),
      value: {
        [PredefinedDbPaths.CONSENSUS_BLOCK_HASH]: proposalBlock.hash,
        [PredefinedDbPaths.CONSENSUS_STAKE]: validatorInfo.stake,
        [PredefinedDbPaths.CONSENSUS_IS_AGAINST]: false,
        [PredefinedDbPaths.CONSENSUS_VOTE_NONCE]: timestamp,
      }
    };
    const voteTx = this.node.createTransaction({ operation, nonce: -1, gas_price: 1, timestamp });
    const consensusMsg = this.encapsulateConsensusMessage(
        Transaction.toJsObject(voteTx), ConsensusMessageTypes.VOTE);
    this.handleConsensusMessage(consensusMsg);
  }

  tryVoteAgainstInvalidBlock(proposalBlock) {
    const LOG_HEADER = 'tryVoteAgainstInvalidBlock';
    logger.info(`[${LOG_HEADER}] Trying to vote against ${proposalBlock.number} / ` +
        `${proposalBlock.epoch} / ${proposalBlock.hash} / ${proposalBlock.proposer}`);
    if (this.votedForBlock(proposalBlock.hash)) {
      logger.info(`[${LOG_HEADER}] Already voted against block ${proposalBlock.hash}`);
      return;
    }
    const myAddr = this.node.account.address;
    // NOTE(liayoo): Try voting if I was one of the validators in the last notarized block. However,
    //               only the votes from the validators in next block's previous block will be counted.
    const lastNotarizedBlock = this.getLastNotarizedBlock();
    const validatorInfo = lastNotarizedBlock.validators[myAddr];
    if (!validatorInfo) {
      return;
    }
    const timestamp = Date.now();
    const operation = {
      type: WriteDbOperations.SET_VALUE,
      ref: PathUtil.getConsensusVotePath(proposalBlock.number, proposalBlock.hash, myAddr),
      value: {
        [PredefinedDbPaths.CONSENSUS_BLOCK_HASH]: proposalBlock.hash,
        [PredefinedDbPaths.CONSENSUS_STAKE]: validatorInfo.stake,
        [PredefinedDbPaths.CONSENSUS_IS_AGAINST]: true,
        [PredefinedDbPaths.CONSENSUS_OFFENSE_TYPE]: ValidatorOffenseTypes.INVALID_PROPOSAL,
        [PredefinedDbPaths.CONSENSUS_VOTE_NONCE]: timestamp,
      }
    };
    const voteTx = this.node.createTransaction({ operation, nonce: -1, gas_price: 1, timestamp });
    const consensusMsg = this.encapsulateConsensusMessage(
        Transaction.toJsObject(voteTx), ConsensusMessageTypes.VOTE);
    this.handleConsensusMessage(consensusMsg);
  }

  catchUp(blockList) {
    const LOG_HEADER = 'catchUp';
    if (!blockList || !blockList.length) return;
    let lastVerifiedBlockInfo;
    const lastNotarizedBlock = this.getLastNotarizedBlock();
    logger.info(`[${LOG_HEADER}] Current lastNotarizedBlock: ` +
        `${lastNotarizedBlock.number} / ${lastNotarizedBlock.epoch}`);
    for (const blockInfo of blockList) {
      logger.debug(`[${LOG_HEADER}] Adding notarized chain's block: ` +
          `${JSON.stringify(blockInfo, null, 2)}`);
      if (!blockInfo.block || !blockInfo.proposal) {
        break;
      }
      if (blockInfo.block.number < lastNotarizedBlock.number) {
        continue;
      }
      try {
        this.checkProposalBlockAndTx(blockInfo.block, blockInfo.proposal);
      } catch (e) {
        if (e instanceof ConsensusError) {
          e.log();
        } else {
          logger.error(`[${LOG_HEADER}] Error while checking proposal: ${e.stack}`);
          break;
        }
      }
      if (!lastVerifiedBlockInfo || lastVerifiedBlockInfo.block.epoch < blockInfo.block.epoch) {
        lastVerifiedBlockInfo = blockInfo;
      }
    }
    this.node.tryFinalizeChain();
    if (lastVerifiedBlockInfo) {
      logger.debug(`[${LOG_HEADER}] voting for the last verified block: ` +
          `${lastVerifiedBlockInfo.block.number} / ${lastVerifiedBlockInfo.block.epoch}`);
      this.tryVoteForValidBlock(lastVerifiedBlockInfo.block);
      if (lastVerifiedBlockInfo.votes) {
        for (const vote of lastVerifiedBlockInfo.votes) {
          this.checkVoteTx(vote);
        }
      }
    }
  }

  getLongestNotarizedChain() {
    const lastNotarizedBlock = this.getLastNotarizedBlock();
    return this.node.bp.getExtendingChain(lastNotarizedBlock.hash, false, true);
  }

  // Returns the last block of the longest notarized chain that was proposed
  // in the most recent epoch.
  getLastNotarizedBlock() {
    const LOG_HEADER = 'getLastNotarizedBlock';
    let candidate = this.node.bc.lastBlock();
    logger.debug(`[${LOG_HEADER}] longestNotarizedChainTips: ` +
        `${JSON.stringify(this.node.bp.longestNotarizedChainTips, null, 2)}`);
    this.node.bp.longestNotarizedChainTips.forEach((chainTip) => {
      const block = _.get(this.node.bp.hashToBlockInfo[chainTip], 'block');
      if (!block) return;
      if (block.epoch > candidate.epoch) candidate = block;
    });
    return candidate;
  }

  getCatchUpInfo() {
    let res = [];
    if (!this.node.bp) {
      return res;
    }
    this.node.bp.longestNotarizedChainTips.forEach((chainTip) => {
      const { chain } = this.node.bp.getExtendingChain(chainTip, true);
      res = _.unionWith(res, chain, (a, b) => _.get(a, 'block.hash') === _.get(b, 'block.hash'));
    });
    return res;
  }

  getSnapDb(latestBlock) {
    const LOG_HEADER = 'getSnapDb';
    const lastFinalizedHash = this.node.bc.lastBlock().hash;
    const chain = [];
    let currBlock = latestBlock;
    let blockHash = currBlock.hash;
    while (currBlock && blockHash !== '' && blockHash !== lastFinalizedHash &&
        !this.node.bp.hashToDb.has(blockHash)) {
      chain.unshift(currBlock);
      // previous block of currBlock
      currBlock = _.get(this.node.bp.hashToBlockInfo[currBlock.last_hash], 'block');
      blockHash = currBlock ? currBlock.hash : '';
    }
    if (!currBlock || blockHash === '') {
      logger.error(`[${LOG_HEADER}] No currBlock (${currBlock}) or blockHash (${blockHash})`);
      return null;
    }

    let proposalTx = null;
    for (let i = 0; i < chain.length; i++) {
      // apply last_votes and transactions
      const block = chain[i];
      proposalTx = i < chain.length - 1 ? ConsensusUtil.filterProposalFromVotes(chain[i + 1].last_votes) : null;
      logger.debug(`[${LOG_HEADER}] applying block ${JSON.stringify(block)}`);
      try {
        Consensus.validateAndExecuteBlockOnDb(block, this.node, StateVersions.SNAP, proposalTx);
      } catch (e) {
        logger.error(`[${LOG_HEADER}] Failed to validate and execute block ${block.number}: ${e}`);
        return null;
      }
    }
    return this.node.bp.hashToDb.get(latestBlock.hash);
  }

  getValidatorsVotedFor(blockHash) {
    const LOG_HEADER = 'getValidatorsVotedFor';
    const blockInfo = this.node.bp.hashToBlockInfo[blockHash];
    if (!blockInfo || !blockInfo.votes || !blockInfo.votes.length) {
      logger.error(`[${LOG_HEADER}] No validators voted`);
      throw Error('No validators voted');
    }
    logger.debug(
        `[${LOG_HEADER}] current epoch: ${this.epoch}\nblock hash: ${blockHash}` +
        `\nvotes: ${JSON.stringify(blockInfo.votes, null, 2)}`);
    const validators = {};
    blockInfo.votes.forEach((voteTx) => {
      validators[voteTx.address] = _.get(voteTx, 'tx_body.operation.value.stake');
    });

    return validators;
  }

  getWhitelist(stateVersion) {
    const LOG_HEADER = 'getWhitelist';
    const stateRoot = this.node.stateManager.getRoot(stateVersion);
    const whitelist = DB.getValueFromStateRoot(stateRoot, PathUtil.getConsensusWhitelistPath());
    logger.debug(`[${LOG_HEADER}] whitelist: ${JSON.stringify(whitelist, null, 2)}`);
    return whitelist || {};
  }

  getValidators(blockHash, blockNumber, stateVersion) {
    const LOG_HEADER = 'getValidators';
    let candidates = [];
    const validators = {};
    // Need the block #1 to be finalized to have the stakes reflected in the state.
    if (this.node.bc.lastBlockNumber() < 1) {
      for (const address of Object.keys(GENESIS_WHITELIST)) {
        const stake = this.getConsensusStakeFromAddr(stateVersion, address);
        if (stake && stake >= MIN_STAKE_PER_VALIDATOR && stake <= MAX_STAKE_PER_VALIDATOR) {
          validators[address] = {
            [PredefinedDbPaths.CONSENSUS_STAKE]: stake,
            [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true
          };
        }
      }
      logger.debug(`[${LOG_HEADER}] validators: ${JSON.stringify(validators)}`);
      return validators;
    }
    const db = this.node.bp.hashToDb.get(blockHash);
    stateVersion = this.node.bc.lastBlock().hash === blockHash ?
        this.node.stateManager.getFinalVersion() : (db ? db.stateVersion : null);
    if (!stateVersion) {
      const err = `[${LOG_HEADER}] No stateVersion found for block ${blockHash}, ${blockNumber}`;
      logger.error(err);
      throw Error(err);
    }
    const whitelist = this.getWhitelist(stateVersion);
    const stateRoot = this.node.stateManager.getRoot(stateVersion);
    const allStakeInfo = DB.getValueFromStateRoot(
        stateRoot, PathUtil.getStakingServicePath(PredefinedDbPaths.CONSENSUS)) || {};
    for (const [address, stakeInfo] of Object.entries(allStakeInfo)) {
      const stake = this.getConsensusStakeFromAddr(stateVersion, address);
      if (stake) {
        if (whitelist[address] === true) {
          if (stake >= MIN_STAKE_PER_VALIDATOR && stake <= MAX_STAKE_PER_VALIDATOR) {
            validators[address] = {
              [PredefinedDbPaths.CONSENSUS_STAKE]: stake,
              [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true
            };
          }
        } else {
          candidates.push({
            address,
            stake,
            expireAt: _.get(stakeInfo, `0.${PredefinedDbPaths.STAKING_EXPIRE_AT}`, 0)
          });
        }
      }
    }
    // NOTE(liayoo): tie-breaking by addresses as a temporary solution.
    candidates = _.orderBy(candidates, ['stake', 'expireAt', 'address'], ['desc', 'desc', 'asc']);
    for (const candidate of candidates) {
      if (Object.keys(validators).length < MAX_NUM_VALIDATORS) {
        validators[candidate.address] = {
          [PredefinedDbPaths.CONSENSUS_STAKE]: candidate.stake,
          [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: false
        };
      } else {
        break;
      }
    }
    logger.debug(`[${LOG_HEADER}] validators: ${JSON.stringify(validators, null, 2)}, ` +
        `whitelist: ${JSON.stringify(whitelist, null, 2)}`);
    return validators;
  }

  getConsensusStakeFromAddr(stateVersion, address) {
    const stateRoot = this.node.stateManager.getRoot(stateVersion);
    return DB.getValueFromStateRoot(
        stateRoot, PathUtil.getConsensusStakingAccountBalancePath(address)) || 0;
  }

  votedForEpoch(epoch) {
    const blockHash = this.node.bp.epochToBlock[epoch];
    if (!blockHash) return false;
    const blockInfo = this.node.bp.hashToBlockInfo[blockHash];
    if (!blockInfo || !blockInfo.votes) return false;
    const myAddr = this.node.account.address;
    return blockInfo.votes.find((vote) => vote.address === myAddr) !== undefined;
  }

  votedForBlock(blockHash) {
    const blockInfo = this.node.bp.hashToBlockInfo[blockHash] || this.node.bp.hashToInvalidBlockInfo[blockHash];
    if (!blockInfo || !blockInfo.votes) return false;
    const myAddr = this.node.account.address;
    return blockInfo.votes.find((vote) => vote.address === myAddr) !== undefined;
  }

  stake(amount) {
    const LOG_HEADER = 'stake';
    if (!amount || amount <= 0) {
      logger.error(`[${LOG_HEADER}] Invalid staking amount received: ${amount}`);
      return null;
    }

    const operation = {
      type: WriteDbOperations.SET_VALUE,
      ref: PathUtil.getStakingStakeRecordValuePath(
          PredefinedDbPaths.CONSENSUS, this.node.account.address, 0, PushId.generate()),
      value: amount
    };
    const stakeTx = this.node.createTransaction({ operation, nonce: -1, gas_price: 1 });
    return stakeTx;
  }

  isRunning() {
    return this.state === ConsensusStates.RUNNING;
  }

  setState(state) {
    const LOG_HEADER = 'setState';
    logger.info(`[${LOG_HEADER}] Setting consensus state from ${this.state} to ${state}`);
    this.state = state;
    this.stateChangedBlockNumber = this.node.bc.lastBlockNumber();
  }

  /**
   * Dumps the raw consensus and block pool's states
   * {
   *   consensus: {
   *     epoch,
   *     proposer
   *   },
   *   block_pool: {
   *     hashToBlockInfo,
   *     hashToDb,
   *     hashToNextBlockSet,
   *     epochToBlock,
   *     numberToBlockSet,
   *     longestNotarizedChainTips
   *   }
   * }
   */
  getRawStatus() {
    const result = {};
    result.consensus =
        Object.assign({}, { epoch: this.epoch, proposer: this.proposer }, { state: this.state });
    if (this.node.bp) {
      result.block_pool = {
        hashToBlockInfo: this.node.bp.hashToBlockInfo,
        hashToInvalidBlockInfo: this.node.bp.hashToInvalidBlockInfo,
        hashToDb: Array.from(this.node.bp.hashToDb.keys()),
        hashToNextBlockSet: Object.keys(this.node.bp.hashToNextBlockSet)
          .reduce((acc, curr) => {
            return Object.assign(acc, {[curr]: [...this.node.bp.hashToNextBlockSet[curr]]})
          }, {}),
        epochToBlock: Object.keys(this.node.bp.epochToBlock),
        numberToBlockSet: Object.keys(this.node.bp.numberToBlockSet),
        longestNotarizedChainTips: this.node.bp.longestNotarizedChainTips
      }
    }
    return result;
  }

  /**
   * Returns the basic status of consensus to see if blocks are being produced
   * {
   *   health,
   *   state,
   *   stateNumeric,
   *   epoch,
   *   validators,
   *   globalTimeSyncStatus
   * }
   */
  getStatus() {
    const lastFinalizedBlock = this.node.bc.lastBlock();
    const validators = this.validators;
    const globalTimeSyncStatus = this.ntpData;

    for (const validatorInfo of Object.values(validators)) {
      validatorInfo.voting_right = true;
    }

    let health;
    if (!lastFinalizedBlock) {
      health = false;
    } else {
      health = (this.epoch - lastFinalizedBlock.epoch) < ConsensusConsts.HEALTH_THRESHOLD_EPOCH;
    }
    return {
      health,
      state: this.state,
      stateNumeric: Object.keys(ConsensusStates).indexOf(this.state),
      epoch: this.epoch,
      validators,
      globalTimeSyncStatus,
    };
  }

  encapsulateConsensusMessage(value, type) {
    const LOG_HEADER = 'encapsulateConsensusMessage';
    if (!value) {
      logger.error(`[${LOG_HEADER}] The value cannot be empty for consensus message.`);
      return null;
    }
    if (!type) {
      logger.error(`[${LOG_HEADER}] The consensus type should be specified.`);
      return null;
    }
    return {
      value: value,
      type: type,
      consensusProtoVer: this.consensusProtocolVersion
    };
  }

  static selectProposer(seed, validators) {
    const LOG_HEADER = 'selectProposer';
    logger.debug(`[${LOG_HEADER}] seed: ${seed}, validators: ${JSON.stringify(validators)}`);
    const validatorsWithProducingRights = _.pickBy(validators, (x) => {
      return _.get(x, PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT) === true;
    });
    const alphabeticallyOrderedValidators = Object.keys(validatorsWithProducingRights).sort();
    const totalAtStake = ConsensusUtil.getTotalAtStake(validatorsWithProducingRights);
    const randomNumGenerator = seedrandom(seed);
    const targetValue = randomNumGenerator() * totalAtStake;
    let cumulative = 0;
    for (let i = 0; i < alphabeticallyOrderedValidators.length; i++) {
      const addr = alphabeticallyOrderedValidators[i];
      cumulative += validatorsWithProducingRights[addr][PredefinedDbPaths.CONSENSUS_STAKE];
      if (cumulative > targetValue) {
        logger.info(`Proposer is ${addr}`);
        return addr;
      }
    }
    logger.error(
        `[${LOG_HEADER}] Failed to get the proposer.\n` +
        `alphabeticallyOrderedValidators: ${alphabeticallyOrderedValidators}\n` +
        `totalAtStake: ${totalAtStake}\nseed: ${seed}\ntargetValue: ${targetValue}`);
    return null;
  }
}

module.exports = Consensus;
