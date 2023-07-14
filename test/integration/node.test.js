const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const _ = require("lodash");
const spawn = require("child_process").spawn;
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const jayson = require('jayson/promise');
const ainUtil = require('@ainblockchain/ain-util');
const { BlockchainConsts, BlockchainParams, NodeConfigs } = require('../../common/constants');
const CommonUtil = require('../../common/common-util');
const {
  verifyStateProof,
} = require('../../db/state-util');
const {
  parseOrLog,
  setUpApp,
  waitUntilNetworkIsReady,
  waitUntilTxFinalized,
  eraseEvalResMatched
} = require('../test-util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');

const PROJECT_ROOT = require('path').dirname(__filename) + "/../../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const ENV_VARIABLES = [
  {
    UNSAFE_PRIVATE_KEY: 'b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96',
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes', PORT: 8081, P2P_PORT: 5001,
    ENABLE_GAS_FEE_WORKAROUND: true, ENABLE_EXPRESS_RATE_LIMIT: false,
    FREE_TX_POOL_SIZE_LIMIT_RATIO: 1.0,
    FREE_TX_POOL_SIZE_LIMIT_RATIO_PER_ACCOUNT: 1.0,
  },
  {
    UNSAFE_PRIVATE_KEY: '921cc48e48c876fc6ed1eb02a76ad520e8d16a91487f9c7e03441da8e35a0947',
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes', PORT: 8082, P2P_PORT: 5002,
    ENABLE_GAS_FEE_WORKAROUND: true, ENABLE_EXPRESS_RATE_LIMIT: false,
    GET_RESP_BYTES_LIMIT: 77819, GET_RESP_MAX_SIBLINGS: 1000, // For get_value limit tests
  },
  {
    UNSAFE_PRIVATE_KEY: '41e6e5718188ce9afd25e4b386482ac2c5272c49a622d8d217887bce21dce560',
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes', PORT: 8083, P2P_PORT: 5003,
    ENABLE_GAS_FEE_WORKAROUND: true, ENABLE_EXPRESS_RATE_LIMIT: false,
  },
];

const server1 = 'http://localhost:8081';
const server2 = 'http://localhost:8082';
const server3 = 'http://localhost:8083';
const serverList = [ server1, server2, server3 ];

function startServer(application, serverName, envVars, stdioInherit = false) {
  const options = {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      ...envVars
    },
  };
  if (stdioInherit) {
    options.stdio = 'inherit';
  }
  return spawn('node', [application], options).on('error', (err) => {
    console.error(`Failed to start ${serverName} with error: ${err.message}`);
  });
}

async function setUp() {
  const res = parseOrLog(syncRequest('POST', server2 + '/set', {
    json: {
      op_list: [
        {
          type: 'SET_VALUE',
          ref: '/apps/test/test_value/some/path',
          value: 100
        },
        {
          type: 'SET_VALUE',
          ref: '/apps/test/test_state_info/some/path',
          value: {
            label1: {
              label11: 'value11',
              label12: 'value12',
            },
            label2: 'value2'
          }
        },
        {
          type: 'SET_RULE',
          ref: '/apps/test/test_rule/some/path',
          value: {
            ".rule": {
              "write": "auth.addr === 'abcd'"
            }
          }
        },
        {
          type: 'SET_RULE',
          ref: '/apps/test/test_rule/state',
          value: {
            ".rule": {
              "state": {
                "max_children": 10,
                "gc_max_siblings": 200,
                "gc_num_siblings_deleted": 100,
              }
            },
            "and": {
              "write": {
                ".rule": {
                  "write": true
                }
              }
            }
          }
        },
        {
          type: 'SET_FUNCTION',
          ref: '/apps/test/test_function/some/path',
          value: {
            ".function": {
              "fid": {
                "function_type": "REST",
                "function_id": "fid",
                "function_url": "https://events.ainetwork.ai/trigger",
              },
            }
          }
        },
        {
          type: 'SET_OWNER',
          ref: '/apps/test/test_owner/some/path',
          value: {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": false,
                }
              }
            }
          }
        },
      ],
      nonce: -1,
    }
  }).body.toString('utf-8')).result;
  assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
  if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
    console.error(`Failed to check finalization of setUp() tx.`);
  }
}

async function cleanUp() {
  const res = parseOrLog(syncRequest('POST', server2 + '/set', {
    json: {
      op_list: [
        {
          type: 'SET_OWNER',
          ref: '/apps/test/test_owner/some/path',
          value: null
        },
        {
          type: 'SET_FUNCTION',
          ref: '/apps/test/test_function',
          value: null
        },
        {
          type: 'SET_RULE',
          ref: '/apps/test/test_rule',
          value: null
        },
        {
          type: 'SET_VALUE',
          ref: '/apps/test/test_value',
          value: null
        },
        {
          type: 'SET_VALUE',
          ref: '/apps/test/test_state_info',
          value: null
        },
      ],
      nonce: -1,
    }
  }).body.toString('utf-8')).result;
  assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
  if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
    console.error(`Failed to check finalization of cleanUp() tx.`);
  }
}

