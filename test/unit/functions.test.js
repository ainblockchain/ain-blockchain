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
      let requestBodyAinetwork = null;
      let requestBodyAinetwork2 = null;
      let requestBodyAinize = null;
      let requestBodyAinize2 = null;
      let requestBodyAinize3 = null;
      let requestBodyAinize4 = null;
      let requestBodyAfan = null;
      let requestBodyAfan2 = null;

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
            },
            "0x30002": {
              "function_type": "REST",
              "function_url": "https://events2.ainetwork.ai/trigger",
              "function_id": "0x30002"
            }
          },
          "deep": {
            "$var_path": {
              ".function": {
                "0x30101": {
                  "function_type": "REST",
                  "function_url": "https://events.ainize.ai/trigger",
                  "function_id": "0x30101"
                },
                "0x30102": {
                  "function_type": "REST",
                  "function_url": "https://events2.ainize.ai/trigger",
                  "function_id": "0x30102"
                }
              },
              "to": {
                "$var_path2": {
                  ".function": {
                    "0x30301": {
                      "function_type": "REST",
                      "function_url": "https://events3.ainize.ai/trigger",
                      "function_id": "0x30301"
                    },
                    "0x30302": {
                      "function_type": "REST",
                      "function_url": "https://events4.ainize.ai/trigger",
                      "function_id": "0x30302"
                    }
                  }
                }
              }
            },
            "path": {
              ".function": {
                "0x30201": {
                  "function_type": "REST",
                  "function_url": "https://events.afan.ai/trigger",
                  "function_id": "0x30201"
                },
                "0x30202": {
                  "function_type": "REST",
                  "function_url": "https://events2.afan.ai/trigger",
                  "function_id": "0x30202"
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
        requestBodyAinetwork = null;
        nock('https://events.ainetwork.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBodyAinetwork = request;  // save request to requestBodyAinetwork.
          return [
            201,
            response,
          ]
        });
        requestBodyAinetwork2 = null;
        nock('https://events2.ainetwork.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBodyAinetwork2 = request;  // save request to requestBodyAinetwork2.
          return [
            201,
            response,
          ]
        });
        requestBodyAinize = null;
        nock('https://events.ainize.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBodyAinize = request;  // save request to requestBodyAinize.
          return [
            201,
            response,
          ]
        });
        requestBodyAinize2 = null;
        nock('https://events2.ainize.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBodyAinize2 = request;  // save request to requestBodyAinize2.
          return [
            201,
            response,
          ]
        });
        requestBodyAinize3 = null;
        nock('https://events3.ainize.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBodyAinize3 = request;  // save request to requestBodyAinize3.
          return [
            201,
            response,
          ]
        });
        requestBodyAinize4 = null;
        nock('https://events4.ainize.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBodyAinize4 = request;  // save request to requestBodyAinize4.
          return [
            201,
            response,
          ]
        });
        requestBodyAfan = null;
        nock('https://events.afan.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBodyAfan = request;  // save request to requestBodyAfan.
          return [
            201,
            response,
          ]
        });
        requestBodyAfan2 = null;
        nock('https://events2.afan.ai')
            .post('/trigger')
            .reply((uri, request) => {
          requestBodyAfan2 = request;  // save request to requestBodyAfan2.
          return [
            201,
            response,
          ]
        });
      })

      it("REST function with non-variable path", () => {
        const value = 'value';
        const tx = {
          "tx_body": {
            "operation": {
              "ref": refPathRest,
              "type": "SET_VALUE",
              "value": value,
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
            CommonUtil.parsePath(refPathRest), value, "prev value", { addr: 'abcd' },
            1234567890000, tx, 1000, 1234567890999,
            accountRegistrationGasAmount, restFunctionCallGasAmount, {});
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
          assert.deepEqual(requestBodyAinetwork, {
            "auth": {
              "addr": "abcd",
              "fid": "0x00001",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
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
            "prevValue": "prev value",
            "timestamp": 1234567890000,
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
                  "value": "value",
                },
                "timestamp": 1566736760322,
              }
            },
            "value": "value",
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
        const value = 'value';
        const tx = {
          "tx_body": {
            "operation": {
              "ref": refPathRestVarPath,
              "type": "SET_VALUE",
              "value": value,
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
            CommonUtil.parsePath(refPathRestVarPath), value, "prev value", { addr: 'abcd' },
            1234567890000, tx, 1000, 1234567890999,
            accountRegistrationGasAmount, restFunctionCallGasAmount, {});
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
          assert.deepEqual(requestBodyAinetwork, {
            "auth": {
              "addr": "abcd",
              "fid": "0x10001",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
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
              "var_path": "arbitrary"
            },
            "prevValue": "prev value",
            "timestamp": 1234567890000,
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
                  "value": "value",
                },
                "timestamp": 1566736760322,
              }
            },
            "value": "value",
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
        const value = 'value';
        const tx = {
          "tx_body": {
            "operation": {
              "ref": refPathRestMulti,
              "type": "SET_VALUE",
              "value": value,
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
            CommonUtil.parsePath(refPathRestMulti), value, "prev value", { addr: 'abcd' },
            1234567890000, tx, 1000, 1234567890999,
            accountRegistrationGasAmount, restFunctionCallGasAmount, {});
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
          assert.deepEqual(requestBodyAinetwork, {
            "auth": {
              "addr": "abcd",
              "fid": "0x20001",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
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
            "prevValue": "prev value",
            "timestamp": 1234567890000,
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
                  "value": "value",
                },
                "timestamp": 1566736760322,
              }
            },
            "value": "value",
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_multi",
            ]
          });
          assert.deepEqual(requestBodyAinize, {
            "auth": {
              "addr": "abcd",
              "fid": "0x20002",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
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
            "prevValue": "prev value",
            "timestamp": 1234567890000,
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
                  "value": "value",
                },
                "timestamp": 1566736760322,
              }
            },
            "value": "value",
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

      it("REST function with subtree and prevValue = null", () => {
        const prevValue = null;
        const value = {
          "deep": {
            "path": {
              "to": "deep path to value"
            },
            "other_path": {
              "to": "deep other_path to value"
            },
          },
          "other_deep": {
            "path": {
              "to": "deep path to value"
            }
          }
        };
        const tx = {
          "tx_body": {
            "operation": {
              "ref": refPathRestWithSubtree,
              "type": "SET_VALUE",
              "value": value,
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
            CommonUtil.parsePath(refPathRestWithSubtree), value, prevValue, { addr: 'abcd' },
            1234567890000, tx, 1000, 1234567890999,
            accountRegistrationGasAmount, restFunctionCallGasAmount, {});
        assert.deepEqual(funcResults, {
          "0x30001": {
            "code": 0,
            "bandwidth_gas_amount": 100,
          },
          "0x30002": {
            "code": 0,
            "bandwidth_gas_amount": 100,
          }
        });
        assert.deepEqual(eraseSubtreeFuncResPromiseResults(subtreeFuncResults), {
          "/deep/$var_path": {
            "/deep/other_path": {
              "func_results": {
                "0x30101": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30102": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "promise_results": "erased"
            },
            "/deep/path": {
              "func_results": {
                "0x30101": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30102": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "promise_results": "erased"
            }
          },
          "/deep/$var_path/to/$var_path2": {},
          "/deep/path": {
            "/deep/path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "promise_results": "erased"
            }
          }
        });
        return promiseResults.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 2,
            trigger_count: 2,
            fail_count: 0,
          });
          assert.deepEqual(requestBodyAinetwork, {
            "auth": {
              "addr": "abcd",
              "fid": "0x30001",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
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
            "timestamp": 1234567890000,
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
                  "value": {
                    "deep": {
                      "other_path": {
                        "to": "deep other_path to value"
                      },
                      "path": {
                        "to": "deep path to value"
                      }
                    },
                    "other_deep": {
                      "path": {
                        "to": "deep path to value"
                      }
                    }
                  }
                },
                "timestamp": 1566736760322
              }
            },
            "value": {
              "deep": {
                "other_path": {
                  "to": "deep other_path to value"
                },
                "path": {
                  "to": "deep path to value"
                }
              },
              "other_deep": {
                "path": {
                  "to": "deep path to value"
                }
              }
            },
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
            ]
          });
          assert.deepEqual(requestBodyAinetwork2, {
            "auth": {
              "addr": "abcd",
              "fid": "0x30002",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
            "executedAt": 1566736760324,
            "fid": "0x30002",
            "function": {
              "function_id": "0x30002",
              "function_type": "REST",
              "function_url": "https://events2.ainetwork.ai/trigger",
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
            "timestamp": 1234567890000,
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
                  "value": {
                    "deep": {
                      "other_path": {
                        "to": "deep other_path to value",
                      },
                      "path": {
                        "to": "deep path to value"
                      }
                    },
                    "other_deep": {
                      "path": {
                        "to": "deep path to value"
                      }
                    }
                  }
                },
                "timestamp": 1566736760322
              }
            },
            "value": {
              "deep": {
                "other_path": {
                  "to": "deep other_path to value"
                },
                "path": {
                  "to": "deep path to value"
                }
              },
              "other_deep": {
                "path": {
                  "to": "deep path to value"
                }
              }
            },
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
            ]
          });
          assert.deepEqual(requestBodyAinize, {
            "auth": {
              "addr": "abcd",
              "fid": "0x30101",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
            "executedAt": 1566736760324,
            "fid": "0x30101",
            "function": {
              "function_id": "0x30101",
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
              "deep",
              "$var_path",
            ],
            "params": {
              "var_path": "other_path"
            },
            "prevValue": null,
            "timestamp": 1234567890000,
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
                  "value": {
                    "deep": {
                      "other_path": {
                        "to": "deep other_path to value",
                      },
                      "path": {
                        "to": "deep path to value"
                      }
                    },
                    "other_deep": {
                      "path": {
                        "to": "deep path to value"
                      }
                    }
                  }
                },
                "timestamp": 1566736760322
              }
            },
            "value": {
              "to": "deep other_path to value"
            },
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deep",
              "other_path",
            ]
          });
          assert.deepEqual(requestBodyAinize2, {
            "auth": {
              "addr": "abcd",
              "fid": "0x30102",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
            "executedAt": 1566736760324,
            "fid": "0x30102",
            "function": {
              "function_id": "0x30102",
              "function_type": "REST",
              "function_url": "https://events2.ainize.ai/trigger",
            },
            "functionPath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deep",
              "$var_path",
            ],
            "params": {
              "var_path": "other_path"
            },
            "prevValue": null,
            "timestamp": 1234567890000,
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
                  "value": {
                    "deep": {
                      "other_path": {
                        "to": "deep other_path to value"
                      },
                      "path": {
                        "to": "deep path to value"
                      }
                    },
                    "other_deep": {
                      "path": {
                        "to": "deep path to value"
                      }
                    }
                  }
                },
                "timestamp": 1566736760322
              }
            },
            "value": {
              "to": "deep other_path to value"
            },
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deep",
              "other_path",
            ]
          });
          assert.deepEqual(requestBodyAinize3, null);
          assert.deepEqual(requestBodyAinize4, null);
          assert.deepEqual(requestBodyAfan, {
            "auth": {
              "addr": "abcd",
              "fid": "0x30201",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
            "executedAt": 1566736760324,
            "fid": "0x30201",
            "function": {
              "function_id": "0x30201",
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
              "deep",
              "path",
            ],
            "params": {},
            "prevValue": null,
            "timestamp": 1234567890000,
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
                  "value": {
                    "deep": {
                      "other_path": {
                        "to": "deep other_path to value"
                      },
                      "path": {
                        "to": "deep path to value"
                      }
                    },
                    "other_deep": {
                      "path": {
                        "to": "deep path to value"
                      }
                    }
                  }
                },
                "timestamp": 1566736760322
              }
            },
            "value": {
              "to": "deep path to value"
            },
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deep",
              "path",
            ]
          });
          assert.deepEqual(requestBodyAfan2, {
            "auth": {
              "addr": "abcd",
              "fid": "0x30202",
              "fids": [],
            },
            "blockNumber": 1000,
            "blockTime": 1234567890999,
            "executedAt": 1566736760324,
            "fid": "0x30202",
            "function": {
              "function_id": "0x30202",
              "function_type": "REST",
              "function_url": "https://events2.afan.ai/trigger",
            },
            "functionPath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deep",
              "path",
            ],
            "params": {},
            "prevValue": null,
            "timestamp": 1234567890000,
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
                  "value": {
                    "deep": {
                      "other_path": {
                        "to": "deep other_path to value"
                      },
                      "path": {
                        "to": "deep path to value"
                      }
                    },
                    "other_deep": {
                      "path": {
                        "to": "deep path to value"
                      }
                    }
                  }
                },
                "timestamp": 1566736760322
              }
            },
            "value": {
              "to": "deep path to value"
            },
            "valuePath": [
              "apps",
              "test",
              "test_function",
              "some",
              "path",
              "rest_with_subtree",
              "deep",
              "path",
            ]
          });
        });
      })

      it("REST function without listener", () => {
        const value = 'value';
        const tx = {
          "tx_body": {
            "operation": {
              "ref": refPathRestWithoutListener,
              "type": "SET_VALUE",
              "value": value,
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
            CommonUtil.parsePath(refPathRestWithoutListener), value, "prev value", { addr: 'abcd' },
            1234567890000, tx, 1000, 1234567890999,
            accountRegistrationGasAmount, restFunctionCallGasAmount, {});
        return promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 1,
          });
        });
      })

      it("REST function NOT whitelisted", () => {
        const value = 'value';
        const tx = {
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
            CommonUtil.parsePath(refPathRestNotWhitelisted), value, "prev value", { addr: 'abcd' },
            1234567890000, tx, 1000, 1234567890999,
            accountRegistrationGasAmount, restFunctionCallGasAmount, {});
        return promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 0,
            fail_count: 0,
          });
        });
      })

      it('REST function newly whitelisted', () => {
        const value = 'value';

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
        const tx = {
          "tx_body": {
            "operation": {
              "ref": refPathRestNewlyWhitelisted,
              "type": "SET_VALUE",
              "value": value,
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
            CommonUtil.parsePath(refPathRestNewlyWhitelisted),
            value, "prev value", { addr: 'abcd' }, 1234567890000, tx, 1000, 1234567890999,
            accountRegistrationGasAmount, restFunctionCallGasAmount, {});
        return promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 1,
            fail_count: 1
          });
        })
      });

      it('REST function newly de-whitelisted', () => {
        const value = 'value';

        // delete function from the whitelist
        node.db.setValuesForTesting(refPathFunctionUrlWhitelist, null);
        const tx = {
          "tx_body": {
            "operation": {
              "ref": refPathRestNewlyWhitelisted,
              "type": "SET_VALUE",
              "value": value,
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
            CommonUtil.parsePath(refPathRestNewlyWhitelisted),
            value, "prev value", { addr: 'abcd' }, 1234567890000, tx, 1000, 1234567890999,
            accountRegistrationGasAmount, restFunctionCallGasAmount, {});
        return promise_results.then((resp) => {
          assert.deepEqual(resp, {
            func_count: 1,
            trigger_count: 0,
            fail_count: 0
          })
        })
      });

      it("null function", () => {
        const value = 'value';
        const tx = {
          "tx_body": {
            "operation": {
              "ref": refPathNull,
              "type": "SET_VALUE",
              "value": value,
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
            CommonUtil.parsePath(refPathNull),
            value, "prev value", { addr: 'abcd' }, 1234567890000, tx, 1000, 1234567890999,
            accountRegistrationGasAmount, restFunctionCallGasAmount, {});
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
        const value = 10;
        const txBody = {
          "operation": {
            "ref": refPathTransfer,
            "type": "SET_VALUE",
            "value": value, 
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
            CommonUtil.parsePath(refPathTransfer), value, null,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 1566736760322, tx,
            1000, 1234567890999, accountRegistrationGasAmount, restFunctionCallGasAmount, {});
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
        const value = 10;
        const txBody = {
          "operation": {
            "ref": refPathTransfer,
            "type": "SET_VALUE",
            "value": value,
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
            CommonUtil.parsePath(refPathTransfer), value, null,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 1566736760322, tx,
            1000, 1234567890999, accountRegistrationGasAmount, restFunctionCallGasAmount, {});
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
        const value = 'value';
        const tx = {
          "tx_body": {
            "operation": {
              "ref": refPathRestGas,
              "type": "SET_VALUE",
              "value": value,
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
            CommonUtil.parsePath(refPathRestGas), value, null,
            { addr: '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1' }, 1566736760322, tx,
            1000, 1234567890999, accountRegistrationGasAmount, restFunctionCallGasAmount, {});
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

  describe("matchValueWithFunctionPath", () => {
    const value = {
      some: {
        value: 'some value',
        path: {
          to: 'some path to value'
        },
        other_path: {
          to: 'some other_path to value'
        },
        deep: {
          path: {
            to: "some deep path to value"
          },
          deeper: {
            path: {
              to: "some deep deeper path to value"
            },
            other_path: {
              to: 'some deep deeper other_path to value'
            }
          }
        }
      }
    };

    it("with matching non-variable path", () => {
      assert.deepEqual(Functions.matchValueWithFunctionPath(value, [
        'some',
        'value',
      ]), [
        {
          "value": "some value",
          "pathVars": {},
          "path": [
            "some",
            "value",
          ]
        }
      ]);
      assert.deepEqual(Functions.matchValueWithFunctionPath(value, [
        'some',
        'deep',
        'deeper',
        'path',
        'to',
      ]), [
        {
          "value": "some deep deeper path to value",
          "pathVars": {},
          "path": [
            "some",
            "deep",
            "deeper",
            "path",
            "to",
          ]
        }
      ]);
    })

    it("with too-long non-variable path", () => {
      assert.deepEqual(Functions.matchValueWithFunctionPath(value, [
        'some',
        'path',
        'to',
        'value'
      ]), []);
    })

    it("with matching variable path", () => {
      assert.deepEqual(Functions.matchValueWithFunctionPath(value, [
        'some',
        '$var_path',
        'to',
      ]), [
        {
          "value": "some path to value",
          "pathVars": {
            "$var_path": "path",
          },
          "path": [
            "some",
            "path",
            "to",
          ]
        },
        {
          "value": "some other_path to value",
          "pathVars": {
            "$var_path": "other_path",
          },
          "path": [
            "some",
            "other_path",
            "to",
          ]
        }
      ]);
      assert.deepEqual(Functions.matchValueWithFunctionPath(value, [
        'some',
        '$var_path1',
        'deeper',
        '$var_path2',
      ]), [
        {
          "value": {
            "to": "some deep deeper path to value"
          },
          "pathVars": {
            "$var_path1": "deep",
            "$var_path2": "path",
          },
          "path": [
            "some",
            "deep",
            "deeper",
            "path",
          ]
        },
        {
          "value": {
            "to": "some deep deeper other_path to value"
          },
          "pathVars": {
            "$var_path1": "deep",
            "$var_path2": "other_path",
          },
          "path": [
            "some",
            "deep",
            "deeper",
            "other_path",
          ]
        }
      ]);
    })

    it("with too-long variable path", () => {
      assert.deepEqual(Functions.matchValueWithFunctionPath(value, [
        'some',
        '$var_path1',
        'to',
        '$var_path2'
      ]), []);
    })
  });

  describe("matchValueWithValuePath", () => {
    const value = {
      some: {
        value: 'some value',
        path: {
          to: 'some path to value'
        },
        other_path: {
          to: 'some other_path to value'
        },
        deep: {
          path: {
            to: "some deep path to value"
          },
          deeper: {
            path: {
              to: "some deep deeper path to value"
            },
            other_path: {
              to: 'some deep deeper other_path to value'
            }
          }
        }
      }
    };

    it("with matching path", () => {
      assert.deepEqual(Functions.matchValueWithValuePath(value, [
        'some',
        'value',
      ]), "some value");
      assert.deepEqual(Functions.matchValueWithValuePath(value, [
        'some',
        'path',
      ]), {
        "to": "some path to value"
      });
      assert.deepEqual(Functions.matchValueWithValuePath(value, [
        'some',
        'deep',
        'deeper',
      ]), {
        "other_path": {
          "to": "some deep deeper other_path to value"
        },
        "path": {
          "to": "some deep deeper path to value"
        }
      });
    });

    it("with non-matching path", () => {
      assert.deepEqual(Functions.matchValueWithValuePath(value, [
        'non_matching',
      ]), null);
      assert.deepEqual(Functions.matchValueWithValuePath(value, [
        'some',
        'non_matching',
        'to',
      ]), null);
      assert.deepEqual(Functions.matchValueWithValuePath(value, [
        'some',
        'deep',
        'non_matching',
      ]), null);
    });
  });
})
