const _get = require('lodash/get');
const logger = require('../logger')('BLOCK_POOL');
const { ConsensusConsts, ValidatorOffenseTypes } = require('./constants');
const { StateVersions } = require('../common/constants');
const CommonUtil = require('../common/common-util');
const ConsensusUtil = require('./consensus-util');
const Transaction = require('../tx-pool/transaction');

class BlockPool {
  constructor(node, lastBlock) {
    this.node = node;
    const lastFinalizedBlock = this.node.bc.lastBlock();

    // Mapping of a block hash to the block's info (block, proposal tx, voting txs)
    // e.g. { [<blockHash>]: { block, proposal, votes: { [<address>]: <number> }, tallied } }
    this.hashToBlockInfo = {};
    // Mapping of a block hash to the invalid block's info.
    // e.g. { [<blockHash>]: { block, proposal, votes: { [<address>]: <number> } } }
    this.hashToInvalidBlockInfo = {};
    // Mapping of a block hash to the new db state
    this.hashToDb = new Map();
    // Mapping of a block hash to a set of block hashes that extend the block.
    // e.g. { [<blockHash>]: Set<blockHash> }
    this.hashToNextBlockSet = {};
    // Mapping of an epoch to the hash of a block proposed at the epoch.
    // e.g. { [<epoch>]: <blockHash> }
    this.epochToBlock = {};
    // Mapping of a number to a set of block hashes proposed for the number.
    // e.g. { [<blockNumber>]: Set<blockHash> }
    this.numberToBlockSet = {};

    this.longestNotarizedChainTips = [lastFinalizedBlock.hash];

    let lastFinalizedBlockHash; let lastFinalizedBlockEpoch; let lastFinalizedBlockNumber;
    if (lastFinalizedBlock) {
      lastFinalizedBlockHash = lastFinalizedBlock.hash;
      lastFinalizedBlockEpoch = lastFinalizedBlock.epoch;
      lastFinalizedBlockNumber = lastFinalizedBlock.number;
    }
    if (lastBlock) {
      const lastBlockHash = lastBlock.hash;
      const lastBlockEpoch = lastBlock.epoch;
      const lastBlockNumber = lastBlock.number;
      if (lastFinalizedBlock && lastFinalizedBlock.hash === lastBlock.last_hash) {
        const proposal = ConsensusUtil.filterProposalFromVotes(lastBlock.last_votes);
        this.hashToBlockInfo[lastFinalizedBlockHash] = {
          block: lastFinalizedBlock,
          proposal,
          votes: lastBlock.last_votes.filter((val) => val.hash !== proposal.hash),
          notarized: true
        };
        this.hashToNextBlockSet[lastFinalizedBlockHash] = new Set([lastBlockHash]);
        this.epochToBlock[lastFinalizedBlockEpoch] = lastFinalizedBlockHash;
        this.numberToBlockSet[lastFinalizedBlockNumber] = new Set([lastFinalizedBlockHash]);
      }
      this.hashToBlockInfo[lastBlockHash] = {block: lastBlock};
      this.epochToBlock[lastBlockEpoch] = lastBlockHash;
      this.numberToBlockSet[lastBlockNumber] = new Set([lastBlockHash]);
    } else if (lastFinalizedBlock) {
      this.hashToBlockInfo[lastFinalizedBlockHash] = {block: lastFinalizedBlock, notarized: true};
      this.epochToBlock[lastFinalizedBlockEpoch] = lastFinalizedBlockHash;
      this.numberToBlockSet[lastFinalizedBlockNumber] = new Set([lastFinalizedBlockHash]);
    }
  }

  updateLongestNotarizedChains() {
    const LOG_HEADER = 'updateLongestNotarizedChains';
    const currentLongest = this.longestNotarizedChainTips.length ?
        _get(this.hashToBlockInfo[this.longestNotarizedChainTips[0]], 'block.number')
        : this.node.bc.lastBlockNumber();
    if (currentLongest == undefined) {
      logger.error(`[${LOG_HEADER}] Notarized block's info is missing: ` +
          `${this.longestNotarizedChainTips[0]}`);
      return;
    }
    const longestChains = this.getLongestNotarizedChainList();
    logger.debug(`[${LOG_HEADER}] longestChains: ${JSON.stringify(longestChains, null, 2)}`);
    this.longestNotarizedChainTips = longestChains.reduce((a, b) => {
      a.push(b[b.length - 1].hash);
      return a;
    }, []);
  }

