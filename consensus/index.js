const seedrandom = require('seedrandom');
const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');
const ntpsync = require('ntpsync');
const sizeof = require('object-sizeof');
const logger = require('../logger')('CONSENSUS');
const {Block} = require('../blockchain/block');
const BlockPool = require('./block-pool');
const Transaction = require('../tx-pool/transaction');
const PushId = require('../db/push-id');
const ChainUtil = require('../common/chain-util');
const StateManager = require('../db/state-manager');
const {
  WriteDbOperations,
  ReadDbOperations,
  PredefinedDbPaths,
  MessageTypes,
  GenesisSharding,
  ShardingProperties,
  ProofProperties,
  StateVersions,
  MAX_TX_BYTES,
  MAX_SHARD_REPORT,
  GenesisWhitelist,
  LIGHTWEIGHT,
} = require('../common/constants');
const {
  ConsensusMessageTypes,
  ConsensusConsts,
  ConsensusStatus,
  ConsensusDbPaths,
} = require('./constants');
const {
  signAndSendTx,
  sendGetRequest
} = require('../server/util');

const parentChainEndpoint = GenesisSharding[ShardingProperties.PARENT_CHAIN_POC] + '/json-rpc';
const shardingPath = GenesisSharding[ShardingProperties.SHARDING_PATH];
const reportingPeriod = GenesisSharding[ShardingProperties.REPORTING_PERIOD];
const txSizeThreshold = MAX_TX_BYTES * 0.9;

class Consensus {
  constructor(server, node) {
    this.server = server;
    this.node = node;
    this.status = null;
    this.statusChangedBlockNumber = null;
    this.setter = '';
    this.setStatus(ConsensusStatus.STARTING);
    this.epochInterval = null;
    this.startingTime = 0;
    this.timeAdjustment = 0;
    this.isReporting = false;
    this.isInEpochTransition = false;
    this.state = {
      // epoch increases by 1 every EPOCH_MS,
      // and at each epoch a new proposer is pseudo-randomly selected.
      epoch: 1,
      proposer: null
    }
    // This feature is only used when LIGHTWEIGHT=true.
    this.cache = {};
    this.validatorList = Object.keys(GenesisWhitelist).sort();
    this.lastReportedBlockNumberSent = -1;
  }

  init(lastBlockWithoutProposal, isFirstNode = false) {
    const LOG_HEADER = 'init';
    const finalizedNumber = this.node.bc.lastBlockNumber();
    const genesisBlock = this.node.bc.getBlockByNumber(0);
    if (!genesisBlock) {
      logger.error(`[${LOG_HEADER}] Init error: genesis block is not found`);
      return;
    }
    this.genesisHash = genesisBlock.hash;
    const myAddr = this.node.account.address;
    try {
      const currentStake = this.getValidConsensusDeposit(myAddr);
      logger.info(`[${LOG_HEADER}] Current stake: ${currentStake}`);
      if (!currentStake) {
        const whitelist = this.getWhitelist();
        if (whitelist && whitelist[myAddr] > 0) {
          const stakeTx = this.stake(whitelist[myAddr]);
          if (isFirstNode) {
            // Add the transaction to the pool so it gets included in the block #1
            this.node.tp.addTransaction(stakeTx);
            // Broadcast this tx once it's connected to other nodes
            this.stakeTx = stakeTx;
          } else {
            this.server.executeAndBroadcastTransaction(stakeTx, MessageTypes.TRANSACTION);
          }
        } else {
          if (isFirstNode) {
            logger.error(`[${LOG_HEADER}] First node should stake some AIN and ` +
                'start the consensus protocol');
            process.exit(1);
          }
          logger.info(`[${LOG_HEADER}] Node doesn't have any stakes. ` +
              'Initialized as a non-validator.');
        }
      }
      this.blockPool = new BlockPool(this.node, lastBlockWithoutProposal);
      this.setStatus(ConsensusStatus.RUNNING, 'init');
      this.startEpochTransition();
      logger.info(`[${LOG_HEADER}] Initialized to number ${finalizedNumber} and ` +
          `epoch ${this.state.epoch}`);
    } catch (e) {
      logger.error(`[${LOG_HEADER}] Init error: ${e}`);
      this.setStatus(ConsensusStatus.STARTING, 'init');
    }
  }

