const assert = require('assert/strict');
const Logger = require('../../logger');
const BlockPool = require('../../block-pool');
const { NodeConfigs } = require('../../common/constants');

describe('Lazy consensus diagnostics', () => {
  let debug;
  let finished;
  beforeEach(() => {
    debug = NodeConfigs.DEBUG;
    finished = global.isFinished;
    global.isFinished = false;
  });
  afterEach(() => {
    NodeConfigs.DEBUG = debug;
    global.isFinished = finished;
  });

  it('does not evaluate a disabled diagnostic factory', () => {
    NodeConfigs.DEBUG = false;
    new Logger('LAZY_TEST').debug(() => {
      throw new Error('must not evaluate');
    });
  });

  it('evaluates an enabled diagnostic exactly once', () => {
    NodeConfigs.DEBUG = true;
    let calls = 0;
    new Logger('LAZY_TEST').debug(() => {
      calls++;
      return 'small diagnostic';
    });
    assert.equal(calls, 1);
  });

  it('does not evaluate diagnostics after finish', () => {
    NodeConfigs.DEBUG = true;
    const logger = new Logger('LAZY_TEST');
    logger.finish();
    logger.debug(() => {
      throw new Error('must not evaluate');
    });
  });

  it('retains legacy string logging', () => {
    NodeConfigs.DEBUG = true;
    assert.doesNotThrow(() => new Logger('LAZY_TEST').debug('legacy diagnostic'));
  });

  it('contains diagnostic factory errors without failing consensus work', () => {
    NodeConfigs.DEBUG = true;
    const log = console.log;
    const errors = [];
    console.log = (error) => errors.push(error);
    try {
      assert.doesNotThrow(() => new Logger('LAZY_TEST').debug(() => {
        throw new Error('diagnostic failure');
      }));
      assert.equal(errors.length, 1);
    } finally {
      console.log = log;
    }
  });

  it('traverses retained branches without serializing block bodies when DEBUG is false', () => {
    NodeConfigs.DEBUG = false;
    let serializations = 0;
    const blocks = Array.from({ length: 9 }, (_, index) => ({
      hash: `block-${index}`, number: index, epoch: index, last_hash: `block-${index - 1}`,
      toJSON() {
        serializations++;
        return { hash: this.hash, number: this.number };
      },
    }));
    const pool = new BlockPool({ bc: { lastBlock: () => blocks[0], lastBlockNumber: () => 0 } });
    for (const block of blocks) {
      pool.hashToBlockInfo.set(block.hash, { block, notarized: true, votes: [] });
      if (block.number > 0) pool.hashToNextBlockSet.set(block.last_hash, new Set([block.hash]));
    }
    for (const withInfo of [false, true]) {
      const chains = pool.getLongestNotarizedChainList(undefined, withInfo);
      assert.equal(chains.length, 1);
      assert.equal(chains[0].length, blocks.length);
      const extending = pool.getExtendingChain(blocks.at(-1).hash, withInfo);
      assert.equal(extending.chain.length, blocks.length - 1);
    }
    pool.updateLongestNotarizedChains();
    assert.deepEqual(pool.longestNotarizedChainTips, [blocks.at(-1).hash]);
    assert.equal(serializations, 0);
  });
});
