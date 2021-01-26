const Functions = require('../db/functions');
const rimraf = require('rimraf');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const nock = require('nock');
const _ = require('lodash');
const {
  BLOCKCHAINS_DIR,
} = require('../common/constants')
const BlockchainNode = require('../node')
const {
  setNodeForTesting,
} = require('./test-util');

describe("Functions", () => {
  describe("triggerFunctions", () => {
    let node;
    let functions;
    let requestBody;

    beforeEach(() => {
      rimraf.sync(BLOCKCHAINS_DIR);

      node = new BlockchainNode();
      setNodeForTesting(node);

      const functionConfig = {
        ".function": {
          "function_map": {
            "0x12345": {
              "function_type": "REST",
              "event_listener": "https://events.ainetwork.ai/trigger",
              "service_name": "https://ainize.ai",
              "function_id": "0x12345"
            }
          }
        }
      };
      const result = node.db.setFunction("test/test_function/some/path", functionConfig);
      expect(result).to.equal(true);
      functions = new Functions(node.db, null);
      const response = { 'success': true };
      nock('https://events.ainetwork.ai')
        .post('/trigger')
        .reply((uri, request) => {
          requestBody = request;  // save request to requestBody.
          return [
            201,
            response,
          ]
        })
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
        ["test", "test_function", "some", "path"], null, null, null, transaction
      ).then((response) => {
        assert.deepEqual(_.get(response, 'data.success'), true);
        assert.deepEqual(requestBody, {
          "function": {
            "event_listener": "https://events.ainetwork.ai/trigger",
            "function_id": "0x12345",
            "function_type": "REST",
            "service_name": "https://ainize.ai",
          },
          "transaction": {
            "nonce": 123,
            "operation": {
              "ref": "test/test_function/some/path",
              "type": "SET_VALUE",
              "value": 1000,
            },
            "timestamp": 1566736760322,
          }
        });
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

  describe("applyFunctionChange", () => {
    const curFunction = {
      ".function": {
        "function_map": {
          "0x111": {
            "function_type": "NATIVE",
            "function_id": "0x111"
          },
          "0x222": {
            "function_type": "NATIVE",
            "function_id": "0x222"
          },
          "0x333": {
            "function_type": "NATIVE",
            "function_id": "0x333"
          }
        }
      }
    };
    it("add / delete / modify with non-existing function", () => {
      assert.deepEqual(Functions.applyFunctionChange(null, {
        ".function": {
          "function_map": {
            "0x111": null,  // delete
            "0x222": {  // modify
              "function_type": "REST",
              "function_id": "0x222"
            },
            "0x444": {  // add
              "function_type": "REST",
              "function_id": "0x444"
            }
          }
        }
      }), {  // the same as the given function change.
        ".function": {
          "function_map": {
            "0x111": null,
            "0x222": {
              "function_type": "REST",
              "function_id": "0x222"
            },
            "0x444": {
              "function_type": "REST",
              "function_id": "0x444"
            }
          }
        }
      });
    });
    it("add / delete / modify with existing function", () => {
      assert.deepEqual(Functions.applyFunctionChange(curFunction, {
        ".function": {
          "function_map": {
            "0x111": null,  // delete
            "0x222": {  // modify
              "function_type": "REST",
              "function_id": "0x222"
            },
            "0x444": {  // add
              "function_type": "REST",
              "function_id": "0x444"
            }
          }
        }
      }), {
        ".function": {
          "function_map": {
            "0x222": {  // modified
              "function_type": "REST",
              "function_id": "0x222"
            },
            "0x333": {  // untouched
              "function_type": "NATIVE",
              "function_id": "0x333"
            },
            "0x444": {  // added
              "function_type": "REST",
              "function_id": "0x444"
            }
          }
        }
      });
    });
    it("with null function change", () => {
      assert.deepEqual(Functions.applyFunctionChange(curFunction, null), null);
    });
  });
})
