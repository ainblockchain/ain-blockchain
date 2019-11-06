const Blockchain = require('../blockchain/');
const {Block} = require('../blockchain/block');
const chai = require('chai');
const expect = chai.expect;
const rimraf = require('rimraf');
const assert = chai.assert;
const DB = require('../db');
const TransactionPool = require('../db/transaction-pool');

describe('Blockchain', () => {
  let bc, bc2, tp, db1, db2;

  beforeEach(() => {
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


  // TODO(seo): Uncomment this test case. (see https://www.notion.so/comcom/438194a854554dee9532678d2ee3a2f2?v=a17b78ac99684b72b158deba529f66e0&p=5f4246fb8ec24813978e7145d00ae217)
  /*
  it('starts with genesis block', () => {
    assert.deepEqual(bc.chain[0], Block.genesis());
  });
  */

  it('adds new block', () => {
    const data = 'foo';
    const lastBlock = bc.lastBlock();
    bc.addNewBlock(Block.createBlock(lastBlock.hash, [], data, bc.height() + 1,
        db1.account.address, []));
    expect(bc.chain[bc.chain.length -1].transactions).to.equal(data);
  });

  // TODO(seo): Uncomment this test case. (see https://www.notion.so/comcom/438194a854554dee9532678d2ee3a2f2?v=a17b78ac99684b72b158deba529f66e0&p=5f4246fb8ec24813978e7145d00ae217)
  /*
  it('validates a valid chain', () => {
    const data = 'foo';
    bc.addNewBlock(Block.createBlock(data, db1, bc.height() + 1, bc.lastBlock()));
    expect(Blockchain.isValidChain(bc.chain)).to.equal(true);
  });
  */

  it('invalidates chain with corrupt genesis block', () => {
    bc2.chain[0].transactions = ':(';
    expect(Blockchain.isValidChain(bc2.chain)).to.equal(false);
  });

  it('invalidates corrupt chain', () => {
    const data = 'foo';
    const lastBlock = bc.lastBlock();
    bc.addNewBlock(Block.createBlock(lastBlock.hash, [], data, bc.height() + 1,
        db1.account.address, []));
    bc.chain[bc.height()].transactions = ':(';
    expect(Blockchain.isValidChain(bc.chain)).to.equal(false);
  });

  describe('with lots of blocks', () => {
    let blocks; let blockHash;

    beforeEach(() => {
      blocks = [];

      for (let i = 0; i<1000; i++) {
        // let i represent a fake block here
        db1.createTransaction({
          operation: {
            type: 'SET_VALUE',
            ref: 'test/something',
            value: 'val'
          }
        });
        const lastBlock = bc.lastBlock();
        const block = Block.createBlock(lastBlock.hash, [], tp.validTransactions(),
            bc.height() + 1, db1.account.address, []);
        if (block.number === 500) {
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

    it('can be queried by block number', () => {
      expect(bc.getBlockByNumber(600).number).to.equal(600);
    });

    it('can be queried by block hash', () => {
      expect(bc.getBlockByHash(blockHash).number).to.equal(500);
    });
  });
});
