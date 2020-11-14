const Functions = require('../db/functions');
const rimraf = require('rimraf');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const nock = require('nock');
const {
  BLOCKCHAINS_DIR,
} = require('../constants')
const BlockchainNode = require('../node')
const {
  setNodeForTesting,
} = require('./test-util');

describe("Functions", () => {
  describe("triggerFunctions", () => {
    let node;
    let functions;

    beforeEach(() => {
      rimraf.sync(BLOCKCHAINS_DIR);

      node = new BlockchainNode();
      setNodeForTesting(node);

      const functionConfig = {
        ".function": {
          "function_type": "REST",
          "event_listener": "https://events.ainetwork.ai/trigger",
          "service_name": "https://ainize.ai",
          "function_id": "0x12345"
        }
      };
      const result = node.db.setFunction("test/test_function/some/path", functionConfig);
      expect(result).to.equal(true);
      functions = new Functions(node.db, null);
      const response = { 'success': true };
      nock('https://events.ainetwork.ai')
        .post('/trigger')
        .reply(200, response);
    })

    afterEach(() => {
      rimraf.sync(BLOCKCHAINS_DIR);
    });

    it("when trigger event", () => {
      transaction = {
        "nonce": 123,
        "timestamp": 1566736760322,
        "operation": {
          "ref": "test/test_function/some/path",
          "type": "SET_VALUE",
          "value": 1000
        }
      }
      return functions.triggerFunctions(
        ["test", "test_function", "some", "path"], null, null, null, {transaction}
      ).then((response) => {
        expect(response.data.success).to.equal(true);
      });
    })
  })

  describe("convertPathVars2Params", () => {
    it("convert correctly", () => {
      pathVars = {
        "$from": "from_addr",
        "$to": "to_addr",
        "$key": "10"
      }
      params = {
        "from": "from_addr",
        "to": "to_addr",
        "key": "10"
      }
      assert.deepEqual(Functions.convertPathVars2Params(pathVars), params);
    })
  });
})
