const chai = require('chai');
const expect = chai.expect;
const rimraf = require('rimraf');
const assert = chai.assert;
const { BLOCKCHAINS_DIR } = require('../constants');
const Blockchain = require('../blockchain/');
const { Block } = require('../blockchain/block');
const Node = require('../node');
const { setDbForTesting, getTransaction } = require('./test-util')

describe('Blockchain', () => {
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

  // TODO(seo): Uncomment this test case. (see https://www.notion.so/comcom/438194a854554dee9532678d2ee3a2f2?v=a17b78ac99684b72b158deba529f66e0&p=5f4246fb8ec24813978e7145d00ae217)
  /*
  it('starts with genesis block', () => {
    assert.deepEqual(node1.bc.chain[0], Block.genesis());
  });
  */

  it('adds new block', () => {
    const tx = getTransaction(node1, { operation: { type: 'SET_VALUE', ref: '/afan/test', value: 'foo'} });
    const lastBlock = node1.bc.lastBlock();
    node1.bc.addNewBlock(Block.createBlock(lastBlock.hash, [], [tx], lastBlock.number + 1,
        lastBlock.epoch + 1, node1.account.address, []));
    assert.deepEqual(node1.bc.chain[node1.bc.chain.length -1].transactions[0], tx);
  });

  // TODO(seo): Uncomment this test case. (see https://www.notion.so/comcom/438194a854554dee9532678d2ee3a2f2?v=a17b78ac99684b72b158deba529f66e0&p=5f4246fb8ec24813978e7145d00ae217)
  /*
  it('validates a valid chain', () => {
    const data = 'foo';
    node1.bc.addNewBlock(Block.createBlock(
        data, node1, node1.bc.lastBlockNumber() + 1, node1.bc.lastBlock()));
    expect(Blockchain.isValidChain(node1.bc.chain)).to.equal(true);
  });
  */

  it('invalidates chain with corrupt genesis block', () => {
    node1.bc.chain[0].transactions = ':(';
    expect(Blockchain.isValidChain(node1.bc.chain)).to.equal(false);
  });

  it('invalidates corrupt chain', () => {
    const tx = getTransaction(node1, { operation: { type: 'SET_VALUE', ref: '/afan/test', value: 'foo'} });
    const lastBlock = node1.bc.lastBlock();
    node1.bc.addNewBlock(Block.createBlock(lastBlock.hash, [], [tx], lastBlock.number + 1,
        lastBlock.epoch + 1, node1.account.address, []));
    node1.bc.chain[node1.bc.lastBlockNumber()].transactions = ':(';
    expect(Blockchain.isValidChain(node1.bc.chain)).to.equal(false);
  });

  describe('with lots of blocks', () => {
    let blocks; let blockHash;

    beforeEach(() => {
      blocks = [];

      for (let i = 0; i < 1000; i++) {
        // let i represent a fake block here
        node1.createTransaction({
          operation: {
            type: 'SET_VALUE',
            ref: 'test/something',
            value: 'val'
          }
        });
        const lastBlock = node1.bc.lastBlock();
        const block = Block.createBlock(lastBlock.hash, [], node1.tp.getValidTransactions(),
            lastBlock.number + 1, i, node1.account.address, []);
        if (block.number === 500) {
          blockHash = block.hash;
        }
        blocks.push(block);
        node1.bc.addNewBlock(block);
        node1.tp.cleanUpForNewBlock(block);
      }
    });

    it('can sync on startup', () => {
      while (!node1.bc.lastBlock() || !node2.bc.lastBlock() || node1.bc.lastBlock().hash !== node2.bc.lastBlock().hash) {
        const blockSection = node1.bc.requestBlockchainSection(node2.bc.lastBlock());
        if (blockSection) {
          node2.bc.merge(blockSection);
        }
      }
      assert.deepEqual(JSON.stringify(node1.bc.chain), JSON.stringify(node2.bc.chain));
    });

    it('can be queried by index', () => {
      assert.deepEqual(JSON.stringify(node1.bc.getChainSection(10, 30)),
          JSON.stringify(blocks.slice(9, 29)));
      assert.deepEqual(JSON.stringify(node1.bc.getChainSection(980, 1010)),
          JSON.stringify(blocks.slice(979, 1010)));
    });

    it('can be queried by block number', () => {
      expect(node1.bc.getBlockByNumber(600).number).to.equal(600);
    });

    it('can be queried by block hash', () => {
      expect(node1.bc.getBlockByHash(blockHash).number).to.equal(500);
    });
  });
});
