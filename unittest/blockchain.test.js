const chai = require('chai');
const expect = chai.expect;
const rimraf = require('rimraf');
const assert = chai.assert;
const { CHAINS_DIR } = require('../common/constants');
const Blockchain = require('../blockchain/');
const Transaction = require('../tx-pool/transaction');
const { Block } = require('../blockchain/block');
const BlockchainNode = require('../node');
const { setNodeForTesting, getTransaction, txsToDummyReceipts  } = require('./test-util');

describe('Blockchain', () => {
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

  it('starts with genesis block', () => {
    assert.deepEqual(node1.bc.chain[0], Block.genesis());
  });

  it('adds new block', () => {
    const tx = getTransaction(node1, {
      operation: { type: 'SET_VALUE', ref: '/afan/test', value: 'foo' },
      gas_price: 1
    });
    const lastBlock = node1.bc.lastBlock();
    const txs = [tx];
    const receipts = txsToDummyReceipts(txs);
    node1.addNewBlock(Block.create(
        lastBlock.hash, [], {}, txs, receipts,
        lastBlock.number + 1, lastBlock.epoch + 1, '', node1.account.address, {}, 0, 0));
    assert.deepEqual(
        node1.bc.chain[node1.bc.chain.length -1].transactions[0],
        Transaction.toJsObject(tx));
  });

  // TODO(platfowner): Uncomment this test case.
  //                   (see https://www.notion.so/comcom/438194a854554dee9532678d2ee3a2f2?v=a17b78ac99684b72b158deba529f66e0&p=5f4246fb8ec24813978e7145d00ae217)
  /*
  it('validates a valid chain', () => {
    const data = 'foo';
    node1.bc.addNewBlock(Block.create(
        data, node1, node1.bc.lastBlockNumber() + 1, node1.bc.lastBlock(), 0, 0));
    expect(Blockchain.validateChainSegment(node1.bc.chain)).to.equal(true);
  });
  */

  it('invalidates chain with corrupt genesis block', () => {
    node1.bc.chain[0].transactions = ':(';
    expect(Blockchain.validateChainSegment(node1.bc.chain)).to.equal(false);
  });

  it('invalidates corrupt chain', () => {
    const tx = getTransaction(node1, {
      operation: { type: 'SET_VALUE', ref: '/afan/test', value: 'foo' },
      gas_price: 1
    });
    const lastBlock = node1.bc.lastBlock();
    const txs = [tx];
    const receipts = txsToDummyReceipts(txs);
    node1.addNewBlock(Block.create(
        lastBlock.hash, [], {}, txs, receipts,
        lastBlock.number + 1, lastBlock.epoch + 1, '', node1.account.address, {}, 0, 0));
    node1.bc.chain[node1.bc.chain.length - 1].transactions = ':(';
    expect(Blockchain.validateChainSegment(node1.bc.chain)).to.equal(false);
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
          },
          gas_price: 1
        });
        const lastBlock = node1.bc.lastBlock();
        const finalRoot = node1.stateManager.getFinalRoot();
        const transactions = node1.tp.getValidTransactions();
        const receipts = txsToDummyReceipts(transactions);
        const block = Block.create(
            lastBlock.hash, [], {}, transactions, receipts, lastBlock.number + 1, i,
            finalRoot.getProofHash(), node1.account.address, [], 0, 0);
        if (block.number === 500) {
          blockHash = block.hash;
        }
        blocks.push(block);
        node1.addNewBlock(block);
      }
    });

    it('can sync on startup', () => {
      while (!node1.bc.lastBlock() || !node2.bc.lastBlock() || node1.bc.lastBlock().hash !== node2.bc.lastBlock().hash) {
        const blockSection = node1.bc.getBlockList(node2.bc.lastBlock().number + 1);
        if (blockSection) {
          expect(node2.mergeChainSegment(blockSection)).to.equal(true);
        }
      }
      assert.deepEqual(JSON.stringify(node1.bc.chain), JSON.stringify(node2.bc.chain));
    });

    it('can be queried by index', () => {
      assert.deepEqual(JSON.stringify(node1.bc.getBlockList(10, 30)),
          JSON.stringify(blocks.slice(9, 29)));
      assert.deepEqual(JSON.stringify(node1.bc.getBlockList(980, 1000)),
          JSON.stringify(blocks.slice(979, 999)));
    });

    it('can be queried by block number', () => {
      expect(node1.bc.getBlockByNumber(600).number).to.equal(600);
    });

    it('can be queried by block hash', () => {
      expect(node1.bc.getBlockByHash(blockHash).number).to.equal(500);
    });
  });
});