  getExtendingChain(blockHash, withInfo = false, withRecordedInvalidBlockHashSet = false) {
    const LOG_HEADER = 'getExtendingChain';
    const chain = [];
    const recordedInvalidBlockHashSet = new Set();
    const finalizedBlock = this.node.bc.lastBlock();
    let currBlockWithInfo = this.hashToBlockInfo[blockHash];
    if (!currBlockWithInfo || !currBlockWithInfo.block ||
        currBlockWithInfo.block.number <= finalizedBlock.number) {
      return { chain, recordedInvalidBlockHashSet };
    }
    while (currBlockWithInfo && currBlockWithInfo.block &&
        currBlockWithInfo.block.number > finalizedBlock.number) {
      const block = currBlockWithInfo.block;
      chain.unshift(withInfo ? currBlockWithInfo : block);
      if (withRecordedInvalidBlockHashSet) {
        for (const invalidBlockHash of ConsensusUtil.getInvalidBlockHashesFromBlock(block)) {
          recordedInvalidBlockHashSet.add(invalidBlockHash);
        }
      }
      currBlockWithInfo = this.hashToBlockInfo[block.last_hash];
    }
    logger.debug(`[${LOG_HEADER}] currBlockWithInfo: ` +
        `${JSON.stringify(currBlockWithInfo, null, 2)}` +
        `\nfinalizedBlock: ${JSON.stringify(finalizedBlock, null, 2)}`);
    if (!currBlockWithInfo || !currBlockWithInfo.block) {
      logger.error(`[${LOG_HEADER}] Block info is missing`);
      return [];
    }
    if (currBlockWithInfo.block.hash !== finalizedBlock.hash) {
      logger.error(`[${LOG_HEADER}] Incorrect chain`);
      return [];
    }
    return { chain, recordedInvalidBlockHashSet };
  }

  getLongestNotarizedChainList(fromBlock, withInfo = false) {
    const LOG_HEADER = 'getLongestNotarizedChainList';
    const lastBlockNumber = this.node.bc.lastBlockNumber();
    const lastFinalized = fromBlock ? fromBlock
        : lastBlockNumber < 1 ? {block: this.node.bc.lastBlock(), notarized: true}
            : this.hashToBlockInfo[this.node.bc.lastBlock().hash];
    logger.debug(`[${LOG_HEADER}] lastFinalized: ${JSON.stringify(lastFinalized, null, 2)}`);
    const chainList = [];
    this.dfsLongest(lastFinalized, [], chainList, withInfo);
    return chainList;
  }

  dfsLongest(currentNode, currentChain, chainList, withInfo = false) {
    if (!currentNode || !currentNode.notarized || !currentNode.block) {
      return;
    }
    if (withInfo) {
      currentChain.push(currentNode);
    } else {
      currentChain.push(currentNode.block);
    }
    const nextBlockSet = this.hashToNextBlockSet[currentNode.block.hash];
    const blockNumber = currentNode.block.number;
    let longestNumber = chainList.length ? withInfo ?
        chainList[0][chainList[0].length - 1].block.number :
            chainList[0][chainList[0].length - 1].number : 0;
    if (blockNumber > longestNumber) {
      logger.debug('[blockPool:dfsLongest] New longest chain found: ' +
          `${JSON.stringify(currentChain, null, 2)}, longestNumber: ${blockNumber}`);
      chainList.length = 0;
      chainList.push([...currentChain]);
      longestNumber = blockNumber;
    } else if (blockNumber === longestNumber) {
      logger.debug('[blockPool:dfsLongest] Another longest chain found: ' +
          `${JSON.stringify(currentChain, null, 2)}, longestNumber: ${blockNumber}`);
      chainList.push([...currentChain]);
    }
    if (!nextBlockSet || !nextBlockSet.size) {
      currentChain.pop();
      return;
    }

    for (const val of nextBlockSet) {
      this.dfsLongest(this.hashToBlockInfo[val], currentChain, chainList, withInfo);
    }
    currentChain.pop();
    logger.debug('[blockPool:dfsLongest] returning.. currentChain: ' +
        `${JSON.stringify(currentChain, null, 2)}`);
  }