  startEpochTransition() {
    const LOG_HEADER = 'startEpochTransition';
    const genesisBlock = Block.genesis();
    this.startingTime = genesisBlock.timestamp;
    this.state.epoch = Math.ceil((Date.now() - this.startingTime) / ConsensusConsts.EPOCH_MS);
    logger.info(`[${LOG_HEADER}] Epoch initialized to ${this.state.epoch}`);

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
      if (this.state.epoch % 100 === 0) {
        // adjust time
        try {
          const iNTPData = await ntpsync.ntpLocalClockDeltaPromise();
          logger.debug(`(Local Time - NTP Time) Delta = ${iNTPData.minimalNTPLatencyDelta} ms`);
          this.timeAdjustment = iNTPData.minimalNTPLatencyDelta;
        } catch (e) {
          logger.error(`ntpsync error: ${e}`);
        }
      }
      currentTime -= this.timeAdjustment;
      const absEpoch = Math.floor((currentTime - this.startingTime) / ConsensusConsts.EPOCH_MS);
      if (this.state.epoch + 1 < absEpoch) {
        logger.debug(`[${LOG_HEADER}] Epoch is too low: ${this.state.epoch} / ${absEpoch}`);
      } else if (this.state.epoch + 1 > absEpoch) {
        logger.debug(`[${LOG_HEADER}] Epoch is too high: ${this.state.epoch} / ${absEpoch}`);
      }
      logger.debug(`[${LOG_HEADER}] Updating epoch at ${currentTime}: ${this.state.epoch} ` +
          `=> ${absEpoch}`);
      // re-adjust and update epoch
      this.state.epoch = absEpoch;
      if (this.state.epoch > 1) {
        this.updateProposer();
        this.tryPropose();
      }
      this.isInEpochTransition = false;
    }, ConsensusConsts.EPOCH_MS);
  }

  stop() {
    logger.info(`Stop epochInterval.`);
    this.setStatus(ConsensusStatus.STOPPED, 'stop');
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
      logger.error(`[${LOG_HEADER}] Empty lastNotarizedBlock (${this.state.epoch})`);
    }
    // Need the block#1 to be finalized to have the deposits reflected in the state
    const validators = this.node.bc.lastBlockNumber() < 1 ?
        lastNotarizedBlock.validators : this.getWhitelist();
    // FIXME(lia): make the seeds more secure and unpredictable
    const seed = '' + this.genesisHash + this.state.epoch;
    this.state.proposer = Consensus.selectProposer(seed, validators);
    logger.debug(`[${LOG_HEADER}] proposer for epoch ${this.state.epoch}: ${this.state.proposer}`);
  }

  // Types of consensus messages:
  //  1. Proposal { value: { proposalBlock, proposalTx }, type = 'PROPOSE' }
  //  2. Vote { value: <voting tx>, type = 'VOTE' }
  handleConsensusMessage(msg) {
    const LOG_HEADER = 'handleConsensusMessage';

    if (this.status !== ConsensusStatus.RUNNING) {
      logger.debug(`[${LOG_HEADER}] Consensus status (${this.status}) is not RUNNING ` +
          `(${ConsensusStatus.RUNNING})`);
      return;
    }
    if (msg.type !== ConsensusMessageTypes.PROPOSE && msg.type !== ConsensusMessageTypes.VOTE) {
      logger.error(`[${LOG_HEADER}] Invalid message type: ${msg.type}`);
      return;
    }
    if (ChainUtil.isEmpty(msg.value)) {
      logger.error(`[${LOG_HEADER}] Invalid message value: ${msg.value}`);
      return;
    }
    logger.info(`[${LOG_HEADER}] Consensus state - Finalized block: ` +
        `${this.node.bc.lastBlockNumber()} / ${this.state.epoch}`);
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
        // FIXME(lia): This has a possibility of being exploited by an attacker. The attacker
        // can keep sending messages with higher numbers, making the node's status unsynced, and
        // prevent the node from getting/handling messages properly.
        // this.node.status = BlockchainNodeStatus.SYNCING;

        this.server.requestChainSegment(this.node.bc.lastBlock());
        return;
      }
      if (Consensus.isValidConsensusTx(proposalTx) &&
          this.checkProposal(proposalBlock, proposalTx)) {
        this.server.broadcastConsensusMessage(msg);
        this.tryVote(proposalBlock);
      }
    } else {
      if (this.node.tp.transactionTracker[msg.value.hash]) {
        logger.debug(`[${LOG_HEADER}] Already have the vote in my tx tracker`);
        return;
      }
      if (Consensus.isValidConsensusTx(msg.value) && this.checkVoteTx(msg.value)) {
        this.server.broadcastConsensusMessage(msg);
      }
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

    const transactions = this.node.tp.getValidTransactions(longestNotarizedChain);
    const validTransactions = [];
    const invalidTransactions = [];
    const baseVersion = lastBlock.number === this.node.bc.lastBlockNumber() ?
        this.node.stateManager.getFinalVersion() :
            this.blockPool.hashToDb.get(lastBlock.hash).stateVersion;
    const tempVersion = StateManager.createRandomVersion(`${StateVersions.TEMP}`);
    const tempDb = this.node.createTempDb(baseVersion, tempVersion, lastBlock.number - 1);
    logger.debug(`[${LOG_HEADER}] Created a temp state for tx checks`);
    const lastBlockInfo = this.blockPool.hashToBlockInfo[lastBlock.hash];
    logger.debug(`[${LOG_HEADER}] lastBlockInfo: ${JSON.stringify(lastBlockInfo, null, 2)}`);
    // FIXME(minsu or lia): When I am behind and a newly coming node is ahead of me, then I cannot
    // get lastBlockInfo from the block-pool. So that, it is not able to create a proper block
    // proposal and also cannot pass checkProposal() where checking prevBlockInfo.notarized.
    const lastVotes = blockNumber > 1 && lastBlockInfo.votes ? [...lastBlockInfo.votes] : [];
    if (lastBlockInfo && lastBlockInfo.proposal) {
      lastVotes.unshift(lastBlockInfo.proposal);
    }
    lastVotes.forEach((voteTx) => {
      if (!ChainUtil.transactionFailed(tempDb.executeTransaction(voteTx))) {
        logger.debug(`[${LOG_HEADER}] last vote: success`);
      } else {
        logger.error(`[${LOG_HEADER}] last vote: failed`);
      }
    })

    transactions.forEach((tx) => {
      logger.debug(`[${LOG_HEADER}] Checking tx ${JSON.stringify(tx, null, 2)}`);
      if (!ChainUtil.transactionFailed(tempDb.executeTransaction(tx))) {
        logger.debug(`[${LOG_HEADER}] tx: success`);
        validTransactions.push(tx);
      } else {
        logger.debug(`[${LOG_HEADER}] tx: failed`);
        invalidTransactions.push(tx);
      }
    })

    // Once successfully executed txs (when submitted to tx pool) can become invalid
    // after some blocks are created. Remove those transactions from tx pool.
    this.node.tp.removeInvalidTxsFromPool(invalidTransactions);

    const myAddr = this.node.account.address;
    // Need the block#1 to be finalized to have the deposits reflected in the state
    const validators = this.node.bc.lastBlockNumber() < 1 ?
        lastBlock.validators : this.getWhitelist();
    if (!validators || !(Object.keys(validators).length)) throw Error('No whitelisted validators')
    const totalAtStake = Object.values(validators).reduce(function(a, b) {
      return a + b;
    }, 0);
    const stateProofHash = LIGHTWEIGHT ? '' : tempDb.getProof('/')[ProofProperties.PROOF_HASH];
    const proposalBlock = Block.create(
        lastBlock.hash, lastVotes, validTransactions, blockNumber, this.state.epoch,
        stateProofHash, myAddr, validators);

    let proposalTx;
    const proposeOp = {
      type: WriteDbOperations.SET_VALUE,
      ref: ChainUtil.formatPath([
        ConsensusDbPaths.CONSENSUS,
        ConsensusDbPaths.NUMBER,
        blockNumber,
        ConsensusDbPaths.PROPOSE
      ]),
      value: {
        number: blockNumber,
        epoch: this.state.epoch,
        validators,
        total_at_stake: totalAtStake,
        proposer: myAddr,
        block_hash: proposalBlock.hash,
        last_hash: proposalBlock.last_hash,
        timestamp: proposalBlock.timestamp
      }
    }

    if (blockNumber <= ConsensusConsts.MAX_CONSENSUS_STATE_DB) {
      proposalTx =
          this.node.createTransaction({ operation: proposeOp, timestamp: Date.now() }, false);
    } else {
      const setOp = {
        type: WriteDbOperations.SET,
        op_list: [
          proposeOp,
          {
            type: WriteDbOperations.SET_VALUE,
            ref: ChainUtil.formatPath([
              ConsensusDbPaths.CONSENSUS,
              ConsensusDbPaths.NUMBER,
              blockNumber - ConsensusConsts.MAX_CONSENSUS_STATE_DB
            ]),
            value: null
          }
        ]
      };
      proposalTx = this.node.createTransaction({ operation: setOp, timestamp: Date.now() }, false);
    }
    if (LIGHTWEIGHT) {
      this.cache[blockNumber] = proposalBlock.hash;
    }
    this.node.destroyDb(tempDb);
    return {proposalBlock, proposalTx};
  }

  checkProposal(proposalBlock, proposalTx) {
    const LOG_HEADER = 'checkProposal';

    logger.info(`[${LOG_HEADER}] Checking block proposal: ` +
        `${proposalBlock.number} / ${proposalBlock.epoch}`);
    if (this.blockPool.hasSeenBlock(proposalBlock)) {
      logger.info(`[${LOG_HEADER}] Proposal already seen`);
      return false;
    }
    if (proposalTx.address !== proposalBlock.proposer) {
      logger.error(`[${LOG_HEADER}] Transaction signer and proposer are different`);
      return false;
    }
    const block_hash = BlockPool.getBlockHashFromTx(proposalTx);
    if (block_hash !== proposalBlock.hash) {
      logger.error(`[${LOG_HEADER}] The block_hash value in proposalTx (${block_hash}) and ` +
          `the actual proposalBlock's hash (${proposalBlock.hash}) don't match`);
      return false;
    }
    if (!LIGHTWEIGHT) {
      if (!Block.validateProposedBlock(proposalBlock)) {
        logger.error(`[${LOG_HEADER}] Proposed block didn't pass the basic checks`);
        return false;
      }
    }
    const {proposer, number, epoch, last_hash} = proposalBlock;
    if (number <= this.node.bc.lastBlockNumber()) {
      logger.info(`[${LOG_HEADER}] There already is a finalized block of the number`);
      logger.debug(`[${LOG_HEADER}] corresponding block info: ` +
          `${JSON.stringify(this.blockPool.hashToBlockInfo[proposalBlock.hash], null, 2)}`);
      if (!this.blockPool.hasSeenBlock(proposalBlock)) {
        logger.debug(`[${LOG_HEADER}] Adding the proposal to the blockPool for later use`);
        this.blockPool.addSeenBlock(proposalBlock, proposalTx);
      }
      return false;
    }
    // If I don't have enough votes for prevBlock, see last_votes of proposalBlock if
    // those can notarize the prevBlock (verify, execute and add the missing votes)
    let prevBlockInfo = number === 1 ?
        this.node.bc.getBlockByNumber(0) : this.blockPool.hashToBlockInfo[last_hash];
    const prevBlock = number > 1 ? prevBlockInfo.block : prevBlockInfo;
    logger.debug(`[${LOG_HEADER}] prevBlockInfo: ${JSON.stringify(prevBlockInfo, null, 2)}`);
    if (number !== 1 && (!prevBlockInfo || !prevBlockInfo.block)) {
      logger.debug(`[${LOG_HEADER}] No notarized block at number ${number - 1} with ` +
          `hash ${last_hash}`);
      return;
    }
    const validators = prevBlock.validators;
    // check that the transactions from block #1 amount to +2/3 deposits of initially whitelisted
    // validators.
    if (number === 1) {
      const majority = ConsensusConsts.MAJORITY * Object.values(validators).reduce((a, b) => {
        return a + b;
      }, 0);
      const depositTxs = Consensus.filterDepositTxs(proposalBlock.transactions);
      const depositSum = depositTxs.reduce((a, b) => {
        return a + b.tx_body.operation.value;
      }, 0);
      if (depositSum < majority) {
        logger.info(`[${LOG_HEADER}] We don't have enough deposits yet`)
        this.blockPool.addSeenBlock(proposalBlock, proposalTx);
        return false;
      }
      // TODO(lia): make sure each validator staked only once at this point
      for (const depositTx of depositTxs) {
        const expectedStake = validators[depositTx.address];
        const actualStake = _.get(depositTx, 'tx_body.operation.value');
        if (actualStake < expectedStake) {
          logger.error(`[${LOG_HEADER}] Validator ${depositTx.address} didn't stake enough. ` +
              `Expected: ${expectedStake} / Actual: ${actualStake}`);
          return false;
        }
      }
    }
    if (number !== 1 && !prevBlockInfo.notarized) {
      // Try applying the last_votes of proposalBlock and see if that makes the prev block notarized
      const prevBlockProposal = BlockPool.filterProposal(proposalBlock.last_votes);
      if (!prevBlockProposal) {
        logger.error(`[${LOG_HEADER}] Proposal block is missing its prev block's proposal ` +
            'in last_votes');
        return false;
      }
      if (!prevBlockInfo.proposal) {
        if (number === this.node.bc.lastBlockNumber() + 1) {
          // TODO(lia): do more checks on the prevBlockProposal
          this.blockPool.addSeenBlock(prevBlockInfo.block, prevBlockProposal);
        } else {
          logger.debug(`[${LOG_HEADER}] Prev block is missing its proposal`);
          return false;
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
          return false;
        }
        baseVersion = prevDb.stateVersion;
      }
      const tempVersion = StateManager.createRandomVersion(`${StateVersions.TEMP}`);
      const tempDb = this.node.createTempDb(baseVersion, tempVersion, prevBlock.number - 1);
      if (isSnapDb) {
        this.node.destroyDb(prevDb);
      }
      proposalBlock.last_votes.forEach((voteTx) => {
        if (voteTx.hash === prevBlockProposal.hash) return;
        if (!Consensus.isValidConsensusTx(voteTx) ||
            ChainUtil.transactionFailed(tempDb.executeTransaction(voteTx))) {
          logger.info(`[${LOG_HEADER}] voting tx execution for prev block failed`);
          // return;
        }
        this.blockPool.addSeenVote(voteTx);
      });
      prevBlockInfo = this.blockPool.hashToBlockInfo[last_hash];
      if (!prevBlockInfo.notarized) {
        logger.error(`[${LOG_HEADER}] Block's last_votes don't correctly notarize ` +
            `its previous block of number ${number - 1} with hash ` +
            `${last_hash}:\n${JSON.stringify(this.blockPool.hashToBlockInfo[last_hash], null, 2)}`);
        return false;
      }
      this.node.destroyDb(tempDb);
    }
    if (prevBlock.epoch >= epoch) {
      logger.error(`[${LOG_HEADER}] Previous block's epoch (${prevBlock.epoch}) is greater than` +
          `or equal to incoming block's (${epoch})`);
      return false;
    }
    const seed = '' + this.genesisHash + epoch;
    const expectedProposer = Consensus.selectProposer(seed, validators);
    if (expectedProposer !== proposer) {
      logger.error(`[${LOG_HEADER}] Proposer is not the expected node (expected: ` +
          `${expectedProposer} / actual: ${proposer})`);
      return false;
    }
    // TODO(lia): Check last_votes if they indeed voted for the previous block
    // TODO(lia): Check the timestamps and nonces of the last_votes and transactions
    // TODO(lia): Implement state version control
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
        return false;
      }
      baseVersion = prevDb.stateVersion;
    }
    const tempVersion = StateManager.createRandomVersion(`${StateVersions.TEMP}`);
    const tempDb = this.node.createTempDb(baseVersion, tempVersion, prevBlock.number - 1);
    if (isSnapDb) {
      this.node.destroyDb(prevDb);
    }
    if (ChainUtil.transactionFailed(tempDb.executeTransaction(proposalTx))) {
      logger.error(`[${LOG_HEADER}] Failed to execute the proposal tx`);
      return false;
    }
    this.node.destroyDb(tempDb);
    const createdTx = Transaction.create(proposalTx.tx_body, proposalTx.signature);
    if (!createdTx) {
      logger.error(`[${LOG_HEADER}] Failed to create a transaction with a proposal: ` +
          `${JSON.stringify(proposalTx, null, 2)}`);
      return false;
    }
    this.node.tp.addTransaction(createdTx);
    const newVersion = StateManager.createRandomVersion(`${StateVersions.TEMP}`);
    const newDb = this.node.createTempDb(baseVersion, newVersion, prevBlock.number);
    if (!newDb.executeTransactionList(proposalBlock.last_votes)) {
      logger.error(`[${LOG_HEADER}] Failed to execute last votes`);
      return false;
    }
    if (!newDb.executeTransactionList(proposalBlock.transactions)) {
      logger.error(`[${LOG_HEADER}] Failed to execute transactions`);
      return false;
    }
    newDb.blockNumberSnapshot += 1;
    if (!LIGHTWEIGHT) {
      if (newDb.getProof('/')[ProofProperties.PROOF_HASH] !== proposalBlock.stateProofHash) {
        logger.error(`[${LOG_HEADER}] State proof hashes don't match: ` +
            `${newDb.getProof('/')[ProofProperties.PROOF_HASH]} / ` +
            `${proposalBlock.stateProofHash}`);
        return false;
      }
    }
    this.blockPool.hashToDb.set(proposalBlock.hash, newDb);
    if (!this.blockPool.addSeenBlock(proposalBlock, proposalTx)) {
      return false;
    }
    if (!this.blockPool.longestNotarizedChainTips.includes(proposalBlock.last_hash)) {
      logger.error(`[${LOG_HEADER}] Block is not extending one of the longest notarized chains ` +
          `(${JSON.stringify(this.blockPool.longestNotarizedChainTips, null, 2)})`);
      return false;
    }
    logger.info(`[${LOG_HEADER}] Verifed block proposal: ` +
        `${proposalBlock.number} / ${proposalBlock.epoch}`);
    return true;
  }

  checkVoteTx(voteTx) {
    const LOG_HEADER = 'checkVoteTx';
    const blockHash = voteTx.tx_body.operation.value.block_hash;
    const blockInfo = this.blockPool.hashToBlockInfo[blockHash];
    let block;
    if (blockInfo && blockInfo.block) {
      block = blockInfo.block
    } else if (blockHash === this.node.bc.lastBlock().hash) {
      block = this.node.bc.lastBlock();
    }
    if (!block) {
      logger.error(`[${LOG_HEADER}] Cannot verify the vote without the block it's voting for: ` +
          `${blockHash} / ${JSON.stringify(blockInfo, null, 2)}`);
      // FIXME: ask for the block from peers
      return false;
    }
    const tempDb = this.getSnapDb(block);
    if (!tempDb) {
      logger.debug(
          `[${LOG_HEADER}] No state snapshot available for vote ${JSON.stringify(voteTx)}`);
      return false;
    }
    if (ChainUtil.transactionFailed(tempDb.executeTransaction(voteTx))) {
      logger.error(`[${LOG_HEADER}] Failed to execute the voting tx`);
      return false;
    }
    this.node.destroyDb(tempDb);
    const createdTx = Transaction.create(voteTx.tx_body, voteTx.signature);
    if (!createdTx) {
      logger.error(`[${LOG_HEADER}] Failed to create a transaction with a vote: ` +
          `${JSON.stringify(voteTx, null, 2)}`);
      return false;
    }
    this.node.tp.addTransaction(createdTx);
    this.blockPool.addSeenVote(voteTx, this.state.epoch);
    return true;
  }

  tryPropose() {
    const LOG_HEADER = 'tryPropose';

    if (this.votedForEpoch(this.state.epoch)) {
      logger.info(`[${LOG_HEADER}] Already voted for ` +
          `${this.blockPool.epochToBlock[this.state.epoch]} at epoch ${this.state.epoch} ` +
          'but trying to propose at the same epoch');
      return;
    }
    if (ainUtil.areSameAddresses(this.state.proposer, this.node.account.address)) {
      logger.info(`[${LOG_HEADER}] I'm the proposer ${this.node.account.address}`);
      try {
        const proposal = this.createProposal();
        if (proposal !== null) {
          this.handleConsensusMessage({value: proposal, type: ConsensusMessageTypes.PROPOSE});
        }
      } catch (e) {
        logger.error(`[${LOG_HEADER}] Error while creating a proposal: ${e}`);
      }
    } else {
      logger.info(`[${LOG_HEADER}] Not my turn ${this.node.account.address}`);
    }
  }

  tryVote(proposalBlock) {
    const LOG_HEADER = 'tryVote';
    logger.info(`[${LOG_HEADER}] Trying to vote for ${proposalBlock.number} / ` +
        `${proposalBlock.epoch} / ${proposalBlock.hash}`)
    if (this.votedForEpoch(proposalBlock.epoch)) {
      logger.info(`[${LOG_HEADER}] Already voted for epoch ${proposalBlock.epoch}`);
      return;
    }
    if (proposalBlock.epoch < this.state.epoch) {
      logger.info(`[${LOG_HEADER}] Possibly a stale proposal (${proposalBlock.epoch} / ` +
          `${this.state.epoch})`);
      // FIXME
    }
    this.vote(proposalBlock);
  }

  vote(block) {
    const myAddr = this.node.account.address;
    // Need the block#1 to be finalized to have the deposits reflected in the state
    const myStake = this.node.bc.lastBlockNumber() < 1 ?
        block.validators[myAddr] : this.getWhitelist()[myAddr];
    if (!myStake) {
      return;
    }
    const operation = {
      type: WriteDbOperations.SET_VALUE,
      ref: ChainUtil.formatPath([
        ConsensusDbPaths.CONSENSUS,
        ConsensusDbPaths.NUMBER,
        block.number,
        ConsensusDbPaths.VOTE,
        myAddr
      ]),
      value: {
        [ConsensusDbPaths.BLOCK_HASH]: block.hash,
        [ConsensusDbPaths.STAKE]: myStake
      }
    };
    const voteTx = this.node.createTransaction({ operation, timestamp: Date.now() }, false);

    this.handleConsensusMessage({value: voteTx, type: ConsensusMessageTypes.VOTE});
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
    for (let i = 0; i < finalizableChain.length - 1; i++) {
      const blockToFinalize = finalizableChain[i];
      if (blockToFinalize.number <= this.node.bc.lastBlockNumber()) {
        continue;
      }
      const versionToFinalize = this.blockPool.hashToDb.get(blockToFinalize.hash).stateVersion;
      this.node.cloneAndFinalizeVersion(versionToFinalize, blockToFinalize.number);
      if (this.node.addNewBlock(blockToFinalize)) {
        logger.info(`[${LOG_HEADER}] Finalized a block of number ${blockToFinalize.number} and ` +
            `hash ${blockToFinalize.hash}`);
      } else {
        logger.error(`[${LOG_HEADER}] Failed to finalize a block: ` +
            `${JSON.stringify(blockToFinalize, null, 2)}`);
        // FIXME: Stop consensus?
        return;
      }
    }
    this.blockPool.cleanUpAfterFinalization(finalizableChain[finalizableChain.length - 2]);
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
      if (this.checkProposal(blockInfo.block, blockInfo.proposal) ||
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
      this.tryVote(lastVerifiedBlock);
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

  getSnapDb(block) {
    const LOG_HEADER = 'getSnapDb';
    const lastFinalizedHash = this.node.bc.lastBlock().hash;
    const chain = [];
    let currBlock = block;
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
    const snapVersion = StateManager.createRandomVersion(`${StateVersions.SNAP}`);
    const blockNumberSnapshot = chain.length ? chain[0].number : block.number;
    const snapDb = this.node.createTempDb(baseVersion, snapVersion, blockNumberSnapshot);

    while (chain.length) {
      // apply last_votes and transactions
      const block = chain.shift();
      logger.debug(`[[${LOG_HEADER}] applying block ${JSON.stringify(block)}`);
      snapDb.executeTransactionList(block.last_votes);
      snapDb.executeTransactionList(block.transactions);
      snapDb.blockNumberSnapshot = block.number;
    }
    return snapDb;
  }

  // FIXME: check from the corresponding previous state?
  getValidatorsVotedFor(blockHash) {
    const LOG_HEADER = 'getValidatorsVotedFor';
    const blockInfo = this.blockPool.hashToBlockInfo[blockHash];
    if (!blockInfo || !blockInfo.votes || !blockInfo.votes.length) {
      logger.error(`[${LOG_HEADER}] No validators voted`);
      throw Error('No validators voted');
    }
    logger.debug(`[${LOG_HEADER}] current epoch: ${this.state.epoch}\nblock hash: ${blockHash}` +
        `\nvotes: ${JSON.stringify(blockInfo.votes, null, 2)}`);
    const validators = {};
    blockInfo.votes.forEach((voteTx) => {
      validators[voteTx.address] = _.get(voteTx, 'tx_body.operation.value.stake');
    });

    return validators;
  }

  getWhitelist() {
    return LIGHTWEIGHT ? GenesisWhitelist : this.node.db.getValue(ChainUtil.formatPath([
      ConsensusDbPaths.CONSENSUS,
      ConsensusDbPaths.WHITELIST
    ])) || {};
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

  votedForEpoch(epoch) {
    const blockHash = this.blockPool.epochToBlock[epoch];
    if (!blockHash) return false;
    const blockInfo = this.blockPool.hashToBlockInfo[blockHash];
    if (!blockInfo || !blockInfo.votes) return false;
    const myAddr = this.node.account.address;
    return blockInfo.votes.filter((vote) => vote.address === myAddr).length > 0;
  }

  stake(amount) {
    const LOG_HEADER = 'stake';
    if (!amount || amount <= 0) {
      logger.error(`[${LOG_HEADER}] Invalid staking amount received: ${amount}`);
      return null;
    }

    const operation = {
      type: WriteDbOperations.SET_VALUE,
      ref: ChainUtil.formatPath([
        PredefinedDbPaths.DEPOSIT_CONSENSUS,
        this.node.account.address,
        PushId.generate(),
        PredefinedDbPaths.DEPOSIT_VALUE
      ]),
      value: amount
    };
    const depositTx = this.node.createTransaction({ operation, timestamp: Date.now() }, false);
    return depositTx;
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
          ref: `${shardingPath}/${ShardingProperties.SHARD}/` +
              `${ShardingProperties.PROOF_HASH_MAP}/${blockNumberToReport}/` +
              `${ShardingProperties.PROOF_HASH}`,
          value: block.stateProofHash
        });
        this.lastReportedBlockNumberSent = blockNumberToReport;
        if (blockNumberToReport >= MAX_SHARD_REPORT) {
          // Remove old reports
          opList.push({
            type: WriteDbOperations.SET_VALUE,
            ref: `${shardingPath}/${ShardingProperties.SHARD}/` +
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
          nonce: -1
        };
        // TODO(lia): save the blockNumber - txHash mapping at /sharding/reports of the child state
        await signAndSendTx(parentChainEndpoint, tx, this.node.account.private_key);
      }
    } catch (e) {
      logger.error(`Failed to report state proof hashes: ${e}`);
    }
    this.isReporting = false;
  }

  async getLastReportedBlockNumber() {
    const resp = await sendGetRequest(
        parentChainEndpoint,
        'ain_get',
        {
          type: ReadDbOperations.GET_VALUE,
          ref: `${shardingPath}/${ShardingProperties.SHARD}/` +
          `${ShardingProperties.PROOF_HASH_MAP}/${ShardingProperties.LATEST}`
        }
    );
    return _.get(resp, 'data.result.result', null);
  }

  isRunning() {
    return this.status === ConsensusStatus.RUNNING;
  }

  setStatus(status, setter = '') {
    const LOG_HEADER = 'setStatus';
    logger.info(`[${LOG_HEADER}] setting consensus status from ${this.status} to ` +
        `${status} (setter = ${setter})`);
    this.status = status;
    this.statusChangedBlockNumber = this.node.bc.lastBlockNumber();
    this.setter = setter;
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
   *     numberToBlock,
   *     longestNotarizedChainTips
   *   }
   * }
   */
  getRawState() {
    const result = {};
    result.consensus = Object.assign({}, this.state, {status: this.status});
    if (this.blockPool) {
      result.block_pool = {
        hashToBlockInfo: this.blockPool.hashToBlockInfo,
        hashToDb: Array.from(this.blockPool.hashToDb.keys()),
        hashToNextBlockSet: Object.keys(this.blockPool.hashToNextBlockSet)
          .reduce((acc, curr) => {
            return Object.assign(acc, {[curr]: [...this.blockPool.hashToNextBlockSet[curr]]})
          }, {}),
        epochToBlock: Object.keys(this.blockPool.epochToBlock),
        numberToBlock: Object.keys(this.blockPool.numberToBlock),
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
  getState() {
    const lastFinalizedBlock = this.node.bc.lastBlock();
    let health;
    if (!lastFinalizedBlock) {
      health = false;
    } else {
      health =
          (this.state.epoch - lastFinalizedBlock.epoch) < ConsensusConsts.HEALTH_THRESHOLD_EPOCH;
    }
    return {health, status: this.status, epoch: this.state.epoch};
  }

  static selectProposer(seed, validators) {
    const LOG_HEADER = 'selectProposer';
    logger.debug(`[${LOG_HEADER}] seed: ${seed}, validators: ${JSON.stringify(validators)}`);
    const alphabeticallyOrderedValidators = Object.keys(validators).sort();
    const totalAtStake = Object.values(validators).reduce((a, b) => {
      return a + b;
    }, 0);
    const randomNumGenerator = seedrandom(seed);
    const targetValue = randomNumGenerator() * totalAtStake;
    let cumulative = 0;
    for (let i = 0; i < alphabeticallyOrderedValidators.length; i++) {
      cumulative += validators[alphabeticallyOrderedValidators[i]];
      if (cumulative > targetValue) {
        logger.info(`Proposer is ${alphabeticallyOrderedValidators[i]}`);
        return alphabeticallyOrderedValidators[i];
      }
    }
    logger.error(`[${LOG_HEADER}] Failed to get the proposer.\nvalidators: ` +
        `${alphabeticallyOrderedValidators}\n` +
        `totalAtStake: ${totalAtStake}\nseed: ${seed}\ntargetValue: ${targetValue}`);
    return null;
  }

  static isValidConsensusTx(tx) {
    if (!tx.tx_body.operation) return false;
    const consensusTxPrefix = ChainUtil.formatPath(
        [ConsensusDbPaths.CONSENSUS, ConsensusDbPaths.NUMBER]);
    if (tx.tx_body.operation.type === WriteDbOperations.SET_VALUE) {
      return tx.tx_body.operation.ref.startsWith(consensusTxPrefix);
    } else if (tx.tx_body.operation.type === WriteDbOperations.SET) {
      const opList = tx.tx_body.operation.op_list;
      if (!opList || opList.length !== 2) {
        return false;
      }
      opList.forEach((op) => {
        if (!op.ref.startsWith(consensusTxPrefix)) return false;
      })
      return true;
    } else {
      return false;
    }
  }

  static filterDepositTxs(txs) {
    return txs.filter((tx) => {
      const ref = _.get(tx, 'tx_body.operation.ref');
      return ref && ref.startsWith(`/${PredefinedDbPaths.DEPOSIT_CONSENSUS}`) &&
        _.get(tx, 'tx_body.operation.type') === WriteDbOperations.SET_VALUE;
    });
  }
}

module.exports = Consensus;
