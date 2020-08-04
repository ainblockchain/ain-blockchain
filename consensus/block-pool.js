const get = require('lodash/get');
const logger = require('../logger');
const { ConsensusConsts } = require('./constants');
const { DEBUG, WriteDbOperations } = require('../constants');
const ChainUtil = require('../chain-util');
const LOG_PREFIX = 'BLOCKPOOL';

class BlockPool {
  constructor(node, lastBlock) {
    this.node = node;
    const lastFinalizedBlock = this.node.bc.lastBlock();

    // Mapping of a block hash to the block's info (block, proposal tx, voting txs)
    // e.g. { block_hash: { block, proposal, votes: { address: stake } } }
    this.hashToBlockInfo = {};
    // Mapping of a block hash to the new db state
    this.hashToState = new Map();
    // Mapping of a block hash to a set of block hashes that extend the block. 
    // e.g. { block_hash: Set<block_hash> }
    this.hashToNextBlockSet = {};
    // Mapping of an epoch to the hash of a block proposed at the epoch.
    // e.g. { epoch: block_hash }
    this.epochToBlock = {};
    // Mapping of a number to a set of block hashes proposed for the number.
    // e.g. { number: Set<block_hash> }
    this.numberToBlock = {};

    this.longestNotarizedChainTips = [ lastFinalizedBlock.hash ];

    let lastFinalizedBlockHash, lastFinalizedBlockEpoch, lastFinalizedBlockNumber;
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
        const proposal = BlockPool.filterProposal(lastBlock.last_votes);
        this.hashToBlockInfo[lastFinalizedBlockHash] = {
          block: lastFinalizedBlock,
          proposal,
          votes: lastBlock.last_votes.filter(val => val.hash !== proposal.hash),
          notarized: true
        };
        this.hashToNextBlockSet[lastFinalizedBlockHash] = new Set([ lastBlockHash ]);
        this.epochToBlock[lastFinalizedBlockEpoch] = lastFinalizedBlockHash;
        this.numberToBlock[lastFinalizedBlockNumber] = new Set([ lastFinalizedBlockHash ]);
      }
      this.hashToBlockInfo[lastBlockHash] = { block: lastBlock };
      this.epochToBlock[lastBlockEpoch] = lastBlockHash;
      this.numberToBlock[lastBlockNumber] = new Set([ lastBlockHash ]);
    } else if (lastFinalizedBlock) {
      this.hashToBlockInfo[lastFinalizedBlockHash] = { block: lastFinalizedBlock, notarized: true };
      this.epochToBlock[lastFinalizedBlockEpoch] = lastFinalizedBlockHash;
      this.numberToBlock[lastFinalizedBlockNumber] = new Set([ lastFinalizedBlockHash ]);
    }
  }

  updateLongestNotarizedChains() {
    const LOG_SUFFIX = 'updateLongestNotarizedChains';
    const currentLongest = this.longestNotarizedChainTips.length ? 
        get(this.hashToBlockInfo[this.longestNotarizedChainTips[0]], 'block.number')
        : this.node.bc.lastBlockNumber();
    if (currentLongest == undefined) {
      logger.error(`[${LOG_PREFIX}:${LOG_SUFFIX}] Notarized block's info is missing: ${this.longestNotarizedChainTips[0]}`);
      return;
    }
    const longestChains = this.getLongestNotarizedChainList();
    if (DEBUG) {
      logger.debug(`[${LOG_PREFIX}:${LOG_SUFFIX}] longestChains: ${JSON.stringify(longestChains, null, 2)}`);
    }
    this.longestNotarizedChainTips = longestChains.reduce((a, b) => { a.push(b[b.length - 1].hash); return a; }, []);
  }

  getExtendingChain(blockHash, withInfo = false) {
    const LOG_SUFFIX = 'getExtendingChain';
    const chain = [];
    const finalizedBlock = this.node.bc.lastBlock();
    let currBlockWithInfo = this.hashToBlockInfo[blockHash];
    if (!currBlockWithInfo || !currBlockWithInfo.block || currBlockWithInfo.block.number <= finalizedBlock.number) {
      return [];
    }
    while (currBlockWithInfo && currBlockWithInfo.block && currBlockWithInfo.block.number > finalizedBlock.number) {
      chain.unshift(withInfo ? currBlockWithInfo : currBlockWithInfo.block);
      currBlockWithInfo = this.hashToBlockInfo[currBlockWithInfo.block.last_hash];
    }
    if (DEBUG) {
      logger.debug(`[${LOG_PREFIX}:${LOG_SUFFIX}] currBlockWithInfo: ${JSON.stringify(currBlockWithInfo, null, 2)}\nfinalizedBlock: ${JSON.stringify(finalizedBlock, null, 2)}`);
    }
    if (!currBlockWithInfo || !currBlockWithInfo.block) {
      logger.error(`[${LOG_PREFIX}:${LOG_SUFFIX}] Block info is missing`);
      return [];
    }
    if (currBlockWithInfo.block.hash !== finalizedBlock.hash) {
      logger.error(`[${LOG_PREFIX}:${LOG_SUFFIX}] Incorrect chain`);
      return [];
    }
    return chain;
  }

  getLongestNotarizedChainList(fromBlock, withInfo = false) {
    const LOG_SUFFIX = 'getLongestNotarizedChainList';
    const lastBlockNumber = this.node.bc.lastBlockNumber();
    const lastFinalized = fromBlock ? fromBlock
        : lastBlockNumber < 1 ? { block: this.node.bc.lastBlock(), notarized: true }
            : this.hashToBlockInfo[this.node.bc.lastBlock().hash];
    if (DEBUG) {
      logger.debug(`[${LOG_PREFIX}:${LOG_SUFFIX}] lastFinalized: ${JSON.stringify(lastFinalized, null, 2)}`);
    }
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
    let longestNumber = chainList.length ? 
        withInfo ? chainList[0][chainList[0].length - 1].block.number
            : chainList[0][chainList[0].length - 1].number : 0;
    if (blockNumber > longestNumber) {
      if (DEBUG) {
        logger.debug(`[blockPool:dfsLongest] New longest chain found: ${JSON.stringify(currentChain, null, 2)}, longestNumber: ${blockNumber}`);
      }
      chainList.length = 0;
      chainList.push([...currentChain]);
      longestNumber = blockNumber;
    } else if (blockNumber === longestNumber) {
      if (DEBUG) {
        logger.debug(`[blockPool:dfsLongest] Another longest chain found: ${JSON.stringify(currentChain, null, 2)}, longestNumber: ${blockNumber}`);
      }
      chainList.push([...currentChain]);
    }
    if (!nextBlockSet || !nextBlockSet.size) {
      currentChain.pop();
      return;
    }

    for (let val of nextBlockSet) {
      this.dfsLongest(this.hashToBlockInfo[val], currentChain, chainList, withInfo);
    }
    currentChain.pop();
    if (DEBUG) {
      logger.debug(`[blockPool:dfsLongest] returning.. currentChain: ${JSON.stringify(currentChain, null, 2)}`);
    }
  }

  // A finalizable chain (extension of current finalized chain):
  //  1. all of its blocks are notarized
  //  2. ends with three blocks that have consecutive epoch numbers
  getFinalizableChain() {
    const lastFinalized = { block: this.node.bc.lastBlock(), notarized: true };
    return this.dfsFinalizable(lastFinalized, []);
  }

  dfsFinalizable(currentNode, currentChain) {
    const LOG_SUFFIX = 'dfsFinalizable';
    // Cannot add a non-notarized block to a finalized chain.
    if (!currentNode || !currentNode.notarized || !currentNode.block) {
      return BlockPool.endsWithThreeConsecutiveEpochs(currentChain) ? [...currentChain] : [];
    }
    currentChain.push(currentNode.block);
    const nextBlockSet = this.hashToNextBlockSet[currentNode.block.hash];
    if (!nextBlockSet || !nextBlockSet.size) {
      if (BlockPool.endsWithThreeConsecutiveEpochs(currentChain)) {
        if (DEBUG) {
          logger.debug(`[${LOG_PREFIX}:${LOG_SUFFIX}] No next blocks but found a finalizable chain`);
        }
        const chainCopy = [...currentChain];
        currentChain.pop();
        return chainCopy;
      }
      if (DEBUG) {
        logger.debug(`[${LOG_PREFIX}:${LOG_SUFFIX}] No next blocks.. returning empty array`);
      }
      currentChain.pop();
      return [...currentChain];
    }
    let res;
    let longest = [];
    for (let blockHash of nextBlockSet) {
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
      .filter(blockInfo => !!blockInfo.block && blockInfo.block.number === number && 
          blockInfo.proposal && blockInfo.notarized);
    return blockArr;
  }

  getNotarizedBlockByHash(hash) {
    const LOG_SUFFIX = 'getNotarizedBlockByHash';
    const blockInfo = this.hashToBlockInfo[hash];
    if (DEBUG) {
      logger.debug(`[${LOG_PREFIX}:${LOG_SUFFIX}] blockInfo: ${JSON.stringify(blockInfo, null, 2)}`);
    }
    return blockInfo && blockInfo.block && blockInfo.notarized ? blockInfo.block : null;
  }

  hasSeenBlock(block) {
    const blockInfo = this.hashToBlockInfo[block.hash];
    return blockInfo && blockInfo.block && (blockInfo.block.number === 0 || blockInfo.proposal);
  }

  addSeenBlock(block, proposalTx) {
    const LOG_SUFFIX = 'addSeenBlock';
    // Check that there's no other block proposed at the same epoch
    if (this.epochToBlock[block.epoch] && this.epochToBlock[block.epoch] !== block.hash) {
      const conflict = this.hashToBlockInfo[this.epochToBlock[block.epoch]];
      if (conflict && conflict.notarized) {
        logger.error(`[${LOG_PREFIX}:${LOG_SUFFIX}] multiple blocks proposed for epoch ${block.epoch} (${block.hash}, ${this.epochToBlock[block.epoch]})`);
        return false;
      }
      logger.info(`[${LOG_PREFIX}:${LOG_SUFFIX}] multiple blocks proposed for epoch ${block.epoch} (${block.hash}, ${this.epochToBlock[block.epoch]}) BUT is not notarized`);
      // FIXME: remove info about the block that's currently this.epochToBlock[block.epoch] ?
    }
    // Update hashToBlockInfo
    const blockHash = block.hash;
    if (!this.hashToBlockInfo[blockHash]) {
      this.hashToBlockInfo[blockHash] = {};
    }
    const blockInfo = this.hashToBlockInfo[blockHash];
    console.log('addSeenBlock')
    console.log(blockInfo);
    if (!ChainUtil.isNonEmptyObject(blockInfo.block)) {
      this.hashToBlockInfo[blockHash].block = block;
      this.hashToBlockInfo[blockHash].proposal = proposalTx;
      // We might have received some votes before the block itself
      if (!blockInfo.tallied && blockInfo.votes) {
        this.hashToBlockInfo[blockHash].tallied = 0;
        blockInfo.votes.forEach(vote => {
          if (block.validators[vote.address]) {
            this.hashToBlockInfo[blockHash].tallied += get(vote, 'operation.value.stake');
          }
        });
        this.tryUpdateNotarized(blockHash);
      }
      logger.info(`[${LOG_PREFIX}:${LOG_SUFFIX}] block added to the block pool`);
    } else {
      logger.info(`[${LOG_PREFIX}:${LOG_SUFFIX}] block already in the block pool`);
    }

    this.epochToBlock[block.epoch] = blockHash;

    if (!this.numberToBlock[block.number]) {
      this.numberToBlock[block.number] = new Set();
    }
    this.numberToBlock[block.number].add(block.hash);

    const lastHash = block.last_hash;
    if (!this.hashToNextBlockSet[lastHash]) {
      this.hashToNextBlockSet[lastHash] = new Set();
    }
    this.hashToNextBlockSet[lastHash].add(blockHash);

    // Try updating notarized info for block and next block (if applicable)
    this.tryUpdateNotarized(blockHash);
    // FIXME: update all descendants, not just the immediate ones
    if (this.hashToNextBlockSet[blockHash]) {
      for (let val of this.hashToNextBlockSet[blockHash]) {
        this.tryUpdateNotarized(val);
      }
    }
    return true;
  }

  addSeenVote(voteTx, currentEpoch) {
    const LOG_SUFFIX = 'addSeenVote';
    const blockHash = get(voteTx, 'operation.value.block_hash');
    const stake = get(voteTx, 'operation.value.stake');
    if (DEBUG) {
      logger.debug(`[${LOG_PREFIX}:${LOG_SUFFIX}] voteTx: ${JSON.stringify(voteTx, null, 2)}, blockHash: ${blockHash}, stake: ${stake}`);
    }
    if (!this.hashToBlockInfo[blockHash]) {
      this.hashToBlockInfo[blockHash] = {};
    }
    if (!this.hashToBlockInfo[blockHash].votes) {
      this.hashToBlockInfo[blockHash].votes = [];
    }
    if (this.hashToBlockInfo[blockHash].votes.filter(v => v.hash === voteTx.hash).length) {
      logger.info(`[${LOG_PREFIX}:${LOG_SUFFIX}] we've already seen this vote`);
      return;
    }
    if (this.hashToBlockInfo[blockHash].tallied === undefined) {
      this.hashToBlockInfo[blockHash].tallied = 0;
    }
    this.hashToBlockInfo[blockHash].votes.push(voteTx);
    // Only counts if the voter was actually included as a validator in the block.
    // To know this, we need the block itself.
    const block = this.hashToBlockInfo[blockHash].block;
    if (currentEpoch && block && block.epoch < currentEpoch) {
      logger.info(`[${LOG_PREFIX}:${LOG_SUFFIX}] Possibly a stale vote (${block.epoch} / ${currentEpoch})`);
      // FIXME
    }
    const voter = voteTx.address;
    if (DEBUG) {
      logger.debug(`[${LOG_PREFIX}:${LOG_SUFFIX}] voted block: ${JSON.stringify(block, null, 2)}`);
      logger.debug(`[${LOG_PREFIX}:${LOG_SUFFIX}] ${block && block.validators[voter] === stake}`);
    }
    if (stake > 0 && block && block.validators[voter] === stake) {
      this.hashToBlockInfo[blockHash].tallied += stake;
      this.tryUpdateNotarized(blockHash);
    }
  }

  tryUpdateNotarized(blockHash) {
    const LOG_SUFFIX = 'tryUpdateNotarized';
    const currentBlockInfo = this.hashToBlockInfo[blockHash];
    if (!currentBlockInfo || !currentBlockInfo.block) {
      logger.info(`[${LOG_PREFIX}:${LOG_SUFFIX}] Current block is unavailable`);
      return;
    }
    const lastHash = currentBlockInfo.block.last_hash;
    // use lastFinalizedBlock instead ?
    const prevBlock = get(this.hashToBlockInfo[lastHash], 'block') || this.node.bc.getBlockByHash(lastHash);
    if (!prevBlock) {
      logger.info(`[${LOG_PREFIX}:${LOG_SUFFIX}] Prev block is unavailable`);
      return;
    }
    const totalAtStake = Object.values(prevBlock.validators).reduce((a, b) => { return a + b; }, 0);
    if (currentBlockInfo.tallied && currentBlockInfo.tallied >= totalAtStake * ConsensusConsts.MAJORITY) {
      logger.info(`[${LOG_PREFIX}:${LOG_SUFFIX}] block ${currentBlockInfo.block.hash} is notarized!`);
      this.hashToBlockInfo[blockHash].notarized = true;
      this.updateLongestNotarizedChains(this.hashToBlockInfo[blockHash]);
    }
  }

  // Remove everything that came before lastBlock including lastBlock.
  cleanUpAfterFinalization(lastBlock) {
    const number = lastBlock.number;
    const blocksToRemove = Object.values(this.hashToBlockInfo)
      .filter(val => {
        let blockNumber;
        if (val.block) {
          blockNumber = val.block.number;
        } else if (val.votes || val.proposal) {
          blockNumber = BlockPool.getBlockNumberFromTx(val.votes ? val.votes[0] : val.proposal);
        }
        return !blockNumber || blockNumber < number;
      });
    blocksToRemove.forEach(blockInfo => {
      const blockHash = blockInfo.block ? blockInfo.block.hash
          : BlockPool.getBlockHashFromTx(blockInfo.votes && blockInfo.votes.length ? blockInfo.votes[0] : blockInfo.proposal);
      if (blockHash) {
        delete this.hashToBlockInfo[blockHash];
        delete this.numberToBlock[number];
        delete this.hashToNextBlockSet[blockHash];
        this.hashToState.delete(blockHash);
      }
    });
    Object.keys(this.numberToBlock).forEach(key => {
      if (key < number) delete this.numberToBlock[key];
    });
    Object.keys(this.epochToBlock).forEach(key => {
      if (key < lastBlock.epoch) delete this.epochToBlock[key];
    });
    this.updateLongestNotarizedChains();
  }

  static filterProposal(votes) {
    if (!votes) return null;
    const proposalSuffix = 'propose';
    return votes.filter(tx => {
      if (tx.operation.type === WriteDbOperations.SET_VALUE) {
        return tx.operation.ref.endsWith(proposalSuffix);
      } else if (tx.operation.type === WriteDbOperations.SET) {
        return tx.operation.op_list[0].ref.endsWith(proposalSuffix);
      }
      return false;
    })[0];
  }

  static getBlockNumberFromTx(tx) {
    if (!tx || !tx.operation) return null;
    const ref = tx.operation.ref ? tx.operation.ref
        : get(tx, 'operation.op_list')[0].ref;
    const refSplit = ref ? ref.split("/") : [];
    return refSplit.length > 3 ? refSplit[3] : null;
  }

  static getBlockHashFromTx(tx) {
    if (!tx || !tx.operation) return null;
    if (tx.operation.type === WriteDbOperations.SET_VALUE) {
      return get(tx.operation, 'value.block_hash');
    } else if (tx.operation.type === WriteDbOperations.SET) {
      return get(tx.operation.op_list[0], 'value.block_hash');
    } else {
      return null;
    }
  }
}

module.exports = BlockPool;