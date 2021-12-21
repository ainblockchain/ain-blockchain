const Functions = require('../../db/functions');
const rimraf = require('rimraf');
const chai = require('chai');
const assert = chai.assert;
const nock = require('nock');
const _ = require('lodash');
const Transaction = require('../../tx-pool/transaction');
const { NodeConfigs, BlockchainParams } = require('../../common/constants')
const BlockchainNode = require('../../node')
const CommonUtil = require('../../common/common-util');
const {
  setNodeForTesting,
  eraseSubtreeFuncResPromiseResults,
} = require('../test-util');

// NOTE(platfowner): These test cases assume ENABLE_REST_FUNCTION_CALL = true.
describe("Functions", () => {
  describe("matchAndTriggerFunctions", () => {
    let node;
    let functions;
    const accountRegistrationGasAmount = BlockchainParams.resource.account_registration_gas_amount;
    const restFunctionCallGasAmount = BlockchainParams.resource.rest_function_call_gas_amount;

    before(() => {
      rimraf.sync(NodeConfigs.CHAINS_DIR);

      node = new BlockchainNode();
      setNodeForTesting(node);
      functions = new Functions(node.db);
    })

    after(() => {
      rimraf.sync(NodeConfigs.CHAINS_DIR);
    });

    describe("Function triggering", () => {
      const refPathRest = "/apps/test/test_function/some/path/rest";
      const refPathRestVarPath = "/apps/test/test_function/some/arbitrary/rest";
      const funcPathRestVarPath = "/apps/test/test_function/some/$var_path/rest";
      const refPathRestMulti = "/apps/test/test_function/some/path/rest_multi";
      const refPathRestWithSubtree = "/apps/test/test_function/some/path/rest_with_subtree";
      const refPathRestWithoutListener = "/apps/test/test_function/some/path/rest_without_listener";
      const refPathRestNotWhitelisted = "/apps/test/test_function/some/path/rest_not_whitelisted";
      const refPathNull = "/apps/test/test_function/some/path/null";
      const refPathFunctionUrlWhitelist = '/developers/rest_functions/url_whitelist/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/0';
      const refPathRestNewlyWhitelisted = '/apps/test/test_function/some/path/rest_newly_whitelisted';
      let requestBody1 = null;
      let requestBody2 = null;
      let requestBody3 = null;

      before(() => {
        const restFunctionNonVarPath = {
          ".function": {
            "0x00001": {
              "function_type": "REST",
              "function_url": "https://events.ainetwork.ai/trigger",
              "function_id": "0x00001"
            }
          }
        };
        const restFunctionVarPath = {
          ".function": {
            "0x10001": {
              "function_type": "REST",
              "function_url": "https://events.ainetwork.ai/trigger",
              "function_id": "0x10001"
            }
          }
        };
        const restFunctionMulti = {
          ".function": {
            "0x20001": {
              "function_type": "REST",
              "function_url": "https://events.ainetwork.ai/trigger",
              "function_id": "0x20001"
            },
            "0x20002": {
              "function_type": "REST",
              "function_url": "https://events.ainize.ai/trigger",
              "function_id": "0x20002"
            }
          }
        };
        const restFunctionWithSubtree = {
          ".function": {
            "0x30001": {
              "function_type": "REST",
              "function_url": "https://events.ainetwork.ai/trigger",
              "function_id": "0x30001"
            }
          },
          "deeper": {
            "$var_path": {
              ".function": {
                "0x30002": {
                  "function_type": "REST",
                  "function_url": "https://events.ainize.ai/trigger",
                  "function_id": "0x30002"
                }
              }
            },
            "path": {
              ".function": {
                "0x30003": {
                  "function_type": "REST",
                  "function_url": "https://events.afan.ai/trigger",
                  "function_id": "0x30003"
                },
              }
            }
          }
        };
        const restFunctionWithoutListener = {
          ".function": {
            "0x40001": {
              "function_type": "REST",
              "function_url": "http://localhost:3000/trigger",
              "function_id": "0x40001"
            }
          }
        };
        const restFunctionNotWhitelisted = {
          ".function": {
            "0x50001": {
              "function_type": "REST",
              "function_url": "https://events.comcom.ai/trigger",
              "function_id": "0x50001"
            }
          }
        };
        const nullFunction = {
          ".function": {
            "0x60001": null
          }
        };
        assert.deepEqual(node.db.setFunction(refPathRest, restFunctionNonVarPath).code, 0);
        assert.deepEqual(node.db.setFunction(funcPathRestVarPath, restFunctionVarPath).code, 0);
        assert.deepEqual(node.db.setFunction(refPathRestMulti, restFunctionMulti).code, 0);
        assert.deepEqual(
            node.db.setFunction(refPathRestWithSubtree, restFunctionWithSubtree).code, 0);
        assert.deepEqual(
            node.db.setFunction(refPathRestWithoutListener, restFunctionWithoutListener).code, 0);
        assert.deepEqual(
            node.db.setFunction(refPathRestNotWhitelisted, restFunctionNotWhitelisted).code, 0);
        assert.deepEqual(node.db.setFunction(refPathNull, nullFunction).code, 0);
      })

      beforeEach(() => {
        // Setup mock for REST API calls.
        const response = { 'success': true };
        requestBody1 = null;
        nock('https://events.ainetwork.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBody1 = request;  // save request to requestBody1.
          return [
            201,
            response,
          ]
        });
        requestBody2 = null;
        nock('https://events.ainize.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBody2 = request;  // save request to requestBody2.
          return [
            201,
            response,
          ]
        });
        requestBody3 = null;
        nock('https://events.afan.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBody3 = request;  // save request to requestBody3.
          return [
            201,
            response,
          ]
        });
      })

      it("REST function with non-variable path", () => {
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
        const {
          func_results: funcResults,
          subtree_func_results: subtreeFuncResults,
          promise_results: promiseResults,
        } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathRest), null, null, null, null, transaction, 0, 0,
            accountRegistrationGasAmount, restFunctionCallGasAmount);
        assert.deepEqual(funcResults, {
          "0x00001": {
            "code": 0,
            "bandwidth_gas_amount": 100,
          }
        });
        assert.deepEqual(subtreeFuncResults, {});
        return promiseResults.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 0,
          });
          assert.deepEqual(requestBody1, {
            "auth": {
              "fid": "0x00001",
              "fids": [],
            },
            "blockNumber": 0,
            "blockTime": 0,
            "executedAt": 1566736760324,
            "fid": "0x00001",
            "function": {
              "function_id": "0x00001",
              "function_type": "REST",
              "function_url": "https://events.ainetwork.ai/trigger",
            },
            "functionPath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest",
            ],
            "params": {},
            "prevValue": null,
            "timestamp": null,
            "transaction": {
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              },
              "tx_body": {
                "gas_price": 1,
                "nonce": 123,
                "operation": {
                  "ref": "/apps/test/test_function/some/path/rest",
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "timestamp": 1566736760322,
              }
            },
            "value": null,
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest",
            ]
          });
        });
      })

      it("REST function with variable path", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathRestVarPath,
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
        const {
          func_results: funcResults,
          subtree_func_results: subtreeFuncResults,
          promise_results: promiseResults,
        } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathRestVarPath), null, null, null, null, transaction, 0, 0,
            accountRegistrationGasAmount, restFunctionCallGasAmount);
        assert.deepEqual(funcResults, {
          "0x10001": {
            "code": 0,
            "bandwidth_gas_amount": 100,
          }
        });
        assert.deepEqual(subtreeFuncResults, {});
        return promiseResults.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 0,
          });
          assert.deepEqual(requestBody1, {
            "auth": {
              "fid": "0x10001",
              "fids": [],
            },
            "blockNumber": 0,
            "blockTime": 0,
            "executedAt": 1566736760324,
            "fid": "0x10001",
            "function": {
              "function_id": "0x10001",
              "function_type": "REST",
              "function_url": "https://events.ainetwork.ai/trigger",
            },
            "functionPath": [
              "apps",
              "test",
              "test_function",
              "some",
              "$var_path",
              "rest",
            ],
            "params": {
              "var_path": "arbitrary",
            },
            "prevValue": null,
            "timestamp": null,
            "transaction": {
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              },
              "tx_body": {
                "gas_price": 1,
                "nonce": 123,
                "operation": {
                  "ref": "/apps/test/test_function/some/arbitrary/rest",
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "timestamp": 1566736760322,
              }
            },
            "value": null,
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "arbitrary",
              "rest",
            ]
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
        const {
          func_results: funcResults,
          subtree_func_results: subtreeFuncResults,
          promise_results: promiseResults,
        } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathRestMulti), null, null, null, null, transaction, 0, 0,
            accountRegistrationGasAmount, restFunctionCallGasAmount);
        assert.deepEqual(funcResults, {
          "0x20001": {
            "code": 0,
            "bandwidth_gas_amount": 100,
          },
          "0x20002": {
            "code": 0,
            "bandwidth_gas_amount": 100,
          }
        });
        assert.deepEqual(subtreeFuncResults, {});
        return promiseResults.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 2,
            trigger_count: 2,
            fail_count: 0,
          });
          assert.deepEqual(requestBody1, {
            "auth": {
              "fid": "0x20001",
              "fids": [],
            },
            "blockNumber": 0,
            "blockTime": 0,
            "executedAt": 1566736760324,
            "fid": "0x20001",
            "function": {
              "function_id": "0x20001",
              "function_type": "REST",
              "function_url": "https://events.ainetwork.ai/trigger",
            },
            "functionPath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_multi",
            ],
            "params": {},
            "prevValue": null,
            "timestamp": null,
            "transaction": {
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              },
              "tx_body": {
                "gas_price": 1,
                "nonce": 123,
                "operation": {
                  "ref": "/apps/test/test_function/some/path/rest_multi",
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "timestamp": 1566736760322,
              }
            },
            "value": null,
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_multi",
            ]
          });
          assert.deepEqual(requestBody2, {
            "auth": {
              "fid": "0x20002",
              "fids": [],
            },
            "blockNumber": 0,
            "blockTime": 0,
            "executedAt": 1566736760324,
            "fid": "0x20002",
            "function": {
              "function_id": "0x20002",
              "function_type": "REST",
              "function_url": "https://events.ainize.ai/trigger",
            },
            "functionPath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_multi",
            ],
            "params": {},
            "prevValue": null,
            "timestamp": null,
            "transaction": {
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              },
              "tx_body": {
                "gas_price": 1,
                "nonce": 123,
                "operation": {
                  "ref": "/apps/test/test_function/some/path/rest_multi",
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "timestamp": 1566736760322,
              }
            },
            "value": null,
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_multi",
            ]
          });
        });
      })

      it("REST function with subtree", () => {
        transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathRestWithSubtree,
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
        const {
          func_results: funcResults,
          subtree_func_results: subtreeFuncResults,
          promise_results: promiseResults,
        } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathRestWithSubtree), null, null, null, null, transaction, 0, 0,
            accountRegistrationGasAmount, restFunctionCallGasAmount);
        assert.deepEqual(funcResults, {
          "0x30001": {
            "code": 0,
            "bandwidth_gas_amount": 100,
          }
        });
        assert.deepEqual(eraseSubtreeFuncResPromiseResults(subtreeFuncResults), {
          "/deeper/$var_path": {
            "func_results": {
              "0x30002": {
                "bandwidth_gas_amount": 100,
                "code": 0,
              }
            },
            "promise_results": "erased",
          },
          "/deeper/path": {
            "func_results": {
              "0x30003": {
                "bandwidth_gas_amount": 100,
                "code": 0,
              }
            },
            "promise_results": "erased",
          }
        });
        return promiseResults.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 0,
          });
          assert.deepEqual(requestBody1, {
            "auth": {
              "fid": "0x30001",
              "fids": [],
            },
            "blockNumber": 0,
            "blockTime": 0,
            "executedAt": 1566736760324,
            "fid": "0x30001",
            "function": {
              "function_id": "0x30001",
              "function_type": "REST",
              "function_url": "https://events.ainetwork.ai/trigger",
            },
            "functionPath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
            ],
            "params": {},
            "prevValue": null,
            "timestamp": null,
            "transaction": {
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              },
              "tx_body": {
                "gas_price": 1,
                "nonce": 123,
                "operation": {
                  "ref": "/apps/test/test_function/some/path/rest_with_subtree",
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "timestamp": 1566736760322,
              }
            },
            "value": null,
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
            ]
          });
          assert.deepEqual(requestBody2, {
            "auth": {
              "fid": "0x30002",
              "fids": [],
            },
            "blockNumber": 0,
            "blockTime": 0,
            "executedAt": 1566736760324,
            "fid": "0x30002",
            "function": {
              "function_id": "0x30002",
              "function_type": "REST",
              "function_url": "https://events.ainize.ai/trigger",
            },
            "functionPath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deeper",
              "$var_path",
            ],
            "params": {},
            "prevValue": null,
            "timestamp": null,
            "transaction": {
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              },
              "tx_body": {
                "gas_price": 1,
                "nonce": 123,
                "operation": {
                  "ref": "/apps/test/test_function/some/path/rest_with_subtree",
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "timestamp": 1566736760322,
              }
            },
            "value": null,
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deeper",
              "$var_path",
            ]
          });
          assert.deepEqual(requestBody3, {
            "auth": {
              "fid": "0x30003",
              "fids": [],
            },
            "blockNumber": 0,
            "blockTime": 0,
            "executedAt": 1566736760324,
            "fid": "0x30003",
            "function": {
              "function_id": "0x30003",
              "function_type": "REST",
              "function_url": "https://events.afan.ai/trigger",
            },
            "functionPath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deeper",
              "path",
            ],
            "params": {},
            "prevValue": null,
            "timestamp": null,
            "transaction": {
              "extra": {
                "created_at": 1566736760323,
                "executed_at": 1566736760324,
              },
              "tx_body": {
                "gas_price": 1,
                "nonce": 123,
                "operation": {
                  "ref": "/apps/test/test_function/some/path/rest_with_subtree",
                  "type": "SET_VALUE",
                  "value": 1000,
                },
                "timestamp": 1566736760322,
              }
            },
            "value": null,
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deeper",
              "path",
            ]
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
        const { promise_results } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathRestWithoutListener), null, null, null, null, transaction,
            0, 0, accountRegistrationGasAmount, restFunctionCallGasAmount);
        return promise_results.then((resp) => {
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
        const { promise_results } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathRestNotWhitelisted), null, null, null, null, transaction,
            0, 0, accountRegistrationGasAmount, restFunctionCallGasAmount);
        return promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 0,
            fail_count: 0,
          });
        });
      })

      it('REST function newly whitelisted', () => {
        node.db.setValuesForTesting(refPathFunctionUrlWhitelist, 'http://localhost:5000');
        node.db.setFunction(refPathRestNewlyWhitelisted, {
          ".function": {
            "newly_whitelisted": {
              "function_type": "REST",
              "function_url": "http://localhost:5000",
              "function_id": "newly_whitelisted"
            }
          }
        }, { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' });
        const transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathRestNewlyWhitelisted,
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
        const { promise_results } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathRestNewlyWhitelisted), null, null, null, null, transaction,
            0, 0, accountRegistrationGasAmount, restFunctionCallGasAmount);
        return promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 1
          });
        })
      });

      it('REST function newly de-whitelisted', () => {
        // delete function from the whitelist
        node.db.setValuesForTesting(refPathFunctionUrlWhitelist, null);
        const transaction = {
          "tx_body": {
            "operation": {
              "ref": refPathRestNewlyWhitelisted,
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
        const { promise_results } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathRestNewlyWhitelisted), null, null, null, null, transaction,
            0, 0, accountRegistrationGasAmount, restFunctionCallGasAmount);
        return promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 0,
            fail_count: 0
          })
        })
      });

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
        const { promise_results } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathNull), null, null, null, null, transaction, 0, 0,
            accountRegistrationGasAmount, restFunctionCallGasAmount);
        return promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 0,
            fail_count: 0,
          });
        });
      })
    })

    describe("Gas fee", () => {
      const refPathRestGas = "/apps/test/test_function/some/path/rest_gas";
      const refPathTransfer =
          "/transfer/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/0/value";

      before(() => {
        const restFunctionGas = {
          ".function": {
            "0x90001": {
              "function_type": "REST",
              "function_url": "https://events.ainetwork.ai/trigger",
              "function_id": "0x90001"
            }
          }
        };
        assert.deepEqual(node.db.setFunction(refPathRestGas, restFunctionGas).code, 0);
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
        const {
          func_results: funcResults,
          subtree_func_results: subtreeFuncResults,
          promise_results: promiseResults,
        } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathTransfer), 10, null,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 1566736760322,
            tx, 0, 0, accountRegistrationGasAmount, restFunctionCallGasAmount);
        assert.deepEqual(funcResults, {
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
            "bandwidth_gas_amount": 2000
          }
        });
        assert.deepEqual(subtreeFuncResults, {});
        return promiseResults.then((resp) => {
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
        const {
          func_results: funcResults,
          subtree_func_results: subtreeFuncResults,
          promise_results: promiseResults,
        } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathTransfer), 10, null,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 1566736760322,
            tx, 0, 0, accountRegistrationGasAmount, restFunctionCallGasAmount);
        assert.deepEqual(funcResults, {
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
        assert.deepEqual(subtreeFuncResults, {});
        return promiseResults.then((resp) => {
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
              "ref": refPathRestGas,
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
        const {
          func_results: funcResults,
          subtree_func_results: subtreeFuncResults,
          promise_results: promiseResults,
        } = functions.matchAndTriggerFunctions(
            CommonUtil.parsePath(refPathRestGas), null, null, null, null, transaction, 0, 0,
            accountRegistrationGasAmount, restFunctionCallGasAmount);
        assert.deepEqual(funcResults, {
          "0x90001": {
            "code": 0,
            "bandwidth_gas_amount": 100,
          }
        });
        assert.deepEqual(subtreeFuncResults, {});
        return promiseResults.then((resp) => {
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
