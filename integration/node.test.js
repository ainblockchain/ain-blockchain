const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const _ = require("lodash");
const spawn = require("child_process").spawn;
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const jayson = require('jayson/promise');
const ainUtil = require('@ainblockchain/ain-util');
const PROJECT_ROOT = require('path').dirname(__filename) + "/../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const {
  CURRENT_PROTOCOL_VERSION,
  CHAINS_DIR,
  GenesisAccounts,
  TX_BYTES_LIMIT,
  BATCH_TX_LIST_SIZE_LIMIT,
  TX_POOL_SIZE_LIMIT_PER_ACCOUNT,
  MICRO_AIN,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const PathUtil = require('../common/path-util');
const {
  verifyStateProof,
} = require('../db/state-util');
const DB = require('../db');
const {
  parseOrLog,
  setUpApp,
  waitForNewBlocks,
  waitUntilNetworkIsReady,
  waitUntilTxFinalized,
  getLastBlockNumber,
  getBlockByNumber,
} = require('../unittest/test-util');

const ENV_VARIABLES = [
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
];

const server1 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[0].ACCOUNT_INDEX))
const server2 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[1].ACCOUNT_INDEX))
const server3 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[2].ACCOUNT_INDEX))
const server4 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[3].ACCOUNT_INDEX))
const serverList = [ server1, server2, server3, server4 ];

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
          type: 'SET_FUNCTION',
          ref: '/apps/test/test_function/some/path',
          value: {
            ".function": {
              "fid": {
                "function_type": "REST",
                "function_id": "fid",
                "event_listener": "https://events.ainetwork.ai/trigger",
                "service_name": "https://ainetwork.ai",
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
          type: 'SET_VALUE',
          ref: '/apps/test/test_value',
          value: null
        },
        {
          type: 'SET_VALUE',
          ref: '/apps/test/test_state_info',
          value: null
        },
        {
          type: 'SET_RULE',
          ref: '/apps/test/test_rule',
          value: null
        },
        {
          type: 'SET_FUNCTION',
          ref: '/apps/test/test_function',
          value: null
        },
        {
          type: 'SET_OWNER',
          ref: '/apps/test/test_owner',
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
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc

  before(async () => {
    rimraf.sync(CHAINS_DIR);

    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', { CONSOLE_LOG: false }, true);
    await CommonUtil.sleep(3000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0], true);
    await CommonUtil.sleep(10000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1], true);
    await CommonUtil.sleep(3000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2], true);
    await CommonUtil.sleep(3000);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[3], true);
    await waitUntilNetworkIsReady(serverList);

    const server1Addr = parseOrLog(syncRequest(
        'GET', server1 + '/get_address').body.toString('utf-8')).result;
    const server2Addr = parseOrLog(syncRequest(
        'GET', server2 + '/get_address').body.toString('utf-8')).result;
    const server3Addr = parseOrLog(syncRequest(
        'GET', server3 + '/get_address').body.toString('utf-8')).result;
    const server4Addr = parseOrLog(syncRequest(
        'GET', server4 + '/get_address').body.toString('utf-8')).result;
    await setUpApp('test', serverList, {
      admin: {
        [server1Addr]: true,
        [server2Addr]: true,
        [server3Addr]: true,
        [server4Addr]: true,
      }
    });
  });

  after(() => {
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()
    server4_proc.kill()

    rimraf.sync(CHAINS_DIR)
  });

  describe('Get API', async () => {
    before(async () => {
      await setUp();
    });

    after(async () => {
      await cleanUp();
    });

    describe('/get_value', () => {
      it('get_value', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path')
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: 100});
      })
    })

    describe('/get_function', () => {
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
                "event_listener": "https://events.ainetwork.ai/trigger",
                "service_name": "https://ainetwork.ai",
              },
            }
          }
        });
      })
    })

    describe('/get_rule', () => {
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

    describe('/get_owner', () => {
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

    describe('/match_function', () => {
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
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
            },
            "path": "/apps/test/test_function/some/path"
          },
          "subtree_configs": []
        }});
      })
    })

    describe('/match_rule', () => {
      it('match_rule', () => {
        const ref = "/apps/test/test_rule/some/path";
        const body = parseOrLog(syncRequest('GET', `${server1}/match_rule?ref=${ref}`)
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: {
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
        }});
      })
    })

    describe('/match_owner', () => {
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
          }
        }});
      })
    })

    describe('/eval_rule', () => {
      it('eval_rule returning true', () => {
        const ref = "/apps/test/test_rule/some/path";
        const value = "value";
        const address = "abcd";
        const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = parseOrLog(syncRequest('POST', server1 + '/eval_rule', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: true});
      })

      it('eval_rule returning false', () => {
        const ref = "/apps/test/test_rule/some/path";
        const value = "value";
        const address = "efgh";
        const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = parseOrLog(syncRequest('POST', server1 + '/eval_rule', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: false});
      })
    })

    describe('/eval_owner', () => {
      it('eval_owner', () => {
        const ref = "/apps/test/test_owner/some/path";
        const address = "abcd";
        const permission = "write_owner";
        const request = { ref, permission, address, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = parseOrLog(syncRequest('POST', server1 + '/eval_owner', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: true,
        });
      })
    })

    describe('/get', () => {
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
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "service_name": "https://ainetwork.ai",
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
            true,
            true,
          ]
        });
      })
    })

    describe('/get_state_proof', () => {
      it('get_state_proof', () => {
        const body = parseOrLog(syncRequest('GET', server1 + '/get_state_proof?ref=/values/token/symbol')
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['#state_ph']).to.not.equal(null);
        const verifResult = verifyStateProof(body.result);
        _.set(verifResult, 'rootProofHash', 'erased');
        assert.deepEqual(verifResult, {
          "isVerified": true,
          "mismatchedPath": null,
          "rootProofHash": "erased",
        });
      });
    });

    describe('/get_proof_hash', () => {
      it('get_proof_hash', () => {
        const body = parseOrLog(syncRequest('GET', server1 + '/get_proof_hash?ref=/values/token/symbol')
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result).to.not.equal(null);
      });
    });

    describe('/get_state_info', () => {
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
                "#state_ph": "erased",
                "#tree_bytes": 0,
                "#tree_height": 2,
                "#tree_size": 5,
                "#version": "erased",
              }});
      });
    });

    describe('/get_state_usage', () => {
      it('get_state_usage', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + `/get_state_usage?app_name=test`)
                .body.toString('utf-8'));
        assert.deepEqual(body.result, {
          "#tree_height": 23,
          "#tree_size": 62,
          "#tree_bytes": 11966,
        });
      });
    });

    describe('ain_get', () => {
      it('returns the correct value', () => {
        const expected = 100;
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request('ain_get', {
          protoVer: CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/apps/test/test_value/some/path"
        })
        .then(res => {
          expect(res.result.result).to.equal(expected);
        });
      });
    });

    describe('ain_matchFunction', () => {
      it('returns correct value', () => {
        const ref = "/apps/test/test_function/some/path";
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_matchFunction', request)
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
                  "event_listener": "https://events.ainetwork.ai/trigger",
                  "function_id": "fid",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              },
              "path": "/apps/test/test_function/some/path"
            },
            "subtree_configs": []
          });
        })
      })
    })

    describe('ain_matchRule', () => {
      it('returns correct value', () => {
        const ref = "/apps/test/test_rule/some/path";
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_matchRule', request)
        .then(res => {
          assert.deepEqual(res.result.result, {
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
          });
        })
      })
    })

    describe('ain_matchOwner', () => {
      it('returns correct value', () => {
        const ref = "/apps/test/test_owner/some/path";
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_matchOwner', request)
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
            }
          });
        })
      })
    })

    describe('ain_evalRule', () => {
      it('returns true', () => {
        const ref = "/apps/test/test_rule/some/path";
        const value = "value";
        const address = "abcd";
        const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_evalRule', request)
        .then(res => {
          expect(res.result.result).to.equal(true);
        })
      })

      it('returns false', () => {
        const ref = "/apps/test/test_rule/some/path";
        const value = "value";
        const address = "efgh";
        const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_evalRule', request)
        .then(res => {
          expect(res.result.result).to.equal(false);
        })
      })
    })

    describe('ain_evalOwner', () => {
      it('returns correct value', () => {
        const ref = "/apps/test/test_owner/some/path";
        const address = "abcd";
        const permission = "write_owner";
        const request = { ref, permission, address, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_evalOwner', request)
        .then(res => {
          assert.deepEqual(res.result.result, true);
        })
      })
    })

    describe('ain_getStateProof', () => {
      it('returns correct value', () => {
        const ref = '/values/token/symbol';
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_getStateProof', request)
        .then(res => {
          expect(res.result.result['#state_ph']).to.not.equal(null);
          const verifResult = verifyStateProof(res.result.result);
          _.set(verifResult, 'rootProofHash', 'erased');
          assert.deepEqual(verifResult, {
            "isVerified": true,
            "mismatchedPath": null,
            "rootProofHash": "erased",
          });
        })
      })
    })

    describe('ain_getProofHash', () => {
      it('returns correct value', () => {
        const ref = '/values/token/symbol';
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_getProofHash', request)
        .then(res => {
          expect(res.result.result).to.not.equal(null);
        })
      })
    })

    describe('ain_getStateInfo', () => {
      it('returns correct value', () => {
        const ref = '/values/apps/test/test_state_info/some/path';
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_getStateInfo', request)
        .then(res => {
          const stateInfo = res.result.result;
          // Erase some properties for stable comparison.
          stateInfo['#tree_bytes'] = 0;
          stateInfo['#state_ph'] = 'erased';
          stateInfo['#version'] = 'erased';
          assert.deepEqual(stateInfo, {
            "#state_ph": "erased",
            "#tree_height": 2,
            "#tree_size": 5,
            "#tree_bytes": 0,
            "#version": "erased"
          });
        })
      })
    })

    describe('ain_getStateUsage', () => {
      it('returns correct value', () => {
        const request = { app_name: 'test', protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_getStateUsage', request)
        .then(res => {
          const stateUsage = res.result.result;
          assert.deepEqual(stateUsage, {
            "#tree_bytes": 11966,
            "#tree_height": 23,
            "#tree_size": 62,
          });
        })
      })
    })

    describe('ain_getProtocolVersion', () => {
      it('returns the correct version', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request('ain_getProtocolVersion', {})
        .then(res => {
          expect(res.result.protoVer).to.equal(CURRENT_PROTOCOL_VERSION);
        })
      });
    });

    describe('ain_checkProtocolVersion', () => {
      it('checks protocol versions correctly', () => {
        return new Promise((resolve, reject) => {
          const client = jayson.client.http(server1 + '/json-rpc');
          let promises = [];
          promises.push(client.request('ain_checkProtocolVersion', {}));
          promises.push(client.request('ain_checkProtocolVersion', {protoVer: 'a.b.c'}));
          promises.push(client.request('ain_checkProtocolVersion', {protoVer: 0}));
          promises.push(client.request('ain_checkProtocolVersion', {protoVer: CURRENT_PROTOCOL_VERSION}));
          promises.push(client.request('ain_checkProtocolVersion', {protoVer: '0.0.1'}));
          Promise.all(promises).then(res => {
            expect(res[0].result.code).to.equal(1);
            expect(res[0].result.message).to.equal("Protocol version not specified.");
            expect(res[1].result.code).to.equal(1);
            expect(res[1].result.message).to.equal("Invalid protocol version.");
            expect(res[2].result.code).to.equal(1);
            expect(res[2].result.message).to.equal("Incompatible protocol version.");
            expect(res[3].result.code).to.equal(0);
            expect(res[3].result.result).to.equal("Success");
            expect(res[4].result.code).to.equal(1);
            expect(res[4].result.message).to.equal("Incompatible protocol version.");
            resolve();
          })
        });
      });
    })

    describe('ain_getAddress', () => {
      it('returns the correct node address', () => {
        const expAddr = GenesisAccounts.others[1].address;
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request('ain_getAddress', { protoVer: CURRENT_PROTOCOL_VERSION })
        .then(res => {
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

    describe('/set_value', async () => {
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

      it('set_value with nonce unordered (-1)', async () => {
        const request = {
          ref: '/apps/test/test_value/some/path',
          value: "some value with nonce unordered",
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
        assert.deepEqual(resultAfter, "some value with nonce unordered");
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
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 103,
          "error_message": "No write permission on: /apps/some/wrong/path",
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
        expect(body.code).to.equal(1);
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

    describe('/inc_value', () => {
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
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 103,
          "error_message": "No write permission on: /apps/some/wrong/path2",
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
        expect(body.code).to.equal(1);
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

    describe('/dec_value', () => {
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
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 103,
          "error_message": "No write permission on: /apps/some/wrong/path3",
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
        expect(body.code).to.equal(1);
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

    describe('/set_function', () => {
      it('set_function', async () => {
        // Check the original function.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=/apps/test/test_function/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, {
          ".function": {
            "fid": {
              "event_listener": "https://events.ainetwork.ai/trigger",
              "function_id": "fid",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai"
            }
          }
        });

        const request = {
          ref: "/apps/test/test_function/some/path",
          value: {
            ".function": {
              "fid": {
                "event_listener": "https://events.ainetwork.ai/trigger2",  // Listener 2
                "function_id": "fid",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
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
              "event_listener": "https://events.ainetwork.ai/trigger2",  // Listener 2
              "function_id": "fid",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai"
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
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
            }
          }
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_function', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 404,
          "error_message": "No write_function permission on: /apps/some/wrong/path",
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
        expect(body.code).to.equal(1);
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

    describe('/set_rule', () => {
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
              "write": "some other rule config"
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
            "write": "some other rule config"
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
              "write": "some other rule config"
            }
          }
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "bandwidth_gas_amount": 1,
          "code": 503,
          "error_message": "No write_rule permission on: /apps/some/wrong/path",
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
        expect(body.code).to.equal(1);
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

    describe('/set_owner', () => {
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
          "code": 603,
          "error_message": "No write_owner or branch_owner permission on: /apps/some/wrong/path",
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
        expect(body.code).to.equal(1);
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

    describe('/set', () => {
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
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid",
                    "function_type": "REST",
                    "service_name": "https://ainetwork.ai"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: "/apps/test/test_rule/other100/path",
              value: {
                ".rule": {
                  "write": "some other100 rule config"
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
                "test": 4622
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
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid",
                    "function_type": "REST",
                    "service_name": "https://ainetwork.ai"
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
              "code": 103,
              "error_message": "No write permission on: /apps/some/wrong/path",
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
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/apps/test/test_value/some101/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/batch', () => {
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
                      "event_listener": "https://events.ainetwork.ai/trigger",
                      "function_id": "fid",
                      "function_type": "REST",
                      "service_name": "https://ainetwork.ai"
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
                    "write": "some other200 rule config"
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
                          "event_listener": "https://events.ainetwork.ai/trigger",
                          "function_id": "fid",
                          "function_type": "REST",
                          "service_name": "https://ainetwork.ai"
                        }
                      }
                    }
                  },
                  {
                    type: 'SET_RULE',
                    ref: "/apps/test/test_rule/other201/path",
                    value: {
                      ".rule": {
                        "write": "some other201 rule config"
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
                    "test": 1552
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
                    "test": 734
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
                    "test": 4622
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
                      "event_listener": "https://events.ainetwork.ai/trigger",
                      "function_id": "fid",
                      "function_type": "REST",
                      "service_name": "https://ainetwork.ai"
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
                    "write": "some other202 rule config"
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
                          "event_listener": "https://events.ainetwork.ai/trigger",
                          "function_id": "fid",
                          "function_type": "REST",
                          "service_name": "https://ainetwork.ai"
                        }
                      }
                    }
                  },
                  {
                    type: 'SET_RULE',
                    ref: "/apps/test/test_rule/other203/path",
                    value: {
                      ".rule": {
                        "write": "some other203 rule config"
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
              "error_message": "No write permission on: /apps/some/wrong/path",
              "code": 103,
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
                    "test": 1552
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
                    "test": 734
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
                    "test": 4622
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

    describe('ain_sendSignedTransaction', () => {
      const account = {
        address: "0x85a620A5A46d01cc1fCF49E73ab00710d4da943E",
        private_key: "b542fc2ca4a68081b3ba238888d3a8783354c3aa81711340fd69f6ff32798525",
        public_key: "eb8c8577e8be18a83829c5c8a2ec2a754ef0a190e5a01139e9a24aae8f56842dfaf708da56d0f395bbfef08633237398dec96343f62ce217130d9738a76adfdf"
      };

      before(async () => {
        const currentRule = parseOrLog(syncRequest('GET', server1 + '/get_rule?ref=/apps/test')
          .body.toString('utf-8')).result[".rule"]["write"];
        const newOwners = parseOrLog(syncRequest('GET', server1 + '/get_owner?ref=/apps/test')
          .body.toString('utf-8')).result[".owner"];
        const newRule = `${currentRule} || auth.addr === '${account.address}'`;
        newOwners["owners"][account.address] = {
          "branch_owner": true,
          "write_owner": true,
          "write_rule": true,
          "write_function": true
        };
        const res = parseOrLog(syncRequest('POST', server1 + '/set', {json: {
            op_list: [
              {
                type: 'SET_RULE',
                ref: '/apps/test',
                value: {
                  ".rule": {
                    "write": newRule
                  }
                }
              },
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

      it('accepts a transaction with nonce unordered (-1)', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value',
            ref: `/apps/test/test_value/some/path`
          },
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransaction', {
          tx_body: txBody,
          signature,
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const result = _.get(res, 'result.result', null);
          expect(result).to.not.equal(null);
          assert.deepEqual(res.result, {
            protoVer: CURRENT_PROTOCOL_VERSION,
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
                      test: 24
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
        return client.request('ain_getNonce', {
          address: account.address,
          from: 'pending',
          protoVer: CURRENT_PROTOCOL_VERSION
        })
        .then((nonceRes) => {
          const nonce = _.get(nonceRes, 'result.result');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              value: 'some other value 2',
              ref: `/apps/test/test_value/some/path`
            },
            timestamp: Date.now(),
            nonce,  // numbered nonce
          };
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request('ain_sendSignedTransaction', {
            tx_body: txBody,
            signature,
            protoVer: CURRENT_PROTOCOL_VERSION
          })
          .then((res) => {
            const result = _.get(res, 'result.result', null);
            expect(result).to.not.equal(null);
            assert.deepEqual(res.result, {
              protoVer: CURRENT_PROTOCOL_VERSION,
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

      it('rejects a transaction that exceeds its size limit.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const longText = 'a'.repeat(TX_BYTES_LIMIT / 2);
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: longText,
            ref: `/apps/test/test_long_text`
          },
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransaction', {
          tx_body: txBody,
          signature,
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: {
              code: 1,
              message: `Transaction size exceeds its limit: ${TX_BYTES_LIMIT} bytes.`,
            },
            protoVer: CURRENT_PROTOCOL_VERSION
          });
        })
      })

      it('rejects a transaction of missing properties.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value',
            ref: `/apps/test/test_value/some/path`
          },
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransaction', {
          transaction: txBody,  // wrong field name
          signature,
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: {
              code: 2,
              message: `Missing properties.`,
            },
            protoVer: CURRENT_PROTOCOL_VERSION
          });
        })
      })

      it('rejects a transaction in an invalid format.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value',
            ref: `/apps/test/test_value/some/path`
          },
          timestamp: Date.now(),
          // missing nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransaction', {
          tx_body: txBody,
          signature,
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: {
              code: 3,
              message: `Invalid transaction format.`,
            },
            protoVer: CURRENT_PROTOCOL_VERSION
          });
        })
      })

      it('rejects a transaction with an invalid signature.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value 3',
            ref: `/apps/test/test_value/some/path`
          },
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransaction', {
          tx_body: txBody,
          signature: signature + '0', // invalid signature
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result.result.result, {
            "error_message": "[executeTransactionAndAddToPool] Invalid signature",
            "code": 6,
            "bandwidth_gas_amount": 0
          });
        })
      })
    })

    describe('ain_sendSignedTransactionBatch', () => {
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
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'INC_VALUE',
              ref: "/apps/test/test_value/some300/path2",
              value: 10
            },
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'DEC_VALUE',
              ref: "/apps/test/test_value/some300/path3",
              value: 10
            },
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
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid",
                    "function_type": "REST",
                    "service_name": "https://ainetwork.ai"
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
              ref: "/apps/test/test_rule/other300/path",
              value: {
                ".rule": {
                  "write": "some other300 rule config"
                }
              }
            },
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
                        "event_listener": "https://events.ainetwork.ai/trigger",
                        "function_id": "fid",
                        "function_type": "REST",
                        "service_name": "https://ainetwork.ai"
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
        return client.request('ain_sendSignedTransactionBatch', {
          tx_list: txList,
          protoVer: CURRENT_PROTOCOL_VERSION
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
            value: 'some other value',
            ref: `/apps/test/test_value/some/path`
          },
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransactionBatch', {
          tx_list: {  // should be an array
            tx_body: txBody,
            signature,
          },
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: {
              code: 1,
              message: `Invalid batch transaction format.`
            },
            protoVer: CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('accepts a batch transaction of under transaction list size limit.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const timestamp = Date.now();
        const txBodyTemplate = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value',
            ref: `/apps/test/test_value/some/path`
          },
          nonce: -1
        };
        const txList = [];
        for (let i = 0; i < BATCH_TX_LIST_SIZE_LIMIT; i++) {  // Just under the limit.
          const txBody = JSON.parse(JSON.stringify(txBodyTemplate));
          txBody.timestamp = timestamp + i;
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          txList.push({
            tx_body: txBody,
            signature,
          });
        }
        return client.request('ain_sendSignedTransactionBatch', {
          tx_list: txList,
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const resultList = _.get(res, 'result.result', null);
          expect(CommonUtil.isArray(resultList)).to.equal(true);
          expect(resultList.length).to.equal(BATCH_TX_LIST_SIZE_LIMIT);
          for (let i = 0; i < resultList.length; i++) {
            expect(CommonUtil.isFailedTx(resultList[i].result)).to.equal(false);
          }
        })
      })

      it('rejects a batch transaction of over transaction list size limit.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const timestamp = Date.now();
        const txBodyTemplate = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value',
            ref: `/apps/test/test_value/some/path`
          },
          nonce: -1
        };
        const txList = [];
        for (let i = 0; i < BATCH_TX_LIST_SIZE_LIMIT + 1; i++) {  // Just over the limit.
          const txBody = JSON.parse(JSON.stringify(txBodyTemplate));
          txBody.timestamp = timestamp + i;
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          txList.push({
            tx_body: txBody,
            signature,
          });
        }
        return client.request('ain_sendSignedTransactionBatch', {
          tx_list: txList,
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: {
              code: 2,
              message: `Batch transaction list size exceeds its limit: ${BATCH_TX_LIST_SIZE_LIMIT}.`
            },
            protoVer: CURRENT_PROTOCOL_VERSION,
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
            value: 'some other value',
            ref: `/apps/test/test_value/some/path`
          },
          nonce: -1
        };

        // Not over the limit.
        let txCount = 0;
        while (txCount < TX_POOL_SIZE_LIMIT_PER_ACCOUNT) {
          const remainingTxCount = TX_POOL_SIZE_LIMIT_PER_ACCOUNT - txCount;
          const batchTxSize = (remainingTxCount >= BATCH_TX_LIST_SIZE_LIMIT) ?
              BATCH_TX_LIST_SIZE_LIMIT : remainingTxCount;
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
          const res1 = await client.request('ain_sendSignedTransactionBatch', {
            tx_list: txList1,
            protoVer: CURRENT_PROTOCOL_VERSION
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
        txBody.timestamp = timestamp + TX_POOL_SIZE_LIMIT_PER_ACCOUNT + 1;
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        txList2.push({
          tx_body: txBody,
          signature,
        });
        const res2 = await client.request('ain_sendSignedTransactionBatch', {
          tx_list: txList2,
          protoVer: CURRENT_PROTOCOL_VERSION
        });
        const resultList2 = _.get(res2, 'result.result', null);
        // Rejects transactions.
        expect(CommonUtil.isArray(resultList2)).to.equal(true);
        expect(resultList2.length).to.equal(1);
        resultList2[0].tx_hash = 'erased';
        assert.deepEqual(resultList2, [
          {
            "result": {
              "code": 4,
              "error_message": "[executeTransactionAndAddToPool] Tx pool does NOT have enough room (100) for account: 0x85a620A5A46d01cc1fCF49E73ab00710d4da943E",
              "bandwidth_gas_amount": 0
            },
            "tx_hash": "erased"
          }
        ]);
      })

      it('rejects a batch transaction with a transaction that exceeds its size limit.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const longText = 'a'.repeat(TX_BYTES_LIMIT / 2);
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/apps/test/test_long_text`,
            value: longText
          },
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransactionBatch', {
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
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const resultList = _.get(res, 'result.result');
          expect(CommonUtil.isArray(resultList)).to.equal(false);
          assert.deepEqual(res.result, {
            result: {
              code: 3,
              message: `Transaction[1]'s size exceededs its limit: ${TX_BYTES_LIMIT} bytes.`,
            },
            protoVer: CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('rejects a batch transaction of missing transaction properties.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value',
            ref: `/apps/test/test_value/some/path`
          },
          timestamp: Date.now(),
          nonce: -1
        };
        return client.request('ain_sendSignedTransactionBatch', {
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
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: {
              code: 4,
              message: `Missing properties of transaction[1].`,
            },
            protoVer: CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('rejects a batch transaction of invalid transaction format.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value',
            ref: `/apps/test/test_value/some/path`
          },
          timestamp: Date.now(),
          // missing nonce
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransactionBatch', {
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
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: {
              code: 5,
              message: `Invalid format of transaction[1].`
            },
            protoVer: CURRENT_PROTOCOL_VERSION
          });
        })
      })

      it('rejects a batch transaction with an invalid signature.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value 3',
            ref: `/apps/test/test_value/some/path`
          },
          timestamp: Date.now(),
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransactionBatch', {
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
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          res.result.result.forEach((res) => {
            res.tx_hash = 'erased';
          });
          assert.deepEqual(res.result.result, [
            {
              "tx_hash": "erased",
              "result": {
                "gas_amount_total": {
                  "bandwidth": {
                    "service": 0,
                    "app": {
                      "test": 1
                    }
                  },
                  "state": {
                    "service": 0,
                    "app": {
                      "test": 380
                    }
                  }
                },
                "gas_cost_total": 0,
                "code": 0,
                "bandwidth_gas_amount": 1,
                "gas_amount_charged": 0
              }
            },
            {
              "tx_hash": "erased",
              "result": {
                "error_message": "[executeTransactionAndAddToPool] Invalid signature",
                "code": 6,
                "bandwidth_gas_amount": 0
              }
            },
            {
              "tx_hash": "erased",
              "result": {
                "gas_amount_total": {
                  "bandwidth": {
                    "service": 0,
                    "app": {
                      "test": 1
                    }
                  },
                  "state": {
                    "service": 0,
                    "app": {
                      "test": 178
                    }
                  }
                },
                "gas_cost_total": 0,
                "code": 0,
                "bandwidth_gas_amount": 1,
                "gas_amount_charged": 0
              }
            }
          ]);
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
      await setUpApp('test_billing', serverList, { admin: adminConfig, billing: billingConfig });

      const server4Addr =
          parseOrLog(syncRequest('GET', server4 + '/get_address').body.toString('utf-8')).result;
      const transferRes = parseOrLog(syncRequest('POST', server4 + '/set', {json: {
        op_list: [
          {
            ref: `/transfer/${server4Addr}/billing|test_billing|A/${Date.now()}/value`,
            value: 100,
            type: 'SET_VALUE'
          },
          {
            ref: `/transfer/${server4Addr}/billing|test_billing|B/${Date.now()}/value`,
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
          ref: '/manage_app/test_billing/config/service/staking/lockup_duration',
          value: 1000,
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
        gasPrice * MICRO_AIN * txRes.result.gas_amount_charged
      );
    });

    it('app-dependent service tx: invalid billing param', async () => {
      const txResBody = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/manage_app/test_billing/config/service/staking/lockup_duration',
          value: 1000,
          gas_price: 1,
          billing: 'A',
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8'));
      assert.deepEqual(txResBody, {code: 1, result: { tx_hash: null, result: false }});
    });

    it('app-dependent service tx: not a billing account user', async () => {
      const txResBody = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/manage_app/test_billing/config/service/staking/lockup_duration',
          value: 1000,
          gas_price: 1,
          billing: 'test_billing|B',
          nonce: -1,
          timestamp: Date.now(),
        }
      }).body.toString('utf-8'));
      expect(txResBody.code).to.equals(1);
      expect(txResBody.result.result.code).to.equals(33);
      expect(txResBody.result.result.error_message).to.equals("[precheckTxBillingParams] User doesn't have permission to the billing account");
    });

    it('app-dependent service tx: billing account', async () => {
      const billingAccountBalanceBefore = parseOrLog(syncRequest(
        'GET', server2 + billingAccountBalancePathA).body.toString('utf-8')).result;
      const gasPrice = 1;
      const txRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: '/manage_app/test_billing/config/service/staking/lockup_duration',
          value: 1000,
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
        billingAccountBalanceBefore - (gasPrice * MICRO_AIN * txRes.result.gas_amount_charged)
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
        gasPrice * MICRO_AIN * txRes.result.gas_amount_charged
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
        billingAccountBalanceBefore - (gasPrice * MICRO_AIN * txRes.result.gas_amount_charged)
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
              ref: `/manage_app/test_billing/config/service/staking/lockup_duration`,
              value: 100,
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
        gasPrice * MICRO_AIN * txRes.result.gas_amount_charged
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
              ref: `/manage_app/test_billing/config/service/staking/lockup_duration`,
              value: 100,
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
        billingAccountBalanceBefore - (gasPrice * MICRO_AIN * txRes.result.gas_amount_charged)
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
              ref: `/manage_app/test_billing/config/service/staking/lockup_duration`,
              value: 100,
              type: 'SET_VALUE'
            },
            {
              ref: `/manage_app/test_billing_2/config/service/staking/lockup_duration`,
              value: 100,
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
        "error_message": "[precheckTxBillingParams] Multiple app-dependent service operations for a billing account",
        "code": 16
      });
    });
  });

  describe('Tx Receipts', () => {
    it(`records a transaction receipt`, async () => {
      const txSignerAddress = parseOrLog(syncRequest(
          'GET', server1 + '/get_address').body.toString('utf-8')).result;
      const request = {
        ref: '/apps/test/test_receipts/some/path',
        value: "some value"
      };
      const body = parseOrLog(syncRequest(
          'POST', server1 + '/set_value', {json: request}).body.toString('utf-8'));
      assert.deepEqual(_.get(body, 'result.result.code'), 0);
      expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
      expect(body.code).to.equal(0);
      if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
        console.error(`Failed to check finalization of tx.`);
      }

      const receipt = parseOrLog(syncRequest(
          'GET', server1 + `/get_value?ref=${PathUtil.getReceiptPath(body.result.tx_hash)}`)
          .body.toString('utf-8')).result;
      assert.deepEqual(receipt.address, txSignerAddress);
      assert.deepEqual(receipt.exec_result, {
        "code": 0,
        "gas_amount_charged": 0,
        "gas_cost_total": 0
      });
    });

    it(`removes an old transaction receipt`, async () => {
      const MAX_BLOCK_NUMBERS_FOR_RECEIPTS = 100;
      let lastBlockNumber = getLastBlockNumber(server1);
      if (lastBlockNumber <= MAX_BLOCK_NUMBERS_FOR_RECEIPTS) {
        await waitForNewBlocks(server1, MAX_BLOCK_NUMBERS_FOR_RECEIPTS - lastBlockNumber + 1);
        lastBlockNumber = getLastBlockNumber(server1);
      }
      let oldBlockNumber = lastBlockNumber - MAX_BLOCK_NUMBERS_FOR_RECEIPTS;
      let oldBlock = getBlockByNumber(server1, oldBlockNumber);
      while (!oldBlock.transactions.length) {
        oldBlock = getBlockByNumber(server1, --oldBlockNumber);
        await CommonUtil.sleep(2000);
      }
      for (const tx of oldBlock.transactions) {
        const receipt = parseOrLog(syncRequest(
          'GET', server1 + `/get_value?ref=${PathUtil.getReceiptPath(tx.hash)}`)
          .body.toString('utf-8')).result;
        assert.deepEqual(receipt, null);
      }
    });

    it('failed transaction', async () => {
      const server1Address = parseOrLog(syncRequest(
        'GET', server1 + '/get_address').body.toString('utf-8')).result;
      const server2Address = parseOrLog(syncRequest(
        'GET', server2 + '/get_address').body.toString('utf-8')).result;
      const failingTx = {
        ref: `/transfer/${server1Address}/${server2Address}/${Date.now()}/value`,
        value: 10000000000,
        gas_price: 1
      }
      const body = parseOrLog(syncRequest(
        'POST', server1 + '/set_value', {json: failingTx}).body.toString('utf-8'));
      assert.deepEqual(body.result.result.code, 103);
      assert.deepEqual(body.result.result.bandwidth_gas_amount, 1);
      assert.deepEqual(body.result.result.gas_amount_total, {
        "bandwidth": {
          "service": 1
        },
        "state": {
          "service": 0
        }
      });
      assert.deepEqual(body.result.result.gas_cost_total, 0.000001);
      
      if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
        console.error(`Failed to check finalization of tx.`);
      }

      // Failed tx's receipt is in state
      const txHash = body.result.tx_hash;
      const receipt = parseOrLog(syncRequest(
        'GET', server2 + `/get_value?ref=${PathUtil.getReceiptPath(txHash)}`).body.toString('utf-8')).result;
      expect(receipt).to.not.equal(null);
      assert.deepEqual(receipt.exec_result, DB.trimExecutionResult(body.result.result));

      // Failed tx's gas fees have been collected
      const blockNumber = receipt.block_number;
      const gasFeeCollected = parseOrLog(syncRequest(
        'GET', server2 + `/get_value?ref=/gas_fee/collect/${blockNumber}/${server1Address}/${txHash}/amount`
      ).body.toString('utf-8')).result;
      assert.deepEqual(gasFeeCollected, body.result.result.gas_cost_total);

      // Failed tx is in a block
      const block = getBlockByNumber(server2, blockNumber);
      expect(block).to.not.equal(undefined);
      expect(block.transactions.find((tx) => tx.hash === txHash)).to.not.equal(undefined);
    });
  });
});
