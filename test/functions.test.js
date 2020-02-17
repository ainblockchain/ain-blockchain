const Functions = require('../db/functions');
const DB = require('../db');
const ChainUtil = require('../chain-util');
const chai = require('chai');
const nock = require('nock');

const assert = chai.assert;
const expect = chai.expect;

describe("Functions", () => {
  describe("matchTriggerPaths", () => {
    beforeEach(() => {
      db = new DB();
      dbFuncs1 = {
        "some": {
          "path": {
            ".function": "some function config1"
          },
        }
      };
      dbFuncs2 = {
        "message": {
          "$key": {
            ".function": "some function config2"
          },
        }
      };
      result = db.setFunc("test/test_function1", dbFuncs1);
      result = db.setFunc("test/test_function2", dbFuncs2);
      functions = new Functions(db)
    })

    it("when matching function paths", () => {
      parsedValuePath = ChainUtil.parsePath(`test/test_function1/some/path`)
      result = functions.matchTriggerPaths(parsedValuePath)
      expect(result).to.equal("some function config1")
    })

    it("supports whild card", () => {
      parsedValuePath = ChainUtil.parsePath(`test/test_function2/message/1`)
      result = functions.matchTriggerPaths(parsedValuePath)
      expect(result).to.equal("some function config2")
    })

    it("whild card doesn't match", () => {
      parsedValuePath = ChainUtil.parsePath(`test/test_function2/message/too/deep`)
      result = functions.matchTriggerPaths(parsedValuePath)
      expect(result).to.equal(null)
    })
  })

  describe("triggerEvent", () => {
    beforeEach(() => {
      db = new DB();
      dbFuncs = {
        "some": {
          "path": {
            ".function": {
              "event_listener": "https://events.ainetwork.ai",
              "service_name": "https://ainize.ai",
              "function_hash": "0x12345"
            }
          },
        }
      };
      result = db.setFunc("test/test_function", dbFuncs);
      functions = new Functions(db)
      const response = {'success': true}
      nock('https://events.ainetwork.ai')
        .post('/')
        .reply(200, response);
    })

    it("when trigger event", () => {
      transaction = {
        "nonce":123,
        "timestamp":1566736760322,
        "operation":{
          "ref":"test/test_function/some/path",
          "type":"SET_VALUE",
          "value":1000
        }
      }
      functions.triggerEvent(transaction).then((response) => {
        expect(response.sucess).to.equal(true)
      });
    })
  })

  describe("matchPaths", () => {
    it("when matching paths", () => {
      const funcPath = '/aaa/{key1}/ccc/{key2}/eee';
      const valuePath = '/aaa/bbb/ccc/ddd/eee';
      assert.deepEqual(Functions.matchPaths(ChainUtil.parsePath(valuePath), ChainUtil.parsePath(funcPath)), {
          "params": {
            "key1": "bbb",
            "key2": "ddd"
          }
        })
    })

    it("when unmatching paths with path lengths", () => {
      const funcPath = '/aaa/{key1}/ccc/{key2}/eee';

      const valuePath1 = '/aaa/bbb/ccc/ddd/eee/fff';
      assert.deepEqual(Functions.matchPaths(ChainUtil.parsePath(valuePath1), ChainUtil.parsePath(funcPath)), null);

      const valuePath2 = '/aaa/bbb/ccc/ddd';
      assert.deepEqual(Functions.matchPaths(ChainUtil.parsePath(valuePath2), ChainUtil.parsePath(funcPath)), null);
    })

    it("when unmatching paths with path segments", () => {
      const funcPath = '/aaa/{key1}/ccc/{key2}/eee';

      const valuePath1 = '/xxx/bbb/ccc/ddd/eee';
      assert.deepEqual(Functions.matchPaths(ChainUtil.parsePath(valuePath1), ChainUtil.parsePath(funcPath)), null);

      const valuePath2 = '/aaa/bbb/ccc/ddd/yyy';
      assert.deepEqual(Functions.matchPaths(ChainUtil.parsePath(valuePath2), ChainUtil.parsePath(funcPath)), null);
    })
  })
})
