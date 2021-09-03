const chai = require('chai');
const expect = chai.expect;
const rimraf = require('rimraf');
const {
  CHAINS_DIR,
  MIN_STAKE_PER_VALIDATOR,
  MAX_STAKE_PER_VALIDATOR,
  PredefinedDbPaths,
} = require('../common/constants');
const BlockchainNode = require('../node');
const { setNodeForTesting, getTransaction, addBlock } = require('./test-util')

describe("Consensus", () => {
  let node1, node2;

  beforeEach(() => {
    rimraf.sync(CHAINS_DIR);

    node1 = new BlockchainNode();
    setNodeForTesting(node1, 0);
    node2 = new BlockchainNode();
    setNodeForTesting(node2, 1);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  it("Non-staked nodes cannot vote", () => {
    const tx = getTransaction(node1, {
        operation: { 
          type: 'SET_VALUE', 
          ref: `/transfer/${node1.account.address}/${node2.account.address}/0/value`,
          value: 1
        },
        nonce: -1,
        gas_price: 1
      }
    );
    addBlock(node1, [tx], [], {});
    const lastBlock = node1.bc.lastBlock();
    const voteTx = getTransaction(node2, {
        operation: { 
          type: 'SET_VALUE', 
          ref: `/consensus/number/1/${lastBlock.hash}/vote/${node2.account.address}`,
          value: { block_hash: lastBlock.hash, stake: 100000, is_against: false }
        },
        nonce: -1,
        gas_price: 1
      }
    );
    expect(node1.db.executeTransaction(voteTx).code).to.equal(103);
  });

  it("Staked nodes can vote", () => {
    const addr = node2.account.address; // Staked node without producing rights
    const stakeTx = getTransaction(node2, {
        operation: { 
          type: 'SET_VALUE', 
          ref: `/staking/consensus/${addr}/0/stake/key1/value`, 
          value: 100000
        },
        nonce: -1,
        gas_price: 1
      }
    );
    addBlock(node1, [stakeTx], [], {});
    const lastBlock = node1.bc.lastBlock();
    const voteTx = getTransaction(node2, {
        operation: {
          type: 'SET_VALUE', 
          ref: `/consensus/number/${lastBlock.number}/${lastBlock.hash}/vote/${addr}`,
          value: { block_hash: lastBlock.hash, stake: 100000, is_against: false }
        },
        nonce: -1,
        gas_price: 1
      }
    );
    expect(node1.db.executeTransaction(voteTx).code).to.equal(0);
  });

  it('Staked nodes without producing rights cannot propose blocks', () => {
    const addr = node2.account.address;
    const stakeTx = getTransaction(node2, {
        operation: { 
          type: 'SET_VALUE', 
          ref: `/staking/consensus/${addr}/0/stake/key1/value`, 
          value: 100000
        },
        nonce: -1,
        gas_price: 1
      }
    );
    addBlock(node1, [stakeTx], [], {});
    const lastBlock = node1.bc.lastBlock();
    const voteTx = getTransaction(node2, {
        operation: {
          type: 'SET_VALUE', 
          ref: `/consensus/number/${lastBlock.number + 1}/propose/${addr}`,
          value: {
            number: lastBlock.number + 1,
            proposer: addr,
            gas_cost_total: 0
          }
        },
        nonce: -1,
        gas_price: 1
      }
    );
    expect(node1.db.executeTransaction(voteTx).code).to.equal(103);
  });

  it('Whitelisted validators must stake within MIN_STAKE_PER_VALIDATOR & MAX_STAKE_PER_VALIDATOR to have the producing rights', () => {
    let lastBlock = node1.bc.lastBlock();
    const addr = node2.account.address;
    // Bypass whitelist rule check (need owner's private key)
    const tempDb = node1.createTempDb(node1.db.stateVersion, 'CONSENSUS_UNIT_TEST', lastBlock.number);
    tempDb.writeDatabase(
        [PredefinedDbPaths.VALUES_ROOT, PredefinedDbPaths.CONSENSUS, PredefinedDbPaths.CONSENSUS_WHITELIST, addr],
        true);
    node1.cloneAndFinalizeVersion(tempDb.stateVersion, -1); // Bypass already existing final state version
    
    // Staking less than MIN_STAKE_PER_VALIDATOR
    let stakeAmount = MIN_STAKE_PER_VALIDATOR - 1;
    const stakeLessThanMin = getTransaction(node2, {
        operation: { 
          type: 'SET_VALUE', 
          ref: `/staking/consensus/${addr}/0/stake/key1/value`, 
          value: stakeAmount
        },
        nonce: -1,
        gas_price: 1
      }
    );
    addBlock(node1, [stakeLessThanMin], [], {});
    lastBlock = node1.bc.lastBlock();
    const voteWithStakeLessThanMin = getTransaction(node2, {
        operation: {
          type: 'SET_VALUE',
          ref: `/consensus/number/${lastBlock.number + 1}/propose/${addr}`,
          value: {
            number: lastBlock.number + 1,
            proposer: addr,
            gas_cost_total: 0
          }
        },
        nonce: -1,
        gas_price: 1
      }
    );
    expect(node1.db.executeTransaction(voteWithStakeLessThanMin).code).to.equal(103); // Fails

    // Staking MIN_STAKE_PER_VALIDATOR
    const stakeEqualMin = getTransaction(node2, {
        operation: { 
          type: 'SET_VALUE', 
          ref: `/staking/consensus/${addr}/0/stake/key2/value`, 
          value: 1
        },
        nonce: -1,
        gas_price: 1
      }
    );
    addBlock(node1, [stakeEqualMin], [], {});
    lastBlock = node1.bc.lastBlock();
    const voteWithStakeEqualMin = getTransaction(node2, {
        operation: {
          type: 'SET_VALUE', 
          ref: `/consensus/number/${lastBlock.number + 1}/propose/${addr}`,
          value: {
            number: lastBlock.number + 1,
            proposer: addr,
            gas_cost_total: 0
          }
        },
        nonce: -1,
        gas_price: 1
      }
    );
    expect(node1.db.executeTransaction(voteWithStakeEqualMin).code).to.equal(0); // Succeeds

    // Staking more than MAX_STAKE_PER_VALIDATOR
    const stakeMoreThanMax = getTransaction(node2, {
        operation: { 
          type: 'SET_VALUE', 
          ref: `/staking/consensus/${addr}/0/stake/key3/value`, 
          value: MAX_STAKE_PER_VALIDATOR - MIN_STAKE_PER_VALIDATOR + 1 // 1 more than MAX_STAKE_PER_VALIDATOR
        },
        nonce: -1,
        gas_price: 1
      }
    );
    addBlock(node1, [stakeMoreThanMax], [], {});
    lastBlock = node1.bc.lastBlock();
    const voteWithStakeMoreThanMax = getTransaction(node2, {
        operation: {
          type: 'SET_VALUE', 
          ref: `/consensus/number/${lastBlock.number + 1}/propose/${addr}`,
          value: {
            number: lastBlock.number + 1,
            proposer: addr,
            gas_cost_total: 0
          }
        },
        nonce: -1,
        gas_price: 1
      }
    );
    expect(node1.db.executeTransaction(voteWithStakeMoreThanMax).code).to.equal(103); // Fails
  });
});