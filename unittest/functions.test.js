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
const ChainUtil = require('../common/chain-util');

describe("Functions", () => {
  describe("triggerFunctions", () => {
    const refPathRest = "test/test_function/some/path/rest";
    const refPathRestMulti = "test/test_function/some/path/rest_multi";
    const refPathRestNotWhitelisted = "test/test_function/some/path/rest_not_whitelisted";
    const refPathNull = "test/test_function/some/path/null";
    let node;
    let functions;
    let requestBody1, requestBody2;

    beforeEach(() => {
      rimraf.sync(BLOCKCHAINS_DIR);

      node = new BlockchainNode();
      setNodeForTesting(node);

      const restFunction = {
        ".function": {
          "0x11111": {
            "function_type": "REST",
            "event_listener": "https://events.ainetwork.ai/trigger",
            "service_name": "https://ainetwork.ai",
            "function_id": "0x11111"
          }
        }
      };
      const restFunctionMulti = {
        ".function": {
          "0x11111": {
            "function_type": "REST",
            "event_listener": "https://events.ainetwork.ai/trigger",
            "service_name": "https://ainetwork.ai",
            "function_id": "0x11111"
          },
          "0x22222": {
            "function_type": "REST",
            "event_listener": "https://events.ainize.ai/trigger",
            "service_name": "https://ainize.ai",
            "function_id": "0x22222"
          }
        }
      };
      const restFunctionNotWhitelisted = {
        ".function": {
          "0x33333": {
            "function_type": "REST",
            "event_listener": "https://events.comcom.ai/trigger",
            "service_name": "https://comcom.ai",
            "function_id": "0x33333"
          }
        }
      };
      const nullFunction = {
        ".function": {
          "0x12345": null
        }
      };
      assert.deepEqual(node.db.setFunction(refPathRest, restFunction), true);
      assert.deepEqual(node.db.setFunction(refPathRestMulti, restFunctionMulti), true);
      assert.deepEqual(node.db.setFunction(refPathNull, nullFunction), true);
      functions = new Functions(node.db, null);

      // Setup mock for REST API calls.
      const response = { 'success': true };
      nock('https://events.ainetwork.ai')
        .post('/trigger')
        .reply((uri, request) => {
          requestBody1 = request;  // save request to requestBody1.
          return [
            201,
            response,
          ]
        })
      nock('https://events.ainize.ai')
        .post('/trigger')
        .reply((uri, request) => {
          requestBody2 = request;  // save request to requestBody2.
          return [
            201,
            response,
          ]
        })
    })

    afterEach(() => {
      rimraf.sync(BLOCKCHAINS_DIR);
    });

    it("REST function", () => {
      transaction = {
        "nonce": 123,
        "timestamp": 1566736760322,
        "operation": {
          "ref": refPathRest,
          "type": "SET_VALUE",
          "value": 1000
        }
      }
      return functions.triggerFunctions(
          ChainUtil.parsePath(refPathRest), null, null, null, transaction).then((response) => {
        assert.deepEqual(response, 1);
        assert.deepEqual(requestBody1, {
          "function": {
            "event_listener": "https://events.ainetwork.ai/trigger",
            "function_id": "0x11111",
            "function_type": "REST",
            "service_name": "https://ainetwork.ai",
          },
          "transaction": {
            "nonce": 123,
            "operation": {
              "ref": refPathRest,
              "type": "SET_VALUE",
              "value": 1000,
            },
            "timestamp": 1566736760322,
          }
        });
      });
    })

    it("REST function multi", () => {
      transaction = {
        "nonce": 123,
        "timestamp": 1566736760322,
        "operation": {
          "ref": refPathRestMulti,
          "type": "SET_VALUE",
          "value": 1000
        }
      }
      return functions.triggerFunctions(
          ChainUtil.parsePath(refPathRestMulti), null, null, null, transaction).then((response) => {
        assert.deepEqual(response, 2);
        assert.deepEqual(requestBody1, {
          "function": {
            "event_listener": "https://events.ainetwork.ai/trigger",
            "function_id": "0x11111",
            "function_type": "REST",
            "service_name": "https://ainetwork.ai",
          },
          "transaction": {
            "nonce": 123,
            "operation": {
              "ref": refPathRestMulti,
              "type": "SET_VALUE",
              "value": 1000,
            },
            "timestamp": 1566736760322,
          }
        });
        assert.deepEqual(requestBody2, {
          "function": {
            "event_listener": "https://events.ainize.ai/trigger",
            "function_id": "0x22222",
            "function_type": "REST",
            "service_name": "https://ainize.ai",
          },
          "transaction": {
            "nonce": 123,
            "operation": {
              "ref": refPathRestMulti,
              "type": "SET_VALUE",
              "value": 1000,
            },
            "timestamp": 1566736760322,
          }
        });
      });
    })

    it("REST function NOT whitelisted", () => {
      transaction = {
        "nonce": 123,
        "timestamp": 1566736760322,
        "operation": {
          "ref": refPathRestNotWhitelisted,
          "type": "SET_VALUE",
          "value": 1000
        }
      }
      assert.deepEqual(
          functions.triggerFunctions(
              ChainUtil.parsePath(refPathRestNotWhitelisted), null, null, null, transaction),
          0);
    })

    it("null function", () => {
      transaction = {
        "nonce": 123,
        "timestamp": 1566736760322,
        "operation": {
          "ref": refPathNull,
          "type": "SET_VALUE",
          "value": 1000
        }
      }
      assert.deepEqual(
          functions.triggerFunctions(
              ChainUtil.parsePath(refPathNull), null, null, null, transaction),
          0);
    })
  });

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
    };

    it("add / delete / modify non-existing function", () => {
      assert.deepEqual(Functions.applyFunctionChange(null, {
        ".function": {  // function
          "0x111": null,
          "0x222": {
            "function_type": "REST",
            "function_id": "0x222"
          },
        },
        "deeper": {
          ".function": {  // deeper function
            "0x999": {
              "function_type": "REST",
              "function_id": "0x999"
            }
          }
        }
      }), {  // the same as the given function change.
        ".function": {
          "0x111": null,
          "0x222": {
            "function_type": "REST",
            "function_id": "0x222"
          },
        },
        "deeper": {
          ".function": {
            "0x999": {
              "function_type": "REST",
              "function_id": "0x999"
            }
          }
        }
      });
    });

    it("add / delete / modify existing function", () => {
      assert.deepEqual(Functions.applyFunctionChange(curFunction, {
        ".function": {
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
      }), {
        ".function": {
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
      });
    });

    it("add / delete / modify existing function with deeper function", () => {
      assert.deepEqual(Functions.applyFunctionChange(curFunction, {
        ".function": {
          "0x111": null,  // delete
          "0x222": {  // modify
            "function_type": "REST",
            "function_id": "0x222"
          },
          "0x444": {  // add
            "function_type": "REST",
            "function_id": "0x444"
          }
        },
        "deeper": {
          ".function": {  // deeper function
            "0x999": {
              "function_type": "REST",
              "function_id": "0x999"
            }
          }
        }
      }), {
        ".function": {  // deeper function has no effect
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
      });
    });

    it("with null function change", () => {
      assert.deepEqual(Functions.applyFunctionChange(curFunction, null), null);
    });
  });
})
