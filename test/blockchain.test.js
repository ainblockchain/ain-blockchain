const Blockchain = require('../blockchain/');
const {ForgedBlock} = require('../blockchain/block');
const chai = require('chai');
const expect = chai.expect;
const rimraf = require('rimraf');
const assert = chai.assert;
const DB = require('../db');
const TransactionPool = require('../db/transaction-pool');

describe('Blockchain', () => {
  let bc; let bc2; let tp;

  beforeEach(() => {
    db = new DB();
    bc = new Blockchain('first-blockchain');
    bc2 = new Blockchain('second-blockchain');
    // Manage use of these transaction pools beer
    tp = new TransactionPool();
    db1 = DB.getDatabase(bc, tp);
    db2 = DB.getDatabase(bc2, new TransactionPool());
  });

  afterEach(() => {
    rimraf.sync(bc._blockchainDir());
    rimraf.sync(bc2._blockchainDir());
  });


  it('starts with genesis block', () => {
    assert.deepEqual(bc.chain[0], ForgedBlock.genesis());
  });

  it('adds new block', () => {
    const data = 'foo';
    bc.addNewBlock(ForgedBlock.forgeBlock(data, db, bc.height() + 1, bc.lastBlock()));
    expect(bc.chain[bc.chain.length -1].data).to.equal(data);
  });

  it('validates a valid chain', () => {
    const data = 'foo';
    bc.addNewBlock(ForgedBlock.forgeBlock(data, db, bc.height() + 1, bc.lastBlock()));
    expect(Blockchain.isValidChain(bc.chain)).to.equal(true);
  });

  it('invalidates chain with corrupt genesis block', () => {
    bc2.chain[0].data = ':(';
    expect(Blockchain.isValidChain(bc2.chain)).to.equal(false);
  });

  it('invalidates corrupt chain', () => {
    const data = 'foo';
    bc.addNewBlock(ForgedBlock.forgeBlock(data, db, bc.height() + 1, bc.lastBlock()));
    bc.chain[bc.height()].data = ':(';
    expect(Blockchain.isValidChain(bc.chain)).to.equal(false);
  });

  describe('with lots of blocks', () => {
    let blocks; let blockHash;

    beforeEach(() => {
      blocks = [];

      for (let i = 0; i<1000; i++) {
        // let i represent a fake block here
        db1.createTransaction({
          type: 'SET_VALUE',
          ref: 'test/something',
          value: 'val'
        });
        const block = ForgedBlock.forgeBlock(tp.validTransactions(), db1, bc.height() + 1, bc.lastBlock());
        if (block.height === 500) {
          blockHash = block.hash;
        }
        blocks.push(block);
        bc.addNewBlock(block);
        tp.removeCommitedTransactions(block);
      }
    });

    it(' can sync on startup', () => {
      while (bc.lastBlock().hash !== bc2.lastBlock().hash) {
        const blockSection = bc.requestBlockchainSection(bc2.lastBlock());
        if (blockSection) {
          bc2.merge(blockSection);
        }
      }
      assert.deepEqual(JSON.stringify(bc.chain), JSON.stringify(bc2.chain));
    });

    it('can be queried by index', () => {
      assert.deepEqual(JSON.stringify(bc.getChainSection(10, 30)), JSON.stringify(blocks.slice(9, 29)));
      assert.deepEqual(JSON.stringify(bc.getChainSection(980, 1010)), JSON.stringify(blocks.slice(979, 1010)));
    });

    it('can be queried by block height', () => {
      expect(bc.getBlockByNumber(600).height).to.equal(600);
    });

    it('can be queried by block hash', () => {
      expect(bc.getBlockByHash(blockHash).height).to.equal(500);
    });
  });
});