  // A finalizable chain (extension of current finalized chain):
  //  1. all of its blocks are notarized
  //  2. ends with three blocks that have consecutive epoch numbers
  getFinalizableChain() {
    const lastFinalized = { block: this.node.bc.lastBlock(), notarized: true };
    return this.dfsFinalizable(lastFinalized, []);
  }

  dfsFinalizable(currentNode, currentChain) {
    const LOG_HEADER = 'dfsFinalizable';
    // Cannot add a non-notarized block to a finalized chain.
    if (!currentNode || !currentNode.notarized || !currentNode.block) {
      return BlockPool.endsWithThreeConsecutiveEpochs(currentChain) ? [...currentChain] : [];
    }
    currentChain.push(currentNode.block);
    const nextBlockSet = this.hashToNextBlockSet[currentNode.block.hash];
    if (!nextBlockSet || !nextBlockSet.size) {
      if (BlockPool.endsWithThreeConsecutiveEpochs(currentChain)) {
        logger.debug(`[${LOG_HEADER}] No next blocks but found a finalizable chain`);
        const chainCopy = [...currentChain];
        currentChain.pop();
        return chainCopy;
      }
      logger.debug(`[${LOG_HEADER}] No next blocks.. returning empty array`);
      currentChain.pop();
      return [...currentChain];
    }
    let res;
    let longest = [];
    for (const blockHash of nextBlockSet) {
      res = this.dfsFinalizable(this.hashToBlockInfo[blockHash], currentChain);
      if (res && BlockPool.endsWithThreeConsecutiveEpochs(res) && res.length > longest.length) {
        longest = res;
      }
    }
    currentChain.pop();
    return longest;
  }

  static endsWithThreeConsecutiveEpochs(chain) {
    const len = chain.length;
    if (!len || len < 3) return false;
    return chain[len - 3].epoch + 1 === chain[len - 2].epoch &&
        chain[len - 2].epoch + 1 === chain[len - 1].epoch;
  }

  // FIXME: return block that's on the longest & heaviest notarized chain
  getNotarizedBlockListByNumber(number) {
    const blockArr = Object.values(this.hashToBlockInfo)
      .filter((blockInfo) => !!blockInfo.block && blockInfo.block.number === number &&
          blockInfo.proposal && blockInfo.notarized);
    return blockArr;
  }

  getNotarizedBlockByHash(hash) {
    const LOG_HEADER = 'getNotarizedBlockByHash';
    const blockInfo = this.hashToBlockInfo[hash];
    logger.debug(`[${LOG_HEADER}] blockInfo: ${JSON.stringify(blockInfo, null, 2)}`);
    return blockInfo && blockInfo.block && blockInfo.notarized ? blockInfo.block : null;
  }

  hasSeenBlock(blockHash) {
    if (this.hashToBlockInfo[blockHash]) {
      const blockInfo = this.hashToBlockInfo[blockHash];
      return blockInfo && blockInfo.block && (blockInfo.block.number === 0 || !!blockInfo.proposal);
    } else if (this.hashToInvalidBlockInfo[blockHash]) {
      const blockInfo = this.hashToInvalidBlockInfo[blockHash];
      return blockInfo && blockInfo.block && (blockInfo.block.number === 0 || !!blockInfo.proposal);
    }
    return false;
  }

  checkEpochToBlockMap(block) {
    const LOG_HEADER = 'checkEpochToBlockMap';
    // Check that there's no other block proposed at the same epoch
    if (this.epochToBlock[block.epoch] && this.epochToBlock[block.epoch] !== block.hash) {
      const conflict = this.hashToBlockInfo[this.epochToBlock[block.epoch]];
      if (conflict && conflict.notarized) {
        logger.error(`[${LOG_HEADER}] Multiple blocks proposed for epoch ` +
            `${block.epoch} (${block.hash}, ${this.epochToBlock[block.epoch]})`);
        return false;
      }
      logger.info(`[${LOG_HEADER}] Multiple blocks proposed for epoch ` +
          `${block.epoch} (${block.hash}, ${this.epochToBlock[block.epoch]}) BUT is not notarized`);
      // FIXME: remove info about the block that's currently this.epochToBlock[block.epoch] ?
    }
    return true;
  }

