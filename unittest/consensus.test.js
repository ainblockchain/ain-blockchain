const chai = require('chai');
const expect = chai.expect;
const rimraf = require('rimraf');
const { CHAINS_DIR } = require('../common/constants');
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
    const tx = getTransaction(node1,
      { operation: 
        { 
          type: 'SET_VALUE', 
          ref: '/afan/test', 
          value: 'foo'
        } 
      }
    );
    addBlock(node1, [tx], [], {});
    const lastBlock = node1.bc.lastBlock();
    const voteTx = getTransaction(node1,
        { operation: 
          { 
            type: 'SET_VALUE', 
            ref: `/consensus/number/1/vote/${node1.account.address}`,
            value: { block_hash: lastBlock.hash, stake: 0 }
          }
        }
      );
    expect(node1.db.executeTransaction(voteTx).code).to.equal(103);
  });

  it("Staked nodes can vote", () => {
    const addr = node1.account.address;
    const depositTx = getTransaction(node1,
      { operation: 
        { 
          type: 'SET_VALUE', 
          ref: `/deposit/consensus/${addr}/key1/value`, 
          value: 200
        } 
      }
    );
    addBlock(node1, [depositTx], [], {});
    const lastBlock = node1.bc.lastBlock();
    const voteTx = getTransaction(node1,
      { operation: 
        { 
          type: 'SET_VALUE', 
          ref: `/consensus/number/${lastBlock.number}/vote/${addr}`,
          value: { block_hash: lastBlock.hash, stake: 200 }
        }
      }
    );
    expect(node1.db.executeTransaction(voteTx)).to.equal(true);
  });
});