const BuiltInFunctions = require('../db/built-in-functions');
const ChainUtil = require('../chain-util');
const chai = require('chai');
const assert = chai.assert;

describe("BuiltInFunctions", () => {
  describe("matchPaths", () => {
    it("when matching paths", () => {
      const funcPath = '/aaa/{key1}/ccc/{key2}/eee';
      const dbPath = '/aaa/bbb/ccc/ddd/eee';
      assert.deepEqual(BuiltInFunctions.matchPaths(ChainUtil.parsePath(dbPath), ChainUtil.parsePath(funcPath)), {
          "params": {
            "key1": "bbb",
            "key2": "ddd"
          }
        })
    })

    it("when unmatching paths with path lengths", () => {
      const funcPath = '/aaa/{key1}/ccc/{key2}/eee';

      const dbPath1 = '/aaa/bbb/ccc/ddd/eee/fff';
      assert.deepEqual(BuiltInFunctions.matchPaths(ChainUtil.parsePath(dbPath1), ChainUtil.parsePath(funcPath)), null);

      const dbPath2 = '/aaa/bbb/ccc/ddd';
      assert.deepEqual(BuiltInFunctions.matchPaths(ChainUtil.parsePath(dbPath2), ChainUtil.parsePath(funcPath)), null);
    })

    it("when unmatching paths with path segments", () => {
      const funcPath = '/aaa/{key1}/ccc/{key2}/eee';

      const dbPath1 = '/xxx/bbb/ccc/ddd/eee';
      assert.deepEqual(BuiltInFunctions.matchPaths(ChainUtil.parsePath(dbPath1), ChainUtil.parsePath(funcPath)), null);

      const dbPath2 = '/aaa/bbb/ccc/ddd/yyy';
      assert.deepEqual(BuiltInFunctions.matchPaths(ChainUtil.parsePath(dbPath2), ChainUtil.parsePath(funcPath)), null);
    })
  })
})