describe('Blockchain Node', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc;

  before(async () => {
    rimraf.sync(NodeConfigs.CHAINS_DIR);

    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', { CONSOLE_LOG: false }, true);
    await CommonUtil.sleep(3000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0], true);
    await CommonUtil.sleep(10000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1], true);
    await CommonUtil.sleep(3000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2], true);
    await CommonUtil.sleep(3000);
    await waitUntilNetworkIsReady(serverList);

    const server1Addr = parseOrLog(syncRequest(
        'GET', server1 + '/get_address').body.toString('utf-8')).result;
    const server2Addr = parseOrLog(syncRequest(
        'GET', server2 + '/get_address').body.toString('utf-8')).result;
    const server3Addr = parseOrLog(syncRequest(
        'GET', server3 + '/get_address').body.toString('utf-8')).result;
    await setUpApp('test', serverList, {
      admin: {
        [server1Addr]: true,
        [server2Addr]: true,
        [server3Addr]: true,
      }
    });
  });

  after(() => {
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()

    rimraf.sync(NodeConfigs.CHAINS_DIR)
  });

  describe('Get API', async () => {
    before(async () => {
      await setUp();
    });

    after(async () => {
      await cleanUp();
    });

    describe('get_value api', () => {
      it('get_value', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path')
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: 100});
      })
    })

    describe('get_function api', () => {
      it('get_function', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=/apps/test/test_function/some/path')
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: {
            ".function": {
              "fid": {
                "function_type": "REST",
                "function_id": "fid",
                "function_url": "https://events.ainetwork.ai/trigger",
              },
            }
          }
        });
      })
    })

    describe('get_rule api', () => {
      it('get_rule', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + '/get_rule?ref=/apps/test/test_rule/some/path')
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: {
            ".rule": {
              "write": "auth.addr === 'abcd'"
            }
          }
        });
      })
    })

    describe('get_owner api', () => {
      it('get_owner', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=/apps/test/test_owner/some/path')
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": false,
                }
              }
            }
          }
        });
      })
    })

    describe('match_function api', () => {
      it('match_function', () => {
        const ref = "/apps/test/test_function/some/path";
        const body = parseOrLog(syncRequest('GET', `${server1}/match_function?ref=${ref}`)
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: {
          "matched_path": {
            "target_path": "/apps/test/test_function/some/path",
            "ref_path": "/apps/test/test_function/some/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "fid": {
                "function_url": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
              }
            },
            "path": "/apps/test/test_function/some/path"
          },
          "subtree_configs": []
        }});
      })
    })

    describe('match_rule api', () => {
      it('match_rule (write)', () => {
        const ref = "/apps/test/test_rule/some/path";
        const body = parseOrLog(syncRequest('GET', `${server1}/match_rule?ref=${ref}`)
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: {
          "write": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/path",
              "ref_path": "/apps/test/test_rule/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === 'abcd'"
              },
              "path": "/apps/test/test_rule/some/path"
            },
            "subtree_configs": []
          },
          "state": {
            "matched_path": {
              "target_path": "/apps/test/test_rule/some/path",
              "ref_path": "/apps/test/test_rule/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": null,
              "path": "/"
            }
          }
        }});
      })

      it('match_rule api - state only', () => {
        const ref = "/apps/test/test_rule/state";
        const body = parseOrLog(syncRequest('GET', `${server1}/match_rule?ref=${ref}`)
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          "code": 0,
          "result": {
            "write": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/state",
                "ref_path": "/apps/test/test_rule/state",
                "path_vars": {}
              },
              "matched_config": {
                "path": "/apps/test",
                "config": {
                  "write": "auth.addr === '0x00ADEc28B6a845a085e03591bE7550dd68673C1C' || auth.addr === '0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204' || auth.addr === '0x02A2A1DF4f630d760c82BE07F18e5065d103Fa00'"
                }
              },
              "subtree_configs": [
                {
                  "path": "/and/write",
                  "config": {
                    "write": true
                  }
                }
              ]
            },
            "state": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/state",
                "ref_path": "/apps/test/test_rule/state",
                "path_vars": {}
              },
              "matched_config": {
                "path": "/apps/test/test_rule/state",
                "config": {
                  "state": {
                    "max_children": 10,
                    "gc_max_siblings": 200,
                    "gc_num_siblings_deleted": 100,
                  }
                }
              }
            }
          }
        });
      })

      it('match_rule api - state & write', () => {
        const ref = "/apps/test/test_rule/state/and/write";
        const body = parseOrLog(syncRequest('GET', `${server1}/match_rule?ref=${ref}`)
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          "code": 0,
          "result": {
            "write": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/state/and/write",
                "ref_path": "/apps/test/test_rule/state/and/write",
                "path_vars": {}
              },
              "matched_config": {
                "path": "/apps/test/test_rule/state/and/write",
                "config": {
                  "write": true
                }
              },
              "subtree_configs": []
            },
            "state": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/state/and/write",
                "ref_path": "/apps/test/test_rule/state/and/write",
                "path_vars": {}
              },
              "matched_config": {
                "path": "/apps/test/test_rule/state",
                "config": {
                  "state": {
                    "max_children": 10,
                    "gc_max_siblings": 200,
                    "gc_num_siblings_deleted": 100,
                  }
                }
              }
            }
          }
        });
      })
    })

    describe('match_owner api', () => {
      it('match_owner', () => {
        const ref = "/apps/test/test_owner/some/path";
        const body = parseOrLog(syncRequest('GET', `${server1}/match_owner?ref=${ref}`)
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: {
          "matched_path": {
            "target_path": "/apps/test/test_owner/some/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/apps/test/test_owner/some/path"
          },
          "subtree_configs": []
        }});
      })
    })

    describe('eval_rule api', () => {
      it('eval_rule returning true', () => {
        const ref = "/apps/test/test_rule/some/path";
        const value = "value";
        const address = "abcd";
        const request = { ref, value, address, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        const body = parseOrLog(syncRequest('POST', server1 + '/eval_rule', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body.code, 0);
        assert.deepEqual(eraseEvalResMatched(body.result), {
          "code": 0,
          "matched": "erased",
        });
      })

      it('eval_rule returning false', () => {
        const ref = "/apps/test/test_rule/some/path";
        const value = "value";
        const address = "efgh";
        const request = { ref, value, address, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        const body = parseOrLog(syncRequest('POST', server1 + '/eval_rule', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body.code, 0);
        body.result.message = 'erased';
        assert.deepEqual(eraseEvalResMatched(body.result), {
          "code": 12103,
          "message": "erased",
          "matched": "erased",
        });
      })
    })

    describe('eval_owner api', () => {
      it('eval_owner', () => {
        const ref = "/apps/test/test_owner/some/path";
        const address = "abcd";
        const permission = "write_owner";
        const request = { ref, permission, address, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        const body = parseOrLog(syncRequest('POST', server1 + '/eval_owner', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: {
            "code": 0,
            "matched": {
              "closestOwner": {
                "config": {
                  "owners": {
                    "*": {
                      "branch_owner": false,
                      "write_function": true,
                      "write_owner": true,
                      "write_rule": false,
                    }
                  }
                },
                "path": [
                  "apps",
                  "test",
                  "test_owner",
                  "some",
                  "path",
                ]
              },
              "matchedOwnerPath": [
                "apps",
                "test",
                "test_owner",
                "some",
                "path",
              ],
              "subtreeOwners": []
            }
          }
        });
      })
    })

    describe('get api', () => {
      it('get', () => {
        const request = {
          op_list: [
            {
              type: "GET_VALUE",
              ref: "/apps/test/test_value/some/path",
            },
            {
              type: 'GET_FUNCTION',
              ref: "/apps/test/test_function/some/path",
            },
            {
              type: 'GET_RULE',
              ref: "/apps/test/test_rule/some/path",
            },
            {
              type: 'GET_OWNER',
              ref: "/apps/test/test_owner/some/path",
            },
            {
              type: 'EVAL_RULE',
              ref: "/apps/test/test_rule/some/path",
              value: "value",
              address: "abcd"
            },
            {
              type: 'EVAL_OWNER',
              ref: "/apps/test/test_owner/some/path",
              permission: "write_owner",
              address: "abcd"
            }
          ]
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/get', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: [
            100,
            {
              ".function": {
                "fid": {
                  "function_type": "REST",
                  "function_id": "fid",
                  "function_url": "https://events.ainetwork.ai/trigger",
                },
              }
            },
            {
              ".rule": {
                "write": "auth.addr === 'abcd'"
              }
            },
            {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": true,
                    "write_owner": true,
                    "write_rule": false,
                  }
                }
              }
            },
            {
              "code": 0,
              "matched": {
                "state": {
                  "closestRule": {
                    "config": null,
                    "path": [],
                  },
                  "matchedRulePath": [
                    "apps",
                    "test",
                    "test_rule",
                    "some",
                    "path",
                  ],
                  "matchedValuePath": [
                    "apps",
                    "test",
                    "test_rule",
                    "some",
                    "path",
                  ],
                  "pathVars": {}
                },
                "write": {
                  "closestRule": {
                    "config": {
                      "write": "auth.addr === 'abcd'"
                    },
                    "path": [
                      "apps",
                      "test",
                      "test_rule",
                      "some",
                      "path",
                    ]
                  },
                  "matchedRulePath": [
                    "apps",
                    "test",
                    "test_rule",
                    "some",
                    "path",
                  ],
                  "matchedValuePath": [
                    "apps",
                    "test",
                    "test_rule",
                    "some",
                    "path",
                  ],
                  "pathVars": {},
                  "subtreeRules": []
                }
              }
            },
            {
              "code": 0,
              "matched": {
                "closestOwner": {
                  "config": {
                    "owners": {
                      "*": {
                        "branch_owner": false,
                        "write_function": true,
                        "write_owner": true,
                        "write_rule": false,
                      }
                    }
                  },
                  "path": [
                    "apps",
                    "test",
                    "test_owner",
                    "some",
                    "path",
                  ]
                },
                "matchedOwnerPath": [
                  "apps",
                  "test",
                  "test_owner",
                  "some",
                  "path",
                ],
                "subtreeOwners": []
              }
            }
          ]
        });
      })

      it('get with empty op_list', () => {
        const request = {
          op_list: [  // empty op_list
          ]
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/get', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          "result": null,
          "code": 30006,
          "message": "Invalid op_list given"
        });
      })

      it('get with null op_list', () => {
        const request = {
          op_list: null  // null op_list
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/get', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          "result": null,
          "code": 30006,
          "message": "Invalid op_list given"
        });
      })
    })

    describe('get_state_proof api', () => {
      it('get_state_proof', () => {
        const body = parseOrLog(syncRequest('GET', server1 + '/get_state_proof?ref=/values/blockchain_params/token/symbol')
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['#state_ph']).to.not.equal(null);
        const verifResult = verifyStateProof(body.result);
        _.set(verifResult, 'curProofHash', 'erased');
        assert.deepEqual(verifResult, {
          "curProofHash": "erased",
          "isVerified": true,
          "mismatchedPath": null,
          "mismatchedProofHash": null,
          "mismatchedProofHashComputed": null,
        });
      });
    });

    describe('get_proof_hash api', () => {
      it('get_proof_hash', () => {
        const body = parseOrLog(syncRequest('GET', server1 + '/get_proof_hash?ref=/values/blockchain_params/token/symbol')
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result).to.not.equal(null);
      });
    });

    describe('get_state_info api', () => {
      it('get_state_info', () => {
        const infoBody = parseOrLog(syncRequest(
            'GET', server1 + `/get_state_info?ref=/values/apps/test/test_state_info/some/path`)
                .body.toString('utf-8'));
        // Erase some properties for stable comparison.
        infoBody.result['#tree_bytes'] = 0;
        infoBody.result['#state_ph'] = 'erased';
        infoBody.result['#version'] = 'erased';
        assert.deepEqual(
            infoBody, {
              code: 0,
              result: {
                "#num_children": 2,
                "#state_ph": "erased",
                "#tree_bytes": 0,
                "#tree_height": 2,
                "#tree_max_siblings": 2,
                "#tree_size": 5,
                "#version": "erased",
              }});
      });
    });

    describe('get_state_usage api', () => {
      it('get_state_usage with existing app name', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + `/get_state_usage?app_name=test`)
                .body.toString('utf-8'));
        assert.deepEqual(body.result, {
          "available": {
            "tree_bytes": 2474987586,
            "tree_height": 30,
            "tree_size": 15468672.412500001
          },
          "staking": {
            "app": 1,
            "total": 1,
            "unstakeable": 1
          },
          "usage": {
            "tree_bytes": 12414,
            "tree_height": 24,
            "tree_max_siblings": 12,
            "tree_size": 66
          }
        });
      });

      it('get_state_usage with non-existing app name', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + `/get_state_usage?app_name=app_non_existing`)
                .body.toString('utf-8'));
        assert.deepEqual(body.result, {
          "available": {
            "tree_bytes": 25000000,
            "tree_height": 30,
            "tree_size": 156250
          },
          "staking": {
            "app": 0,
            "total": 1,
            "unstakeable": 0
          },
          "usage": {
            "tree_bytes": 0,
            "tree_height": 0,
            "tree_max_siblings": 0,
            "tree_size": 0
          }
        });
      });
    });

    describe('json-rpc api: ain_get', () => {
      it('returns the correct value', () => {
        const expected = 100;
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value/some/path"
        })
        .then(res => {
          expect(res.result.result).to.equal(expected);
        });
      });

      it('returns the correct value with is_shallow = true', () => {
        const expected = 100;
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value/some/path",
          is_shallow: true  // w/ is_shallow = true
        })
        .then(res => {
          expect(res.result.result).to.equal(expected);
        });
      });

      it('returns the correct value with is_partial = true', () => {
        const expected = 100;
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value/some/path",
          is_partial: true  // w/ is_partial = true
        })
        .then(res => {
          expect(res.result.result).to.equal(expected);
        });
      });

      it('returns the correct object value', () => {
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value"
        })
        .then(res => {
          assert.deepEqual(res.result.result, {
            "some": {
              "path": 100
            }
          });
        });
      });

      it('returns the correct object value with is_shallow = true', () => {
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value",
          is_shallow: true  // w/ is_shallow = true
        })
        .then(res => {
          assert.deepEqual(res.result.result, {
            "some": {
              "#state_ph": "0x1f8ea4b70d822143cd8545d3c248ac33f14c60053c86d2b44ee6bb9381c21d62"
            }
          });
        });
      });

      it('returns the correct object value with is_partial = true', () => {
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value",
          is_partial: true  // w/ is_partial = true
        })
        .then(res => {
          assert.deepEqual(res.result.result, {
            "#end_label": "736f6d65",
            "some": {
              "#serial": 2,
              "#state_ph": "0x1f8ea4b70d822143cd8545d3c248ac33f14c60053c86d2b44ee6bb9381c21d62",
            }
          });
        });
      });

      it('returns error when empty op_list is given', () => {
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET',
          op_list: [  // empty op_list
          ]
        })
        .then(res => {
          expect(res.result.result).to.equal(null);
          expect(res.result.code).to.equal(30006);
          expect(res.result.message).to.equal('Invalid op_list given');
        });
      });

      it('returns error when null op_list is given', () => {
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET',
          op_list: null
        })
        .then(res => {
          expect(res.result.result).to.equal(null);
          expect(res.result.code).to.equal(30006);
          expect(res.result.message).to.equal('Invalid op_list given');
        });
      });

      it('returns error when requested data exceeds the get response bytes limit', async () => {
        // Note: GET_RESP_BYTES_LIMIT = 77819
        const bigTree = {};
        for (let i = 0; i < 100; i++) {
          bigTree[i] = {};
          for (let j = 0; j < 100; j++) {
            bigTree[i][j] = 'a';
          }
        }
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: '/apps/test/test_value/some/path',
          value: bigTree, // 77820 bytes (using object-sizeof)
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value/some/path",
        })
        .then(res => {
          expect(res.result.result).to.equal(null);
          expect(res.result.code).to.equal(30002);
          expect(res.result.message.includes(
              'The data exceeds the max byte limit of the requested node'), true);
        });
      });

      // the same as the previous test case but is_shallow = true
      it('returns a correct value with is_shallow = true', async () => {
        const bigTree = {};
        for (let i = 0; i < 100; i++) {
          bigTree[i] = {};
          for (let j = 0; j < 100; j++) {
            bigTree[i][j] = 'a';
          }
        }
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: '/apps/test/test_value/some/path',
          value: bigTree, // 77820 bytes (using object-sizeof)
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value/some/path",
          is_shallow: true  // w/ is_shallow = true
        })
        .then(res => {
          expect(res.result.code).to.equal(undefined);
        });
      });

      it('returns error when requested data exceeds the get response max siblings limit - node num children', async () => {
        // Note: GET_RESP_MAX_SIBLINGS = 1000
        const wideTree = {};
        for (let i = 0; i < 1001; i++) {
          wideTree[i] = 'a';
        }
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: '/apps/test/test_value/some/path',
          value: wideTree, // 1001 siblings (num children)
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value/some/path",
        })
        .then(res => {
          expect(res.result.result).to.equal(null);
          expect(res.result.code).to.equal(30003);
          expect(res.result.message.includes(
              'The data exceeds the max sibling limit of the requested node'), true);
        });
      });

      it('returns error when requested data exceeds the get response max siblings limit - subtree num children', async () => {
        // Note: GET_RESP_MAX_SIBLINGS = 1000
        const wideTree = {};
        wideTree[0] = {};
        for (let i = 0; i < 1001; i++) {
          wideTree[0][i] = 'a';
        }
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: '/apps/test/test_value/some/path',
          value: wideTree, // 1001 max siblings (subtree num children)
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value/some/path",
        })
        .then(res => {
          expect(res.result.result).to.equal(null);
          expect(res.result.code).to.equal(30003);
          expect(res.result.message.includes(
              'The data exceeds the max sibling limit of the requested node'), true);
        });
      });

      // the same as the previous test case but is_partial = true
      it('returns a correct value with is_partial = true', async () => {
        // Note: GET_RESP_MAX_SIBLINGS = 1000
        const wideTree = {};
        for (let i = 0; i < 1001; i++) {
          wideTree[i] = 'a';
        }
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: '/apps/test/test_value/some/path',
          value: wideTree, // 1001 siblings (num children)
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value/some/path",
          is_partial: true  // w/ is_partial = true
        })
        .then(res => {
          expect(res.result.result['#end_label']).to.equal('393938');
        });
      });
    });

    describe('json-rpc api: ain_matchFunction', () => {
      it('returns correct value', () => {
        const ref = "/apps/test/test_function/some/path";
        const request = { ref, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_MATCH_FUNCTION, request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "matched_path": {
              "target_path": "/apps/test/test_function/some/path",
              "ref_path": "/apps/test/test_function/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "fid": {
                  "function_url": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid",
                  "function_type": "REST",
                }
              },
              "path": "/apps/test/test_function/some/path"
            },
            "subtree_configs": []
          });
        })
      })
    })

    describe('json-rpc api: ain_matchRule', () => {
      it('returns correct value (write)', () => {
        const ref = "/apps/test/test_rule/some/path";
        const request = { ref, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_MATCH_RULE, request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "write": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/some/path",
                "ref_path": "/apps/test/test_rule/some/path",
                "path_vars": {},
              },
              "matched_config": {
                "config": {
                  "write": "auth.addr === 'abcd'"
                },
                "path": "/apps/test/test_rule/some/path"
              },
              "subtree_configs": []
            },
            "state": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/some/path",
                "ref_path": "/apps/test/test_rule/some/path",
                "path_vars": {},
              },
              "matched_config": {
                "config": null,
                "path": "/"
              }
            }
          });
        })
      })

      it('returns correct value (state)', () => {
        const ref = "/apps/test/test_rule/state";
        const request = { ref, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_MATCH_RULE, request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "write": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/state",
                "ref_path": "/apps/test/test_rule/state",
                "path_vars": {}
              },
              "matched_config": {
                "path": "/apps/test",
                "config": {
                  "write": "auth.addr === '0x00ADEc28B6a845a085e03591bE7550dd68673C1C' || auth.addr === '0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204' || auth.addr === '0x02A2A1DF4f630d760c82BE07F18e5065d103Fa00'"
                }
              },
              "subtree_configs": [
                {
                  "path": "/and/write",
                  "config": {
                    "write": true
                  }
                }
              ]
            },
            "state": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/state",
                "ref_path": "/apps/test/test_rule/state",
                "path_vars": {}
              },
              "matched_config": {
                "path": "/apps/test/test_rule/state",
                "config": {
                  "state": {
                    "max_children": 10,
                    "gc_max_siblings": 200,
                    "gc_num_siblings_deleted": 100,
                  }
                }
              }
            }
          });
        });
      })

      it('returns correct value (state & write)', () => {
        const ref = "/apps/test/test_rule/state/and/write";
        const request = { ref, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_MATCH_RULE, request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "write": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/state/and/write",
                "ref_path": "/apps/test/test_rule/state/and/write",
                "path_vars": {}
              },
              "matched_config": {
                "path": "/apps/test/test_rule/state/and/write",
                "config": {
                  "write": true
                }
              },
              "subtree_configs": []
            },
            "state": {
              "matched_path": {
                "target_path": "/apps/test/test_rule/state/and/write",
                "ref_path": "/apps/test/test_rule/state/and/write",
                "path_vars": {}
              },
              "matched_config": {
                "path": "/apps/test/test_rule/state",
                "config": {
                  "state": {
                    "max_children": 10,
                    "gc_max_siblings": 200,
                    "gc_num_siblings_deleted": 100,
                  }
                }
              }
            }
          });
        });
      })
    })

    describe('json-rpc api: ain_matchOwner', () => {
      it('returns correct value', () => {
        const ref = "/apps/test/test_owner/some/path";
        const request = { ref, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_MATCH_OWNER, request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "matched_path": {
              "target_path": "/apps/test/test_owner/some/path"
            },
            "matched_config": {
              "config": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": true,
                    "write_owner": true,
                    "write_rule": false
                  }
                }
              },
              "path": "/apps/test/test_owner/some/path"
            },
            "subtree_configs": []
          });
        })
      })
    })

    describe('json-rpc api: ain_evalRule', () => {
      it('returns true', () => {
        const ref = "/apps/test/test_rule/some/path";
        const value = "value";
        const address = "abcd";
        const request = { ref, value, address, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_EVAL_RULE, request)
        .then(res => {
          assert.deepEqual(eraseEvalResMatched(res.result.result), {
            "code": 0,
            "matched": "erased",
          });
        })
      })

      it('returns false', () => {
        const ref = "/apps/test/test_rule/some/path";
        const value = "value";
        const address = "efgh";
        const request = { ref, value, address, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_EVAL_RULE, request)
        .then(res => {
          res.result.result.message = 'erased';
          assert.deepEqual(eraseEvalResMatched(res.result.result), {
            "code": 12103,
            "message": "erased",
            "matched": "erased",
          });
        })
      })
    })

    describe('json-rpc api: ain_evalOwner', () => {
      it('returns correct value', () => {
        const ref = "/apps/test/test_owner/some/path";
        const address = "abcd";
        const permission = "write_owner";
        const request = { ref, permission, address, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_EVAL_OWNER, request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "code": 0,
            "matched": {
              "closestOwner": {
                "config": {
                  "owners": {
                    "*": {
                      "branch_owner": false,
                      "write_function": true,
                      "write_owner": true,
                      "write_rule": false,
                    }
                  }
                },
                "path": [
                  "apps",
                  "test",
                  "test_owner",
                  "some",
                  "path",
                ]
              },
              "matchedOwnerPath": [
                "apps",
                "test",
                "test_owner",
                "some",
                "path",
              ],
              "subtreeOwners": []
            }
          });
        })
      })
    })

    describe('json-rpc api: ain_getStateProof', () => {
      it('returns correct value', () => {
        const ref = '/values/blockchain_params/token/symbol';
        const request = { ref, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_GET_STATE_PROOF, request)
        .then(res => {
          expect(res.result.result['#state_ph']).to.not.equal(null);
          const verifResult = verifyStateProof(res.result.result);
          _.set(verifResult, 'curProofHash', 'erased');
          assert.deepEqual(verifResult, {
            "curProofHash": "erased",
            "isVerified": true,
            "mismatchedPath": null,
            "mismatchedProofHash": null,
            "mismatchedProofHashComputed": null,
          });
        })
      })
    })

    describe('json-rpc api: ain_getProofHash', () => {
      it('returns correct value', () => {
        const ref = '/values/blockchain_params/token/symbol';
        const request = { ref, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_GET_PROOF_HASH, request)
        .then(res => {
          expect(res.result.result).to.not.equal(null);
        })
      })
    })

    describe('json-rpc api: ain_getStateInfo', () => {
      it('returns correct value', () => {
        const ref = '/values/apps/test/test_state_info/some/path';
        const request = { ref, protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_GET_STATE_INFO, request)
        .then(res => {
          const stateInfo = res.result.result;
          // Erase some properties for stable comparison.
          stateInfo['#tree_bytes'] = 0;
          stateInfo['#state_ph'] = 'erased';
          stateInfo['#version'] = 'erased';
          assert.deepEqual(stateInfo, {
            "#num_children": 2,
            "#state_ph": "erased",
            "#tree_height": 2,
            "#tree_max_siblings": 2,
            "#tree_size": 5,
            "#tree_bytes": 0,
            "#version": "erased"
          });
        })
      })
    })

    describe('json-rpc api: ain_getStateUsage', () => {
      it('with existing app name', () => {
        const request = { app_name: 'test', protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_GET_STATE_USAGE, request)
        .then(res => {
          const stateUsage = res.result.result;
          assert.deepEqual(stateUsage, {
            "available": {
              "tree_bytes": 2474819644,
              "tree_height": 30,
              "tree_size": 15467622.775
            },
            "staking": {
              "app": 1,
              "total": 1,
              "unstakeable": 1
            },
            "usage": {
              "tree_bytes": 180356,
              "tree_height": 24,
              "tree_max_siblings": 1011,
              "tree_size": 1067
            }
          });
        })
      })

      it('with non-existing app name', () => {
        const request = { app_name: 'app_non_existing', protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request(JSON_RPC_METHODS.AIN_GET_STATE_USAGE, request)
        .then(res => {
          const stateUsage = res.result.result;
          assert.deepEqual(stateUsage, {
            "available": {
              "tree_bytes": 25000000,
              "tree_height": 30,
              "tree_size": 156250
            },
            "staking": {
              "app": 0,
              "total": 1,
              "unstakeable": 0
            },
            "usage": {
              "tree_bytes": 0,
              "tree_height": 0,
              "tree_max_siblings": 0,
              "tree_size": 0
            }
          });
        })
      })
    })

    describe('json-rpc api: ain_getProtocolVersion', () => {
      it('returns the correct version', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_PROTOCOL_VERSION, {})
        .then(res => {
          expect(res.result.protoVer).to.equal(BlockchainConsts.CURRENT_PROTOCOL_VERSION);
        })
      });
    });

    describe('json-rpc api: ain_checkProtocolVersion', () => {
      it('returns success code', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_CHECK_PROTOCOL_VERSION, { protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION })
        .then(res => {
          expect(res.result.result).to.equal(true);
          expect(res.result.code).to.equal(0);
        });
      });

      it('returns version not specified code', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_CHECK_PROTOCOL_VERSION, {})
        .then(res => {
          expect(res.result.result).to.equal(false);
          expect(res.result.code).to.equal(30101);
          expect(res.result.message).to.equal("Protocol version not specified.");
        });
      });

      it('returns invalid version code', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_CHECK_PROTOCOL_VERSION, { protoVer: 'a.b.c' })
        .then(res => {
          expect(res.result.result).to.equal(false);
          expect(res.result.code).to.equal(30102);
          expect(res.result.message).to.equal("Invalid protocol version.");
        });
      });

      it('returns incompatible version code for ill-formatted version', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_CHECK_PROTOCOL_VERSION, { protoVer: 0 })
        .then(res => {
          expect(res.result.result).to.equal(false);
          expect(res.result.code).to.equal(30103);
          expect(res.result.message).to.equal("Incompatible protocol version.");
        });
      });

      it('returns incompatible version code for low version', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_CHECK_PROTOCOL_VERSION, { protoVer: '0.0.1' })
        .then(res => {
          expect(res.result.result).to.equal(false);
          expect(res.result.code).to.equal(30103);
          expect(res.result.message).to.equal("Incompatible protocol version.");
        });
      });
    })

    describe('json-rpc api: ain_validateAppName', () => {
      it('returns true', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const request = { app_name: 'app_name_valid0', protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return client.request(JSON_RPC_METHODS.AIN_VALIDATE_APP_NAME, request)
        .then(res => {
          expect(res.result.is_valid).to.equal(true);
          expect(res.result.code).to.equal(0);
        })
      });

      it('returns false', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const request = { app_name: 'app/path', protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION };
        return client.request(JSON_RPC_METHODS.AIN_VALIDATE_APP_NAME, request)
        .then(res => {
          expect(res.result.is_valid).to.equal(false);
          expect(res.result.code).to.equal(30601);
          expect(res.result.message).to.equal('Invalid app name for state label: app/path');
        })
      });
    });

    describe('json-rpc api: ain_getAddress', () => {
      it('returns the correct node address', () => {
        const expAddr = '0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204';
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request(JSON_RPC_METHODS.AIN_GET_ADDRESS, {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then(res => {
          expect(res.result.result).to.equal(expAddr);
        });
      });
    });
  })

  describe('Set API', () => {
    beforeEach(async () => {
      await setUp();
    });

    afterEach(async () => {
      await cleanUp();
    });

    describe('set_value api', async () => {
      it('set_value', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, 100);

        const request = {
          ref: '/apps/test/test_value/some/path',
          value: "some value"
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_value', {json: request}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        expect(body.code).to.equal(0);

        // Confirm that the value is set properly.
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value");
      })

      it('set_value with timestamp', async () => {
        const request = {
          ref: '/apps/test/test_value/some/path',
          value: "some value with timestamp",
          timestamp: Date.now(),
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_value', {json: request}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(body.code).to.equal(0);
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);

        // Confirm that the value is set properly.
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value with timestamp");
      })

      it('set_value with unordered nonce (-1)', async () => {
        const request = {
          ref: '/apps/test/test_value/some/path',
          value: "some value with unordered nonce",
          nonce: -1,
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_value', {json: request}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(body.code).to.equal(0);
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);

        // Confirm that the value is set properly.
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value with unordered nonce");
      })

      it('set_value with numbered nonce', async () => {
        const nonce = parseOrLog(
            syncRequest('GET', server1 + '/get_nonce').body.toString('utf-8')).result;
        const request = {
          ref: '/apps/test/test_value/some/path',
          value: "some value with numbered nonce",
          nonce,
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_value', {json: request}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(body.code).to.equal(0);
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);

        // Confirm that the value is set properly.
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value with numbered nonce");
      })

      it('set_value with failing operation', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: '/apps/some/wrong/path', value: "some other value"};
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: request})
          .body.toString('utf-8'));
        body.result.result.message = 'erased';
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 12103,
          "message": "erased",
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "some": 1
              },
              "service": 0
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('inc_value api', () => {
      it('inc_value', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "/apps/test/test_value/some/path2", value: 10};
        const body = parseOrLog(syncRequest('POST', server1 + '/inc_value', {json: request})
          .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(body.code).to.equal(0);

        // Confirm that the value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, 10);
      })

      it('inc_value with a failing operation', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/some/wrong/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "/apps/some/wrong/path2", value: 10};
        const body = parseOrLog(syncRequest('POST', server1 + '/inc_value', {json: request})
          .body.toString('utf-8'));
        body.result.result.message = 'erased';
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 12103,
          "message": "erased",
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "some": 1
              },
              "service": 0
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/some/wrong/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('dec_value api', () => {
      it('dec_value', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/some/wrong/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "/apps/test/test_value/some/path3", value: 10};
        const body = parseOrLog(syncRequest('POST', server1 + '/dec_value', {json: request})
          .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(body.code).to.equal(0);

        // Confirm that the value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, -10);
      })

      it('dec_value with a failing operation', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/some/wrong/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "/apps/some/wrong/path3", value: 10};
        const body = parseOrLog(syncRequest('POST', server1 + '/dec_value', {json: request})
          .body.toString('utf-8'));
        body.result.result.message = 'erased';
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 12103,
          "message": "erased",
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "some": 1
              },
              "service": 0
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/some/wrong/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('set_function api', () => {
      it('set_function', async () => {
        // Check the original function.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=/apps/test/test_function/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, {
          ".function": {
            "fid": {
              "function_url": "https://events.ainetwork.ai/trigger",
              "function_id": "fid",
              "function_type": "REST",
            }
          }
        });

        const request = {
          ref: "/apps/test/test_function/some/path",
          value: {
            ".function": {
              "fid": {
                "function_url": "http://echo-bot.ainetwork.ai/trigger",  // Listener 2
                "function_id": "fid",
                "function_type": "REST",
              }
            }
          }
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_function', {json: request})
            .body.toString('utf-8'));
        expect(_.get(body, 'code')).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);

        // Confirm that the value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=/apps/test/test_function/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, {
          ".function": {
            "fid": {
              "function_url": "http://echo-bot.ainetwork.ai/trigger",  // Listener 2
              "function_id": "fid",
              "function_type": "REST",
            }
          }
        });
      })

      it('set_function with a failing operation', async () => {
        // Check the original function.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=/apps/some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          ref: "/apps/some/wrong/path",
          value: {
            ".function": {
              "fid": {
                "function_url": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
              }
            }
          }
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_function', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 12402,
          "message": "write_function permission evaluated false: [null] at '/apps' for function path '/apps/some/wrong/path' with permission 'write_function', auth '{\"addr\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}'",
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "some": 1
              },
              "service": 0
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Confirm that the original function is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=/apps/some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('set_rule api', () => {
      it('set_rule', async () => {
        // Check the original rule.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_rule?ref=/apps/test/test_rule/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, {
          ".rule": {
            "write": "auth.addr === 'abcd'"
          }
        });

        const request = {
          ref: "/apps/test/test_rule/some/path",
          value: {
            ".rule": {
              "write": "auth.addr === 'xyz'"
            }
          }
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(body.code).to.equal(0);

        // Confirm that the value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_rule?ref=/apps/test/test_rule/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, {
          ".rule": {
            "write": "auth.addr === 'xyz'"
          }
        });
      })

      it('set_rule with a failing operation', async () => {
        // Check the original rule.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_rule?ref=/apps/some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          ref: "/apps/some/wrong/path",
          value: {
            ".rule": {
              "write": "auth.addr === 'xyz'"
            }
          }
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 12302,
          "message": "write_rule permission evaluated false: [null] at '/apps' for rule path '/apps/some/wrong/path' with permission 'write_rule', auth '{\"addr\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}'",
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "some": 1
              },
              "service": 0
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Confirm that the original rule is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_rule?ref=/apps/some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('set_owner api', () => {
      it('set_owner', async () => {
        // Check the original owner.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=/apps/test/test_owner/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": true,
                "write_owner": true,
                "write_rule": false,
              }
            }
          }
        });

        const request = {
          ref: "/apps/test/test_owner/some/path",
          value: {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false,
                }
              }
            }
          }
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set_owner', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(body.code).to.equal(0);

        // Confirm that the value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=/apps/test/test_owner/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": false,
                "write_owner": true,
                "write_rule": false,
              }
            }
          }
        });
      })

      it('set_owner with a failing operation', async () => {
        // Check the original owner.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=/apps/some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          ref: "/apps/some/wrong/path",
          value: {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": true,
                  "write_owner": true,
                  "write_rule": true,
                  "write_function": true
                }
              }
            }
          }
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set_owner', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 12502,
          "message": "branch_owner permission evaluated false: [null] at '/apps' for owner path '/apps/some/wrong/path' with permission 'branch_owner', auth '{\"addr\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}'",
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "some": 1
              },
              "service": 0
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Confirm that the original owner is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=/apps/some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('set api', () => {
      it('set with successful operations', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some100/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          op_list: [
            {
              // Default type: SET_VALUE
              ref: "/apps/test/test_value/some100/path",
              value: "some other100 value",
            },
            {
              type: 'INC_VALUE',
              ref: "/apps/test/test_value/some100/path1",
              value: 10
            },
            {
              type: 'DEC_VALUE',
              ref: "/apps/test/test_value/some100/path2",
              value: 10
            },
            {
              type: 'SET_FUNCTION',
              ref: "/apps/test/test_function/other100/path",
              value: {
                ".function": {
                  "fid": {
                    "function_url": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid",
                    "function_type": "REST",
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: "/apps/test/test_rule/other100/path",
              value: {
                ".rule": {
                  "write": "auth.addr === 'xyz100'"
                }
              }
            },
            {
              type: 'SET_OWNER',
              ref: "/apps/test/test_owner/other100/path",
              value: {
                ".owner": {
                  "owners": {
                    "*": {
                      "branch_owner": true,
                      "write_owner": true,
                      "write_rule": true,
                      "write_function": true
                    }
                  }
                }
              }
            }
          ]
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "result_list": {
            "0": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "1": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "2": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "3": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "4": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "5": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
          },
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "test": 6
              },
              "service": 0
            },
            "state": {
              "app": {
                "test": 4388
              },
              "service": 0
            }
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(0);

        // Confirm that the original value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some100/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, 'some other100 value');
      })

      it('set with a failing operation', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some101/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          op_list: [
            {
              // Default type: SET_VALUE
              ref: "/apps/test/test_value/some101/path",
              value: "some other101 value",
            },
            {
              type: 'INC_VALUE',
              ref: "/apps/test/test_value/some101/path2",
              value: 10
            },
            {
              type: 'DEC_VALUE',
              ref: "/apps/test/test_value/some101/path3",
              value: 10
            },
            {
              type: 'SET_VALUE',
              ref: "/apps/some/wrong/path",
              value: "some other101 value",
            },
            {
              type: 'SET_FUNCTION',
              ref: "/apps/test/test_function/other101/path",
              value: {
                ".function": {
                  "fid": {
                    "function_url": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid",
                    "function_type": "REST",
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: "/apps/test/test_rule/other101/path",
              value: {
                ".rule": {
                  "write": "some other101 rule config"
                }
              }
            },
            {
              type: 'SET_OWNER',
              ref: "/apps/test/test_owner/other101/path",
              value: {
                ".owner": "some other101 owner config"
              }
            }
          ]
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set', {json: request})
            .body.toString('utf-8'));
        body.result.result.result_list[3].message = 'erased';
        assert.deepEqual(_.get(body, 'result.result'), {
          "result_list": {
            "0": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "1": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "2": {
              "code": 0,
              "bandwidth_gas_amount": 1
            },
            "3": {
              "code": 12103,
              "message": "erased",
              "bandwidth_gas_amount": 1
            }
          },
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "some": 1,
                "test": 3
              },
              "service": 0
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some101/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })

      it('set with op_list size bigger than set_op_list_size_limit', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some102/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = { op_list: [] };
        const setOpListSizeLimit = BlockchainParams.resource.set_op_list_size_limit;
        for (let i = 0; i < setOpListSizeLimit + 1; i++) { // 1 more than the limit
          request.op_list.push({
            type: 'INC_VALUE',
            ref: '/apps/test/test_value/some102/path',
            value: 1
          });
        }
        const body = parseOrLog(syncRequest('POST', server1 + '/set', {json: request})
            .body.toString('utf-8'));
        expect(body.result.result.code).to.equal(30005);
        expect(
            body.result.result.message
                .includes('The transaction exceeds the max op_list size limit')).to.equal(true);

        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Confirm that the values are not set.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some102/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('batch api', () => {
      it('batch with successful transactions', async () => {
        const address = parseOrLog(syncRequest(
            'GET', server1 + '/get_address').body.toString('utf-8')).result;
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some200/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);
        const resultBefore2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some201/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore2, null);

        const nonce = parseOrLog(syncRequest(
            'GET', server1 + `/get_nonce?address=${address}`).body.toString('utf-8')).result;
        const request = {
          tx_list: [
            {
              operation: {
                // Default type: SET_VALUE
                ref: "/apps/test/test_value/some200/path",
                value: "some other200 value",
              },
              timestamp: Date.now(),
              nonce: nonce
            },
            {
              operation: {
                type: 'INC_VALUE',
                ref: "/apps/test/test_value/some200/path2",
                value: 10
              },
              timestamp: Date.now(),
              nonce: nonce + 1
            },
            {
              operation: {
                type: 'DEC_VALUE',
                ref: "/apps/test/test_value/some200/path3",
                value: 10
              },
              timestamp: Date.now(),
              nonce: nonce + 2
            },
            {
              operation: {
                type: 'SET_FUNCTION',
                ref: "/apps/test/test_function/other200/path",
                value: {
                  ".function": {
                    "fid": {
                      "function_url": "https://events.ainetwork.ai/trigger",
                      "function_id": "fid",
                      "function_type": "REST",
                    }
                  }
                }
              },
              timestamp: Date.now(),
              nonce: nonce + 3
            },
            {
              operation: {
                type: 'SET_RULE',
                ref: "/apps/test/test_rule/other200/path",
                value: {
                  ".rule": {
                    "write": "auth.addr === 'xyz200'"
                  }
                }
              },
              timestamp: Date.now(),
              nonce: nonce + 4
            },
            {
              operation: {
                type: 'SET_OWNER',
                ref: "/apps/test/test_owner/other200/path",
                value: {
                  ".owner": {
                    "owners": {
                      "*": {
                        "branch_owner": true,
                        "write_owner": true,
                        "write_rule": true,
                        "write_function": true
                      }
                    }
                  }
                }
              },
              timestamp: Date.now(),
              nonce: nonce + 5
            },
            {
              operation: {
                type: 'SET',
                op_list: [
                  {
                    type: "SET_VALUE",
                    ref: "/apps/test/test_value/some201/path",
                    value: "some other201 value",
                  },
                  {
                    type: 'INC_VALUE',
                    ref: "/apps/test/test_value/some201/path2",
                    value: 5
                  },
                  {
                    type: 'DEC_VALUE',
                    ref: "/apps/test/test_value/some201/path3",
                    value: 5
                  },
                  {
                    type: 'SET_FUNCTION',
                    ref: "/apps/test/test_function/other201/path",
                    value: {
                      ".function": {
                        "fid": {
                          "function_url": "https://events.ainetwork.ai/trigger",
                          "function_id": "fid",
                          "function_type": "REST",
                        }
                      }
                    }
                  },
                  {
                    type: 'SET_RULE',
                    ref: "/apps/test/test_rule/other201/path",
                    value: {
                      ".rule": {
                        "write": "auth.addr === 'xyz201'"
                      }
                    }
                  },
                  {
                    type: 'SET_OWNER',
                    ref: "/apps/test/test_owner/other201/path",
                    value: {
                      ".owner": {
                        "owners": {
                          "*": {
                            "branch_owner": true,
                            "write_owner": true,
                            "write_rule": true,
                            "write_function": true
                          }
                        }
                      }
                    }
                  }
                ]
              },
              timestamp: Date.now(),
              nonce: nonce + 6
            }
          ]
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/batch', {json: request})
            .body.toString('utf-8'));
        expect(body).to.not.equal(null);
        expect(CommonUtil.isArray(body.result)).to.equal(true);
        for (let i = 0; i < body.result.length; i++) {
          const result = body.result[i];
          if (!(await waitUntilTxFinalized(serverList, result.tx_hash))) {
            console.error(`Failed to check finalization of tx.`);
          }
          result.tx_hash = 'erased';
        }
        assert.deepEqual(body.result, [
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 380
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 178
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 178
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 1324
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 728
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 1600
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "result_list": {
                "0": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "1": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "2": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "3": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "4": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "5": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              },
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 6
                  }
                },
                "state": {
                  "app": {
                    "test": 4388
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          }
        ]);
        expect(body.code).to.equal(0);

        // Confirm that the value is set properly.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some200/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, 'some other200 value');
        const resultAfter2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some201/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter2, 'some other201 value');
      });

      it('batch with a failing transaction', async () => {
        const address = parseOrLog(syncRequest(
            'GET', server1 + '/get_address').body.toString('utf-8')).result;
        // Check the original values.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some202/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);
        const resultBefore2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some203/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore2, null);
        const nonce = parseOrLog(syncRequest(
            'GET', server1 + `/get_nonce?address=${address}`).body.toString('utf-8')).result;

        const request = {
          tx_list: [
            {
              operation: {
                // Default type: SET_VALUE
                ref: "/apps/test/test_value/some202/path",
                value: "some other202 value",
              },
              timestamp: Date.now(),
              nonce: -1
            },
            {
              operation: {
                type: 'INC_VALUE',
                ref: "/apps/test/test_value/some202/path2",
                value: 10
              },
              timestamp: Date.now(),
              nonce: -1
            },
            {
              operation: {
                type: 'DEC_VALUE',
                ref: "/apps/test/test_value/some202/path3",
                value: 10
              },
              timestamp: Date.now(),
              nonce: -1
            },
            {
              operation: {
                type: 'SET_VALUE',
                ref: "/apps/some/wrong/path",
                value: "some other202 value",
              },
              timestamp: Date.now(),
              nonce: -1
            },
            {
              operation: {
                type: 'SET_FUNCTION',
                ref: "/apps/test/test_function/other202/path",
                value: {
                  ".function": {
                    "fid": {
                      "function_url": "https://events.ainetwork.ai/trigger",
                      "function_id": "fid",
                      "function_type": "REST",
                    }
                  }
                }
              },
              timestamp: Date.now(),
              nonce: -1
            },
            {
              operation: {
                type: 'SET_RULE',
                ref: "/apps/test/test_rule/other202/path",
                value: {
                  ".rule": {
                    "write": "auth.addr === 'xyz202'"
                  }
                }
              },
              timestamp: Date.now(),
              nonce: -1
            },
            {
              operation: {
                type: 'SET_OWNER',
                ref: "/apps/test/test_owner/other202/path",
                value: {
                  ".owner": {
                    "owners": {
                      "*": {
                        "branch_owner": true,
                        "write_owner": true,
                        "write_rule": true,
                        "write_function": true
                      }
                    }
                  }
                }
              },
              timestamp: Date.now(),
              nonce: -1
            },
            {
              operation: {
                type: 'SET',
                op_list: [
                  {
                    type: "SET_VALUE",
                    ref: "/apps/test/test_value/some203/path",
                    value: "some other203 value",
                  },
                  {
                    type: 'INC_VALUE',
                    ref: "/apps/test/test_value/some203/path2",
                    value: 5
                  },
                  {
                    type: 'DEC_VALUE',
                    ref: "/apps/test/test_value/some203/path3",
                    value: 5
                  },
                  {
                    type: 'SET_FUNCTION',
                    ref: "/apps/test/test_function/other203/path",
                    value: {
                      ".function": {
                        "fid": {
                          "function_url": "https://events.ainetwork.ai/trigger",
                          "function_id": "fid",
                          "function_type": "REST",
                        }
                      }
                    }
                  },
                  {
                    type: 'SET_RULE',
                    ref: "/apps/test/test_rule/other203/path",
                    value: {
                      ".rule": {
                        "write": "auth.addr === 'xyz203'"
                      }
                    }
                  },
                  {
                    type: 'SET_OWNER',
                    ref: "/apps/test/test_owner/other203/path",
                    value: {
                      ".owner": {
                        "owners": {
                          "*": {
                            "branch_owner": true,
                            "write_owner": true,
                            "write_rule": true,
                            "write_function": true
                          }
                        }
                      }
                    }
                  }
                ]
              },
              timestamp: Date.now(),
              nonce: -1
            }
          ]
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/batch', {json: request})
            .body.toString('utf-8'));
        expect(body).to.not.equal(null);
        expect(CommonUtil.isArray(body.result)).to.equal(true);
        for (let i = 0; i < body.result.length; i++) {
          const result = body.result[i];
          if (!(await waitUntilTxFinalized(serverList, result.tx_hash))) {
            console.error(`Failed to check finalization of tx.`);
          }
          result.tx_hash = 'erased';
          if (result.result.code > 0) {
            result.result.message = 'erased';
          }
        }
        assert.deepEqual(body.result, [
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 380
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 178
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 178
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "message": "erased",
              "code": 12103,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "app": {
                    "some": 1
                  },
                  "service": 0,
                },
                "state": {
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 1324
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 728
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "code": 0,
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 1
                  }
                },
                "state": {
                  "app": {
                    "test": 1600
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          },
          {
            "tx_hash": "erased",
            "result": {
              "result_list": {
                "0": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "1": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "2": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "3": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "4": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                },
                "5": {
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              },
              "gas_amount_charged": 0,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 0,
                  "app": {
                    "test": 6
                  }
                },
                "state": {
                  "app": {
                    "test": 4388
                  },
                  "service": 0
                }
              },
              "gas_cost_total": 0
            }
          }
        ]);
        expect(body.code).to.equal(0);

        // Confirm that the value is set properly.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some202/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, 'some other202 value');
        const resultAfter2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some203/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter2, 'some other203 value');
      })
    })

    describe('json-rpc api: ain_sendSignedTransactionDryrun', () => {
      const account = {
        address: "0x9534bC7529961E5737a3Dd317BdEeD41AC08a52D",
        private_key: "e96292ef0676287908fc3461f747f106b7b9336f183b1766f83672fbe893664d",
        public_key: "1e8de35ac153fa52cb61a7e887463c205b0121be659803e9f69dddcae8dfb5a3d4c96570c5c3fafa5755b89a90eb58a2041f8da9d909b9c4b6813c3832d1254a"
      };

      // for account registration gas amount (single set)
      const account2 = {
        address: "0x85a620A5A46d01cc1fCF49E73ab00710d4da943E",
        private_key: "b542fc2ca4a68081b3ba238888d3a8783354c3aa81711340fd69f6ff32798525",
        public_key: "eb8c8577e8be18a83829c5c8a2ec2a754ef0a190e5a01139e9a24aae8f56842dfaf708da56d0f395bbfef08633237398dec96343f62ce217130d9738a76adfdf"
      };
      // for account registration gas amount (multi set)
      const account3 = {
        address: "0x758fd59D3f8157Ae4458f8E29E2A8317be3d5974",
        private_key: "63200d28b05377f983103b1ac45a379b3d424c415f8a705c7cdd6365f7e828ea",
        public_key: "0760186e6d1a37107217d68e491b4a4bd89e3b6642acfcf4b320acef24d5d0de1d33bcabd2e868776879c4776937a6785e71ee963efb40c4cf09283b542006ca"
      };
      // for account registration gas amount (transfer)
      const account4 = {
        address: "0x652a5e81Dc2B62be4b7225584A1079C29334dE27",
        private_key: "98a0cc69436b5fc635184bbe16ffa97284e099e8e84c0b7ecee61b1f92db29e5",
        public_key: "b6c5920098836b4ee3dd9458c706470f539e81d7370534228ffe155fff4b9af8ccdb7f6ad1eeba135c30fe4a6175ecf0d8be4bd6813a8358bc19901df47f558a"
      };
      // for account registration gas amount (transfer)
      const account09 = { // genesis account 09
        address: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1",
        private_key: "ee0b1315d446e5318eb6eb4e9d071cd12ef42d2956d546f9acbdc3b75c469640",
        public_key: "e0a9c4697a41d7ecbd7660f43c59b0df8a3e9fa31ec87687b5b4592e1ab1f66e3b2503a966ca702051f4c8e1c37c9d88cd46242750e7fc9f65dfb14980101806"
      };

      before(async () => {
        const currentRule = parseOrLog(syncRequest('GET', server1 + '/get_rule?ref=/apps/test')
          .body.toString('utf-8')).result[".rule"]["write"];
        const newOwners = parseOrLog(syncRequest('GET', server1 + '/get_owner?ref=/apps/test')
          .body.toString('utf-8')).result[".owner"];
        const newRule = `${currentRule} || auth.addr === '${account.address}' || auth.addr === '${account2.address}' || auth.addr === '${account4.address}'`;
        newOwners["owners"][account.address] = {
          "branch_owner": true,
          "write_owner": true,
          "write_rule": true,
          "write_function": true
        };
        const res = parseOrLog(syncRequest('POST', server1 + '/set', {json: {
            op_list: [
              // clean up old owner configs.
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other100/path',
                value: null,
              },
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other200/path',
                value: null,
              },
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other201/path',
                value: null,
              },
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other202/path',
                value: null,
              },
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other203/path',
                value: null,
              },
              {
                type: 'SET_RULE',
                ref: '/apps/test',
                value: {
                  ".rule": {
                    "write": newRule
                  }
                }
              },
              // set new owner config.
              {
                type: 'SET_OWNER',
                ref: '/apps/test',
                value: {
                  ".owner": newOwners
                }
              }
            ],
            timestamp: Date.now(),
            nonce: -1
          }})
          .body.toString('utf-8')).result;
        assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
        if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('accepts a transaction with unordered nonce (-1)', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 1'
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_DRYRUN, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                code: 0,
                bandwidth_gas_amount: 1,
                gas_amount_charged: 0,
                gas_amount_total: {
                  bandwidth: {
                    app: {
                      test: 1
                    },
                    service: 0
                  },
                  state: {
                    app: {
                      test: 28
                    },
                    service: 0
                  }
                },
                gas_cost_total: 0
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      });

      it('accepts a transaction with unordered nonce (-1) and non-zero gas_price', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 1 longer'
          },
          gas_price: 500,  // non-zero gas price
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_DRYRUN, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                code: 0,
                bandwidth_gas_amount: 1,
                gas_amount_charged: 0,
                gas_amount_total: {
                  bandwidth: {
                    app: {
                      test: 1
                    },
                    service: 0
                  },
                  state: {
                    app: {
                      test: 42
                    },
                    service: 0
                  }
                },
                gas_cost_total: 0
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      });

      it('accepts a transaction with numbered nonce', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              ref: `/apps/test/test_value/some/path`,
              value: 'some other value 2'
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_DRYRUN, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  code: 0,
                  bandwidth_gas_amount: 2001,
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 2001
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 28
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction with numbered nonce and non-zero gas price', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              ref: `/apps/test/test_value/some/path`,
              value: 'some other value 2 longer'
            },
            gas_price: 500,  // non-zero gas price
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_DRYRUN, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  code: 0,
                  bandwidth_gas_amount: 2001,
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 2001
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 42
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction with account registration gas amount from nonce', () => {
        // NOTE: account2 does not have balance nor nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account2.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              ref: `/apps/test/test_value/some/path`,
              value: 'some other value 4'
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account2.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_DRYRUN, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  code: 0,
                  bandwidth_gas_amount: 2001,
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 2001
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 28
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction with account registration gas amount from nonce and non-zero gas price', () => {
        // NOTE: account2 does not have balance nor nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account2.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              ref: `/apps/test/test_value/some/path`,
              value: 'some other value 4 longer'
            },
            gas_price: 500,  // non-zero gas price
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account2.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_DRYRUN, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  code: 0,
                  bandwidth_gas_amount: 2001,
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 2001
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 42
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction with account registration gas amount from balance', () => {
        // NOTE: account3 does not have balance nor nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/transfer/${account09.address}/${account3.address}/${Date.now()}/value`,
            value: 10
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1,  // unordered nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account09.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_DRYRUN, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                "bandwidth_gas_amount": 1,
                "code": 0,
                "func_results": {
                  "_transfer": {
                    "bandwidth_gas_amount": 2000,
                    "code": 0,
                    "op_results": {
                      "0": {
                        "path": "/accounts/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      },
                      "1": {
                        "path": "/accounts/0x758fd59D3f8157Ae4458f8E29E2A8317be3d5974/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      }
                    }
                  }
                },
                "gas_amount_charged": 3281,
                "gas_amount_total": {
                  "bandwidth": {
                    "service": 2003
                  },
                  "state": {
                    "service": 1278
                  }
                },
                "gas_cost_total": 0
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      })

      it('accepts a transaction with account registration gas amount from balance and non-zero gas price', () => {
        // NOTE: account3 does not have balance nor nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/transfer/${account09.address}/${account3.address}/${Date.now()}/value`,
            value: 10
          },
          gas_price: 500, // non-zero gas price
          timestamp: Date.now(),
          nonce: -1,  // unordered nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account09.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_DRYRUN, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                "bandwidth_gas_amount": 1,
                "code": 0,
                "func_results": {
                  "_transfer": {
                    "bandwidth_gas_amount": 2000,
                    "code": 0,
                    "op_results": {
                      "0": {
                        "path": "/accounts/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      },
                      "1": {
                        "path": "/accounts/0x758fd59D3f8157Ae4458f8E29E2A8317be3d5974/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      }
                    }
                  }
                },
                "gas_amount_charged": 3281,
                "gas_amount_total": {
                  "bandwidth": {
                    "service": 2003
                  },
                  "state": {
                    "service": 1278
                  }
                },
                "gas_cost_total": 1.6405
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      })

      it('rejects a transaction with an invalid signature.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 3'
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_DRYRUN, {
          tx_body: txBody,
          signature: signature + '0', // invalid signature
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30304,
            message: 'Invalid transaction signature.',
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          });
        })
      });
    });

    describe('json-rpc api: ain_sendSignedTransaction', () => {
      const account = {
        address: "0x9534bC7529961E5737a3Dd317BdEeD41AC08a52D",
        private_key: "e96292ef0676287908fc3461f747f106b7b9336f183b1766f83672fbe893664d",
        public_key: "1e8de35ac153fa52cb61a7e887463c205b0121be659803e9f69dddcae8dfb5a3d4c96570c5c3fafa5755b89a90eb58a2041f8da9d909b9c4b6813c3832d1254a"
      };

      // for account registration gas amount (single set)
      const account2 = {
        address: "0x85a620A5A46d01cc1fCF49E73ab00710d4da943E",
        private_key: "b542fc2ca4a68081b3ba238888d3a8783354c3aa81711340fd69f6ff32798525",
        public_key: "eb8c8577e8be18a83829c5c8a2ec2a754ef0a190e5a01139e9a24aae8f56842dfaf708da56d0f395bbfef08633237398dec96343f62ce217130d9738a76adfdf"
      };
      // for account registration gas amount (multi set)
      const account3 = {
        address: "0x758fd59D3f8157Ae4458f8E29E2A8317be3d5974",
        private_key: "63200d28b05377f983103b1ac45a379b3d424c415f8a705c7cdd6365f7e828ea",
        public_key: "0760186e6d1a37107217d68e491b4a4bd89e3b6642acfcf4b320acef24d5d0de1d33bcabd2e868776879c4776937a6785e71ee963efb40c4cf09283b542006ca"
      };
      // for account registration gas amount (transfer)
      const account4 = {
        address: "0x652a5e81Dc2B62be4b7225584A1079C29334dE27",
        private_key: "98a0cc69436b5fc635184bbe16ffa97284e099e8e84c0b7ecee61b1f92db29e5",
        public_key: "b6c5920098836b4ee3dd9458c706470f539e81d7370534228ffe155fff4b9af8ccdb7f6ad1eeba135c30fe4a6175ecf0d8be4bd6813a8358bc19901df47f558a"
      };
      // for account registration gas amount (transfer)
      const account09 = { // genesis account 09
        address: "0x09A0d53FDf1c36A131938eb379b98910e55EEfe1",
        private_key: "ee0b1315d446e5318eb6eb4e9d071cd12ef42d2956d546f9acbdc3b75c469640",
        public_key: "e0a9c4697a41d7ecbd7660f43c59b0df8a3e9fa31ec87687b5b4592e1ab1f66e3b2503a966ca702051f4c8e1c37c9d88cd46242750e7fc9f65dfb14980101806"
      };

      before(async () => {
        const currentRule = parseOrLog(syncRequest('GET', server1 + '/get_rule?ref=/apps/test')
          .body.toString('utf-8')).result[".rule"]["write"];
        const newOwners = parseOrLog(syncRequest('GET', server1 + '/get_owner?ref=/apps/test')
          .body.toString('utf-8')).result[".owner"];
        const newRule = `${currentRule} || auth.addr === '${account.address}' || auth.addr === '${account2.address}' || auth.addr === '${account4.address}'`;
        newOwners["owners"][account.address] = {
          "branch_owner": true,
          "write_owner": true,
          "write_rule": true,
          "write_function": true
        };
        const res = parseOrLog(syncRequest('POST', server1 + '/set', {json: {
            op_list: [
              // clean up old owner configs.
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other100/path',
                value: null,
              },
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other200/path',
                value: null,
              },
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other201/path',
                value: null,
              },
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other202/path',
                value: null,
              },
              {
                type: 'SET_OWNER',
                ref: '/apps/test/test_owner/other203/path',
                value: null,
              },
              {
                type: 'SET_RULE',
                ref: '/apps/test',
                value: {
                  ".rule": {
                    "write": newRule
                  }
                }
              },
              // set new owner config.
              {
                type: 'SET_OWNER',
                ref: '/apps/test',
                value: {
                  ".owner": newOwners
                }
              }
            ],
            timestamp: Date.now(),
            nonce: -1
          }})
          .body.toString('utf-8')).result;
        assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
        if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      })

      it('accepts a transaction with unordered nonce (-1)', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 1'
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                code: 0,
                bandwidth_gas_amount: 1,
                gas_amount_charged: 0,
                gas_amount_total: {
                  bandwidth: {
                    app: {
                      test: 1
                    },
                    service: 0
                  },
                  state: {
                    app: {
                      test: 28
                    },
                    service: 0
                  }
                },
                gas_cost_total: 0
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        })
      })

      it('accepts a transaction with unordered nonce (-1) and non-zero gas_price', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 1 longer'
          },
          gas_price: 500,  // non-zero gas price
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                code: 0,
                bandwidth_gas_amount: 1,
                gas_amount_charged: 0,
                gas_amount_total: {
                  bandwidth: {
                    app: {
                      test: 1
                    },
                    service: 0
                  },
                  state: {
                    app: {
                      test: 42
                    },
                    service: 0
                  }
                },
                gas_cost_total: 0
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        })
      })

      it('accepts a transaction with numbered nonce', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              ref: `/apps/test/test_value/some/path`,
              value: 'some other value 2'
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  code: 0,
                  bandwidth_gas_amount: 2001,
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 2001
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 28
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction with numbered nonce and non-zero gas price', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              ref: `/apps/test/test_value/some/path`,
              value: 'some other value 2 longer'
            },
            gas_price: 500,  // non-zero gas price
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  code: 0,
                  bandwidth_gas_amount: 1,
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 1
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 42
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction with account registration gas amount from nonce', () => {
        // NOTE: account2 does not have balance nor nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account2.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              ref: `/apps/test/test_value/some/path`,
              value: 'some other value 3'
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account2.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  code: 0,
                  bandwidth_gas_amount: 2001,
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 2001
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 28
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction without account registration gas amount from nonce', () => {
        // NOTE: account2 already has nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account2.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              ref: `/apps/test/test_value/some/path`,
              value: 'some other value 4'
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account2.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  code: 0,
                  bandwidth_gas_amount: 1,
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 1
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 28
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction without account registration gas amount from nonce and non-zero gas price', () => {
        // NOTE: account2 already has nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account2.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              ref: `/apps/test/test_value/some/path`,
              value: 'some other value 4 longer'
            },
            gas_price: 500,  // non-zero gas price
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account2.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  code: 0,
                  bandwidth_gas_amount: 1,
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 1
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 42
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction without account registration gas amount from balance', () => {
        // NOTE: account2 does not have balance but already has nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/transfer/${account09.address}/${account2.address}/${Date.now()}/value`,
            value: 10
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1,  // unordered nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account09.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                "bandwidth_gas_amount": 1,
                "code": 0,
                "func_results": {
                  "_transfer": {
                    "bandwidth_gas_amount": 0,
                    "code": 0,
                    "op_results": {
                      "0": {
                        "path": "/accounts/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      },
                      "1": {
                        "path": "/accounts/0x85a620A5A46d01cc1fCF49E73ab00710d4da943E/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      }
                    }
                  }
                },
                "gas_amount_charged": 1037,
                "gas_amount_total": {
                  "bandwidth": {
                    "service": 3
                  },
                  "state": {
                    "service": 1034
                  }
                },
                "gas_cost_total": 0
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      })

      it('accepts a transaction with account registration gas amount from balance', () => {
        // NOTE: account3 does not have balance nor nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/transfer/${account09.address}/${account3.address}/${Date.now()}/value`,
            value: 10
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1,  // unordered nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account09.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                "bandwidth_gas_amount": 1,
                "code": 0,
                "func_results": {
                  "_transfer": {
                    "bandwidth_gas_amount": 2000,
                    "code": 0,
                    "op_results": {
                      "0": {
                        "path": "/accounts/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      },
                      "1": {
                        "path": "/accounts/0x758fd59D3f8157Ae4458f8E29E2A8317be3d5974/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      }
                    }
                  }
                },
                "gas_amount_charged": 3037,
                "gas_amount_total": {
                  "bandwidth": {
                    "service": 2003
                  },
                  "state": {
                    "service": 1034
                  }
                },
                "gas_cost_total": 0
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      })

      it('accepts a transaction without account registration gas amount from balance', () => {
        // NOTE: account3 already has balance.
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/transfer/${account09.address}/${account3.address}/${Date.now()}/value`,
            value: 10
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1,  // unordered nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account09.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                "bandwidth_gas_amount": 1,
                "code": 0,
                "func_results": {
                  "_transfer": {
                    "bandwidth_gas_amount": 0,
                    "code": 0,
                    "op_results": {
                      "0": {
                        "path": "/accounts/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      },
                      "1": {
                        "path": "/accounts/0x758fd59D3f8157Ae4458f8E29E2A8317be3d5974/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      }
                    }
                  }
                },
                "gas_amount_charged": 367,
                "gas_amount_total": {
                  "bandwidth": {
                    "service": 3
                  },
                  "state": {
                    "service": 364
                  }
                },
                "gas_cost_total": 0
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      })

      it('accepts a transaction without account registration gas amount from balance and non-zero gas price', () => {
        // NOTE: account3 already has balance.
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/transfer/${account09.address}/${account3.address}/${Date.now()}/value`,
            value: 10
          },
          gas_price: 500, // non-zero gas price
          timestamp: Date.now(),
          nonce: -1,  // unordered nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account09.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                "bandwidth_gas_amount": 1,
                "code": 0,
                "func_results": {
                  "_transfer": {
                    "bandwidth_gas_amount": 0,
                    "code": 0,
                    "op_results": {
                      "0": {
                        "path": "/accounts/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      },
                      "1": {
                        "path": "/accounts/0x758fd59D3f8157Ae4458f8E29E2A8317be3d5974/balance",
                        "result": {
                          "bandwidth_gas_amount": 1,
                          "code": 0
                        }
                      }
                    }
                  }
                },
                "gas_amount_charged": 367,
                "gas_amount_total": {
                  "bandwidth": {
                    "service": 3
                  },
                  "state": {
                    "service": 364
                  }
                },
                "gas_cost_total": 0.1835
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      })

      it('accepts a multi-set transaction with account registration gas amount from nonce', () => {
        // NOTE: account4 does not have balance nor nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account4.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET',
              op_list: [
                {
                  type: 'SET_VALUE',
                  ref: `/apps/test/test_value/some/path`,
                  value: 'some other value 5'
                },
                {
                  // Default type: SET_VALUE
                  ref: `/apps/test/test_value/some/path`,
                  value: 'some other value 6'
                },
              ],
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account4.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 2002
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 28
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                  result_list: {
                    0: {
                      bandwidth_gas_amount: 2001,
                      code: 0
                    },
                    1: {
                      bandwidth_gas_amount: 1,
                      code: 0
                    }
                  }
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a multi-set transaction without account registration gas amount from nonce', () => {
        // NOTE: account4 already has nonce/timestamp.
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request(JSON_RPC_METHODS.AIN_GET_NONCE, {
          address: account4.address,
          from: 'pending',
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET',
              op_list: [
                {
                  type: 'SET_VALUE',
                  ref: `/apps/test/test_value/some/path`,
                  value: 'some other value 7'
                },
                {
                  // Default type: SET_VALUE
                  ref: `/apps/test/test_value/some/path`,
                  value: 'some other value 8'
                },
              ],
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account4.private_key, 'hex'));
          return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
            tx_body: txBody,
            signature,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
              result: {
                result: {
                  gas_amount_charged: 0,
                  gas_amount_total: {
                    bandwidth: {
                      app: {
                        test: 2
                      },
                      service: 0
                    },
                    state: {
                      app: {
                        test: 28
                      },
                      service: 0
                    }
                  },
                  gas_cost_total: 0,
                  result_list: {
                    0: {
                      bandwidth_gas_amount: 1,
                      code: 0
                    },
                    1: {
                      bandwidth_gas_amount: 1,
                      code: 0
                    }
                  }
                },
                tx_hash: CommonUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('accepts a transaction with app creation gas amount', () => {
        // NOTE: App doesn't exist yet.
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/manage_app/test_app_creation_gas_amount_app0/create/1`,
            value: {
              admin: { [account.address]: true },
            }
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1,
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                bandwidth_gas_amount: 1,
                code: 0,
                func_results: {
                  _createApp: {
                    bandwidth_gas_amount: 2000,
                    code: 0,
                    op_results: {
                      0: {
                        path: "/apps/test_app_creation_gas_amount_app0",
                        result: {
                          bandwidth_gas_amount: 1,
                          code: 0
                        }
                      },
                      1: {
                        path: "/apps/test_app_creation_gas_amount_app0",
                        result: {
                          bandwidth_gas_amount: 1,
                          code: 0
                        }
                      },
                      2: {
                        path: "/manage_app/test_app_creation_gas_amount_app0/config/admin",
                        result: {
                          bandwidth_gas_amount: 1,
                          code: 0
                        }
                      }
                    }
                  }
                },
                gas_amount_charged: 3570,
                gas_amount_total: {
                  bandwidth: {
                    app: {
                      test_app_creation_gas_amount_app0: 2
                    },
                    service: 2002
                  },
                  state: {
                    service: 1568
                  }
                },
                gas_cost_total: 0
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      })

      it('rejects a transaction without app creation gas amount', () => {
        // NOTE: App ready exists.
        const client = jayson.client.http(server1 + '/json-rpc');
        const timestamp = Date.now();
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/manage_app/test_app_creation_gas_amount_app0/create/2`,
            value: {
              admin: { [account.address]: true },
            }
          },
          gas_price: 0,
          timestamp,
          nonce: -1,
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        })
        .then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            result: {
              result: {
                bandwidth_gas_amount: 1,
                code: 12103,
                gas_amount_charged: 1,
                gas_amount_total: {
                  bandwidth: {
                    service: 1
                  },
                  state: {
                    service: 0
                  }
                },
                gas_cost_total: 0,
                message: `Write rule evaluated false: [data === null && getValue('/manage_app/' + $app_name + '/config') === null && util.isDict(newData) && util.checkValuePathLen(parsedValuePath, 4) === true] at '/manage_app/$app_name/create/$record_id' for value path '/manage_app/test_app_creation_gas_amount_app0/create/2' with path vars '{\"$record_id\":\"2\",\"$app_name\":\"test_app_creation_gas_amount_app0\"}', data 'null', newData '{\"admin\":{\"0x9534bC7529961E5737a3Dd317BdEeD41AC08a52D\":true}}', auth '{\"addr\":\"0x9534bC7529961E5737a3Dd317BdEeD41AC08a52D\"}', timestamp '${timestamp}'`
              },
              tx_hash: CommonUtil.hashSignature(signature),
            }
          });
        });
      })

      it('rejects a transaction that exceeds the op_list size limit.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const setOpListSizeLimit = BlockchainParams.resource.set_op_list_size_limit;
        const opList = [];
        for (let i = 0; i < setOpListSizeLimit + 1; i++) { // 1 more than the limit
          opList.push({
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 9'
          });
        }
        const txBody = {
          operation: {
            type: 'SET',
            op_list: opList,
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          res.result.result.tx_hash = 'erased';
          assert.deepEqual(res.result, {
            "protoVer": BlockchainConsts.CURRENT_PROTOCOL_VERSION,
            "result": {
              "result": {
                "code": 30005,
                "gas_amount_charged": 0,
                "gas_amount_total": {
                  "bandwidth": {
                    "service": 0
                  },
                  "state": {
                    "service": 0
                  }
                },
                "gas_cost_total": 0,
                "message": "The transaction exceeds the max op_list size limit: 51 > 50",
                "result_list": null,
              },
              "tx_hash": "erased"
            }
          });
        })
      })

      it('rejects a transaction that exceeds its size limit.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const longText = 'a'.repeat(BlockchainParams.resource.tx_bytes_limit / 2);
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_long_text`,
            value: longText
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30301,
            message: `Transaction size exceeds its limit: ${BlockchainParams.resource.tx_bytes_limit} bytes.`,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          });
        })
      })

      it('rejects a transaction of missing properties.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 10'
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          transaction: txBody,  // wrong field name
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30302,
            message: 'Missing properties.',
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          });
        })
      })

      it('rejects a transaction in an invalid format.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 11'
          },
          gas_price: 0,
          timestamp: Date.now(),
          // missing nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30303,
            message: 'Invalid transaction format.',
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          });
        })
      })

      it('rejects a transaction with an invalid signature.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 12'
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature: signature + '0', // invalid signature
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30304,
            message: 'Invalid transaction signature.',
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          });
        })
      })
    })

    describe('json-rpc api: ain_sendSignedTransactionBatch', () => {
      const account = {
        address: "0x85a620A5A46d01cc1fCF49E73ab00710d4da943E",
        private_key: "b542fc2ca4a68081b3ba238888d3a8783354c3aa81711340fd69f6ff32798525",
        public_key: "eb8c8577e8be18a83829c5c8a2ec2a754ef0a190e5a01139e9a24aae8f56842dfaf708da56d0f395bbfef08633237398dec96343f62ce217130d9738a76adfdf"
      };

      let txBodyBefore;
      let txBodyAfter;
      let signatureBefore;
      let signatureAfter;

      before(() => {
        txBodyBefore = {
          operation: {
            // Default type: SET_VALUE
            ref: "/apps/test/test_value/some400/path",
            value: "some other300 value",
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        signatureBefore =
            ainUtil.ecSignTransaction(txBodyBefore, Buffer.from(account.private_key, 'hex'));

        txBodyAfter = {
          operation: {
            type: 'INC_VALUE',
            ref: "/apps/test/test_value/some400/path2",
            value: 10
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        signatureAfter =
            ainUtil.ecSignTransaction(txBodyAfter, Buffer.from(account.private_key, 'hex'));
      });

      it('accepts a batch transaction', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBodyList = [
          {
            operation: {
              // Default type: SET_VALUE
              ref: "/apps/test/test_value/some300/path",
              value: "some other300 value",
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'INC_VALUE',
              ref: "/apps/test/test_value/some300/path2",
              value: 10
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'DEC_VALUE',
              ref: "/apps/test/test_value/some300/path3",
              value: 10
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'SET_FUNCTION',
              ref: "/apps/test/test_function/other300/path",
              value: {
                ".function": {
                  "fid": {
                    "function_url": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid",
                    "function_type": "REST",
                  }
                }
              }
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'SET_RULE',
              ref: "/apps/test/test_rule/other300/path",
              value: {
                ".rule": {
                  "write": "some other300 rule config"
                }
              }
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'SET_OWNER',
              ref: "/apps/test/test_owner/other300/path",
              value: {
                ".owner": {
                  "owners": {
                    "*": {
                      "branch_owner": true,
                      "write_owner": true,
                      "write_rule": true,
                      "write_function": true
                    }
                  }
                }
              }
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'SET',
              op_list: [
                {
                  type: "SET_VALUE",
                  ref: "/apps/test/test_value/some301/path",
                  value: "some other301 value",
                },
                {
                  type: 'INC_VALUE',
                  ref: "/apps/test/test_value/some301/path2",
                  value: 5
                },
                {
                  type: 'DEC_VALUE',
                  ref: "/apps/test/test_value/some301/path3",
                  value: 5
                },
                {
                  type: 'SET_FUNCTION',
                  ref: "/apps/test/test_function/other301/path",
                  value: {
                    ".function": {
                      "fid": {
                        "function_url": "https://events.ainetwork.ai/trigger",
                        "function_id": "fid",
                        "function_type": "REST",
                      }
                    }
                  }
                },
                {
                  type: 'SET_RULE',
                  ref: "/apps/test/test_rule/other301/path",
                  value: {
                    ".rule": {
                      "write": "some other301 rule config"
                    }
                  }
                },
                {
                  type: 'SET_OWNER',
                  ref: "/apps/test/test_owner/other301/path",
                  value: {
                    ".owner": {
                      "owners": {
                        "*": {
                          "branch_owner": true,
                          "write_owner": true,
                          "write_rule": true,
                          "write_function": true
                        }
                      }
                    }
                  }
                }
              ]
            },
            gas_price: 0,
            timestamp: Date.now(),
            nonce: -1
          }
        ];
        const txList = [];
        for (const txBody of txBodyList) {
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          txList.push({
            tx_body: txBody,
            signature
          });
        }
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
          tx_list: txList,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const resultList = _.get(res, 'result.result', null);
          expect(CommonUtil.isArray(resultList)).to.equal(true);
          for (let i = 0; i < resultList.length; i++) {
            expect(CommonUtil.txPrecheckFailed(resultList[i].result)).to.equal(false);
          }
        })
      })

      it('rejects a batch transaction of invalid batch transaction format.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 1'
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
          tx_list: {  // should be an array
            tx_body: txBody,
            signature,
          },
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30401,
            message: 'Invalid batch transaction format.',
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('accepts a batch transaction of under the tx_list size limit.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const timestamp = Date.now();
        const txBodyTemplate = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 2'
          },
          gas_price: 0,
          nonce: -1
        };
        const txList = [];
        for (let i = 0; i < BlockchainParams.resource.batch_tx_list_size_limit; i++) {  // Just under the limit.
          const txBody = JSON.parse(JSON.stringify(txBodyTemplate));
          txBody.timestamp = timestamp + i;
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          txList.push({
            tx_body: txBody,
            signature,
          });
        }
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
          tx_list: txList,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const resultList = _.get(res, 'result.result', null);
          expect(CommonUtil.isArray(resultList)).to.equal(true);
          expect(resultList.length).to.equal(BlockchainParams.resource.batch_tx_list_size_limit);
          for (let i = 0; i < resultList.length; i++) {
            expect(CommonUtil.isFailedTx(resultList[i].result)).to.equal(false);
          }
        })
      })

      it('rejects a batch transaction of over the tx_list size limit.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const timestamp = Date.now();
        const txBodyTemplate = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 3'
          },
          gas_price: 0,
          nonce: -1
        };
        const txList = [];
        for (let i = 0; i < BlockchainParams.resource.batch_tx_list_size_limit + 1; i++) {  // Just over the limit.
          const txBody = JSON.parse(JSON.stringify(txBodyTemplate));
          txBody.timestamp = timestamp + i;
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          txList.push({
            tx_body: txBody,
            signature,
          });
        }
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
          tx_list: txList,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30402,
            message: `Batch transaction list size exceeds its limit: ${BlockchainParams.resource.batch_tx_list_size_limit}.`,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      // NOTE(platfowner): As a workaround for BATCH_TX_LIST_SIZE_LIMIT, the transactions are
      // divided into two batch transaction.
      it('rejects batch transactions that cause over per-account transaction pool size limit.',
          async () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const timestamp = Date.now();
        const txBodyTemplate = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 4'
          },
          gas_price: 0,
          nonce: -1
        };

        // Not over the limit.
        let txCount = 0;
        while (txCount < NodeConfigs.TX_POOL_SIZE_LIMIT_PER_ACCOUNT) {
          const remainingTxCount = NodeConfigs.TX_POOL_SIZE_LIMIT_PER_ACCOUNT - txCount;
          const batchTxSize = (remainingTxCount >= BlockchainParams.resource.batch_tx_list_size_limit) ?
              BlockchainParams.resource.batch_tx_list_size_limit : remainingTxCount;
          const txList1 = [];
          for (let i = 0; i < batchTxSize; i++) {
            const txBody = JSON.parse(JSON.stringify(txBodyTemplate));
            txBody.timestamp = timestamp + txCount + i;
            const signature =
                ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
            txList1.push({
              tx_body: txBody,
              signature,
            });
          }
          const res1 = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
            tx_list: txList1,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          });
          const resultList1 = _.get(res1, 'result.result', null);
          // Accepts transactions.
          expect(CommonUtil.isArray(resultList1)).to.equal(true);
          for (let i = 0; i < resultList1.length; i++) {
            expect(CommonUtil.isFailedTx(resultList1[i].result)).to.equal(false);
          }

          txCount += batchTxSize;
        }

        // Just over the limit.
        const txList2 = [];
        const txBody = JSON.parse(JSON.stringify(txBodyTemplate));
        txBody.timestamp = timestamp + NodeConfigs.TX_POOL_SIZE_LIMIT_PER_ACCOUNT + 1;
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        txList2.push({
          tx_body: txBody,
          signature,
        });
        const res2 = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
          tx_list: txList2,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        });
        const resultList2 = _.get(res2, 'result.result', null);
        // Rejects transactions.
        expect(CommonUtil.isArray(resultList2)).to.equal(true);
        expect(resultList2.length).to.equal(1);
        resultList2[0].tx_hash = 'erased';
        assert.deepEqual(resultList2, [
          {
            "result": {
              "code": 10705,
              "message": "[executeTransactionAndAddToPool] Tx pool does NOT have enough room (100) for account: 0x85a620A5A46d01cc1fCF49E73ab00710d4da943E",
              "bandwidth_gas_amount": 0
            },
            "tx_hash": "erased"
          }
        ]);
      })

      it('rejects a batch transaction with a transaction that exceeds its size limit.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const longText = 'a'.repeat(BlockchainParams.resource.tx_bytes_limit / 2);
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_long_text`,
            value: longText
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
          tx_list: [
            {
              tx_body: txBodyBefore,
              signature: signatureBefore,
            },
            {
              tx_body: txBody,
              signature: signature,
            },
            {
              tx_body: txBodyAfter,
              signature: signatureAfter,
            }
          ],
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const resultList = _.get(res, 'result.result');
          expect(CommonUtil.isArray(resultList)).to.equal(false);
          assert.deepEqual(res.result, {
            result: null,
            code: 30403,
            message: `Transaction[1]'s size exceededs its limit: ${BlockchainParams.resource.tx_bytes_limit} bytes.`,
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('rejects a batch transaction of missing transaction properties.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 5'
          },
          timestamp: Date.now(),
          nonce: -1
        };
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
          tx_list: [
            {
              tx_body: txBodyBefore,
              signature: signatureBefore,
            },
            {
              tx_body: txBody,
              // missing signature
            },
            {
              tx_body: txBodyAfter,
              signature: signatureAfter,
            }
          ],
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30404,
            message: 'Missing properties of transaction[1].',
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('rejects a batch transaction of invalid format.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 6'
          },
          gas_price: 0,
          timestamp: Date.now(),
          // missing nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
          tx_list: [
            {
              tx_body: txBodyBefore,
              signature: signatureBefore,
            },
            {
              tx_body: txBody,
              signature,
            },
            {
              tx_body: txBodyAfter,
              signature: signatureAfter,
            }
          ],
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30405,
            message: 'Invalid format of transaction[1].',
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          });
        })
      })

      it('rejects a batch transaction with an invalid signature.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_value/some/path`,
            value: 'some other value 7'
          },
          gas_price: 0,
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH, {
          tx_list: [
            {
              tx_body: txBodyBefore,
              signature: signatureBefore,
            },
            {
              tx_body: txBody,
              signature: signature + 'a', // invalid signature
            },
            {
              tx_body: txBodyAfter,
              signature: signatureAfter,
            }
          ],
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: null,
            code: 30406,
            message: 'Invalid signature of transaction[1].',
            protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
          });
        })
      })
    })
  })

  describe('Billing', async () => {
    let serviceAdmin; // = server1
    let billingUserA; // = server2
    let billingUserB; // = server3
    let userBalancePathA;
    let userBalancePathB;
    const billingAccountBalancePathA = '/get_value?ref=/service_accounts/billing/test_billing/A/balance';
    before(async () => {
      serviceAdmin =
          parseOrLog(syncRequest('GET', server1 + '/get_address').body.toString('utf-8')).result;
      billingUserA =
          parseOrLog(syncRequest('GET', server2 + '/get_address').body.toString('utf-8')).result;
      billingUserB =
          parseOrLog(syncRequest('GET', server3 + '/get_address').body.toString('utf-8')).result;
      userBalancePathA = `/get_value?ref=/accounts/${billingUserA}/balance`;
      userBalancePathB = `/get_value?ref=/accounts/${billingUserB}/balance`;
      const adminConfig = {
        [serviceAdmin]: true,
        [billingUserA]: true,
        [billingUserB]: true
      };
      const billingConfig = {
        A: { 
          users: {
            [serviceAdmin]: true,
            [billingUserA]: true
          }
        },
        B: {
          users: {
            [serviceAdmin]: true,
            [billingUserB]: true
          }
        }
      };
      const serviceConfig = {
        staking: {
          lockup_duration: 1000
        }
      }
      await setUpApp('test_billing', serverList, {
        admin: adminConfig,
        billing: billingConfig,
        service: serviceConfig
      });

      // const server4Addr =
      //     parseOrLog(syncRequest('GET', server4 + '/get_address').body.toString('utf-8')).result;
      const transferRes = parseOrLog(syncRequest('POST', server3 + '/set', {json: {
        op_list: [
          {
            ref: `/transfer/${billingUserB}/billing|test_billing|A/${Date.now()}/value`,
            value: 100,
            type: 'SET_VALUE'
          },
          {
            ref: `/transfer/${billingUserB}/billing|test_billing|B/${Date.now()}/value`,
            value: 100,
            type: 'SET_VALUE'
          }
        ],
        nonce: -1,
        timestamp: Date.now(),
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, transferRes.tx_hash))) {
        console.error(`Failed to check finalization of transfer tx.`);
      }
    });

    it('app txs are not charged by transfer', async () => {
      // NOTE(platfowner): A pre-tx to guarantee that the service state delta of the next tx
      // is zero.
      const txPreRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/apps/test_billing/test_pre',
          value: 'testing app tx',
          gas_price: 1,
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txPreRes.tx_hash))) {
        console.error(`Failed to check finalization of app tx.`);
      }
      const balanceBefore = parseOrLog(syncRequest('GET', server2 + userBalancePathA).body.toString('utf-8')).result;
      const txWithoutBillingRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/apps/test_billing/test',
          value: 'testing app tx',
          gas_price: 1,
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txWithoutBillingRes.tx_hash))) {
        console.error(`Failed to check finalization of app tx.`);
      }
      const balanceAfter = parseOrLog(syncRequest('GET', server2 + userBalancePathA).body.toString('utf-8')).result;
      assert.deepEqual(balanceAfter, balanceBefore);

      const billingAccountBalanceBefore = parseOrLog(syncRequest(
          'GET', server2 + billingAccountBalancePathA).body.toString('utf-8')).result;
      const txWithBillingRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/apps/test_billing/test',
          value: 'testing app tx',
          gas_price: 1,
          billing: 'test_billing|A',
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txWithBillingRes.tx_hash))) {
        console.error(`Failed to check finalization of app tx.`);
      }
      const billingAccountBalanceAfter = parseOrLog(syncRequest(
          'GET', server2 + billingAccountBalancePathA).body.toString('utf-8')).result;
      assert.deepEqual(billingAccountBalanceAfter, billingAccountBalanceBefore);
    });

    it('app-dependent service tx: individual account', async () => {
      const gasPrice = 1;
      const txRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/manage_app/test_billing/config/service',
          value: {
            staking: {
              lockup_duration: 1000
            }
          },
          gas_price: gasPrice,
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txRes.tx_hash))) {
        console.error(`Failed to check finalization of app tx.`);
      }
      // NOTE(liayoo): Checking the gas fee was collected instead of account balances, since the
      // nodes also participate in consensus & get the collected fees as rewards.
      const tx = parseOrLog(syncRequest('GET', server2 + `/get_transaction?hash=${txRes.tx_hash}`).body.toString('utf-8')).result;
      const gasFeeCollected = parseOrLog(syncRequest(
        'GET',
        `${server2}/get_value?ref=/gas_fee/collect/${tx.number}/${billingUserA}/${txRes.tx_hash}/amount`
      ).body.toString('utf-8')).result;
      assert.deepEqual(
        gasFeeCollected,
        gasPrice * BlockchainParams.resource.gas_price_unit * txRes.result.gas_amount_charged
      );
    });

    it('app-dependent service tx: invalid billing param', async () => {
      const txResBody = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/manage_app/test_billing/config/service',
          value: {
            staking: {
              lockup_duration: 1000
            }
          },
          gas_price: 1,
          billing: 'A',
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8'));
      assert.deepEqual(txResBody, {code: 40001, result: { tx_hash: null, result: false }});
    });

    it('app-dependent service tx: not a billing account user', async () => {
      const txResBody = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/manage_app/test_billing/config/service',
          value: {
            staking: {
              lockup_duration: 1000
            }
          },
          gas_price: 1,
          billing: 'test_billing|B',
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8'));
      expect(txResBody.code).to.equals(40001);
      expect(txResBody.result.result.code).to.equals(10802);
      expect(txResBody.result.result.message).to.equals("[precheckTxBillingParams] User doesn't have permission to the billing account");
    });

    it('app-dependent service tx: billing account', async () => {
      const billingAccountBalanceBefore = parseOrLog(syncRequest(
        'GET', server2 + billingAccountBalancePathA).body.toString('utf-8')).result;
      const gasPrice = 1;
      const txRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/manage_app/test_billing/config/service',
          value: {
            staking: {
              lockup_duration: 1000
            }
          },
          gas_price: 1,
          billing: 'test_billing|A',
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txRes.tx_hash))) {
        console.error(`Failed to check finalization of app tx.`);
      }
      const billingAccountBalanceAfter = parseOrLog(syncRequest(
          'GET', server2 + billingAccountBalancePathA).body.toString('utf-8')).result;
      assert.deepEqual(
        billingAccountBalanceAfter,
        billingAccountBalanceBefore - (gasPrice * BlockchainParams.resource.gas_price_unit * txRes.result.gas_amount_charged)
      );
    });

    it('app-independent service tx: individual account', async () => {
      const gasPrice = 1;
      const txRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/transfer/${billingUserA}/${billingUserB}/${Date.now()}/value`,
          value: 1,
          gas_price: gasPrice,
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txRes.tx_hash))) {
        console.error(`Failed to check finalization of app tx.`);
      }
      // NOTE(liayoo): Checking the gas fee was collected instead of account balances, since the
      // nodes also participate in consensus & get the collected fees as rewards.
      const tx = parseOrLog(syncRequest('GET', server2 + `/get_transaction?hash=${txRes.tx_hash}`).body.toString('utf-8')).result;
      const gasFeeCollected = parseOrLog(syncRequest(
        'GET',
        `${server2}/get_value?ref=/gas_fee/collect/${tx.number}/${billingUserA}/${txRes.tx_hash}/amount`
      ).body.toString('utf-8')).result;
      assert.deepEqual(
        gasFeeCollected,
        gasPrice * BlockchainParams.resource.gas_price_unit * txRes.result.gas_amount_charged
      );
    });

    it('app-independent service tx: billing account', async () => {
      const billingAccountBalanceBefore = parseOrLog(syncRequest(
          'GET', server2 + billingAccountBalancePathA).body.toString('utf-8')).result;
      const gasPrice = 1;
      const txRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/transfer/${billingUserA}/${billingUserB}/${Date.now()}/value`,
          value: 1,
          gas_price: gasPrice,
          billing: 'test_billing|A',
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txRes.tx_hash))) {
        console.error(`Failed to check finalization of app tx.`);
      }
      const billingAccountBalanceAfter = parseOrLog(syncRequest(
          'GET', server2 + billingAccountBalancePathA).body.toString('utf-8')).result;
      assert.deepEqual(
        billingAccountBalanceAfter,
        billingAccountBalanceBefore - (gasPrice * BlockchainParams.resource.gas_price_unit * txRes.result.gas_amount_charged)
      );
    });

    it('multi-set service tx: individual account', async () => {
      const gasPrice = 1;
      const txRes = parseOrLog(syncRequest('POST', server2 + '/set', {json: {
          op_list: [
            {
              ref: `/transfer/${billingUserA}/${billingUserB}/${Date.now()}/value`,
              value: 1,
              type: 'SET_VALUE'
            },
            {
              ref: `/manage_app/test_billing/config/service`,
              value: {
                staking: {
                  lockup_duration: 1000
                }
              },
              type: 'SET_VALUE'
            }
          ],
          gas_price: gasPrice,
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txRes.tx_hash))) {
        console.error(`Failed to check finalization of app tx.`);
      }
      // NOTE(liayoo): Checking the gas fee was collected instead of account balances, since the
      // nodes also participate in consensus & get the collected fees as rewards.
      const tx = parseOrLog(syncRequest('GET', server2 + `/get_transaction?hash=${txRes.tx_hash}`).body.toString('utf-8')).result;
      const gasFeeCollected = parseOrLog(syncRequest(
        'GET',
        `${server2}/get_value?ref=/gas_fee/collect/${tx.number}/${billingUserA}/${txRes.tx_hash}/amount`
      ).body.toString('utf-8')).result;
      assert.deepEqual(
        gasFeeCollected,
        gasPrice * BlockchainParams.resource.gas_price_unit * txRes.result.gas_amount_charged
      );
    });

    it('multi-set service tx: billing account', async () => {
      const billingAccountBalanceBefore = parseOrLog(syncRequest(
          'GET', server2 + billingAccountBalancePathA).body.toString('utf-8')).result;
      const gasPrice = 1;
      const txRes = parseOrLog(syncRequest('POST', server2 + '/set', {json: {
          op_list: [
            {
              ref: `/transfer/${billingUserA}/${billingUserB}/${Date.now()}/value`,
              value: 1,
              type: 'SET_VALUE'
            },
            {
              ref: `/manage_app/test_billing/config/service`,
              value: {
                staking: {
                  lockup_duration: 1000
                }
              },
              type: 'SET_VALUE'
            }
          ],
          billing: 'test_billing|A',
          gas_price: gasPrice,
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, txRes.tx_hash))) {
        console.error(`Failed to check finalization of app tx.`);
      }
      const billingAccountBalanceAfter = parseOrLog(syncRequest(
          'GET', server2 + billingAccountBalancePathA).body.toString('utf-8')).result;
      assert.deepEqual(
        billingAccountBalanceAfter,
        billingAccountBalanceBefore - (gasPrice * BlockchainParams.resource.gas_price_unit * txRes.result.gas_amount_charged)
      );
    });

    it('multi-set service tx: multiple apps', async () => {
      // Set up another app
      const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
        ref: `/staking/test_billing_2/${serviceAdmin}/0/stake/${Date.now()}/value`,
        value: 1
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
        console.error(`Failed to check finalization of app staking tx.`);
      }

      const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
        ref: '/manage_app/test_billing_2/create/0',
        value: {
          admin: {
            [serviceAdmin]: true,
            [billingUserA]: true,
            [billingUserB]: true
          },
          billing: {
            '0': { 
              users: {
                [serviceAdmin]: true,
                [billingUserA]: true,
                [billingUserB]: true
              }
            }
          },
          service: {
            staking: {
              lockup_duration: 2592000000
            }
          }
        },
        nonce: -1,
        timestamp: Date.now(),
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, createAppRes.tx_hash))) {
        console.error(`Failed to check finalization of create app tx.`);
      }

      const txResBody = parseOrLog(syncRequest('POST', server1 + '/set', {json: {
          op_list: [
            {
              ref: `/manage_app/test_billing/config/service`,
              value: {
                staking: {
                  lockup_duration: 100
                  }
                },
              type: 'SET_VALUE'
            },
            {
              ref: `/manage_app/test_billing_2/config/service`,
              value: {
                staking: {
                  lockup_duration: 100
                  }
                },
              type: 'SET_VALUE'
            }
          ],
          billing: 'test_billing|A',
          gas_price: 1,
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8'));
      assert.deepEqual(txResBody.result.result, {
        "bandwidth_gas_amount": 0,
        "message": "[precheckTxBillingParams] Multiple app-dependent service operations for a billing account",
        "code": 10803
      });
    });
  });

  // NOTE(liayoo): Commenting out the test cases for the tx receipts. We can safely delete them once
  //               we deprecate the feature completely.
  // describe('Tx Receipts', () => {
  //   it(`records a transaction receipt`, async () => {
  //     const txSignerAddress = parseOrLog(syncRequest(
  //         'GET', server1 + '/get_address').body.toString('utf-8')).result;
  //     const request = {
  //       ref: '/apps/test/test_receipts/some/path',
  //       value: "some value"
  //     };
  //     const body = parseOrLog(syncRequest(
  //         'POST', server1 + '/set_value', {json: request}).body.toString('utf-8'));
  //     assert.deepEqual(_.get(body, 'result.result.code'), 0);
  //     expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
  //     expect(body.code).to.equal(0);
  //     if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
  //       console.error(`Failed to check finalization of tx.`);
  //     }

  //     const receipt = parseOrLog(syncRequest(
  //         'GET', server1 + `/get_value?ref=${PathUtil.getReceiptPath(body.result.tx_hash)}`)
  //         .body.toString('utf-8')).result;
  //     assert.deepEqual(receipt.address, txSignerAddress);
  //     assert.deepEqual(receipt.exec_result, {
  //       "code": 0,
  //       "gas_amount_charged": 0,
  //       "gas_cost_total": 0
  //     });
  //   });

  //   it('failed transaction', async () => {
  //     const server1Address = parseOrLog(syncRequest(
  //       'GET', server1 + '/get_address').body.toString('utf-8')).result;
  //     const server2Address = parseOrLog(syncRequest(
  //       'GET', server2 + '/get_address').body.toString('utf-8')).result;
  //     const failingTx = {
  //       ref: `/transfer/${server1Address}/${server2Address}/${Date.now()}/value`,
  //       value: 10000000000,
  //       gas_price: 1
  //     }
  //     const body = parseOrLog(syncRequest(
  //       'POST', server1 + '/set_value', {json: failingTx}).body.toString('utf-8'));
  //     assert.deepEqual(body.result.result.code, 12103);
  //     assert.deepEqual(body.result.result.bandwidth_gas_amount, 1);
  //     assert.deepEqual(body.result.result.gas_amount_total, {
  //       "bandwidth": {
  //         "service": 1
  //       },
  //       "state": {
  //         "service": 0
  //       }
  //     });
  //     assert.deepEqual(body.result.result.gas_cost_total, 0.000001);
      
  //     if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
  //       console.error(`Failed to check finalization of tx.`);
  //     }

  //     // Failed tx's receipt is in state
  //     const txHash = body.result.tx_hash;
  //     const receipt = parseOrLog(syncRequest(
  //       'GET', server2 + `/get_value?ref=${PathUtil.getReceiptPath(txHash)}`).body.toString('utf-8')).result;
  //     expect(receipt).to.not.equal(null);
  //     assert.deepEqual(receipt.exec_result, DB.trimExecutionResult(body.result.result));

  //     // Failed tx's gas fees have been collected
  //     const blockNumber = receipt.block_number;
  //     const gasFeeCollected = parseOrLog(syncRequest(
  //       'GET', server2 + `/get_value?ref=/gas_fee/collect/${blockNumber}/${server1Address}/${txHash}/amount`
  //     ).body.toString('utf-8')).result;
  //     assert.deepEqual(gasFeeCollected, body.result.result.gas_cost_total);

  //     // Failed tx is in a block
  //     const block = getBlockByNumber(server2, blockNumber);
  //     expect(block).to.not.equal(undefined);
  //     expect(block.transactions.find((tx) => tx.hash === txHash)).to.not.equal(undefined);
  //   });
  // });
});
