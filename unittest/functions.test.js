const Functions = require('../db/functions');
const rimraf = require('rimraf');
const chai = require('chai');
const assert = chai.assert;
const nock = require('nock');
const _ = require('lodash');
const {
  CHAINS_DIR,
  NativeFunctionIds,
  GasFeeConstants,
} = require('../common/constants')
const BlockchainNode = require('../node')
const {
  setNodeForTesting,
} = require('./test-util');
const ChainUtil = require('../common/chain-util');
const { expect } = require('chai');

describe("Functions", () => {
  describe("triggerFunctions", () => {
    let node;
    let functions;

    before(() => {
      rimraf.sync(CHAINS_DIR);

      node = new BlockchainNode();
      setNodeForTesting(node);
      functions = new Functions(node.db, null);
    })

    after(() => {
      rimraf.sync(CHAINS_DIR);
    });

    describe("Function triggering", () => {
      const refPathRest = "/test/test_function/some/path/rest";
      const refPathRestMulti = "/test/test_function/some/path/rest_multi";
      const refPathRestWithoutListener = "/test/test_function/some/path/rest_without_listener";
      const refPathRestNotWhitelisted = "/test/test_function/some/path/rest_not_whitelisted";
      const refPathNull = "/test/test_function/some/path/null";
      let requestBody1 = null, requestBody2 = null;

      before(() => {
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
        const restFunctionWithoutListener = {
          ".function": {
            "0x33333": {
              "function_type": "REST",
              "event_listener": "http://localhost:3000/trigger",
              "service_name": "http://localhost:3000",
              "function_id": "0x33333"
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
        assert.deepEqual(node.db.setFunction(refPathRest, restFunction).code, 0);
        assert.deepEqual(node.db.setFunction(refPathRestMulti, restFunctionMulti).code, 0);
        assert.deepEqual(
            node.db.setFunction(refPathRestWithoutListener, restFunctionWithoutListener).code, 0);
        assert.deepEqual(
            node.db.setFunction(refPathRestNotWhitelisted, restFunctionNotWhitelisted).code, 0);
        assert.deepEqual(node.db.setFunction(refPathNull, nullFunction).code, 0);
      })

      beforeEach(() => {
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
            });
        nock('https://events.ainize.ai')
            .post('/trigger')
            .reply((uri, request) => {
              requestBody2 = request;  // save request to requestBody2.
              return [
                201,
                response,
              ]
            });
      })

      it("REST function", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathRest,
              "type": "SET_VALUE",
              "value": 1000
            },
            "nonce": 123,
            "timestamp": 1566736760322,
            "gas_price": 1,
          },
          "extra": {
            "created_at": 1566736760323,
            "executed_at": 1566736760324,
          }
        }
        return functions.triggerFunctions(
            ChainUtil.parsePath(refPathRest),
            null, null, null, transaction).then((response) => {
          assert.deepEqual(response, {
            functionCount: 1,
            triggerCount: 1,
            failCount: 0,
          });
          assert.deepEqual(requestBody1, {
            "function": {
              "event_listener": "https://events.ainetwork.ai/trigger",
              "function_id": "0x11111",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai",
            },
            "transaction": {
              "tx_body": {
                "operation": {
                  "ref": refPathRest,
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "nonce": 123,
                "timestamp": 1566736760322,
                "gas_price": 1,
              },
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              }
            }
          });
        });
      })

      it("REST function multi", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathRestMulti,
              "type": "SET_VALUE",
              "value": 1000
            },
            "nonce": 123,
            "timestamp": 1566736760322,
            "gas_price": 1,
          },
          "extra": {
            "created_at": 1566736760323,
            "executed_at": 1566736760324,
          }
        }
        return functions.triggerFunctions(
            ChainUtil.parsePath(refPathRestMulti),
            null, null, null, transaction).then((response) => {
          assert.deepEqual(response, {
            functionCount: 2,
            triggerCount: 2,
            failCount: 0,
          });
          assert.deepEqual(requestBody1, {
            "function": {
              "event_listener": "https://events.ainetwork.ai/trigger",
              "function_id": "0x11111",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai",
            },
            "transaction": {
              "tx_body": {
                "operation": {
                  "ref": refPathRestMulti,
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "nonce": 123,
                "timestamp": 1566736760322,
                "gas_price": 1,
              },
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              }
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
              "tx_body": {
                "operation": {
                  "ref": refPathRestMulti,
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "nonce": 123,
                "timestamp": 1566736760322,
                "gas_price": 1,
              },
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              }
            }
          });
        });
      })

      it("REST function without listener", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathRestWithoutListener,
              "type": "SET_VALUE",
              "value": 1000
            },
            "nonce": 123,
            "timestamp": 1566736760322,
            "gas_price": 1,
          },
          "extra": {
            "created_at": 1566736760323,
            "executed_at": 1566736760324,
          }
        }
        return functions.triggerFunctions(
            ChainUtil.parsePath(refPathRestWithoutListener),
            null, null, null, transaction).then((response) => {
          assert.deepEqual(response, {
            functionCount: 1,
            triggerCount: 1,
            failCount: 1,
          });
        });
      })

      it("REST function NOT whitelisted", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathRestNotWhitelisted,
              "type": "SET_VALUE",
              "value": 1000
            },
            "nonce": 123,
            "timestamp": 1566736760322,
            "gas_price": 1,
          },
          "extra": {
            "created_at": 1566736760323,
            "executed_at": 1566736760324,
          }
        }
        return functions.triggerFunctions(
            ChainUtil.parsePath(refPathRestNotWhitelisted),
            null, null, null, transaction).then((response) => {
          assert.deepEqual(response, {
            functionCount: 1,
            triggerCount: 0,
            failCount: 0,
          });
        });
      })

      it("null function", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathNull,
              "type": "SET_VALUE",
              "value": 1000
            },
            "nonce": 123,
            "timestamp": 1566736760322,
            "gas_price": 1,
          },
          "extra": {
            "created_at": 1566736760323,
            "executed_at": 1566736760324,
          }
        }
        return functions.triggerFunctions(
            ChainUtil.parsePath(refPathNull),
            null, null, null, transaction).then((response) => {
          assert.deepEqual(response, {
            functionCount: 1,
            triggerCount: 0,
            failCount: 0,
          });
        });
      })
    })

    describe("Gas fee", () => {
      const refPathRest = "/test/test_function/some/path/rest";
      const refPathTransfer =
          "/transfer/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/0/value";

      before(() => {
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
        assert.deepEqual(node.db.setFunction(refPathRest, restFunction).code, 0);
      })

      beforeEach(() => {
        // Setup mock for REST API calls.
        const response = { 'success': true };
        nock('https://events.ainetwork.ai')
            .post('/trigger')
            .reply((uri, request) => {
              return [
                201,
                response,
              ]
            });
      })

      it("native function (_transfer) with account registration", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathTransfer,
              "type": "SET_VALUE",
              "value": 10
            },
            "nonce": -1,
            "timestamp": 1566736760322,
            "gas_price": 1,
          },
          "extra": {
            "created_at": 1566736760323,
            "executed_at": 1566736760324,
          }
        }
        return functions.triggerFunctions(
            ChainUtil.parsePath(refPathTransfer), 10,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 1566736760322,
            transaction).then((response) => {
          assert.deepEqual(response, {
            functionCount: 1,
            triggerCount: 1,
            failCount: 0,
          });
          const gasAmountActual = functions.getTotalGasAmount();
          // With account registration gas amount.
          const gasAmountExpected =
              functions.nativeFunctionMap[NativeFunctionIds.TRANSFER].execGasAmount +
                  GasFeeConstants.ACCOUNT_REGISTRATION_GAS_AMOUNT;
          expect(gasAmountActual).to.equal(gasAmountExpected);
        });
      });

      it("native function (_transfer) without account registration", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathTransfer,
              "type": "SET_VALUE",
              "value": 10
            },
            "nonce": -1,
            "timestamp": 1566736760322,
            "gas_price": 1,
          },
          "extra": {
            "created_at": 1566736760323,
            "executed_at": 1566736760324,
          }
        }
        return functions.triggerFunctions(
            ChainUtil.parsePath(refPathTransfer), 10,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 1566736760322,
            transaction).then((response) => {
          assert.deepEqual(response, {
            functionCount: 1,
            triggerCount: 1,
            failCount: 0,
          });
          const gasAmountActual = functions.getTotalGasAmount();
          // Without account registration gas amount.
          const gasAmountExpected =
              functions.nativeFunctionMap[NativeFunctionIds.TRANSFER].execGasAmount;
          expect(gasAmountActual).to.equal(gasAmountExpected);
        });
      });

      it("REST function with external RPC call", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathRest,
              "type": "SET_VALUE",
              "value": 1000
            },
            "nonce": 123,
            "timestamp": 1566736760322,
            "gas_price": 1,
          },
          "extra": {
            "created_at": 1566736760323,
            "executed_at": 1566736760324,
          }
        }
        return functions.triggerFunctions(
            ChainUtil.parsePath(refPathRest),
            null, null, null, transaction).then((response) => {
          assert.deepEqual(response, {
            functionCount: 1,
            triggerCount: 1,
            failCount: 0,
          });
          const gasAmountActual = functions.getTotalGasAmount();
          // With external RPC call gas amount.
          const gasAmountExpected = GasFeeConstants.EXTERNAL_RPC_CALL_GAS_AMOUNT;
          expect(gasAmountActual).to.equal(gasAmountExpected);
        });
      })
    });
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
