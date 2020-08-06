const chai = require('chai');
const expect = chai.expect;
const rimraf = require('rimraf');
const { BLOCKCHAINS_DIR } = require('../constants');
const Node = require('../node');
const { setDbForTesting, getTransaction, addBlock } = require('./test-util')

describe("Consensus", () => {
  let node1, node2;

  beforeEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);

    node1 = new Node();
    setDbForTesting(node1, 0);
    node2 = new Node();
    setDbForTesting(node2, 1);
  });

  afterEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);
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
    expect(node1.db.executeTransaction(voteTx).code).to.equal(2);
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