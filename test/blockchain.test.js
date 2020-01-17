const Blockchain = require('../blockchain/');
const {Block} = require('../blockchain/block');
const chai = require('chai');
const expect = chai.expect;
const rimraf = require('rimraf');
const assert = chai.assert;
const Node = require('../node');
const TransactionPool = require('../tx-pool');
const {setDbForTesting} = require('./test-util')

describe('Blockchain', () => {
  let bc1, bc2, tp, node1, node2;

  beforeEach(() => {
    tp = new TransactionPool();
    bc1 = new Blockchain('test-blockchain1');
    node1 = new Node();
    setDbForTesting(bc1, tp, node1, 0);
    bc2 = new Blockchain('test-blockchain2');
    node2 = new Node();
    setDbForTesting(bc2, tp, node2, 1);
  });

  afterEach(() => {
    rimraf.sync(bc1._blockchainDir());
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
    const lastBlock = bc1.lastBlock();
    bc1.addNewBlock(Block.createBlock(lastBlock.hash, [], data, bc1.lastBlockNumber() + 1,
        node1.account.address, []));
    expect(bc1.chain[bc1.chain.length -1].transactions).to.equal(data);
  });

  // TODO(seo): Uncomment this test case. (see https://www.notion.so/comcom/438194a854554dee9532678d2ee3a2f2?v=a17b78ac99684b72b158deba529f66e0&p=5f4246fb8ec24813978e7145d00ae217)
  /*
  it('validates a valid chain', () => {
    const data = 'foo';
    bc1.addNewBlock(Block.createBlock(data, node1, bc1.lastBlockNumber() + 1, bc1.lastBlock()));
    expect(Blockchain.isValidChain(bc1.chain)).to.equal(true);
  });
  */

  it('invalidates chain with corrupt genesis block', () => {
    bc2.chain[0].transactions = ':(';
    expect(Blockchain.isValidChain(bc2.chain)).to.equal(false);
  });

  it('invalidates corrupt chain', () => {
    const data = 'foo';
    const lastBlock = bc1.lastBlock();
    bc1.addNewBlock(Block.createBlock(lastBlock.hash, [], data, bc1.lastBlockNumber() + 1,
        node1.account.address, []));
    bc1.chain[bc1.lastBlockNumber()].transactions = ':(';
    expect(Blockchain.isValidChain(bc1.chain)).to.equal(false);
  });

  describe('with lots of blocks', () => {
    let blocks; let blockHash;

    beforeEach(() => {
      blocks = [];

      for (let i = 0; i<1000; i++) {
        // let i represent a fake block here
        node1.createTransaction({
          operation: {
            type: 'SET_VALUE',
            ref: 'test/something',
            value: 'val'
          }
        });
        const lastBlock = bc1.lastBlock();
        const block = Block.createBlock(lastBlock.hash, [], tp.validTransactions(),
            bc1.lastBlockNumber() + 1, node1.account.address, []);
        if (block.number === 500) {
          blockHash = block.hash;
        }
        blocks.push(block);
        bc1.addNewBlock(block);
        tp.removeCommitedTransactions(block);
      }
    });

    it(' can sync on startup', () => {
      while (bc1.lastBlock().hash !== bc2.lastBlock().hash) {
        const blockSection = bc1.requestBlockchainSection(bc2.lastBlock());
        if (blockSection) {
          bc2.merge(blockSection);
        }
      }
      assert.deepEqual(JSON.stringify(bc1.chain), JSON.stringify(bc2.chain));
    });

    it('can be queried by index', () => {
      assert.deepEqual(JSON.stringify(bc1.getChainSection(10, 30)),
          JSON.stringify(blocks.slice(9, 29)));
      assert.deepEqual(JSON.stringify(bc1.getChainSection(980, 1010)),
          JSON.stringify(blocks.slice(979, 1010)));
    });

    it('can be queried by block number', () => {
      expect(bc1.getBlockByNumber(600).number).to.equal(600);
    });

    it('can be queried by block hash', () => {
      expect(bc1.getBlockByHash(blockHash).number).to.equal(500);
    });
  });
});
