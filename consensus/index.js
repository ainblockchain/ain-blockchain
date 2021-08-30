const seedrandom = require('seedrandom');
const _ = require('lodash');
const ntpsync = require('ntpsync');
const sizeof = require('object-sizeof');
const semver = require('semver');
const logger = require('../logger')('CONSENSUS');
const { Block } = require('../blockchain/block');
const BlockPool = require('./block-pool');
const Transaction = require('../tx-pool/transaction');
const PushId = require('../db/push-id');
const CommonUtil = require('../common/common-util');
const {
  WriteDbOperations,
  ReadDbOperations,
  PredefinedDbPaths,
  GenesisSharding,
  ShardingProperties,
  ProofProperties,
  StateVersions,
  TX_BYTES_LIMIT,
  MAX_SHARD_REPORT,
  GENESIS_WHITELIST,
  LIGHTWEIGHT,
  MIN_NUM_VALIDATORS,
  MAX_NUM_VALIDATORS,
  MIN_STAKE_PER_VALIDATOR,
  MAX_STAKE_PER_VALIDATOR,
  EPOCH_MS,
  CONSENSUS_PROTOCOL_VERSION,
} = require('../common/constants');
const {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStates,
  ValidatorOffenseTypes,
} = require('./constants');
const {
  signAndSendTx,
  sendGetRequest
} = require('../common/network-util');
const ConsensusUtil = require('./consensus-util');
const PathUtil = require('../common/path-util');
const VersionUtil = require('../common/version-util');
const DB = require('../db');