  addToHashBlockInfoMap(block, proposalTx) {
    const LOG_HEADER = 'addToHashBlockInfoMap';
    const blockHash = block.hash;
    if (!this.hashToBlockInfo[blockHash]) {
      this.hashToBlockInfo[blockHash] = {};
    }
    const blockInfo = this.hashToBlockInfo[blockHash];
    if (CommonUtil.isEmpty(blockInfo.block)) {
      this.hashToBlockInfo[blockHash].block = block;
      this.hashToBlockInfo[blockHash].proposal = proposalTx;
      // We might have received some votes before the block itself
      if (!blockInfo.tallied && blockInfo.votes) {
        this.hashToBlockInfo[blockHash].tallied = 0;
        blockInfo.votes.forEach((vote) => {
          if (block.validators[vote.address]) {
            this.hashToBlockInfo[blockHash].tallied += _get(vote, 'tx_body.operation.value.stake');
          }
        });
        this.tryUpdateNotarized(blockHash);
      }
      logger.info(
          `[${LOG_HEADER}] Block added to the block pool: ${block.number} / ${block.epoch}`);
    } else {
      logger.info(
          `[${LOG_HEADER}] Block already in the block pool: ${block.number} / ${block.epoch}`);
    }
  }

  addToInvalidBlockInfoMap(block, proposalTx) {
    const LOG_HEADER = 'addToInvalidBlockInfoMap';
    const blockHash = block.hash;
    if (!this.hashToInvalidBlockInfo[blockHash]) {
      this.hashToInvalidBlockInfo[blockHash] = {};
    }
    const blockInfo = this.hashToInvalidBlockInfo[blockHash];
    if (CommonUtil.isEmpty(blockInfo.block)) {
      this.hashToInvalidBlockInfo[blockHash].block = block;
      this.hashToInvalidBlockInfo[blockHash].proposal = proposalTx;
      logger.info(
          `[${LOG_HEADER}] Invalid block added to the block pool: ${block.number} / ${block.epoch}`);
    } else {
      logger.info(
          `[${LOG_HEADER}] Invalid block already in the block pool: ${block.number} / ${block.epoch}`);
    }
  }

  addToNumberToBlockSet(block) {
    if (!this.numberToBlockSet[block.number]) {
      this.numberToBlockSet[block.number] = new Set();
    }
    this.numberToBlockSet[block.number].add(block.hash);
  }

  addToNextBlockSet(block) {
    const lastHash = block.last_hash;
    if (!this.hashToNextBlockSet[lastHash]) {
      this.hashToNextBlockSet[lastHash] = new Set();
    }
    this.hashToNextBlockSet[lastHash].add(block.hash);
  }

  addSeenBlock(block, proposalTx, isValid = true) {
    const LOG_HEADER = 'addSeenBlock';
    logger.info(
        `[${LOG_HEADER}] Adding seen block to the block pool: ${block.number} / ${block.epoch} / ${isValid}`);
    const blockHash = block.hash;
    if (isValid) {
      if (!this.checkEpochToBlockMap(block)) {
        return false;
      }
      this.addToHashBlockInfoMap(block, proposalTx);
      this.addToNumberToBlockSet(block);
      this.epochToBlock[block.epoch] = blockHash;
      this.addToNextBlockSet(block);
      this.tryUpdateNotarized(blockHash);
      // FIXME: update all descendants, not just the immediate ones
      if (this.hashToNextBlockSet[blockHash]) {
        for (const val of this.hashToNextBlockSet[blockHash]) {
          this.tryUpdateNotarized(val);
        }
      }
    } else {
      this.addToInvalidBlockInfoMap(block, proposalTx);
      this.addToNumberToBlockSet(block);
    }
    return true;
  }

  hasVote(voteTx, blockHash, isAgainstVote) {
    if (isAgainstVote) {
      if (!this.hashToInvalidBlockInfo[blockHash] || !this.hashToInvalidBlockInfo[blockHash].votes) {
        return false;
      }
      return !!this.hashToInvalidBlockInfo[blockHash].votes.find((v) => v.hash === voteTx.hash);
    } else {
      if (!this.hashToBlockInfo[blockHash] || !this.hashToBlockInfo[blockHash].votes) {
        return false;
      }
      return !!this.hashToBlockInfo[blockHash].votes.find((v) => v.hash === voteTx.hash);
    }
  }

