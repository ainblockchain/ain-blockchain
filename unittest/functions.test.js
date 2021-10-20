const Functions = require('../db/functions');
const Transaction = require('../tx-pool/transaction');
const rimraf = require('rimraf');
const chai = require('chai');
const assert = chai.assert;
const nock = require('nock');
const _ = require('lodash');
const {
  CHAINS_DIR,
} = require('../common/constants')
const BlockchainNode = require('../node')
const {
  setNodeForTesting,
} = require('./test-util');
const CommonUtil = require('../common/common-util');
const { expect } = require('chai');

describe("Functions", () => {
  describe("triggerFunctions", () => {
    let node;
    let functions;

    before(() => {
      rimraf.sync(CHAINS_DIR);

      node = new BlockchainNode();
      setNodeForTesting(node);
      functions = new Functions(node.db);
    })

    after(() => {
      rimraf.sync(CHAINS_DIR);
    });

    describe("Function triggering", () => {
      const refPathRest = "/apps/test/test_function/some/path/rest";
      const refPathRestMulti = "/apps/test/test_function/some/path/rest_multi";
      const refPathRestWithoutListener = "/apps/test/test_function/some/path/rest_without_listener";
      const refPathRestNotWhitelisted = "/apps/test/test_function/some/path/rest_not_whitelisted";
      const refPathNull = "/apps/test/test_function/some/path/null";
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
        const { func_results, promise_results } = functions.triggerFunctions(
            CommonUtil.parsePath(refPathRest),
            null, null, null, null, transaction);
        assert.deepEqual(func_results, {
          "0x11111": {
            "code": 0,
            "bandwidth_gas_amount": 10,
          }
        });
        promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 0,
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
        const { promise_results } = functions.triggerFunctions(
            CommonUtil.parsePath(refPathRestMulti),
            null, null, null, null, transaction);
        promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 2,
            trigger_count: 2,
            fail_count: 0,
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
        const { promise_results } = functions.triggerFunctions(
            CommonUtil.parsePath(refPathRestWithoutListener),
            null, null, null, null, transaction);
        promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 1,
          });
        });
      })

      it("REST function NOT whitelisted", () => {
        const transaction = {
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
        const { promise_results } = functions.triggerFunctions(
            CommonUtil.parsePath(refPathRestNotWhitelisted),
            null, null, null, null, transaction);
        promise_results.then((resp) => {
          assert.deepEqual(resp, {
            function_count: 1,
            trigger_count: 0,
            fail_count: 0,
          });
        });
      })

      it("null function", () => {
        const transaction = {
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
        const { promise_results } = functions.triggerFunctions(
            CommonUtil.parsePath(refPathNull),
            null, null, null, null, transaction);
        promise_results.then((resp) => {
          assert.deepEqual(resp, {
            function_count: 1,
            trigger_count: 0,
            fail_count: 0,
          });
        });
      })
    })

    describe("Gas fee", () => {
      const refPathRest = "/apps/test/test_function/some/path/rest";
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

      it("Native function (_transfer) with account registration", () => {
        const txBody = {
          "operation": {
            "ref": refPathTransfer,
            "type": "SET_VALUE",
            "value": 10
          },
          "nonce": -1,
          "timestamp": 1566736760322,
          "gas_price": 1,
          "address": "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1"
        }
        const tx = Transaction.fromTxBody(txBody, null);
        const { func_results, promise_results } = functions.triggerFunctions(
            CommonUtil.parsePath(refPathTransfer), 10, null,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 1566736760322,
            tx);
        assert.deepEqual(func_results, {
          "_transfer": {
            "op_results": {
              "0": {
                "path": "/accounts/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/balance",
                "result": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              },
              "1": {
                "path": "/accounts/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/balance",
                "result": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 1000
          }
        });
        promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 0,
          });
        });
      });

      it("Native function (_transfer) without account registration", () => {
        const txBody = {
          "operation": {
            "ref": refPathTransfer,
            "type": "SET_VALUE",
            "value": 10
          },
          "nonce": -1,
          "timestamp": 1566736760322,
          "gas_price": 1,
          "address": "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1"
        }
        const tx = Transaction.fromTxBody(txBody, null);
        const { func_results, promise_results } = functions.triggerFunctions(
            CommonUtil.parsePath(refPathTransfer), 10, null,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 1566736760322,
            tx);
        assert.deepEqual(func_results, {
          "_transfer": {
            "op_results": {
              "0": {
                "path": "/accounts/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/balance",
                "result": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              },
              "1": {
                "path": "/accounts/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/balance",
                "result": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0
          }
        });
        promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 0,
          });
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
        const { func_results, promise_results } = functions.triggerFunctions(
            CommonUtil.parsePath(refPathRest),
            null, null, null, null, transaction);
        assert.deepEqual(func_results, {
          "0x11111": {
            "code": 0,
            "bandwidth_gas_amount": 10,
          }
        });
        promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 0,
          });
        });
      })
    });
  });

  describe("convertPathVars2Params()", () => {
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