const parentChainEndpoint = GenesisSharding[ShardingProperties.PARENT_CHAIN_POC] + '/json-rpc';
const shardingPath = GenesisSharding[ShardingProperties.SHARDING_PATH];
const reportingPeriod = GenesisSharding[ShardingProperties.REPORTING_PERIOD];
const txSizeThreshold = TX_BYTES_LIMIT * 0.9;

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
    this.isReporting = false;
    this.isInEpochTransition = false;
    // epoch increases by 1 every EPOCH_MS,
    // and at each epoch a new proposer is pseudo-randomly selected.
    this.epoch = 1;
    this.proposer = null;
    // This feature is only used when LIGHTWEIGHT=true.
    this.cache = {};
    this.lastReportedBlockNumberSent = -1;
  }

  init(lastBlockWithoutProposal) {
    const LOG_HEADER = 'Consensus.init';
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
      this.blockPool = new BlockPool(this.node, lastBlockWithoutProposal);
      this.setState(ConsensusStates.RUNNING);
      this.startEpochTransition();
      logger.info(
          `[${LOG_HEADER}] Initialized to number ${finalizedNumber} and epoch ${this.epoch}`);
    } catch (err) {
      logger.error(`[${LOG_HEADER}] Init error: ${err} ${err.stack}`);
      this.setState(ConsensusStates.STARTING);
    }
  }

  startEpochTransition() {
    const LOG_HEADER = 'startEpochTransition';
    const genesisBlock = Block.genesis();
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
      this.tryFinalize();
      let currentTime = Date.now();
      if (this.epoch % 100 === 0) {
        // adjust time
        try {
          const iNTPData = await ntpsync.ntpLocalClockDeltaPromise();
          logger.debug(`(Local Time - NTP Time) Delta = ${iNTPData.minimalNTPLatencyDelta} ms`);
          this.timeAdjustment = iNTPData.minimalNTPLatencyDelta;
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
    }
    // Need the block#1 to be finalized to have the stakes reflected in the state
    const validators = this.node.bc.lastBlockNumber() < 1 ? lastNotarizedBlock.validators
        : this.getValidators(lastNotarizedBlock.hash, lastNotarizedBlock.number);

    // FIXME(liayoo): Make the seeds more secure and unpredictable.
    // const seed = '' + this.genesisHash + this.epoch;
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
      if (proposalBlock.number > lastNotarizedBlock.number + 1) {
        logger.info(`[${LOG_HEADER}] Trying to sync. Current last block number: ` +
            `${lastNotarizedBlock.number}, proposal block number ${proposalBlock.number}`);
        // I might be falling behind. Try to catch up.
        // FIXME(liayoo): This has a possibility of being exploited by an attacker. The attacker
        // can keep sending messages with higher numbers, making the node's status unsynced, and
        // prevent the node from getting/handling messages properly.
        // this.node.state = BlockchainNodeStates.SYNCING;
        Object.values(this.server.client.outbound).forEach((node) => {
          this.server.client.requestChainSegment(node.socket, this.node.bc.lastBlock());
        });
        return;
      }
      if (!ConsensusUtil.isValidConsensusTx(proposalTx)) {
        logger.info(`[${LOG_HEADER}] Invalid consensus tx: ${JSON.stringify(proposalTx)}`);
        return;
      }
      const proposalCheck = this.checkProposal(proposalBlock, proposalTx);
      if (proposalCheck === true) {
        this.server.client.broadcastConsensusMessage(msg);
        this.tryVoteForValidBlock(proposalBlock);
      } else if (proposalCheck.voteAgainst) {
        this.blockPool.addSeenBlock(proposalBlock, proposalTx, false);
        this.server.client.broadcastConsensusMessage(msg);
        this.tryVoteAgainstInvalidBlock(proposalBlock, proposalTx);
      }
    } else {
      if (this.node.tp.transactionTracker[msg.value.hash]) {
        logger.debug(`[${LOG_HEADER}] Already have the vote in my tx tracker`);
        return;
      }
      if (!ConsensusUtil.isValidConsensusTx(msg.value) || !this.checkVoteTx(msg.value)) {
        logger.info(`[${LOG_HEADER}] Invalid vote tx: ${JSON.stringify(msg.value)}`);
        return;
      }
      this.server.client.broadcastConsensusMessage(msg);
    }
  }

  // proposing for block #N :
  //    1. create a block (with last_votes)
  //    2. create a tx (/consensus/number/N/propose: { block_hash, ... })
  //    3. broadcast tx + block (i.e. call handleConsensusMessage())
  //    4. verify block
  //    5. execute propose tx
  //    6. Nth propose tx should be included in the N+1th block's last_votes
  createProposal() {
    const LOG_HEADER = 'createProposal';
    const longestNotarizedChain = this.getLongestNotarizedChain();
    const lastBlock = longestNotarizedChain && longestNotarizedChain.length ?
        longestNotarizedChain[longestNotarizedChain.length - 1] : this.node.bc.lastBlock();
    const blockNumber = lastBlock.number + 1;

    if (blockNumber > 1 && LIGHTWEIGHT && this.cache[blockNumber]) {
      logger.error(`Already proposed ${blockNumber} / ${this.cache[blockNumber]}`);
      return null;
    }

    const baseVersion = lastBlock.number === this.node.bc.lastBlockNumber() ?
        this.node.stateManager.getFinalVersion() :
            this.blockPool.hashToDb.get(lastBlock.hash).stateVersion;
    const tempDb = this.node.createTempDb(
        baseVersion, `${StateVersions.CONSENSUS_CREATE}:${lastBlock.number}:${blockNumber}`,
        lastBlock.number - 1);
    if (!tempDb) {
      logger.error(`Failed to create a temp database with state version: ${baseVersion}.`);
      return null;
    }
    const lastBlockInfo = this.blockPool.hashToBlockInfo[lastBlock.hash];
    logger.debug(`[${LOG_HEADER}] lastBlockInfo: ${JSON.stringify(lastBlockInfo, null, 2)}`);

    const myAddr = this.node.account.address;
    // Need the block #1 to be finalized to have the stakes reflected in the state
    let validators = {};
    if (this.node.bc.lastBlockNumber() < 1) {
      const whitelist = GENESIS_WHITELIST;
      for (const address of Object.keys(whitelist)) {
        const stake = tempDb.getValue(PathUtil.getConsensusStakingAccountBalancePath(address));
        if (stake && stake >= MIN_STAKE_PER_VALIDATOR && stake <= MAX_STAKE_PER_VALIDATOR) {
          validators[address] = {
            [PredefinedDbPaths.CONSENSUS_STAKE]: stake,
            [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true
          };
        }
      }
      logger.debug(`[${LOG_HEADER}] validators: ${JSON.stringify(validators)}`);
    } else {
      validators = this.getValidators(lastBlock.hash, lastBlock.number);
    }
    const numValidators = Object.keys(validators).length;
    if (!validators || !numValidators) {
      tempDb.destroyDb();
      throw Error('No whitelisted validators');
    }
    if (numValidators < MIN_NUM_VALIDATORS) {
      tempDb.destroyDb();
      throw Error(`Not enough validators: ${JSON.stringify(validators)}`);
    }
    const totalAtStake = Object.values(validators).reduce((acc, cur) => {
      return acc + cur[PredefinedDbPaths.CONSENSUS_STAKE];
    }, 0);

    // FIXME(minsulee2 or liayoo): When I am behind and a newly coming node is ahead of me,
    // then I cannot get lastBlockInfo from the block-pool. So that, it is not able to create
    // a proper block proposal and also cannot pass checkProposal()
    // where checking prevBlockInfo.notarized.
    const lastVotes = blockNumber > 1 && lastBlockInfo.votes ? [...lastBlockInfo.votes] : [];
    if (lastBlockInfo && lastBlockInfo.proposal) {
      lastVotes.unshift(lastBlockInfo.proposal);
    }

    this.node.removeOldReceipts(blockNumber, tempDb);

    for (const voteTx of lastVotes) {
      if (CommonUtil.isFailedTx(tempDb.executeTransaction(Transaction.toExecutable(voteTx), true))) {
        logger.debug(`[${LOG_HEADER}] failed to execute last vote: ${JSON.stringify(voteTx, null, 2)}`);
        tempDb.destroyDb();
        return null;
      }
    }
    const { offenses, evidence } = this.blockPool.getOffensesAndEvidence(validators, tempDb);
    const transactions = this.node.tp.getValidTransactions(longestNotarizedChain, tempDb.stateVersion);
    const validTransactions = [];
    const invalidTransactions = [];
    const resList = [];
    for (const tx of transactions) {
      const res = tempDb.executeTransaction(Transaction.toExecutable(tx), false, true, blockNumber);
      if (CommonUtil.txPrecheckFailed(res)) {
        logger.debug(`[${LOG_HEADER}] failed to execute transaction:\n${JSON.stringify(tx, null, 2)}\n${JSON.stringify(res, null, 2)})`);
        invalidTransactions.push(tx);
      } else {
        validTransactions.push(tx);
        resList.push(res);
      }
    }
    const { gasAmountTotal, gasCostTotal } =
        CommonUtil.getServiceGasCostTotalFromTxList(validTransactions, resList);

    // Once successfully executed txs (when submitted to tx pool) can become invalid
    // after some blocks are created. Remove those transactions from tx pool.
    this.node.tp.removeInvalidTxsFromPool(invalidTransactions);
    const stateProofHash = LIGHTWEIGHT ? '' : tempDb.getStateProof('/')[ProofProperties.PROOF_HASH];
    const proposalBlock = Block.create(
        lastBlock.hash, lastVotes, evidence, validTransactions, blockNumber, this.epoch,
        stateProofHash, myAddr, validators, gasAmountTotal, gasCostTotal);

    let proposalTx;
    const proposeOp = {
      type: WriteDbOperations.SET_VALUE,
      ref: PathUtil.getConsensusProposePath(blockNumber),
      value: {
        number: blockNumber,
        epoch: this.epoch,
        validators,
        total_at_stake: totalAtStake,
        proposer: myAddr,
        block_hash: proposalBlock.hash,
        last_hash: proposalBlock.last_hash,
        timestamp: proposalBlock.timestamp,
        gas_cost_total: gasCostTotal
      }
    }
    if (!CommonUtil.isEmpty(offenses)) {
      proposeOp.value.offenses = offenses;
    }

    if (blockNumber <= ConsensusConsts.MAX_CONSENSUS_STATE_DB) {
      proposalTx =
          this.node.createTransaction({ operation: proposeOp, nonce: -1, gas_price: 1 });
    } else {
      const setOp = {
        type: WriteDbOperations.SET,
        op_list: [
          proposeOp,
          {
            type: WriteDbOperations.SET_VALUE,
            ref: CommonUtil.formatPath([
              PredefinedDbPaths.CONSENSUS,
              PredefinedDbPaths.CONSENSUS_NUMBER,
              blockNumber - ConsensusConsts.MAX_CONSENSUS_STATE_DB
            ]),
            value: null
          }
        ]
      };
      proposalTx = this.node.createTransaction({ operation: setOp, nonce: -1, gas_price: 1 });
    }
    if (LIGHTWEIGHT) {
      this.cache[blockNumber] = proposalBlock.hash;
    }
    tempDb.destroyDb();
    return { proposalBlock, proposalTx: Transaction.toJsObject(proposalTx) };
  }

  checkProposal(proposalBlock, proposalTx) {
    const LOG_HEADER = 'checkProposal';
    const block = Block.parse(proposalBlock);
    if (!block) {
      logger.error(`[${LOG_HEADER}] Invalid block: ${JSON.stringify(proposalBlock)}`);
      return { voteAgainst: false };
    }
    const { proposer, number, epoch, hash, last_hash, validators, last_votes, transactions,
        gas_amount_total, gas_cost_total, state_proof_hash } = block;

    logger.info(`[${LOG_HEADER}] Checking block proposal: ${number} / ${epoch}`);
    if (this.blockPool.hasSeenBlock(proposalBlock)) {
      logger.info(`[${LOG_HEADER}] Proposal already seen`);
      return { voteAgainst: false };
    }
    if (proposalTx.address !== proposer) {
      logger.error(`[${LOG_HEADER}] Transaction signer and proposer are different`);
      return { voteAgainst: false };
    }
    const blockHash = ConsensusUtil.getBlockHashFromConsensusTx(proposalTx);
    if (blockHash !== hash) {
      logger.error(`[${LOG_HEADER}] The block_hash value in proposalTx (${blockHash}) and ` +
          `the actual proposalBlock's hash (${hash}) don't match`);
      return { voteAgainst: true };
    }
    if (!LIGHTWEIGHT) {
      if (!Block.validateProposedBlock(proposalBlock)) {
        logger.error(`[${LOG_HEADER}] Proposed block didn't pass the basic checks`);
        return { voteAgainst: true };
      }
    }
    if (number <= this.node.bc.lastBlockNumber()) {
      logger.info(`[${LOG_HEADER}] There already is a finalized block of the number`);
      logger.debug(`[${LOG_HEADER}] corresponding block info: ` +
          `${JSON.stringify(this.blockPool.hashToBlockInfo[hash], null, 2)}`);
      if (!this.blockPool.hasSeenBlock(proposalBlock)) {
        logger.debug(`[${LOG_HEADER}] Adding the proposal to the blockPool for later use`);
        this.blockPool.addSeenBlock(proposalBlock, proposalTx);
      }
      return { voteAgainst: false };
    }
    // If I don't have enough votes for prevBlock, see last_votes of proposalBlock if
    // those can notarize the prevBlock (verify, execute and add the missing votes)
    let prevBlockInfo = number === 1 ?
        this.node.bc.getBlockByNumber(0) : this.blockPool.hashToBlockInfo[last_hash];
    logger.debug(`[${LOG_HEADER}] prevBlockInfo: ${JSON.stringify(prevBlockInfo, null, 2)}`);
    if (number !== 1 && (!prevBlockInfo || !prevBlockInfo.block)) {
      logger.debug(`[${LOG_HEADER}] No notarized block at number ${number - 1} with ` +
          `hash ${last_hash}`);
      return { voteAgainst: false };
    }
    const prevBlock = number > 1 ? prevBlockInfo.block : prevBlockInfo;

    // Make sure we have validators within MIN_NUM_VALIDATORS and MAX_NUM_VALIDATORS.
    if (Object.keys(validators).length < MIN_NUM_VALIDATORS || Object.keys(validators).length > MAX_NUM_VALIDATORS) {
      logger.error(
          `[${LOG_HEADER}] Invalid validator set size (${JSON.stringify(validators)})\n` +
          `MIN_NUM_VALIDATORS: ${MIN_NUM_VALIDATORS}, MAX_NUM_VALIDATORS: ${MAX_NUM_VALIDATORS}`);
      return { voteAgainst: true };
    }

    if (number !== 1 && !prevBlockInfo.notarized) {
      // Try applying the last_votes of proposalBlock and see if that makes the prev block notarized
      const prevBlockProposal = ConsensusUtil.filterProposalFromVotes(last_votes);
      if (!prevBlockProposal) {
        logger.error(`[${LOG_HEADER}] Proposal block is missing its prev block's proposal ` +
            'in last_votes');
        return { voteAgainst: true };
      }
      if (!prevBlockInfo.proposal) {
        if (number === this.node.bc.lastBlockNumber() + 1) {
          // TODO(liayoo): Do more checks on the prevBlockProposal.
          this.blockPool.addSeenBlock(prevBlockInfo.block, prevBlockProposal);
        } else {
          logger.debug(`[${LOG_HEADER}] Prev block is missing its proposal`);
          return { voteAgainst: false };
        }
      }
      let baseVersion;
      let prevDb;
      let isSnapDb = false;
      if (prevBlock.number === this.node.bc.lastBlockNumber()) {
        baseVersion = this.node.stateManager.getFinalVersion();
      } else if (this.blockPool.hashToDb.has(last_hash)) {
        baseVersion = this.blockPool.hashToDb.get(last_hash).stateVersion;
      } else {
        prevDb = this.getSnapDb(prevBlock);
        isSnapDb = true;
        if (!prevDb) {
          logger.error(`[${LOG_HEADER}] Previous db state doesn't exist`);
          return { voteAgainst: false };
        }
        baseVersion = prevDb.stateVersion;
      }
      const tempDb = this.node.createTempDb(
          baseVersion, `${StateVersions.CONSENSUS_VOTE}:${prevBlock.number}:${number}`,
          prevBlock.number - 1);
      if (!tempDb) {
        logger.error(`Failed to create a temp database with state version: ${baseVersion}.`);
        return { voteAgainst: false };
      }
      if (isSnapDb) {
        prevDb.destroyDb();
      }
      for (const voteTx of last_votes) {
        if (voteTx.hash === prevBlockProposal.hash) continue;
        if (!ConsensusUtil.isValidConsensusTx(voteTx) ||
            CommonUtil.isFailedTx(
                tempDb.executeTransaction(Transaction.toExecutable(voteTx), true))) {
          logger.error(`[${LOG_HEADER}] voting tx execution for prev block failed`);
          tempDb.destroyDb();
          return { voteAgainst: true };
        } else {
          this.blockPool.addSeenVote(voteTx);
        }
      }
      tempDb.destroyDb();
      prevBlockInfo = this.blockPool.hashToBlockInfo[last_hash];
      if (!prevBlockInfo.notarized) {
        logger.error(`[${LOG_HEADER}] Block's last_votes don't correctly notarize ` +
            `its previous block of number ${number - 1} with hash ` +
            `${last_hash}:\n${JSON.stringify(this.blockPool.hashToBlockInfo[last_hash], null, 2)}`);
        return { voteAgainst: true };
      }
    }

    if (prevBlock.epoch >= epoch) {
      logger.error(`[${LOG_HEADER}] Previous block's epoch (${prevBlock.epoch}) ` +
          `is greater than or equal to incoming block's (${epoch})`);
      return { voteAgainst: true };
    }
    const seed = '' + prevBlock.last_votes_hash + epoch;
    const expectedProposer = Consensus.selectProposer(seed, validators);
    if (expectedProposer !== proposer) {
      logger.error(`[${LOG_HEADER}] Proposer is not the expected node (expected: ` +
          `${expectedProposer} / actual: ${proposer})`);
      return { voteAgainst: true };
    }
    let baseVersion;
    let prevDb;
    let isSnapDb = false;
    if (prevBlock.number === this.node.bc.lastBlockNumber()) {
      baseVersion = this.node.stateManager.getFinalVersion();
    } else if (this.blockPool.hashToDb.has(last_hash)) {
      baseVersion = this.blockPool.hashToDb.get(last_hash).stateVersion;
    } else {
      prevDb = this.getSnapDb(prevBlock);
      if (!prevDb) {
        logger.error(`[${LOG_HEADER}] Previous db state doesn't exist`);
        return { voteAgainst: false };
      }
      isSnapDb = true;
      baseVersion = prevDb.stateVersion;
    }
    const newDb = this.node.createTempDb(
        baseVersion, `${StateVersions.POOL}:${prevBlock.number}:${number}`, prevBlock.number);
    if (!newDb) {
      logger.error(`Failed to create a temp database with state version: ${baseVersion}.`);
      return { voteAgainst: false };
    }
    if (isSnapDb) {
      prevDb.destroyDb();
    }

    // Check last_votes if they indeed voted for the previous block.
    const totalAtStake = Object.values(prevBlock.validators).reduce((acc, cur) => {
      return acc + _.get(cur, 'stake', 0);
    }, 0);
    const majority = totalAtStake * ConsensusConsts.MAJORITY;
    if (number > 1) {
      const lastVotesTallied = last_votes.reduce((acc, vote) => {
        if (!ConsensusUtil.isProposalTx(vote) && !ConsensusUtil.isAgainstVoteTx(vote) &&
            ConsensusUtil.getBlockHashFromConsensusTx(vote) === prevBlock.hash) {
          return acc + ConsensusUtil.getStakeFromVoteTx(vote);
        }
        return acc;
      }, 0);
      if (lastVotesTallied < majority) {
        logger.error(`[${LOG_HEADER}] Last votes don't meet the majority (${lastVotesTallied} < ${majority})\n${JSON.stringify(last_votes, null, 2)}`);
        newDb.destroyDb();
        return { voteAgainst: true };
      }
    }

    this.node.removeOldReceipts(number, newDb);
    if (!newDb.executeTransactionList(last_votes, true)) {
      logger.error(`[${LOG_HEADER}] Failed to execute last votes`);
      newDb.destroyDb();
      return { voteAgainst: true };
    }

    // Cross-check the offenses in proposalTx & the evidence in proposalBlock
    const offenses = ConsensusUtil.getOffensesFromProposalTx(proposalTx);
    const evidence = proposalBlock.evidence;
    if (CommonUtil.isEmpty(offenses) !== CommonUtil.isEmpty(evidence)) {
      logger.error(`[${LOG_HEADER}] Offenses and evidence don't match: ` +
          `${JSON.stringify(offenses)} / ${JSON.stringify(evidence)}`);
      newDb.destroyDb();
      return { voteAgainst: true };
    }
    if (!CommonUtil.isEmpty(evidence)) {
      for (const [offender, evidenceList] of Object.entries(evidence)) {
        const tempOffenses = {};
        for (const evidenceForOffense of evidenceList) {
          if (!CommonUtil.isValidatorOffenseType(evidenceForOffense.offense_type)) {
            newDb.destroyDb();
            return { voteAgainst: true };
          }
          const tallied = evidenceForOffense.votes.reduce((acc, vote) => {
            return acc + _.get(validators, `${vote.address}.stake`, 0);
          }, 0);
          if (tallied < majority) {
            logger.error(`[${LOG_HEADER}] Evidence votes don't meet the majority`);
            newDb.destroyDb();
            return { voteAgainst: true };
          }
          const txsRes = newDb.executeTransactionList(evidenceForOffense.votes, true);
          if (!txsRes) {
            logger.error(`[${LOG_HEADER}] Failed to execute evidence votes`);
            newDb.destroyDb();
            return { voteAgainst: true };
          }
          if (!tempOffenses[evidenceForOffense.offense_type]) {
            tempOffenses[evidenceForOffense.offense_type] = 0;
          }
          tempOffenses[evidenceForOffense.offense_type] += 1;
        }
        if (!_.isEqual(offenses[offender], tempOffenses, { strict: true })) {
          logger.error(`[${LOG_HEADER}] Invalid offense counts`);
          newDb.destroyDb();
          return { voteAgainst: true };
        }
      }
    }

    const txsRes = newDb.executeTransactionList(transactions, false, true, number);
    if (!txsRes) {
      logger.error(`[${LOG_HEADER}] Failed to execute transactions`);
      newDb.destroyDb();
      return { voteAgainst: true };
    }
    const { gasAmountTotal, gasCostTotal } =
        CommonUtil.getServiceGasCostTotalFromTxList(transactions, txsRes);
    if (gasAmountTotal !== gas_amount_total) {
      logger.error(`[${LOG_HEADER}] Invalid gas_amount_total`);
      newDb.destroyDb();
      return { voteAgainst: true };
    }
    if (gasCostTotal !== gas_cost_total) {
      logger.error(`[${LOG_HEADER}] Invalid gas_cost_total`);
      newDb.destroyDb();
      return { voteAgainst: true };
    }

    // Try executing the proposal tx on the proposal block's db state
    const executableTx = Transaction.toExecutable(proposalTx);
    if (!executableTx) {
      logger.error(`[${LOG_HEADER}] Failed to create a transaction with a proposal: ` +
          `${JSON.stringify(proposalTx, null, 2)}`);
      newDb.destroyDb();
      return { voteAgainst: true };
    }
    const tempDb = this.node.createTempDb(
        newDb.stateVersion, `${StateVersions.CONSENSUS_PROPOSE}:${prevBlock.number}:${number}`,
        prevBlock.number - 1);
    if (!tempDb) {
      logger.error(`Failed to create a temp database with state version: ${newDb.stateVersion}.`);
      newDb.destroyDb();
      return { voteAgainst: false };
    }
    const proposalTxExecRes = tempDb.executeTransaction(executableTx, true);
    if (CommonUtil.isFailedTx(proposalTxExecRes)) {
      logger.error(
          `[${LOG_HEADER}] Failed to execute the proposal tx: ` +
          `${JSON.stringify(proposalTxExecRes)}`);
      newDb.destroyDb();
      tempDb.destroyDb();
      return { voteAgainst: true };
    }
    tempDb.destroyDb();
    this.node.tp.addTransaction(executableTx);
    newDb.blockNumberSnapshot += 1;
    if (!LIGHTWEIGHT) {
      if (newDb.getStateProof('/')[ProofProperties.PROOF_HASH] !== state_proof_hash) {
        logger.error(`[${LOG_HEADER}] State proof hashes don't match: ` +
            `${newDb.getStateProof('/')[ProofProperties.PROOF_HASH]} / ` +
            `${state_proof_hash}\n\n${JSON.stringify(proposalBlock, null, 2)}`);
        return { voteAgainst: true };
      }
    }
    if (!this.blockPool.addSeenBlock(proposalBlock, proposalTx)) {
      newDb.destroyDb();
      return { voteAgainst: true };
    }
    this.blockPool.hashToDb.set(hash, newDb);
    if (!this.blockPool.longestNotarizedChainTips.includes(last_hash)) {
      logger.info(`[${LOG_HEADER}] Block is not extending one of the longest notarized chains ` +
          `(${JSON.stringify(this.blockPool.longestNotarizedChainTips, null, 2)})`);
      return { voteAgainst: false };
    }
    logger.info(`[${LOG_HEADER}] Verifed block proposal: ${number} / ${epoch}`);
    return true;
  }

  checkVoteTx(voteTx) {
    const LOG_HEADER = 'checkVoteTx';
    const blockHash = ConsensusUtil.getBlockHashFromConsensusTx(voteTx);
    const isAgainst = ConsensusUtil.isAgainstVoteTx(voteTx);
    const blockInfo = this.blockPool.hashToBlockInfo[blockHash] ||
        this.blockPool.hashToInvalidBlockInfo[blockHash];
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
    const executableTx = Transaction.toExecutable(voteTx);
    if (!executableTx) {
      logger.error(`[${LOG_HEADER}] Failed to create a transaction with a vote: ` +
          `${JSON.stringify(voteTx, null, 2)}`);
      return false;
    }
    let tempDb;
    if (isAgainst) {
      const offenseType = ConsensusUtil.getOffenseTypeFromVoteTx(voteTx);
      if (!CommonUtil.isValidatorOffenseType(offenseType)) {
        return false;
      }
      const lastBlock = this.node.bc.lastBlock();
      tempDb = this.node.createTempDb(
          this.node.stateManager.getFinalVersion(),
          `${StateVersions.SNAP}:${lastBlock.number}`, lastBlock.number);
    } else {
      tempDb = this.getSnapDb(block);
    }
    if (!tempDb) {
      logger.debug(
          `[${LOG_HEADER}] No state snapshot available for vote ${JSON.stringify(executableTx)}`);
      return false;
    }
    const voteTxRes = tempDb.executeTransaction(executableTx, true);
    tempDb.destroyDb();
    if (CommonUtil.isFailedTx(voteTxRes)) {
      logger.error(`[${LOG_HEADER}] Failed to execute the voting tx: ${JSON.stringify(voteTxRes)}`);
      return false;
    }
    this.node.tp.addTransaction(executableTx);
    this.blockPool.addSeenVote(voteTx);
    return true;
  }

  tryPropose() {
    const LOG_HEADER = 'tryPropose';

    if (this.votedForEpoch(this.epoch)) {
      logger.info(
          `[${LOG_HEADER}] Already voted for ${this.blockPool.epochToBlock[this.epoch]} ` +
          `at epoch ${this.epoch} but trying to propose at the same epoch`);
      return;
    }
    if (this.proposer && CommonUtil.areSameAddrs(this.proposer, this.node.account.address)) {
      logger.info(`[${LOG_HEADER}] I'm the proposer ${this.node.account.address}`);
      try {
        const proposal = this.createProposal();
        if (proposal !== null) {
          const consensusMsg = this.encapsulateConsensusMessage(
              proposal, ConsensusMessageTypes.PROPOSE);
          this.handleConsensusMessage(consensusMsg);
        }
      } catch (err) {
        logger.error(`[${LOG_HEADER}] Error while creating a proposal: ${err} ${err.stack}`);
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
    const isValidator = proposalBlock.validators[myAddr];
    if (!isValidator) {
      return;
    }
    const operation = {
      type: WriteDbOperations.SET_VALUE,
      ref: PathUtil.getConsensusVotePath(proposalBlock.number, proposalBlock.hash, myAddr),
      value: {
        [PredefinedDbPaths.CONSENSUS_BLOCK_HASH]: proposalBlock.hash,
        [PredefinedDbPaths.CONSENSUS_STAKE]: isValidator.stake,
        [PredefinedDbPaths.CONSENSUS_IS_AGAINST]: false,
      }
    };
    const voteTx = this.node.createTransaction({ operation, nonce: -1, gas_price: 1 });
    const consensusMsg = this.encapsulateConsensusMessage(
        Transaction.toJsObject(voteTx), ConsensusMessageTypes.VOTE);
    this.handleConsensusMessage(consensusMsg);
  }

  tryVoteAgainstInvalidBlock(proposalBlock, proposalTx) {
    const LOG_HEADER = 'tryVoteAgainstInvalidBlock';
    logger.info(`[${LOG_HEADER}] Trying to vote against ${proposalBlock.number} / ` +
        `${proposalBlock.epoch} / ${proposalBlock.hash}`);
    if (this.votedForBlock(proposalBlock.hash)) {
      logger.info(`[${LOG_HEADER}] Already voted against block ${proposalBlock.hash}`);
      return;
    }
    const myAddr = this.node.account.address;
    // NOTE(liayoo): Try voting if I was one of the validators in the last notarized block. However,
    //               only the votes from the validators in next block's previous block will be counted.
    const lastNotarizedBlock = this.getLastNotarizedBlock();
    const isValidator = lastNotarizedBlock.validators[myAddr];
    if (!isValidator) {
      return;
    }
    const operation = {
      type: WriteDbOperations.SET_VALUE,
      ref: PathUtil.getConsensusVotePath(proposalBlock.number, proposalBlock.hash, myAddr),
      value: {
        [PredefinedDbPaths.CONSENSUS_BLOCK_HASH]: proposalBlock.hash,
        [PredefinedDbPaths.CONSENSUS_STAKE]: isValidator.stake,
        [PredefinedDbPaths.CONSENSUS_IS_AGAINST]: true,
        [PredefinedDbPaths.CONSENSUS_OFFENSE_TYPE]: ValidatorOffenseTypes.INVALID_PROPOSAL,
      }
    };
    const voteTx = this.node.createTransaction({ operation, nonce: -1, gas_price: 1 });
    const consensusMsg = this.encapsulateConsensusMessage(
        Transaction.toJsObject(voteTx), ConsensusMessageTypes.VOTE);
    this.handleConsensusMessage(consensusMsg);
  }

  // If there's a notarized chain that ends with 3 blocks, which have 3 consecutive epoch numbers,
  // finalize up to second to the last block of that notarized chain.
  tryFinalize() {
    const LOG_HEADER = 'tryFinalize';
    const finalizableChain = this.blockPool.getFinalizableChain();
    logger.debug(`[${LOG_HEADER}] finalizableChain: ${JSON.stringify(finalizableChain, null, 2)}`);
    if (!finalizableChain || !finalizableChain.length) {
      logger.debug(`[${LOG_HEADER}] No notarized chain with 3 consecutive epochs yet`);
      return;
    }
    // Discard the last block (but save it for a future finalization)
    const recordedInvalidBlocks = new Set();
    for (let i = 0; i < finalizableChain.length - 1; i++) {
      const blockToFinalize = finalizableChain[i];
      if (blockToFinalize.number <= this.node.bc.lastBlockNumber()) {
        continue;
      }
      if (this.node.addNewBlock(blockToFinalize)) {
        logger.info(`[${LOG_HEADER}] Finalized a block of number ${blockToFinalize.number} and ` +
            `hash ${blockToFinalize.hash}`);
        const versionToFinalize = this.blockPool.hashToDb.get(blockToFinalize.hash).stateVersion;
        this.node.cloneAndFinalizeVersion(versionToFinalize, blockToFinalize.number);
        if (!CommonUtil.isEmpty(blockToFinalize.evidence)) {
          Object.values(blockToFinalize.evidence).forEach((evidenceList) => {
            evidenceList.forEach((val) => {
              if (val.offense_type === ValidatorOffenseTypes.INVALID_PROPOSAL) {
                recordedInvalidBlocks.add(val.block.hash);
              }
            });
          });
        }
      } else {
        logger.error(`[${LOG_HEADER}] Failed to finalize a block: ` +
            `${JSON.stringify(blockToFinalize, null, 2)}`);
        // FIXME: Stop consensus?
        return;
      }
    }
    this.blockPool.cleanUpAfterFinalization(
        finalizableChain[finalizableChain.length - 2], recordedInvalidBlocks);
    this.reportStateProofHashes();
  }

  catchUp(blockList) {
    const LOG_HEADER = 'catchUp';
    if (!blockList || !blockList.length) return;
    let lastVerifiedBlock;
    blockList.forEach((blockInfo) => {
      logger.debug(`[${LOG_HEADER}] Adding notarized chain's block: ` +
          `${JSON.stringify(blockInfo, null, 2)}`);
      const lastNotarizedBlock = this.getLastNotarizedBlock();
      logger.info(`[${LOG_HEADER}] Current lastNotarizedBlock: ` +
          `${lastNotarizedBlock.number} / ${lastNotarizedBlock.epoch}`);
      if (!blockInfo.block || !blockInfo.proposal ||
          blockInfo.block.number < lastNotarizedBlock.number) {
        return;
      }
      if (this.checkProposal(blockInfo.block, blockInfo.proposal) === true ||
          this.blockPool.hasSeenBlock(blockInfo.block)) {
        if (blockInfo.votes) {
          blockInfo.votes.forEach((vote) => {
            this.blockPool.addSeenVote(vote);
          });
        }
        if (!lastVerifiedBlock || lastVerifiedBlock.epoch < blockInfo.block.epoch) {
          lastVerifiedBlock = blockInfo.block;
        }
      }
    });

    this.tryFinalize();
    // Try voting for the last block
    if (lastVerifiedBlock) {
      logger.info(`[${LOG_HEADER}] voting for the last verified block: ` +
          `${lastVerifiedBlock.number} / ${lastVerifiedBlock.epoch}`);
      this.tryVoteForValidBlock(lastVerifiedBlock);
    }
  }

  getLongestNotarizedChain() {
    const lastNotarizedBlock = this.getLastNotarizedBlock();
    return this.blockPool.getExtendingChain(lastNotarizedBlock.hash);
  }

  // Returns the last block of the longest notarized chain that was proposed
  // in the most recent epoch.
  getLastNotarizedBlock() {
    const LOG_HEADER = 'getLastNotarizedBlock';
    let candidate = this.node.bc.lastBlock();
    logger.debug(`[${LOG_HEADER}] longestNotarizedChainTips: ` +
        `${JSON.stringify(this.blockPool.longestNotarizedChainTips, null, 2)}`);
    this.blockPool.longestNotarizedChainTips.forEach((chainTip) => {
      const block = _.get(this.blockPool.hashToBlockInfo[chainTip], 'block');
      if (!block) return;
      if (block.epoch > candidate.epoch) candidate = block;
    });
    return candidate;
  }

  getCatchUpInfo() {
    let res = [];
    if (!this.blockPool) {
      return res;
    }
    this.blockPool.longestNotarizedChainTips.forEach((chainTip) => {
      const chain = this.blockPool.getExtendingChain(chainTip, true);
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
        !this.blockPool.hashToDb.has(blockHash)) {
      chain.unshift(currBlock);
      // previous block of currBlock
      currBlock = _.get(this.blockPool.hashToBlockInfo[currBlock.last_hash], 'block');
      blockHash = currBlock ? currBlock.hash : '';
    }
    if (!currBlock || blockHash === '') {
      logger.error(`[${LOG_HEADER}] No currBlock (${currBlock}) or blockHash (${blockHash})`);
      return null;
    }

    // Create a DB for executing the block on.
    let baseVersion = StateVersions.EMPTY;
    if (this.blockPool.hashToDb.has(blockHash)) {
      baseVersion = this.blockPool.hashToDb.get(blockHash).stateVersion;
    } else if (blockHash === lastFinalizedHash) {
      baseVersion = this.node.stateManager.getFinalVersion();
    }
    const blockNumberSnapshot = chain.length ? chain[0].number : latestBlock.number;
    const snapDb = this.node.createTempDb(
        baseVersion, `${StateVersions.SNAP}:${currBlock.number}`, blockNumberSnapshot);
    if (!snapDb) {
      logger.error(`Failed to create a temp database with state version: ${baseVersion}.`);
      return null;
    }

    while (chain.length) {
      // apply last_votes and transactions
      const block = chain.shift();
      const blockNumber = block.number;
      logger.debug(`[${LOG_HEADER}] applying block ${JSON.stringify(block)}`);
      const executeRes = this.node.applyBlocksToDb([block], snapDb);
      if (executeRes !== true) {
        logger.error(`[${LOG_HEADER}] Failed to execute block`);
        snapDb.destroyDb();
        return null;
      }
      snapDb.blockNumberSnapshot = blockNumber;
    }
    return snapDb;
  }

  getValidatorsVotedFor(blockHash) {
    const LOG_HEADER = 'getValidatorsVotedFor';
    const blockInfo = this.blockPool.hashToBlockInfo[blockHash];
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

  getValidators(blockHash, blockNumber) {
    const LOG_HEADER = 'getValidators';
    const db = this.blockPool.hashToDb.get(blockHash);
    const stateVersion = this.node.bc.lastBlock().hash === blockHash ?
        this.node.stateManager.getFinalVersion() : (db ? db.stateVersion : null);
    if (!stateVersion) {
      const err = `[${LOG_HEADER}] No stateVersion found for block ${blockHash}, ${blockNumber}`;
      logger.error(err);
      throw Error(err);
    }
    let candidates = [];
    const validators = {};
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
    const blockHash = this.blockPool.epochToBlock[epoch];
    if (!blockHash) return false;
    const blockInfo = this.blockPool.hashToBlockInfo[blockHash];
    if (!blockInfo || !blockInfo.votes) return false;
    const myAddr = this.node.account.address;
    return blockInfo.votes.find((vote) => vote.address === myAddr) !== undefined;
  }

  votedForBlock(blockHash) {
    const blockInfo = this.blockPool.hashToBlockInfo[blockHash] || this.blockPool.hashToInvalidBlockInfo[blockHash];
    if (!blockInfo || !blockInfo.votes) return false;
    const myAddr = this.node.account.address;
    const votedFor = blockInfo.votes.find((vote) => vote.address === myAddr);
    const votedAgainst = blockInfo.against_votes.find((vote) => vote.address === myAddr);
    return votedFor !== undefined || votedAgainst !== undefined;
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

  async reportStateProofHashes() {
    if (!this.node.isShardReporter) {
      return;
    }
    const lastFinalizedBlock = this.node.bc.lastBlock();
    const lastFinalizedBlockNumber = lastFinalizedBlock ? lastFinalizedBlock.number : -1;
    if (lastFinalizedBlockNumber < this.lastReportedBlockNumberSent + reportingPeriod) {
      // Too early.
      return;
    }
    const lastReportedBlockNumberConfirmed = await this.getLastReportedBlockNumber();
    if (lastReportedBlockNumberConfirmed === null) {
      // Try next time.
      return;
    }
    if (this.isReporting) {
      return;
    }
    this.isReporting = true;
    try {
      let blockNumberToReport = lastReportedBlockNumberConfirmed + 1;
      const opList = [];
      while (blockNumberToReport <= lastFinalizedBlockNumber) {
        if (sizeof(opList) >= txSizeThreshold) {
          break;
        }
        const block = blockNumberToReport === lastFinalizedBlockNumber ?
            lastFinalizedBlock : this.node.bc.getBlockByNumber(blockNumberToReport);
        if (!block) {
          logger.error(`Failed to fetch block of number ${blockNumberToReport} while reporting`);
          break;
        }
        opList.push({
          type: WriteDbOperations.SET_VALUE,
          ref: `${shardingPath}/${PredefinedDbPaths.DOT_SHARD}/` +
              `${ShardingProperties.PROOF_HASH_MAP}/${blockNumberToReport}/` +
              `${ShardingProperties.PROOF_HASH}`,
          value: block.state_proof_hash
        });
        this.lastReportedBlockNumberSent = blockNumberToReport;
        if (blockNumberToReport >= MAX_SHARD_REPORT) {
          // Remove old reports
          opList.push({
            type: WriteDbOperations.SET_VALUE,
            ref: `${shardingPath}/${PredefinedDbPaths.DOT_SHARD}/` +
                `${ShardingProperties.PROOF_HASH_MAP}/` +
                `${blockNumberToReport - MAX_SHARD_REPORT}/` +
                `${ShardingProperties.PROOF_HASH}`,
            value: null
          });
        }
        blockNumberToReport++;
      }
      logger.debug(`Reporting op_list: ${JSON.stringify(opList, null, 2)}`);
      if (opList.length > 0) {
        const tx = {
          operation: {
            type: WriteDbOperations.SET,
            op_list: opList,
          },
          timestamp: Date.now(),
          nonce: -1,
          gas_price: 0,  // NOTE(platfowner): A temporary solution.
        };
        // TODO(liayoo): save the blockNumber - txHash mapping at /sharding/reports of
        // the child state.
        await signAndSendTx(parentChainEndpoint, tx, this.node.account.private_key);
      }
    } catch (err) {
      logger.error(`Failed to report state proof hashes: ${err} ${err.stack}`);
    }
    this.isReporting = false;
  }

  async getLastReportedBlockNumber() {
    const resp = await sendGetRequest(
        parentChainEndpoint,
        'ain_get',
        {
          type: ReadDbOperations.GET_VALUE,
          ref: `${shardingPath}/${PredefinedDbPaths.DOT_SHARD}/` +
          `${ShardingProperties.PROOF_HASH_MAP}/${ShardingProperties.LATEST}`
        }
    );
    return _.get(resp, 'data.result.result', null);
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
    if (this.blockPool) {
      result.block_pool = {
        hashToBlockInfo: this.blockPool.hashToBlockInfo,
        hashToInvalidBlockInfo: this.blockPool.hashToInvalidBlockInfo,
        hashToDb: Array.from(this.blockPool.hashToDb.keys()),
        hashToNextBlockSet: Object.keys(this.blockPool.hashToNextBlockSet)
          .reduce((acc, curr) => {
            return Object.assign(acc, {[curr]: [...this.blockPool.hashToNextBlockSet[curr]]})
          }, {}),
        epochToBlock: Object.keys(this.blockPool.epochToBlock),
        numberToBlockSet: Object.keys(this.blockPool.numberToBlockSet),
        longestNotarizedChainTips: this.blockPool.longestNotarizedChainTips
      }
    }
    return result;
  }

  /**
   * Returns the basic status of consensus to see if blocks are being produced
   * {
   *   health
   *   status
   *   epoch
   * }
   */
  getStatus() {
    const lastFinalizedBlock = this.node.bc.lastBlock();
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
      epoch: this.epoch
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
    const totalAtStake = Object.values(validatorsWithProducingRights).reduce((acc, cur) => {
      return acc + cur[PredefinedDbPaths.CONSENSUS_STAKE];
    }, 0);
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