  addSeenVote(voteTx) {
    const LOG_HEADER = 'addSeenVote';
    const blockHash = ConsensusUtil.getBlockHashFromConsensusTx(voteTx);
    const stake = ConsensusUtil.getStakeFromVoteTx(voteTx);
    logger.debug(`[${LOG_HEADER}] voteTx: ${JSON.stringify(voteTx, null, 2)}, ` +
        `blockHash: ${blockHash}, stake: ${stake}`);
    if (ConsensusUtil.isProposalTx(voteTx)) {
      this.addProposal(voteTx, blockHash);
    } else if (ConsensusUtil.isAgainstVoteTx(voteTx)) {
      this.addVoteAgainst(voteTx, blockHash);
    } else {
      this.addVoteFor(voteTx, blockHash, stake);
    }
  }

  addVoteFor(voteTx, blockHash, stake) {
    const LOG_HEADER = 'addVoteFor';
    if (!this.hashToBlockInfo[blockHash]) {
      this.hashToBlockInfo[blockHash] = {};
    }
    if (!this.hashToBlockInfo[blockHash].votes) {
      this.hashToBlockInfo[blockHash].votes = [];
    }
    if (this.hasVote(voteTx, blockHash, false)) {
      logger.debug(`[${LOG_HEADER}] Already have seen this vote`);
      return;
    }
    this.hashToBlockInfo[blockHash].votes.push(voteTx);
    if (this.hashToBlockInfo[blockHash].tallied === undefined) {
      this.hashToBlockInfo[blockHash].tallied = 0;
    }
    // Only counts if the voter was actually included as a validator in the block.
    // To know this, we need the block itself.
    const block = this.hashToBlockInfo[blockHash].block;
    const voter = voteTx.address;
    logger.debug(`[${LOG_HEADER}] Voted for block: ${blockHash}`);
    if (stake > 0 && block && _get(block, `validators.${voter}.stake`) === stake) {
      this.hashToBlockInfo[blockHash].tallied += stake;
      this.tryUpdateNotarized(blockHash);
    }
  }

  addVoteAgainst(voteTx, blockHash) {
    const LOG_HEADER = 'addVoteAgainst';
    if (!this.hashToInvalidBlockInfo[blockHash]) {
      this.hashToInvalidBlockInfo[blockHash] = {};
    }
    if (!this.hashToInvalidBlockInfo[blockHash].votes) {
      this.hashToInvalidBlockInfo[blockHash].votes = [];
    }
    if (this.hasVote(voteTx, blockHash, true)) {
      logger.debug(`[${LOG_HEADER}] Already have seen this vote`);
      return;
    }
    this.hashToInvalidBlockInfo[blockHash].votes.push(voteTx);
    logger.debug(`[${LOG_HEADER}] Voted against block: ${blockHash}`);
  }

  addProposal(proposalTx, blockHash) {
    const LOG_HEADER = 'addProposal';
    if (!this.hashToInvalidBlockInfo[blockHash]) {
      this.hashToInvalidBlockInfo[blockHash] = {};
    } else if (this.hashToInvalidBlockInfo[blockHash].proposal) {
      logger.debug(`[${LOG_HEADER}] Already have seen this proposal`);
      return;
    }
    this.hashToInvalidBlockInfo[blockHash].proposal = proposalTx;
    logger.debug(`[${LOG_HEADER}] Proposal tx for block added: ${blockHash}`);
  }

