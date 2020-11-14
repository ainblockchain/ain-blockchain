const Functions = require('../db/functions');
const StateNode = require('../db/state-node');
const DB = require('../db');
const chai = require('chai');
const nock = require('nock');

const assert = chai.assert;
const expect = chai.expect;

describe("Functions", () => {
  describe("triggerFunctions", () => {
    let functions;

    beforeEach(() => {
      const db = new DB(new StateNode(), null, null, false, 0);
      const functionConfig = {
        ".function": {
          "function_type": "REST",
          "event_listener": "https://events.ainetwork.ai/trigger",
          "service_name": "https://ainize.ai",
          "function_id": "0x12345"
        }
      };
      db.setFunction("test/test_function/some/path", functionConfig);
      functions = new Functions(db, null);
      const response = { 'success': true };
      nock('https://events.ainetwork.ai')
        .post('/trigger')
        .reply(200, response);
    })

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
      return functions.triggerFunctions(["test", "test_function", "some", "path"], null, null, null,
          {transaction}).then((response) => {
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
