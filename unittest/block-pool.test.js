const chai = require('chai');
const expect = chai.expect;
const rimraf = require('rimraf');
const assert = chai.assert;
const { CHAINS_DIR, PredefinedDbPaths } = require('../common/constants');
const BlockPool = require('../consensus/block-pool');
const BlockchainNode = require('../node');
const { Block } = require('../blockchain/block');
const { setNodeForTesting, getTransaction } = require('./test-util')

describe("BlockPool", () => {
  let node1;

  beforeEach(() => {
    rimraf.sync(CHAINS_DIR);

    node1 = new BlockchainNode();
    setNodeForTesting(node1, 0, true);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  function createAndAddBlock(node, blockPool, lastBlock, number, epoch) {
    const block = Block.create(
        lastBlock.hash, [], {}, [], [], number, epoch, '', node.account.address,
        {[node.account.address]: { [PredefinedDbPaths.CONSENSUS_STAKE]: 100000, [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true } }, 0, 0);
    const proposal = getTransaction(node, {
        operation: {
          type: 'SET_VALUE',
          ref: `/consensus/number/${block.number}/propose`,
          value: {
            number: block.number,
            epoch: block.epoch,
            validators: { [node.account.address]: { [PredefinedDbPaths.CONSENSUS_STAKE]: 100000, [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true } },
            total_at_stake: 100000,
            proposer: node.account.address,
            block_hash: block.hash
          }
        },
        gas_price: 1
      }
    );
    blockPool.addSeenBlock(block, proposal);
    return block;
  }

  function createAndAddVote(node, blockPool, block) {
    const voteTx = getTransaction(node, {
      operation: {
        type: 'SET_VALUE',
        ref: `/consensus/number/${block.number}/${block.hash}/vote`,
        value: {
          block_hash: block.hash,
          stake: 100000,
          is_against: false
        }
      },
      gas_price: 1
    });
    blockPool.addSeenVote(voteTx);
  }

  it("Adds blocks to BlockPool", () => {
    const lastBlock = node1.bc.lastBlock();
    const addr = node1.account.address;
    const block = Block.create(
        lastBlock.hash, [], {}, [], [], lastBlock.number + 1, lastBlock.epoch + 1, '', addr,
        {[addr]: { [PredefinedDbPaths.CONSENSUS_STAKE]: 100000, [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true }}, 0, 0);
    const proposalTx = getTransaction(node1, {
        operation: {
          type: 'SET_VALUE',
          ref: `/consensus/number/${block.number}/propose`,
          value: {
            number: block.number,
            epoch: block.epoch,
            validators: {[addr]: { [PredefinedDbPaths.CONSENSUS_STAKE]: 100000, [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true } },
            total_at_stake: 100000,
            proposer: addr,
            block_hash: block.hash
          }
        },
        gas_price: 1
      }
    );
    const blockPool = new BlockPool(node1);
    blockPool.addSeenBlock(block, proposalTx);
    assert.deepEqual(blockPool.hashToBlockInfo[block.hash].block, block);
    expect(blockPool.epochToBlock[block.epoch]).to.equal(block.hash);
    expect(blockPool.hashToNextBlockSet[block.last_hash].has(block.hash)).to.equal(true);
  });

  it("Returns an empty array if there's no finalizable chain", () => {
    const addr = node1.account.address;
    const lastBlock = node1.bc.lastBlock();
    const block = Block.create(
        lastBlock.hash, [], {}, [], [], lastBlock.number + 1, lastBlock.epoch + 1, '', addr,
        {[addr]: { [PredefinedDbPaths.CONSENSUS_STAKE]: 100000, [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true }}, 0, 0);
    const proposalTx = getTransaction(node1, {
        operation: {
          type: 'SET_VALUE',
          ref: `/consensus/number/${block.number}/propose`,
          value: {
            number: block.number,
            epoch: block.epoch,
            validators: {[addr]: { [PredefinedDbPaths.CONSENSUS_STAKE]: 100000, [PredefinedDbPaths.CONSENSUS_PROPOSAL_RIGHT]: true } },
            total_at_stake: 100000,
            proposer: addr,
            block_hash: block.hash
          }
        },
        gas_price: 1
      }
    );
    const blockPool = new BlockPool(node1);
    blockPool.addSeenBlock(block, proposalTx);
    const finalizableChain = blockPool.getFinalizableChain();
    assert.deepEqual(finalizableChain, []);
  });

  it("Returns a finalizable chain", () => {
    /*
      Notation: ID(block number, epoch, notarized)

      A(0,0,T) -> B(1,1,T) -> C(2,3,T) -> D(3,4,T) -> E(4,5,T)
                            \
                             v
                              F(2,2,T) -> G(3,6,F)
    */
    
    // block A = genesis block (0,0)
    const blockA = node1.bc.lastBlock();
    const blockPool = new BlockPool(node1);

    // block B (1,1)
    const blockB = createAndAddBlock(node1, blockPool, blockA, blockA.number + 1, blockA.epoch + 1);
    createAndAddVote(node1, blockPool, blockB);
    expect(blockPool.hashToBlockInfo[blockB.hash].notarized).to.equal(true);

    // block F (2,2)
    const blockF = createAndAddBlock(node1, blockPool, blockB, blockB.number + 1, blockB.epoch + 1);

    // block C (2,3)
    const blockC = createAndAddBlock(node1, blockPool, blockB, blockB.number + 1, blockB.epoch + 2);

    createAndAddVote(node1, blockPool, blockF);
    expect(blockPool.hashToBlockInfo[blockF.hash].notarized).to.equal(true);
    createAndAddVote(node1, blockPool, blockC);
    expect(blockPool.hashToBlockInfo[blockC.hash].notarized).to.equal(true);

    // block D (3,4)
    const blockD = createAndAddBlock(node1, blockPool, blockC, blockC.number + 1, blockC.epoch + 1);

    // block E (4,5)
    const blockE = createAndAddBlock(node1, blockPool, blockD, blockD.number + 1, blockD.epoch + 1);

    // block G (3,6)
    const blockG = createAndAddBlock(node1, blockPool, blockF, blockF.number + 1, blockF.epoch + 4);
    expect(blockPool.hashToBlockInfo[blockG.hash].notarized).to.equal(undefined);

    createAndAddVote(node1, blockPool, blockD);
    expect(blockPool.hashToBlockInfo[blockD.hash].notarized).to.equal(true);
    createAndAddVote(node1, blockPool, blockE);
    expect(blockPool.hashToBlockInfo[blockE.hash].notarized).to.equal(true);

    const finalizableChain = blockPool.getFinalizableChain();
    assert.deepEqual(finalizableChain, [blockA, blockB, blockC, blockD, blockE]);
  });

  it("Correctly returns the longest notarized chain", () => {
    /*
      Notation: ID(block number, epoch, notarized)

      A(0,0,T) -> B(1,1,T) -> C(2,3,T) -> D(3,5,T) -> E(4,7,T)
                            \
                             v
                              F(2,2,T) -> G(3,6,F)
    */

    const blockPool = new BlockPool(node1);

    // block A = genesis block (0,0)
    const blockA = node1.bc.lastBlock();

    // block B (1,1)
    const blockB = createAndAddBlock(node1, blockPool, blockA, blockA.number + 1, blockA.epoch + 1);
    createAndAddVote(node1, blockPool, blockB);

    // block F (2,2)
    const blockF = createAndAddBlock(node1, blockPool, blockB, blockB.number + 1, blockB.epoch + 1);

    // block C (2,3)
    const blockC = createAndAddBlock(node1, blockPool, blockB, blockB.number + 1, blockB.epoch + 2);
    
    // postpone voting (& notarizing) so that we can add a block with the same number
    createAndAddVote(node1, blockPool, blockF);
    createAndAddVote(node1, blockPool, blockC);

    // block D (3,5)
    const blockD = createAndAddBlock(node1, blockPool, blockC, blockC.number + 1, blockC.epoch + 2);

    // block G (3,6)
    const blockG = createAndAddBlock(node1, blockPool, blockF, blockF.number + 1, blockF.epoch + 4);
    
    // Same reason for postponing as above
    createAndAddVote(node1, blockPool, blockD);

    // block E (4,7)
    const blockE = createAndAddBlock(node1, blockPool, blockD, blockD.number + 1, blockD.epoch + 2);
    createAndAddVote(node1, blockPool, blockE);

    const longestNotarizedChain = blockPool.getLongestNotarizedChainList();
    assert.deepEqual(longestNotarizedChain, [[blockA, blockB, blockC, blockD, blockE]]);
  });
});