  tryUpdateNotarized(blockHash) {
    const LOG_HEADER = 'tryUpdateNotarized';
    const currentBlockInfo = this.hashToBlockInfo[blockHash];
    if (!currentBlockInfo || !currentBlockInfo.block) {
      logger.info(`[${LOG_HEADER}] Current block is unavailable`);
      return;
    }
    const lastBlockNumber = currentBlockInfo.block.number - 1;
    const lastHash = currentBlockInfo.block.last_hash;
    const lastFinalizedBlock = this.node.bc.lastBlock();
    let prevBlock;
    if (lastBlockNumber === lastFinalizedBlock.number) {
      prevBlock = lastFinalizedBlock;
    } else if (lastBlockNumber > lastFinalizedBlock.number) {
      prevBlock = _get(this.hashToBlockInfo[lastHash], 'block');
    } else {
      prevBlock = this.node.bc.getBlockByHash(lastHash);
    }
    if (!prevBlock) {
      logger.info(`[${LOG_HEADER}] Prev block is unavailable`);
      return;
    }
    const totalAtStake = Object.values(prevBlock.validators).reduce((acc, cur) => {
      return acc + _get(cur, 'stake', 0);
    }, 0);
    if (currentBlockInfo.tallied &&
        currentBlockInfo.tallied >= totalAtStake * ConsensusConsts.MAJORITY) {
      logger.info(`[${LOG_HEADER}] Notarized block: ${currentBlockInfo.block.hash} ` +
          `(${currentBlockInfo.block.number} / ${currentBlockInfo.block.epoch})`);
      this.hashToBlockInfo[blockHash].notarized = true;
      this.updateLongestNotarizedChains(this.hashToBlockInfo[blockHash]);
    }
  }

  cleanUpForBlockHash(blockHash) {
    delete this.hashToBlockInfo[blockHash];
    delete this.hashToInvalidBlockInfo[blockHash];
    delete this.hashToNextBlockSet[blockHash];
    const db = this.hashToDb.get(blockHash);
    if (db) {
      db.destroyDb();
      this.hashToDb.delete(blockHash);
    }
  }

  // Remove everything that came before lastBlock including lastBlock.
  cleanUpAfterFinalization(lastBlock, recordedInvalidBlocks) {
    const targetNumber = lastBlock.number;
    Object.keys(this.numberToBlockSet).forEach((blockNumber) => {
      if (blockNumber < targetNumber) {
        this.numberToBlockSet[blockNumber].forEach((blockHash) => {
          if (this.hashToInvalidBlockInfo[blockHash]) {
            if (recordedInvalidBlocks.has(blockHash) ||
                blockNumber < targetNumber - ConsensusConsts.MAX_CONSENSUS_LOGS_IN_STATES) {
              this.cleanUpForBlockHash(blockHash);
              this.numberToBlockSet[blockNumber].delete(blockHash);
            }
          } else {
            this.cleanUpForBlockHash(blockHash);
            this.numberToBlockSet[blockNumber].delete(blockHash);
          }
        });
        if (!this.numberToBlockSet[blockNumber].size) {
          delete this.numberToBlockSet[blockNumber];
        }
      }
    });
    Object.keys(this.epochToBlock).forEach((epoch) => {
      if (epoch < lastBlock.epoch) {
        const blockHash = this.epochToBlock[epoch];
        this.cleanUpForBlockHash(blockHash);
        delete this.epochToBlock[epoch];
      }
    });
    this.updateLongestNotarizedChains();
  }

  /**
   * Executes votes for the lastBlock, check that the sum of stakes exceeds the majority,
   * and returns valid votes.
   * @param {Block} lastBlock The block to get the votes for
   * @param {number} blockNumber The block number of the new block
   * @param {DB} tempDb The DB to execute the votes on
   * @returns Array
   */
  getValidLastVotes(lastBlock, blockNumber, blockTime, tempDb) {
    const LOG_HEADER = 'getValidLastVotes';
    const lastBlockInfo = this.hashToBlockInfo[lastBlock.hash];
    logger.debug(`[${LOG_HEADER}] lastBlockInfo: ${JSON.stringify(lastBlockInfo, null, 2)}`);
    // FIXME(minsulee2 or liayoo): When I am behind and a newly coming node is ahead of me,
    // then I cannot get lastBlockInfo from the block-pool. So that, it is not able to create
    // a proper block proposal and also cannot pass checkProposal()
    // where checking prevBlockInfo.notarized.
    const validLastVotes = [];
    const lastVotes = blockNumber > 1 && lastBlockInfo.votes ?
        JSON.parse(JSON.stringify(lastBlockInfo.votes)) : [];
    if (lastBlockInfo && lastBlockInfo.proposal) {
      lastVotes.unshift(lastBlockInfo.proposal);
    }
    const majority = ConsensusUtil.getTotalAtStake(lastBlock.validators) * ConsensusConsts.MAJORITY;
    let tallied = 0;
    for (const vote of lastVotes) {
      if (CommonUtil.isFailedTx(tempDb.executeTransaction(
          Transaction.toExecutable(vote), true, true, 0, blockTime))) {
        logger.debug(`[${LOG_HEADER}] failed to execute last vote: ${JSON.stringify(vote, null, 2)}`);
      } else {
        tallied += _get(lastBlock.validators, `${vote.address}.stake`, 0);
        validLastVotes.push(vote);
      }
    }
    if (blockNumber <= 1 || tallied >= majority) {
      return validLastVotes;
    }
    tempDb.destroyDb();
    throw Error(`[${LOG_HEADER}] lastBlock doesn't have enough votes`);
  }

