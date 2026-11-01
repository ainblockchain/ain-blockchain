'use strict';
const assert = require('assert/strict');
const Functions = require('../../db/functions');
const { NativeFunctionIds } = require('../../common/constants');

describe('Retired index hook compatibility', () => {
  it('preserves historical success and zero gas without touching state or external indexes', () => {
    const db = new Proxy({}, { get() { throw Error('Retired hook accessed the database'); } });
    const functions = new Functions(db);
    for (const fid of [NativeFunctionIds.SYNC_KNOWLEDGE_TOPIC, NativeFunctionIds.SYNC_KNOWLEDGE_EXPLORATION]) {
      for (const value of [null, { title: 'historical value' }]) {
        assert.deepEqual(functions.nativeFunctionMap[fid].func(value, { fid, opResultList: [] }),
            { code: 0, bandwidth_gas_amount: 0 });
      }
    }
  });
});
