const assert = require('assert');
const getBlockApis = require('../../json_rpc/block');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');

describe('Block RPC cache integrity', () => {
  it('keeps cached transactions intact across repeated number and hash queries', () => {
    const transactions = [{ hash: 'first', tx_body: { operation: { type: 'SET_VALUE' } } },
      { hash: 'second', tx_body: { operation: { type: 'SET' } } }];
    const block = { number: 0, hash: 'genesis', timestamp: 1, transactions };
    const original = JSON.stringify(block);
    const api = getBlockApis({ bc: { getBlockByNumber: () => block, getBlockByHash: () => block } });
    const call = (method, args) => {
      let result;
      api[method](args, (error, response) => { assert.ifError(error); result = response.result; });
      return result;
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const method of [JSON_RPC_METHODS.AIN_GET_BLOCK_BY_NUMBER, JSON_RPC_METHODS.AIN_GET_BLOCK_BY_HASH]) {
        const summary = call(method, { number: 0, hash: 'genesis' });
        assert.deepStrictEqual(summary.transactions, ['first', 'second']);
        assert.notStrictEqual(summary, block);
        assert.deepStrictEqual(call(method, { number: 0, hash: 'genesis', getFullTransactions: true }).transactions, transactions);
        assert.strictEqual(JSON.stringify(block), original);
      }
    }
  });

  it('supports immutable cached blocks and missing block results', () => {
    const block = Object.freeze({ hash: 'block', transactions: Object.freeze([{ hash: 'tx' }]) });
    const api = getBlockApis({ bc: { getBlockByNumber: number => number === 0 ? block : null } });
    api[JSON_RPC_METHODS.AIN_GET_BLOCK_BY_NUMBER]({ number: 0 }, (error, response) => {
      assert.ifError(error);
      assert.deepStrictEqual(response.result.transactions, ['tx']);
    });
    api[JSON_RPC_METHODS.AIN_GET_BLOCK_BY_NUMBER]({ number: 1 }, (error, response) => {
      assert.ifError(error);
      assert.strictEqual(response.result, null);
    });
  });
});