  /**
   * Checks if there's any evidence in hashToInvalidBlockInfo that can sufficiently
   * (i.e. sum of evidence votes stakes > 2/3 * total stakes) support offenses.
   * Executes the valid evidence votes on baseDb, making changes to the state.
   * Resulting `offenses` has the following structure: { [<address>]: { [<offenseType>]: <number> } },
   * and the `evidence` has the following structure: { [<address>]: [{ offense_type, transactions, block, votes }, ...] }
   * @param {object} validators The validators of the block that the offenses and evidence will be included in.
   * @param {Set} recordedInvalidBlockHashSet A set of invalid block hashes that have been alraedy included in the chain that new block will extend.
   * @param {DB} baseDb The DB instance should be the base of where evidence votes should be executed on.
   * @returns { offenses, evidence }
   */
  getOffensesAndEvidence(validators, recordedInvalidBlockHashSet, blockTime, baseDb) {
    const LOG_HEADER = 'getOffensesAndEvidence';
    const totalAtStake = ConsensusUtil.getTotalAtStake(validators);
    const blockNumber = baseDb.blockNumberSnapshot;
    let backupDb = this.node.createTempDb(
        baseDb.stateVersion, `${StateVersions.SNAP}:${blockNumber}`, blockNumber);
    const majority = totalAtStake * ConsensusConsts.MAJORITY;
    const evidence = {};
    const offenses = {};
    for (const [blockHash, blockInfo] of Object.entries(this.hashToInvalidBlockInfo)) {
      if (recordedInvalidBlockHashSet.has(blockHash)) {
        continue;
      }
      if (!blockInfo.votes || !blockInfo.votes.length) {
        continue;
      }
      const validBlockCandidate = this.hashToBlockInfo[blockHash];
      const block = blockInfo.block || _get(validBlockCandidate, 'block');
      const proposal = blockInfo.proposal || _get(validBlockCandidate, 'proposal');
      if (!block || !proposal) {
        continue;
      }
      const talliedVotes = [];
      let talliedAgainst = 0;
      for (const vote of blockInfo.votes) {
        const stake = _get(validators, `${vote.address}.stake`, 0);
        if (stake > 0) {
          const res = baseDb.executeTransaction(Transaction.toExecutable(vote), true, true, 0, blockTime);
          if (CommonUtil.isFailedTx(res)) {
            logger.debug(`[${LOG_HEADER}] Failed to execute evidence vote:\n${JSON.stringify(vote, null, 2)}\n${JSON.stringify(res, null, 2)})`);
          } else {
            talliedAgainst += stake;
            talliedVotes.push(vote);
          }
        }
      }
      if (talliedAgainst >= majority) {
        const offender = block.proposer;
        if (!evidence[offender]) {
          evidence[offender] = [];
        }
        if (!offenses[offender]) {
          offenses[offender] = {
            [ValidatorOffenseTypes.INVALID_PROPOSAL]: 0
          };
        }
        evidence[offender].push({
          transactions: [proposal],
          block: block,
          votes: talliedVotes,
          offense_type: ValidatorOffenseTypes.INVALID_PROPOSAL
        });
        offenses[offender][ValidatorOffenseTypes.INVALID_PROPOSAL] += 1;
      } else {
        const newBackupDb = this.node.createTempDb(
            backupDb.stateVersion, `${StateVersions.SNAP}:${blockNumber}`, blockNumber);
        baseDb.setStateVersion(newBackupDb.stateVersion, newBackupDb.stateRoot);
        backupDb.destroyDb();
        backupDb = this.node.createTempDb(
            baseDb.stateVersion, `${StateVersions.SNAP}:${blockNumber}`, blockNumber);
      }
    }
    backupDb.destroyDb();
    return { offenses, evidence };
  }
}

module.exports = BlockPool;
