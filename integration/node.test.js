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
  HASH_DELIMITER,
  FunctionResultCode,
  GenesisAccounts,
  ProofProperties,
  TX_BYTES_LIMIT,
  BATCH_TX_LIST_SIZE_LIMIT,
  TX_POOL_SIZE_LIMIT_PER_ACCOUNT,
  MICRO_AIN,
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const { waitUntilTxFinalized, parseOrLog } = require('../unittest/test-util');

const ENV_VARIABLES = [
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0, EPOCH_MS: 1000, DEBUG: false,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1, EPOCH_MS: 1000, DEBUG: false,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2, EPOCH_MS: 1000, DEBUG: false,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3, EPOCH_MS: 1000, DEBUG: false,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
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
          ref: 'test/test_value/some/path',
          value: 100
        },
        {
          type: 'SET_VALUE',
          ref: 'test/test_state_info/some/path',
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
          ref: '/test/test_rule/some/path',
          value: {
            ".write": "auth.addr === 'abcd'"
          }
        },
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_function/some/path',
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
          ref: '/test/test_owner/some/path',
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
  assert.deepEqual(ChainUtil.isFailedTx(_.get(res, 'result')), false);
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
          ref: 'test/test_value/some/path',
          value: null
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_rule/some/path',
          value: null
        },
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_function/some/path',
          value: null
        },
        {
          type: 'SET_OWNER',
          ref: '/test/test_owner/some/path',
          value: null
        },
      ],
      nonce: -1,
    }
  }).body.toString('utf-8')).result;
  assert.deepEqual(ChainUtil.isFailedTx(_.get(res, 'result')), false);
  if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
    console.error(`Failed to check finalization of cleanUp() tx.`);
  }
}

describe('Blockchain Node', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc

  before(async () => {
    rimraf.sync(CHAINS_DIR)

    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', { CONSOLE_LOG: false }, true);
    await ChainUtil.sleep(2000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0], true);
    await ChainUtil.sleep(2000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1], true);
    await ChainUtil.sleep(2000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2], true);
    await ChainUtil.sleep(2000);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[3], true);
    await ChainUtil.sleep(2000);
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
    })

    after(async () => {
      await cleanUp();
    })

    describe('/get_value', () => {
      it('get_value', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: 100});
      })
    })

    describe('/get_function', () => {
      it('get_function', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=/test/test_function/some/path')
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
            'GET', server1 + '/get_rule?ref=/test/test_rule/some/path')
            .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: {
            ".write": "auth.addr === 'abcd'"
          }
        });
      })
    })

    describe('/get_owner', () => {
      it('get_owner', () => {
        const body = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=/test/test_owner/some/path')
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
        const ref = "/test/test_function/some/path";
        const body = parseOrLog(syncRequest('GET', `${server1}/match_function?ref=${ref}`)
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: {
          "matched_path": {
            "target_path": "/test/test_function/some/path",
            "ref_path": "/test/test_function/some/path",
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
            "path": "/test/test_function/some/path"
          },
          "subtree_configs": []
        }});
      })
    })

    describe('/match_rule', () => {
      it('match_rule', () => {
        const ref = "/test/test_rule/some/path";
        const body = parseOrLog(syncRequest('GET', `${server1}/match_rule?ref=${ref}`)
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: {
          "matched_path": {
            "target_path": "/test/test_rule/some/path",
            "ref_path": "/test/test_rule/some/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": "auth.addr === 'abcd'",
            "path": "/test/test_rule/some/path"
          },
          "subtree_configs": []
        }});
      })
    })

    describe('/match_owner', () => {
      it('match_owner', () => {
        const ref = "/test/test_owner/some/path";
        const body = parseOrLog(syncRequest('GET', `${server1}/match_owner?ref=${ref}`)
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: {
          "matched_path": {
            "target_path": "/test/test_owner/some/path"
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
            "path": "/test/test_owner/some/path"
          }
        }});
      })
    })

    describe('/eval_rule', () => {
      it('eval_rule returning true', () => {
        const ref = "/test/test_rule/some/path";
        const value = "value";
        const address = "abcd";
        const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = parseOrLog(syncRequest('POST', server1 + '/eval_rule', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: true});
      })

      it('eval_rule returning false', () => {
        const ref = "/test/test_rule/some/path";
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
        const ref = "/test/test_owner/some/path";
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
              ref: "/test/test_value/some/path",
            },
            {
              type: 'GET_FUNCTION',
              ref: "/test/test_function/some/path",
            },
            {
              type: 'GET_RULE',
              ref: "/test/test_rule/some/path",
            },
            {
              type: 'GET_OWNER',
              ref: "/test/test_owner/some/path",
            },
            {
              type: 'EVAL_RULE',
              ref: "/test/test_rule/some/path",
              value: "value",
              address: "abcd"
            },
            {
              type: 'EVAL_OWNER',
              ref: "/test/test_owner/some/path",
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
              ".write": "auth.addr === 'abcd'"
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
        const body = parseOrLog(syncRequest('GET', server1 + '/get_state_proof?ref=/')
            .body.toString('utf-8'));
        const ownersBody = parseOrLog(syncRequest('GET', server1 + `/get_state_proof?ref=/owners`)
            .body.toString('utf-8'));
        const rulesBody = parseOrLog(syncRequest('GET', server1 + `/get_state_proof?ref=/rules`)
            .body.toString('utf-8'));
        const valuesBody = parseOrLog(syncRequest('GET', server1 + `/get_state_proof?ref=/values`)
            .body.toString('utf-8'));
        const functionsBody = parseOrLog(syncRequest(
            'GET', server1 + `/get_state_proof?ref=/functions`)
            .body.toString('utf-8'));
        const ownersProof = ownersBody.result.owners[ProofProperties.PROOF_HASH];
        const rulesProof = rulesBody.result.rules[ProofProperties.PROOF_HASH];
        const valuesProof = valuesBody.result.values[ProofProperties.PROOF_HASH];
        const functionProof = functionsBody.result.functions[ProofProperties.PROOF_HASH];
        const preimage = `owners${HASH_DELIMITER}${ownersProof}${HASH_DELIMITER}` +
            `rules${HASH_DELIMITER}${rulesProof}${HASH_DELIMITER}` +
            `values${HASH_DELIMITER}${valuesProof}${HASH_DELIMITER}` +
            `functions${HASH_DELIMITER}${functionProof}`;
        const proofHash = ChainUtil.hashString(ChainUtil.toString(preimage));
        assert.deepEqual(body, { code: 0, result: { '.proof_hash': proofHash } });
      });
    });

    describe('/get_state_info', () => {
      it('get_state_info', () => {
        const infoBody = parseOrLog(syncRequest(
            'GET', server1 + `/get_state_info?ref=/values/test/test_state_info/some/path`)
                .body.toString('utf-8'));
        assert.deepEqual(infoBody, { code: 0, result: { tree_height: 2, tree_size: 5 }});
      });
    });

    describe('ain_get', () => {
      it('returns the correct value', () => {
        const expected = 100;
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request('ain_get', {
          protoVer: CURRENT_PROTOCOL_VERSION,
          type: 'GET_VALUE',
          ref: "/test/test_value/some/path"
        })
        .then(res => {
          expect(res.result.result).to.equal(expected);
        });
      });
    });

    describe('ain_matchFunction', () => {
      it('returns correct value', () => {
        const ref = "/test/test_function/some/path";
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_matchFunction', request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "matched_path": {
              "target_path": "/test/test_function/some/path",
              "ref_path": "/test/test_function/some/path",
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
              "path": "/test/test_function/some/path"
            },
            "subtree_configs": []
          });
        })
      })
    })

    describe('ain_matchRule', () => {
      it('returns correct value', () => {
        const ref = "/test/test_rule/some/path";
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_matchRule', request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "matched_path": {
              "target_path": "/test/test_rule/some/path",
              "ref_path": "/test/test_rule/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": "auth.addr === 'abcd'",
              "path": "/test/test_rule/some/path"
            },
            "subtree_configs": []
          });
        })
      })
    })

    describe('ain_matchOwner', () => {
      it('returns correct value', () => {
        const ref = "/test/test_owner/some/path";
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_matchOwner', request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "matched_path": {
              "target_path": "/test/test_owner/some/path"
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
              "path": "/test/test_owner/some/path"
            }
          });
        })
      })
    })

    describe('ain_evalRule', () => {
      it('returns true', () => {
        const ref = "/test/test_rule/some/path";
        const value = "value";
        const address = "abcd";
        const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_evalRule', request)
        .then(res => {
          expect(res.result.result).to.equal(true);
        })
      })

      it('returns false', () => {
        const ref = "/test/test_rule/some/path";
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
        const ref = "/test/test_owner/some/path";
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
        const ownersBody = parseOrLog(syncRequest('GET', server1 + `/get_state_proof?ref=/owners`)
            .body.toString('utf-8'));
        const rulesBody = parseOrLog(syncRequest('GET', server1 + `/get_state_proof?ref=/rules`)
            .body.toString('utf-8'));
        const valuesBody = parseOrLog(syncRequest('GET', server1 + `/get_state_proof?ref=/values`)
            .body.toString('utf-8'));
        const functionsBody = parseOrLog(syncRequest(
            'GET', server1 + `/get_state_proof?ref=/functions`)
            .body.toString('utf-8'));
        const ownersProof = ownersBody.result.owners[ProofProperties.PROOF_HASH];
        const rulesProof = rulesBody.result.rules[ProofProperties.PROOF_HASH];
        const valuesProof = valuesBody.result.values[ProofProperties.PROOF_HASH];
        const functionProof = functionsBody.result.functions[ProofProperties.PROOF_HASH];
        const preimage = `owners${HASH_DELIMITER}${ownersProof}${HASH_DELIMITER}` +
            `rules${HASH_DELIMITER}${rulesProof}${HASH_DELIMITER}` +
            `values${HASH_DELIMITER}${valuesProof}${HASH_DELIMITER}` +
            `functions${HASH_DELIMITER}${functionProof}`;
        const proofHash = ChainUtil.hashString(ChainUtil.toString(preimage));

        const ref = '/';
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_getStateProof', request)
        .then(res => {
          assert.deepEqual(res.result.result, { '.proof_hash': proofHash });
        })
      })
    })

    describe('ain_getStateInfo', () => {
      it('returns correct value', () => {
        const ref = '/values/test/test_state_info/some/path';
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        return jayson.client.http(server1 + '/json-rpc').request('ain_getStateInfo', request)
        .then(res => {
          assert.deepEqual(res.result.result, { tree_height: 2, tree_size: 5 });
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
    })

    afterEach(async () => {
      await cleanUp();
    })

    describe('/set_value', async () => {
      it('set_value', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, 100);

        const request = {
          ref: 'test/test_value/some/path',
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
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value");
      })

      it('set_value with timestamp', async () => {
        const request = {
          ref: 'test/test_value/some/path',
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
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value with timestamp");
      })

      it('set_value with nonce unordered (-1)', async () => {
        const request = {
          ref: 'test/test_value/some/path',
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
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value with nonce unordered");
      })

      it('set_value with numbered nonce', async () => {
        const nonce = parseOrLog(
            syncRequest('GET', server1 + '/get_nonce').body.toString('utf-8')).result;
        const request = {
          ref: 'test/test_value/some/path',
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
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value with numbered nonce");
      })

      it('set_value with failing operation', () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: 'some/wrong/path', value: "some other value"};
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: request})
          .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 103,
          "error_message": "No .write permission on: some/wrong/path",
          "gas_amount": 0,
          "gas_amount_total": {
            "app": {},
            "service": 0
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(1);

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/inc_value', () => {
      it('inc_value', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "test/test_value/some/path2", value: 10};
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
            'GET', server1 + '/get_value?ref=test/test_value/some/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, 10);
      })

      it('inc_value with a failing operation', () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "some/wrong/path2", value: 10};
        const body = parseOrLog(syncRequest('POST', server1 + '/inc_value', {json: request})
          .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 103,
          "error_message": "No .write permission on: some/wrong/path2",
          "gas_amount": 0,
          "gas_amount_total": {
            "app": {},
            "service": 0
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(1);

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/dec_value', () => {
      it('dec_value', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "test/test_value/some/path3", value: 10};
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
            'GET', server1 + '/get_value?ref=test/test_value/some/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, -10);
      })

      it('dec_value with a failing operation', () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "some/wrong/path3", value: 10};
        const body = parseOrLog(syncRequest('POST', server1 + '/dec_value', {json: request})
          .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 103,
          "error_message": "No .write permission on: some/wrong/path3",
          "gas_amount": 0,
          "gas_amount_total": {
            "app": {},
            "service": 0
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(1);

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/set_function', () => {
      it('set_function', async () => {
        // Check the original function.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=test/test_function/some/path')
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
          ref: "/test/test_function/some/path",
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
            'GET', server1 + '/get_function?ref=test/test_function/some/path')
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

      it('set_function with a failing operation', () => {
        // Check the original function.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          ref: "/some/wrong/path",
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
          "code": 404,
          "error_message": "No write_function permission on: /some/wrong/path",
          "gas_amount": 0,
          "gas_amount_total": {
            "app": {},
            "service": 0
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(1);

        // Confirm that the original function is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/set_rule', () => {
      it('set_rule', async () => {
        // Check the original rule.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_rule?ref=test/test_rule/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, {
          ".write": "auth.addr === 'abcd'"
        });

        const request = {
          ref: "/test/test_rule/some/path",
          value: {
            ".write": "some other rule config"
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
            'GET', server1 + '/get_rule?ref=test/test_rule/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, {
          ".write": "some other rule config"
        });
      })

      it('set_rule with a failing operation', () => {
        // Check the original rule.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_rule?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          ref: "/some/wrong/path",
          value: {
            ".write": "some other rule config"
          }
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 503,
          "error_message": "No write_rule permission on: /some/wrong/path",
          "gas_amount": 0,
          "gas_amount_total": {
            "app": {},
            "service": 0
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(1);

        // Confirm that the original rule is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_rule?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/set_owner', () => {
      it('set_owner', async () => {
        // Check the original owner.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=test/test_owner/some/path')
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
          ref: "/test/test_owner/some/path",
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
            'GET', server1 + '/get_owner?ref=test/test_owner/some/path')
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

      it('set_owner with a failing operation', () => {
        // Check the original owner.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          ref: "/some/wrong/path",
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
          "code": 603,
          "error_message": "No write_owner or branch_owner permission on: /some/wrong/path",
          "gas_amount": 0,
          "gas_amount_total": {
            "app": {},
            "service": 0
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(1);

        // Confirm that the original owner is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/set', () => {
      it('set with successful operations', async () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some100/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          op_list: [
            {
              // Default type: SET_VALUE
              ref: "test/test_value/some100/path",
              value: "some other100 value",
            },
            {
              type: 'INC_VALUE',
              ref: "test/test_value/some100/path1",
              value: 10
            },
            {
              type: 'DEC_VALUE',
              ref: "test/test_value/some100/path2",
              value: 10
            },
            {
              type: 'SET_FUNCTION',
              ref: "/test/test_function/other100/path",
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
              ref: "/test/test_rule/other100/path",
              value: {
                ".write": "some other100 rule config"
              }
            },
            {
              type: 'SET_OWNER',
              ref: "/test/test_owner/other100/path",
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
          "result_list": [
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
          ],
          "gas_amount_total": {
            "service": 6,
            "app": {}
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
            'GET', server1 + '/get_value?ref=test/test_value/some100/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, 'some other100 value');
      })

      it('set with a failing operation', () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some101/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {
          op_list: [
            {
              // Default type: SET_VALUE
              ref: "test/test_value/some101/path",
              value: "some other101 value",
            },
            {
              type: 'INC_VALUE',
              ref: "test/test_value/some101/path2",
              value: 10
            },
            {
              type: 'DEC_VALUE',
              ref: "test/test_value/some101/path3",
              value: 10
            },
            {
              type: 'SET_VALUE',
              ref: "some/wrong/path",
              value: "some other101 value",
            },
            {
              type: 'SET_FUNCTION',
              ref: "/test/test_function/other101/path",
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
              ref: "/test/test_rule/other101/path",
              value: {
                ".write": "some other101 rule config"
              }
            },
            {
              type: 'SET_OWNER',
              ref: "/test/test_owner/other101/path",
              value: {
                ".owner": "some other101 owner config"
              }
            }
          ]
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set', {json: request})
            .body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "result_list": [
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 103,
              "error_message": "No .write permission on: some/wrong/path",
              "gas_amount": 0
            }
          ],
          "gas_amount_total": {
            "app": {},
            "service": 3
          },
          "gas_cost_total": 0
        });
        expect(body.code).to.equal(1);

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some101/path')
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
            'GET', server1 + '/get_value?ref=test/test_value/some200/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);
        const resultBefore2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some201/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore2, null);

        const nonce = parseOrLog(syncRequest(
            'GET', server1 + `/get_nonce?address=${address}`).body.toString('utf-8')).result;
        const request = {
          tx_list: [
            {
              operation: {
                // Default type: SET_VALUE
                ref: "test/test_value/some200/path",
                value: "some other200 value",
              },
              timestamp: Date.now(),
              nonce: nonce
            },
            {
              operation: {
                type: 'INC_VALUE',
                ref: "test/test_value/some200/path2",
                value: 10
              },
              timestamp: Date.now(),
              nonce: nonce + 1
            },
            {
              operation: {
                type: 'DEC_VALUE',
                ref: "test/test_value/some200/path3",
                value: 10
              },
              timestamp: Date.now(),
              nonce: nonce + 2
            },
            {
              operation: {
                type: 'SET_FUNCTION',
                ref: "/test/test_function/other200/path",
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
                ref: "/test/test_rule/other200/path",
                value: {
                  ".write": "some other200 rule config"
                }
              },
              timestamp: Date.now(),
              nonce: nonce + 4
            },
            {
              operation: {
                type: 'SET_OWNER',
                ref: "/test/test_owner/other200/path",
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
                    ref: "test/test_value/some201/path",
                    value: "some other201 value",
                  },
                  {
                    type: 'INC_VALUE',
                    ref: "test/test_value/some201/path2",
                    value: 5
                  },
                  {
                    type: 'DEC_VALUE',
                    ref: "test/test_value/some201/path3",
                    value: 5
                  },
                  {
                    type: 'SET_FUNCTION',
                    ref: "/test/test_function/other201/path",
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
                    ref: "/test/test_rule/other201/path",
                    value: {
                      ".write": "some other201 rule config"
                    }
                  },
                  {
                    type: 'SET_OWNER',
                    ref: "/test/test_owner/other201/path",
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
        expect(ChainUtil.isArray(body.result)).to.equal(true);
        for (let i = 0; i < body.result.length; i++) {
          const result = body.result[i];
          result.tx_hash = 'erased';
        }
        assert.deepEqual(body.result, [
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0,
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "result_list": [
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                }
              ],
              "gas_amount_total": {
                "app": {},
                "service": 6
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          }
        ]);
        expect(body.code).to.equal(0);

        // Confirm that the value is set properly.
        await ChainUtil.sleep(6);
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some200/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, 'some other200 value');
        const resultAfter2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some201/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter2, 'some other201 value');
      });

      it('batch with a failing transaction', async () => {
        const address = parseOrLog(syncRequest(
            'GET', server1 + '/get_address').body.toString('utf-8')).result;
        // Check the original values.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some202/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);
        const resultBefore2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some203/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore2, null);
        const nonce = parseOrLog(syncRequest(
            'GET', server1 + `/get_nonce?address=${address}`).body.toString('utf-8')).result;

        const request = {
          tx_list: [
            {
              operation: {
                // Default type: SET_VALUE
                ref: "test/test_value/some202/path",
                value: "some other202 value",
              },
              timestamp: Date.now(),
              nonce: nonce
            },
            {
              operation: {
                type: 'INC_VALUE',
                ref: "test/test_value/some202/path2",
                value: 10
              },
              timestamp: Date.now(),
              nonce: nonce + 1
            },
            {
              operation: {
                type: 'DEC_VALUE',
                ref: "test/test_value/some202/path3",
                value: 10
              },
              timestamp: Date.now(),
              nonce: nonce + 2
            },
            {
              operation: {
                type: 'SET_VALUE',
                ref: "some/wrong/path",
                value: "some other202 value",
              },
              timestamp: Date.now(),
              nonce: nonce + 3
            },
            {
              operation: {
                type: 'SET_FUNCTION',
                ref: "/test/test_function/other202/path",
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
                ref: "/test/test_rule/other202/path",
                value: {
                  ".write": "some other202 rule config"
                }
              },
              timestamp: Date.now(),
              nonce: nonce + 4
            },
            {
              operation: {
                type: 'SET_OWNER',
                ref: "/test/test_owner/other202/path",
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
                    ref: "test/test_value/some203/path",
                    value: "some other203 value",
                  },
                  {
                    type: 'INC_VALUE',
                    ref: "test/test_value/some203/path2",
                    value: 5
                  },
                  {
                    type: 'DEC_VALUE',
                    ref: "test/test_value/some203/path3",
                    value: 5
                  },
                  {
                    type: 'SET_FUNCTION',
                    ref: "/test/test_function/other203/path",
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
                    ref: "/test/test_rule/other203/path",
                    value: {
                      ".write": "some other203 rule config"
                    }
                  },
                  {
                    type: 'SET_OWNER',
                    ref: "/test/test_owner/other203/path",
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
        expect(ChainUtil.isArray(body.result)).to.equal(true);
        for (let i = 0; i < body.result.length; i++) {
          const result = body.result[i];
          result.tx_hash = 'erased';
        }
        assert.deepEqual(body.result, [
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 103,
              "error_message": "No .write permission on: some/wrong/path",
              "gas_amount": 0,
              "gas_amount_total": {
                "app": {},
                "service": 0
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1
              },
              "gas_cost_total": 0
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "result_list": [
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                },
                {
                  "code": 0,
                  "gas_amount": 1
                }
              ],
              "gas_amount_total": {
                "app": {},
                "service": 6
              },
              "gas_cost_total": 0,
            },
            "tx_hash": "erased"
          }
        ]);
        expect(body.code).to.equal(0);

        // Confirm that the value is set properly.
        await ChainUtil.sleep(6);
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some202/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, 'some other202 value');
        const resultAfter2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some203/path')
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

      it('accepts a transaction with nonce unordered (-1)', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value',
            ref: `test/test_value/some/path`
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
                gas_amount: 1,
                gas_amount_total: {
                  service: 1,
                  app: {}
                },
                gas_cost_total: 0
              },
              tx_hash: ChainUtil.hashSignature(signature),
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
              ref: `test/test_value/some/path`
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
                  gas_amount: 1,
                  gas_amount_total: {
                    service: 1,
                    app: {}
                  },
                  gas_cost_total: 0,
                },
                tx_hash: ChainUtil.hashSignature(signature),
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
            ref: `test/test_long_text`
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
            ref: `test/test_value/some/path`
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
            ref: `test/test_value/some/path`
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
            ref: "test/test_value/some400/path",
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
            ref: "test/test_value/some400/path2",
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
              ref: "test/test_value/some300/path",
              value: "some other300 value",
            },
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'INC_VALUE',
              ref: "test/test_value/some300/path2",
              value: 10
            },
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'DEC_VALUE',
              ref: "test/test_value/some300/path3",
              value: 10
            },
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'SET_FUNCTION',
              ref: "/test/test_function/other300/path",
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
              ref: "/test/test_rule/other300/path",
              value: {
                ".write": "some other300 rule config"
              }
            },
            timestamp: Date.now(),
            nonce: -1
          },
          {
            operation: {
              type: 'SET_OWNER',
              ref: "/test/test_owner/other300/path",
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
                  ref: "test/test_value/some301/path",
                  value: "some other301 value",
                },
                {
                  type: 'INC_VALUE',
                  ref: "test/test_value/some301/path2",
                  value: 5
                },
                {
                  type: 'DEC_VALUE',
                  ref: "test/test_value/some301/path3",
                  value: 5
                },
                {
                  type: 'SET_FUNCTION',
                  ref: "/test/test_function/other301/path",
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
                  ref: "/test/test_rule/other301/path",
                  value: {
                    ".write": "some other301 rule config"
                  }
                },
                {
                  type: 'SET_OWNER',
                  ref: "/test/test_owner/other301/path",
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
          expect(ChainUtil.isArray(resultList)).to.equal(true);
          for (let i = 0; i < resultList.length; i++) {
            expect(ChainUtil.isFailedTx(resultList[i].result)).to.equal(false);
          }
        })
      })

      it('rejects a batch transaction of invalid batch transaction format.', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            value: 'some other value',
            ref: `test/test_value/some/path`
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
            ref: `test/test_value/some/path`
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
          expect(ChainUtil.isArray(resultList)).to.equal(true);
          expect(resultList.length).to.equal(BATCH_TX_LIST_SIZE_LIMIT);
          for (let i = 0; i < resultList.length; i++) {
            expect(ChainUtil.isFailedTx(resultList[i].result)).to.equal(false);
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
            ref: `test/test_value/some/path`
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
            ref: `test/test_value/some/path`
          },
          nonce: -1
        };

        const txList1 = [];
        // Not over the limit.
        for (let i = 0; i < TX_POOL_SIZE_LIMIT_PER_ACCOUNT; i++) {
          const txBody = JSON.parse(JSON.stringify(txBodyTemplate));
          txBody.timestamp = timestamp + i;
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
        expect(ChainUtil.isArray(resultList1)).to.equal(true);
        for (let i = 0; i < resultList1.length; i++) {
          expect(ChainUtil.isFailedTx(resultList1[i].result)).to.equal(false);
        }

        const txList2 = [];
        // Just over the limit.
        for (let i = 0; i < 1; i++) {
          const txBody = JSON.parse(JSON.stringify(txBodyTemplate));
          txBody.timestamp = timestamp + TX_POOL_SIZE_LIMIT_PER_ACCOUNT + i;
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          txList2.push({
            tx_body: txBody,
            signature,
          });
        }
        const res2 = await client.request('ain_sendSignedTransactionBatch', {
          tx_list: txList2,
          protoVer: CURRENT_PROTOCOL_VERSION
        });
        const resultList2 = _.get(res2, 'result.result', null);
        // Rejects transactions.
        expect(ChainUtil.isArray(resultList2)).to.equal(true);
        expect(resultList2.length).to.equal(1);
        resultList2[0].tx_hash = 'erased';
        assert.deepEqual(resultList2, [
          {
            "result": {
              "code": 4,
              "error_message": "[executeTransactionAndAddToPool] Tx pool does NOT have enough room (50) for account: 0x85a620A5A46d01cc1fCF49E73ab00710d4da943E",
              "gas_amount": 0
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
            ref: `test/test_long_text`,
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
          expect(ChainUtil.isArray(resultList)).to.equal(false);
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
            ref: `test/test_value/some/path`
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
            ref: `test/test_value/some/path`
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
    })
  })

  describe('Function triggering', () => {
    const setFunctionWithOwnerOnlyPath = '/test/test_function_triggering/owner_only';
    const saveLastTxAllowedPath = '/test/test_function_triggering/allowed_path_with_fid';
    const saveLastTxNotAllowedPath = '/test/test_function_triggering/not_allowed_path_with_fid';
    const saveLastTxAllowedPathWithFids = '/test/test_function_triggering/allowed_path_with_fids';
    const saveLastTxNotAllowedPathWithFids = '/test/test_function_triggering/not_allowed_path_with_fids';
    const setOwnerConfigAllowedPath = '/test/test_function_triggering/set_owner_allowed_path_with_fid';
    const setOwnerConfigNotAllowedPath = '/test/test_function_triggering/set_owner_not_allowed_path_with_fid';
    const triggerRestFunctionPath = '/test/test_function_triggering/rest_function_path';

    let transferFrom; // = server1
    let transferTo; // = server2
    const transferAmount = 33;
    let transferPath;
    let transferFromBalancePath;
    let transferToBalancePath;

    let serviceAdmin; // = server1
    let serviceUser; // = server2
    let serviceUserBad;     // = server3
    const stakeAmount = 50;
    let stakingServiceAccountBalancePath;
    let stakePath;
    let unstakePath;
    let serviceUserBalancePath;

    let triggerTransferToIndividualAccountPath1;
    let triggerTransferToIndividualAccountPath2;
    let triggerTransferToServiceAccountPath1;
    let triggerTransferToServiceAccountPath2;

    before(() => {
      transferFrom = parseOrLog(
          syncRequest('GET', server1 + '/get_address').body.toString('utf-8')).result;
      transferTo =
          parseOrLog(syncRequest('GET', server2 + '/get_address').body.toString('utf-8')).result;
      transferPath = `/transfer/${transferFrom}/${transferTo}`;
      transferFromBalancePath = `/accounts/${transferFrom}/balance`;
      transferToBalancePath = `/accounts/${transferTo}/balance`;

      serviceAdmin =
          parseOrLog(syncRequest('GET', server1 + '/get_address').body.toString('utf-8')).result;
      serviceUser =
          parseOrLog(syncRequest('GET', server2 + '/get_address').body.toString('utf-8')).result;
      serviceUserBad =
          parseOrLog(syncRequest('GET', server3 + '/get_address').body.toString('utf-8')).result;
      stakingServiceAccountBalancePath = `/service_accounts/staking/test_service_staking/${serviceUser}|0/balance`;
      stakePath = `/staking/test_service_staking/${serviceUser}/0/stake`;
      unstakePath = `/staking/test_service_staking/${serviceUser}/0/unstake`;
      serviceUserBalancePath = `/accounts/${serviceUser}/balance`;

      triggerTransferToIndividualAccountPath1 =
          `/transfer/${serviceUser}/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/0/value`;
      triggerTransferToIndividualAccountPath2 =
          `/transfer/${serviceUser}/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/1/value`;
      triggerTransferToServiceAccountPath1 =
          `/staking/test_service_gas_fee/${serviceUser}/0/stake/100/value`;
      triggerTransferToServiceAccountPath2 =
          `/staking/test_service_gas_fee/${serviceUser}/0/stake/101/value`;
    })

    beforeEach(async () => {
      const res = parseOrLog(syncRequest('POST', server2 + '/set', {
        json: {
          op_list: [
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/allowed_path_with_fid/value',
              value: {
                ".function": {
                  "_saveLastTx": {
                    "function_type": "NATIVE",
                    "function_id": "_saveLastTx"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/allowed_path_with_fid/value',
              value: {
                ".write": true,
              }
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/allowed_path_with_fid/.last_tx/value',
              value: {
                ".write": "auth.fid === '_saveLastTx'",
              }
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/not_allowed_path_with_fid/value',
              value: {
                ".function": {
                  "_saveLastTx": {
                    "function_type": "NATIVE",
                    "function_id": "_saveLastTx"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/not_allowed_path_with_fid/value',
              value: {
                ".write": true,
              }
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/not_allowed_path_with_fid/.last_tx/value',
              value: {
                ".write": "auth.fid === 'some function id'",
              }
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/allowed_path_with_fids/value',
              value: {
                ".function": {
                  "_saveLastTx": {
                    "function_type": "NATIVE",
                    "function_id": "_saveLastTx"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/allowed_path_with_fids/value',
              value: {
                ".write": true,
              }
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/allowed_path_with_fids/.last_tx/value',
              value: {
                ".write": "util.includes(auth.fids, '_saveLastTx')",
              }
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/not_allowed_path_with_fids/value',
              value: {
                ".function": {
                  "_saveLastTx": {
                    "function_type": "NATIVE",
                    "function_id": "_saveLastTx"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/not_allowed_path_with_fids/value',
              value: {
                ".write": true,
              }
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/not_allowed_path_with_fids/.last_tx/value',
              value: {
                ".write": "util.includes(auth.fids, 'some function id')",
              }
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/set_owner_allowed_path_with_fid/value',
              value: {
                ".function": {
                  "_setOwnerConfig": {
                    "function_type": "NATIVE",
                    "function_id": "_setOwnerConfig"
                  }
                }
              }
            },
            {
              type: 'SET_OWNER',
              ref: '/test/test_function_triggering/set_owner_allowed_path_with_fid',
              value: {
                ".owner": {
                  "owners": {
                    "fid:_setOwnerConfig": {
                      "branch_owner": true,  // allow branching
                      "write_function": false,
                      "write_owner": false,
                      "write_rule": false,
                    },
                    "*": {
                      "branch_owner": false,  // not allow branching
                      "write_function": true,
                      "write_owner": true,
                      "write_rule": true,
                    }
                  }
                }
              }
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/set_owner_not_allowed_path_with_fid/value',
              value: {
                ".function": {
                  "_setOwnerConfig": {
                    "function_type": "NATIVE",
                    "function_id": "_setOwnerConfig"
                  }
                }
              }
            },
            {
              type: 'SET_OWNER',
              ref: '/test/test_function_triggering/set_owner_not_allowed_path_with_fid',
              value: {
                ".owner": {
                  "owners": {
                    "fid:_setOwnerConfig": {
                      "branch_owner": false,  // not allow branching
                      "write_function": false,
                      "write_owner": false,
                      "write_rule": false,
                    },
                    "*": {
                      "branch_owner": false,  // not allow branching
                      "write_function": true,
                      "write_owner": true,
                      "write_rule": true,
                    }
                  }
                }
              }
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/rest_function_path',
              value: {
                ".function": {
                  "0x11111": {
                    "function_type": "REST",
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "service_name": "https://ainetwork.ai",
                    "function_id": "0x11111"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/rest_function_path',
              value: {
                ".write": true,
              }
            },
          ],
          nonce: -1,
        }
      }).body.toString('utf-8')).result;
      assert.deepEqual(ChainUtil.isFailedTx(_.get(res, 'result')), false);
      if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
        console.error(`Failed to check finalization of function triggering setup tx.`);
      }
    })

    afterEach(async () => {
      const res = parseOrLog(syncRequest('POST', server2 + '/set', {
        json: {
          op_list: [
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/allowed_path_with_fid/value',
              value: null
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/allowed_path_with_fid/value',
              value: null
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/not_allowed_path_with_fid/value',
              value: null
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/not_allowed_path_with_fid/value',
              value: null
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/allowed_path_with_fids/value',
              value: null
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/allowed_path_with_fids/value',
              value: null
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/not_allowed_path_with_fids/value',
              value: null
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/not_allowed_path_with_fids/value',
              value: null
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/set_owner_allowed_path_with_fid/value',
              value: null
            },
            {
              type: 'SET_OWNER',
              ref: '/test/test_function_triggering/set_owner_allowed_path_with_fid',
              value: null
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/set_owner_not_allowed_path_with_fid/value',
              value: null
            },
            {
              type: 'SET_OWNER',
              ref: '/test/test_function_triggering/set_owner_not_allowed_path_with_fid',
              value: null
            },
            {
              type: 'SET_FUNCTION',
              ref: '/test/test_function_triggering/rest_function_path',
              value: null,
            },
            {
              type: 'SET_RULE',
              ref: '/test/test_function_triggering/rest_function_path',
              value: null,
            },
          ],
          nonce: -1,
        }
      }).body.toString('utf-8')).result;
      assert.deepEqual(ChainUtil.isFailedTx(_.get(res, 'result')), false);
      if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
        console.error(`Failed to check finalization of function triggering cleanup tx.`);
      }
    })

    describe('Function permission', () => {
      describe('Owner only', async () => {
        beforeEach(async () => {
          const res = parseOrLog(syncRequest('POST', server2 + '/set_function', {
            json: {
              ref: setFunctionWithOwnerOnlyPath,
              value: null,
              timestamp: Date.now(),
              nonce: -1,
            }
          }).body.toString('utf-8')).result;
          assert.deepEqual(_.get(res, 'result.code'), 0);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of owner only cleanup tx.`);
          }
        })

        it('owner only: set_function with ownerOnly = false (_saveLastTx)', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_function', {json: {
            ref: setFunctionWithOwnerOnlyPath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            },
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const resp = parseOrLog(syncRequest('GET',
              server2 + `/get_function?ref=${setFunctionWithOwnerOnlyPath}`)
            .body.toString('utf-8')).result
          // Should not be null.
          expect(resp).to.not.equal(null);
        });

        it('owner only: set_function with ownerOnly = true (_transfer)', () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_function', {json: {
            ref: setFunctionWithOwnerOnlyPath,
            value: {
              ".function": {
                "_transfer": {
                  "function_type": "NATIVE",
                  "function_id": "_transfer"
                }
              }
            },
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 403,
            "error_message": "Trying to write owner-only function: _transfer",
            "gas_amount": 0,
            "gas_amount_total": {
              "service": 0,
              "app": {}
            },
            "gas_cost_total": 0,
          })
          const resp = parseOrLog(syncRequest('GET',
              server2 + `/get_function?ref=${setFunctionWithOwnerOnlyPath}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(resp).to.equal(null);
        });
      });

      describe('Write rule: auth.fid', () => {
        it('write rule: auth.fid: without function permission', () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxNotAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_saveLastTx": {
                "code": "FAILURE",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/not_allowed_path_with_fid/.last_tx/value",
                    "result": {
                      "code": 103,
                      "error_message": "No .write permission on: /test/test_function_triggering/not_allowed_path_with_fid/.last_tx/value",
                      "gas_amount": 0,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 1
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 1);
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxNotAllowedPath + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(_.get(lastTx, 'tx_hash', null)).to.equal(null);
        });

        it('write rule: auth.fid: with function permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_saveLastTx": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/allowed_path_with_fid/.last_tx/value",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 2
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxAllowedPath + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be the tx hash value.
          assert.deepEqual(_.get(lastTx, 'tx_hash', null), body.result.tx_hash);
        });
      });

      describe('Write rule: auth.fids', () => {
        it('write rule: auth.fids: without function permission', () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxNotAllowedPathWithFids + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_saveLastTx": {
                "code": "FAILURE",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/not_allowed_path_with_fids/.last_tx/value",
                    "result": {
                      "code": 103,
                      "error_message": "No .write permission on: /test/test_function_triggering/not_allowed_path_with_fids/.last_tx/value",
                      "gas_amount": 0,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 1
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 1);
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxNotAllowedPathWithFids + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(_.get(lastTx, 'tx_hash', null)).to.equal(null);
        });

        it('write rule: auth.fids: with function permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxAllowedPathWithFids + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_saveLastTx": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/allowed_path_with_fids/.last_tx/value",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 2
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxAllowedPathWithFids + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be the tx hash value.
          assert.deepEqual(_.get(lastTx, 'tx_hash', null), body.result.tx_hash);
        });
      });

      describe('Owner rule: auth.fid', () => {
        it('owner rule: auth.fid: without function permission', () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: setOwnerConfigNotAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_setOwnerConfig": {
                "code": "FAILURE",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/set_owner_not_allowed_path_with_fid/value",
                    "result": {
                      "code": 603,
                      "error_message": "No write_owner or branch_owner permission on: /test/test_function_triggering/set_owner_not_allowed_path_with_fid/value",
                      "gas_amount": 0,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 1
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 1);
          const ownerConfig = parseOrLog(syncRequest('GET',
              server2 + `/get_owner?ref=${setOwnerConfigNotAllowedPath + '/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(ownerConfig).to.equal(null);
        });

        it('owner rule: auth.fid: with function permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: setOwnerConfigAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_setOwnerConfig": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/set_owner_allowed_path_with_fid/value",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 2
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const ownerConfig = parseOrLog(syncRequest('GET',
              server2 + `/get_owner?ref=${setOwnerConfigAllowedPath + '/value'}`)
            .body.toString('utf-8')).result
          // Should be not null.
          expect(ownerConfig).to.not.equal(null);
        });
      });
    });

    describe('Function execution', () => {
      describe('/set_value', () => {
        it("when successful with function triggering", async () => {
          const valuePath = '/test/test_function_triggering/allowed_path1/value';
          const functionResultPath = '/test/test_function_triggering/allowed_path1/.last_tx/value';
          const value = 'some value';
          const timestamp = 1234567890000;

          // Config
          const res = parseOrLog(syncRequest('POST', server2 + '/set', { json: {
            op_list: [
              {
                type: 'SET_FUNCTION',
                ref: valuePath,
                value: {
                  ".function": {
                    "_saveLastTx": {
                      "function_type": "NATIVE",
                      "function_id": "_saveLastTx"
                    }
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: valuePath,
                value: {
                  ".write": true,
                }
              },
              {
                type: 'SET_RULE',
                ref: functionResultPath,
                value: {
                  ".write": true,  // Allow all.
                }
              },
              {
                type: 'SET_FUNCTION',
                ref: functionResultPath,
                value: {
                  ".function": {
                    "_eraseValue": {
                      "function_type": "NATIVE",
                      "function_id": "_eraseValue"
                    }
                  }
                }
              },
            ],
            nonce: -1,
          }}).body.toString('utf-8')).result;
          assert.deepEqual(ChainUtil.isFailedTx(_.get(res, 'result')), false);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of function triggering setup tx.`);
          }

          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: valuePath,
            value,
            gas_price: 1,
            nonce: -1,
            timestamp,
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 0);  // Should succeed.
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // Confirm that the value change is committed.
          assert.deepEqual(parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result, value);
        });

        it("when failed with function triggering", async () => {
          const valuePath = '/test/test_function_triggering/allowed_path2/value';
          const functionResultPath = '/test/test_function_triggering/allowed_path2/.last_tx/value';
          const value = 'some value';
          const timestamp = 1234567890000 + 1;
          let valueBefore = null;
          let valueAfter = null;

          // Config
          const res = parseOrLog(syncRequest('POST', server2 + '/set', { json: {
            op_list: [
              {
                type: 'SET_FUNCTION',
                ref: valuePath,
                value: {
                  ".function": {
                    "_saveLastTx": {
                      "function_type": "NATIVE",
                      "function_id": "_saveLastTx"
                    }
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: valuePath,
                value: {
                  ".write": true,
                }
              },
              {
                type: 'SET_RULE',
                ref: functionResultPath,
                value: {
                  ".write": "auth.fid !== '_eraseValue'",  // Do NOT allow writes by the last function.
                }
              },
              {
                type: 'SET_FUNCTION',
                ref: functionResultPath,
                value: {
                  ".function": {
                    "_eraseValue": {
                      "function_type": "NATIVE",
                      "function_id": "_eraseValue"
                    }
                  }
                }
              },
            ],
            nonce: -1,
          }}).body.toString('utf-8')).result;
          assert.deepEqual(ChainUtil.isFailedTx(_.get(res, 'result')), false);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of function triggering setup tx.`);
          }

          valueBefore = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result;

          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: valuePath,
            value,
            gas_price: 1,
            nonce: -1,
            timestamp,
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 1);  // Should fail.
          // Confirm that the value change is undone.
          valueAfter = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result;
          assert.deepEqual(valueAfter, valueBefore);
        });
      });

      describe('/set', () => {
        it("when successful with function triggering", async () => {
          const valuePath = '/test/test_function_triggering/allowed_path101/value';
          const functionResultPath = '/test/test_function_triggering/allowed_path101/.last_tx/value';
          const value = 'some value';
          const timestamp = 1234567890000;

          // Config
          const res = parseOrLog(syncRequest('POST', server2 + '/set', { json: {
            op_list: [
              {
                type: 'SET_FUNCTION',
                ref: valuePath,
                value: {
                  ".function": {
                    "_saveLastTx": {
                      "function_type": "NATIVE",
                      "function_id": "_saveLastTx"
                    }
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: valuePath,
                value: {
                  ".write": true,
                }
              },
              {
                type: 'SET_RULE',
                ref: functionResultPath,
                value: {
                  ".write": true,  // Allow all.
                }
              },
              {
                type: 'SET_FUNCTION',
                ref: functionResultPath,
                value: {
                  ".function": {
                    "_eraseValue": {
                      "function_type": "NATIVE",
                      "function_id": "_eraseValue"
                    }
                  }
                }
              },
            ],
            nonce: -1,
          }}).body.toString('utf-8')).result;
          assert.deepEqual(ChainUtil.isFailedTx(_.get(res, 'result')), false);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of function triggering setup tx.`);
          }

          const body = parseOrLog(syncRequest('POST', server2 + '/set', {json: {
            op_list: [
              {
                ref: valuePath,
                value,
              },
              {
                // Default type: SET_VALUE
                ref: "test/nested/far/down101",
                value: {
                  "new": 12345
                },
              },
            ],
            gas_price: 1,
            nonce: -1,
            timestamp,
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 0);  // Should succeed.
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // Confirm that the value change is committed.
          assert.deepEqual(parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result, value);
        });

        it("when failed with function triggering", async () => {
          const valuePath = '/test/test_function_triggering/allowed_path102/value';
          const functionResultPath = '/test/test_function_triggering/allowed_path102/.last_tx/value';
          const value = 'some value';
          const timestamp = 1234567890000 + 1;
          let valueBefore = null;
          let valueAfter = null;

          const res = parseOrLog(syncRequest('POST', server2 + '/set', { json: {
            op_list: [
              {
                type: 'SET_FUNCTION',
                ref: valuePath,
                value: {
                  ".function": {
                    "_saveLastTx": {
                      "function_type": "NATIVE",
                      "function_id": "_saveLastTx"
                    }
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: valuePath,
                value: {
                  ".write": true,
                }
              },
              {
                type: 'SET_RULE',
                ref: functionResultPath,
                value: {
                  ".write": "auth.fid !== '_eraseValue'",  // Do NOT allow writes by the last function.
                }
              },
              {
                type: 'SET_FUNCTION',
                ref: functionResultPath,
                value: {
                  ".function": {
                    "_eraseValue": {
                      "function_type": "NATIVE",
                      "function_id": "_eraseValue"
                    }
                  }
                }
              },
            ],
            nonce: -1,
          }}).body.toString('utf-8')).result;
          assert.deepEqual(ChainUtil.isFailedTx(_.get(res, 'result')), false);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of function triggering setup tx.`);
          }

          valueBefore = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result;

          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            op_list: [
              {
                ref: valuePath,
                value,
              },
              {
                // Default type: SET_VALUE
                ref: "test/nested/far/down102",
                value: {
                  "new": 12345
                },
              },
            ],
            gas_price: 1,
            nonce: -1,
            timestamp,
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 1);  // Should fail.
          // Confirm that the value change is undone.
          valueAfter = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result;
          assert.deepEqual(valueAfter, valueBefore);
        });
      });
    });

    describe('App creation', () => {
      before(async () => {
        const appStakingPath =
            `/staking/test_service_create_app/${serviceAdmin}/0/stake/${Date.now()}/value`;
        const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: appStakingPath,
          value: 1
        }}).body.toString('utf-8')).result;
        if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when successful with valid app name", async () => {
        const manageAppPath = '/manage_app/test_service_create_app0/create/1';
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "result": {
            "code": 0,
            "func_results": {
              "_createApp": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/apps/test_service_create_app0",
                    "result": {
                      "code": 0,
                      "gas_amount": 1
                    }
                  },
                  {
                    "path": "/apps/test_service_create_app0",
                    "result": {
                      "code": 0,
                      "gas_amount": 1
                    }
                  },
                  {
                    "path": "/manage_app/test_service_create_app0/config",
                    "result": {
                      "code": 0,
                      "gas_amount": 1
                    }
                  },
                  {
                    "path": "/manage_app/test_service_create_app0/create/1/result",
                    "result": {
                      "code": 0,
                      "gas_amount": 1
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {
                "test_service_create_app0": 2
              },
              "service": 3
            },
            "gas_cost_total": 0
          },
          "tx_hash": "0x4e2a4bc009347bbaa1a14f1ddecb0f2b06d02d46326d33def7c346c613093079"
        });
      });

      it("when failed with invalid app name", async () => {
        const manageAppPath = '/manage_app/0test_service_create_app/create/1';
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "result": {
            "code": 0,
            "func_results": {
              "_createApp": {
                "code": "INVALID_SERVICE_NAME",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/manage_app/0test_service_create_app/create/1/result",
                    "result": {
                      "code": 0,
                      "gas_amount": 1
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 2
            },
            "gas_cost_total": 0
          },
          "tx_hash": "0x60f6a71fedc8bbe457680ff6cf2e24b5c2097718f226c4f40fb4f9849d52f7fa"
        });
      });
    });

    describe('Gas fee', () => {
      before(async () => {
        const appStakingPath =
            `/staking/test_service_gas_fee/${serviceAdmin}/0/stake/${Date.now()}/value`;
        const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: appStakingPath,
          value: 1
        }}).body.toString('utf-8')).result;
        if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const manageAppPath = '/manage_app/test_service_gas_fee/create/1';
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
          },
        }}).body.toString('utf-8')).result;
        if (!(await waitUntilTxFinalized(serverList, createAppRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("native function (_transfer) with individual account registration", () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerTransferToIndividualAccountPath1,
          value: 10,
          timestamp: 1234567890000,
          nonce: -1,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "func_results": {
            "_transfer": {
              "op_results": [
                {
                  "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/accounts/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/balance",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/0/result",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                }
              ],
              "code": "SUCCESS",
              "gas_amount": 1000
            }
          },
          "code": 0,
          "gas_amount": 1,
          "gas_amount_total": {
            "app": {},
            "service": 1004
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
      });

      it("native function (_transfer) without individual account registration", () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerTransferToIndividualAccountPath2,
          value: 10,
          timestamp: 1234567890000,
          nonce: -1,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "func_results": {
            "_transfer": {
              "op_results": [
                {
                  "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/accounts/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/balance",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/1/result",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                }
              ],
              "code": "SUCCESS",
              "gas_amount": 0
            }
          },
          "code": 0,
          "gas_amount": 1,
          "gas_amount_total": {
            "app": {},
            "service": 4
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
      });

      it("native function (_transfer) with service account registration", () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerTransferToServiceAccountPath1,
          value: 10,
          timestamp: 1234567890000,
          nonce: -1,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "func_results": {
            "_stake": {
              "op_results": [
                {
                  "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/staking|test_service_gas_fee|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/value",
                  "result": {
                    "func_results": {
                      "_transfer": {
                        "op_results": [
                          {
                            "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                            "result": {
                              "code": 0,
                              "gas_amount": 1
                            }
                          },
                          {
                            "path": "/service_accounts/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                            "result": {
                              "code": 0,
                              "gas_amount": 1
                            }
                          },
                          {
                            "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/staking|test_service_gas_fee|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/result",
                            "result": {
                              "code": 0,
                              "gas_amount": 1
                            }
                          }
                        ],
                        "code": "SUCCESS",
                        "gas_amount": 1000
                      }
                    },
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/expire_at",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/staking/test_service_gas_fee/balance_total",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/stake/100/result",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                }
              ],
              "code": "SUCCESS",
              "gas_amount": 0
            }
          },
          "code": 0,
          "gas_amount": 1,
          "gas_amount_total": {
            "app": {},
            "service": 1008
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
      });

      it("native function (_transfer) without service account registration", () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerTransferToServiceAccountPath2,
          value: 10,
          timestamp: 1234567890001,
          nonce: -1,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "func_results": {
            "_stake": {
              "op_results": [
                {
                  "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/staking|test_service_gas_fee|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890001/value",
                  "result": {
                    "func_results": {
                      "_transfer": {
                        "op_results": [
                          {
                            "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                            "result": {
                              "code": 0,
                              "gas_amount": 1
                            }
                          },
                          {
                            "path": "/service_accounts/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                            "result": {
                              "code": 0,
                              "gas_amount": 1
                            }
                          },
                          {
                            "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/staking|test_service_gas_fee|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890001/result",
                            "result": {
                              "code": 0,
                              "gas_amount": 1
                            }
                          }
                        ],
                        "code": "SUCCESS",
                        "gas_amount": 0
                      }
                    },
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/expire_at",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/staking/test_service_gas_fee/balance_total",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                },
                {
                  "path": "/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/stake/101/result",
                  "result": {
                    "code": 0,
                    "gas_amount": 1
                  }
                }
              ],
              "code": "SUCCESS",
              "gas_amount": 0
            }
          },
          "code": 0,
          "gas_amount": 1,
          "gas_amount_total": {
            "app": {},
            "service": 8
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
      });

      it("REST function with external RPC call", () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerRestFunctionPath,
          value: 'some value',
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "func_results": {
            "0x11111": {
              "code": "SUCCESS",
              "gas_amount": 10,
            }
          },
          "code": 0,
          "gas_amount": 1,
          "gas_amount_total": {
            "app": {},
            "service": 11
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
      });
    });

    describe('Transfer: _transfer', () => {
      it('transfer: transfer', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/1/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        assert.deepEqual(body.code, 0);
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const resultCode = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferPath}/1/result/code`)
          .body.toString('utf-8')).result
        expect(fromAfterBalance).to.equal(fromBeforeBalance - transferAmount);
        expect(toAfterBalance).to.equal(toBeforeBalance + transferAmount);
        expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
      });

      it('transfer: transfer more than account balance', () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/2/value',
          value: fromBeforeBalance + 1
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer: transfer by another address', () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server3 + '/set_value', {json: {
          ref: transferPath + '/3/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer: transfer with a duplicated key', () => {
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/1/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('transfer: transfer with same addresses', () => {
        const transferPathSameAddrs = `/transfer/${transferFrom}/${transferFrom}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathSameAddrs + '/4/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('transfer: transfer with non-checksum addreess', () => {
        const fromLowerCase = _.toLower(transferFrom);
        const transferPathFromLowerCase = `/transfer/${fromLowerCase}/${transferTo}`;
        const bodyFromLowerCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathFromLowerCase + '/101/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyFromLowerCase.code).to.equals(1);

        const toLowerCase = _.toLower(transferTo);
        const transferPathToLowerCase = `/transfer/${transferFrom}/${toLowerCase}`;
        const bodyToLowerCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathToLowerCase + '/102/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyToLowerCase.code).to.equals(1);

        const fromUpperCase = _.toLower(transferFrom);
        const transferPathFromUpperCase = `/transfer/${fromUpperCase}/${transferTo}`;
        const bodyFromUpperCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathFromUpperCase + '/103/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyFromUpperCase.code).to.equals(1);

        const toUpperCase = _.toLower(transferTo);
        const transferPathToUpperCase = `/transfer/${transferFrom}/${toUpperCase}`;
        const bodyToUpperCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathToUpperCase + '/104/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyToUpperCase.code).to.equals(1);
      });

      it('transfer: transfer with valid service account service type', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const transferToService = `staking|test_service|${transferTo}|0`;
        const transferToServiceBalancePath =
            `/service_accounts/staking/test_service/${transferTo}|0/balance`;
        const toServiceBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToServiceBalancePath}`)
            .body.toString('utf-8')).result || 0;
        const transferServicePath = `/transfer/${transferFrom}/${transferToService}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferServicePath + '/1/value',
          value: transferAmount,
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(body, {
          "code": 0,
          "result": {
            "result": {
              "code": 0,
              "func_results": {
                "_transfer": {
                  "code": "SUCCESS",
                  "gas_amount": 1000,
                  "op_results": [
                    {
                      "path": "/accounts/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/balance",
                      "result": {
                        "code": 0,
                        "gas_amount": 1
                      }
                    },
                    {
                      "path": "/service_accounts/staking/test_service/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                      "result": {
                        "code": 0,
                        "gas_amount": 1
                      }
                    },
                    {
                      "path": "/transfer/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/staking|test_service|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1/result",
                      "result": {
                        "code": 0,
                        "gas_amount": 1
                      }
                    }
                  ]
                }
              },
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 1004
              },
              "gas_cost_total": 0
            },
            "tx_hash": "0x62f01969d903d7a6f184279634249941a2c312e896f045c071afe78ac635fe96"
          }
        });
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toServiceAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToServiceBalancePath}`).body.toString('utf-8')).result;
        const resultCode = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferServicePath}/1/result/code`)
          .body.toString('utf-8')).result
        expect(fromAfterBalance).to.equal(fromBeforeBalance - transferAmount);
        expect(toServiceAfterBalance).to.equal(toServiceBeforeBalance + transferAmount);
        expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
      });

      it('transfer: transfer with invalid service account service type', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const transferToService = `invalid_service_type|test_service|${transferTo}|0`;
        const transferServicePath = `/transfer/${transferFrom}/${transferToService}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferServicePath + '/1/value',
          value: transferAmount,
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(body, {
          "code": 1,
          "result": {
            "result": {
              "code": 103,
              "error_message": "No .write permission on: /transfer/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/invalid_service_type|test_service|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1/value",
              "gas_amount": 0,
              "gas_amount_total": {
                "app": {},
                "service": 0
              },
              "gas_cost_total": 0
            },
            "tx_hash": "0x6cce46b284beb254c6b67205f5ba00f04c85028d7457410b4fa4b4d8522c14be"
          }
        });
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
      });
    })

    describe('Staking: _stake, _unstake', () => {
      before(async () => {
        const appStakingPath = `/staking/test_service_staking/${serviceAdmin}/0/stake/${Date.now()}/value`
        const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: appStakingPath,
          value: 1
        }}).body.toString('utf-8')).result;
        if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const manageAppPath = '/manage_app/test_service_staking/create/1'
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
            service: {
              staking: { lockup_duration: 1000 }
            }
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      })

      describe('Stake', () => {
        it('stake: stake', async () => {
          let beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/1/value',
            value: stakeAmount,
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_stake": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/staking|test_service_staking|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": "SUCCESS",
                          "gas_amount": 1000,
                          "op_results": [
                            {
                              "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/service_accounts/staking/test_service_staking/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/staking|test_service_staking|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/result",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            }
                          ]
                        }
                      },
                      "gas_amount": 1,
                    }
                  },
                  {
                    "path": "/staking/test_service_staking/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/expire_at",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  },
                  {
                    "path": "/staking/test_service_staking/balance_total",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  },
                  {
                    "path": "/staking/test_service_staking/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/stake/1/result",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 1008
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const stakeValue = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakePath}/1/value`).body.toString('utf-8')).result;
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const resultCode = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakePath}/1/result/code`)
            .body.toString('utf-8')).result;
          const stakingAppBalanceTotal = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/test_service_staking/balance_total`)
            .body.toString('utf-8')).result;
          expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
          expect(stakeValue).to.equal(stakeAmount);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance + stakeAmount);
          expect(afterBalance).to.equal(beforeBalance - stakeAmount);
          expect(stakingAppBalanceTotal).to.equal(stakeAmount + 1);
        });

        it('stake: stake more than account balance', () => {
          const beforeBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/2/value',
            value: beforeBalance + 1
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance);
          expect(afterBalance).to.equal(beforeBalance);
        });

        it('stake: stake by another address', () => {
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server3 + '/set_value', {json: {
            ref: `${stakePath}/3/value`,
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          const stakeRequest = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakePath}/3`).body.toString('utf-8')).result;
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          expect(stakeRequest).to.equal(null);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance);
        });

        it('stake: stake with invalid timestamp', async () => {
          const account = {
            "address": "0x07A43138CC760C85A5B1F115aa60eADEaa0bf417",
            "private_key": "0e9876c7e7966fb0237892eb2e890b4738d0e50adfcfe089ef31f5a1579d65cd",
            "public_key": "1cc01c94edce1d5807685dc04de0a0e445b560090eb421fc087f95080eb7a12a41145cc17cf4476a1d2ec0c1f737f5d84e5d0fecbfb370869845714e4ecfdd53"
          };
          const transferPath = `/transfer/${transferFrom}/${account.address}`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: transferPath + '/100/value',
            value: 1000
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              value: stakeAmount,
              ref: `/staking/test_service_staking/${account.address}/0/stake/1/value`
            },
            timestamp: Date.now() + 100000,
            nonce: 0
          }
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));

          const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
          return jsonRpcClient.request('ain_sendSignedTransaction', {
            tx_body: txBody,
            signature,
            protoVer: CURRENT_PROTOCOL_VERSION
          }).then(res => {
            assert.deepEqual(_.get(res, 'result.result.result'), {
              "code": 0,
              "func_results": {
                "_stake": {
                  "code": "FAILURE",
                  "gas_amount": 0,
                  "op_results": [
                    {
                      "path": "/staking/test_service_staking/0x07A43138CC760C85A5B1F115aa60eADEaa0bf417/0/stake/1/result",
                      "result": {
                        "code": 0,
                        "gas_amount": 1,
                      }
                    }
                  ]
                }
              },
              "gas_amount": 1,
              "gas_amount_total": {
                "app": {},
                "service": 2
              },
              "gas_cost_total": 0,
            });
          });
        });

        it('stake: stake with the same record_id', () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/1/value',
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it('stake: stake with non-checksum addreess', () => {
          const addrLowerCase = _.toLower(serviceUser);
          const stakePathLowerCase = `/staking/checksum_addr_test_service/${addrLowerCase}/0/stake`;
          const bodyLowerCase = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePathLowerCase + '/101/value',
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(bodyLowerCase.code).to.equals(1);

          const addrUpperCase = _.toUpper(serviceUser);
          const stakePathUpperCase = `/staking/checksum_addr_test_service/${addrUpperCase}/0/stake`;
          const bodyUpperCase = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePathUpperCase + '/102/value',
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(bodyUpperCase.code).to.equals(1);
        });
      });

      describe('Unstake', () => {
        it('unstake: unstake by another address', () => {
          let beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/accounts/${serviceUserBad}/balance`)
              .body.toString('utf-8')).result;
          let beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server3 + '/set_value', {json: {
            ref: `${unstakePath}/1/value`,
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          const unstakeRequest = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${unstakePath}/1`).body.toString('utf-8')).result;
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const balance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/accounts/${serviceUserBad}/balance`)
              .body.toString('utf-8')).result;
          expect(unstakeRequest).to.equal(null);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance);
          expect(balance).to.equal(beforeBalance);
        });

        it('unstake: unstake more than staked amount', () => {
          let beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          let beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: `${unstakePath}/1/value`,
            value: beforeStakingAccountBalance + 1
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const balance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance);
          expect(balance).to.equal(beforeBalance);
        });

        it('unstake: unstake', async () => {
          const beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: `${unstakePath}/2/value`,
            value: stakeAmount,
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_unstake": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/transfer/staking|test_service_staking|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": "SUCCESS",
                          "gas_amount": 0,
                          "op_results": [
                            {
                              "path": "/service_accounts/staking/test_service_staking/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/transfer/staking|test_service_staking|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1234567890000/result",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            }
                          ]
                        }
                      },
                      "gas_amount": 1,
                    }
                  },
                  {
                    "path": "/staking/test_service_staking/balance_total",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  },
                  {
                    "path": "/staking/test_service_staking/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/unstake/2/result",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 7
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const resultCode = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${unstakePath}/2/result/code`)
              .body.toString('utf-8')).result;
          const stakingAppBalanceTotal = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/test_service_staking/balance_total`)
            .body.toString('utf-8')).result;
          expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance - stakeAmount);
          expect(afterBalance).to.equal(beforeBalance + stakeAmount);
          expect(stakingAppBalanceTotal).to.equal(1);
        });

        it('unstake: stake after unstake', async () => {
          const newStakingAmount = 100;
          const beforeBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/3/value',
            value: newStakingAmount
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const stakeValue = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakePath}/3/value`).body.toString('utf-8')).result;
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const resultCode = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakePath}/3/result/code`)
              .body.toString('utf-8')).result;
          expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
          expect(stakeValue).to.equal(newStakingAmount);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance + newStakingAmount);
          expect(afterBalance).to.equal(beforeBalance - newStakingAmount);
        });
      });
    });

    describe('Payments: _pay, _claim', () => {
      before(async () => {
        const appStakingPath = `/staking/test_service_payment/${serviceAdmin}/0/stake/${Date.now()}/value`
        const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: appStakingPath,
          value: 1
        }}).body.toString('utf-8')).result;
        if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const manageAppPath = '/manage_app/test_service_payment/create/1'
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
          },
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: non-app admin cannot write pay records', () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
              ref: `/payments/test_service_payment/${serviceUser}/0/pay/key1`,
              value: {
                amount: 100
              }
            }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: amount = 0', () => {
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: 0
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: amount is not a number', () => {
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: 'test'
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: payment amount > admin balance', () => {
        const adminBalance = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: adminBalance + 1
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: app admin can write pay records', async () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key2`;
        const amount = adminBalanceBefore - 1;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', { json: {
          ref: payRef,
          value: {
            amount
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 0,
          "func_results": {
            "_pay": {
              "code": "SUCCESS",
              "gas_amount": 0,
              "op_results": [
                {
                  "path": "/transfer/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/payments|test_service_payment|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/value",
                  "result": {
                    "code": 0,
                    "func_results": {
                      "_transfer": {
                        "code": "SUCCESS",
                        "gas_amount": 1000,
                        "op_results": [
                          {
                            "path": "/accounts/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/balance",
                            "result": {
                              "code": 0,
                              "gas_amount": 1,
                            }
                          },
                          {
                            "path": "/service_accounts/payments/test_service_payment/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                            "result": {
                              "code": 0,
                              "gas_amount": 1,
                            }
                          },
                          {
                            "path": "/transfer/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/payments|test_service_payment|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/result",
                            "result": {
                              "code": 0,
                              "gas_amount": 1,
                            }
                          }
                        ]
                      }
                    },
                    "gas_amount": 1,
                  }
                },
                {
                  "path": "/payments/test_service_payment/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/pay/key2/result",
                  "result": {
                    "code": 0,
                    "gas_amount": 1,
                  }
                }
              ]
            }
          },
          "gas_amount": 1,
          "gas_amount_total": {
            "app": {},
            "service": 1006
          },
          "gas_cost_total": 0,
        });
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const paymentResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${payRef}/result/code`).body.toString('utf-8')).result;
        expect(paymentResult).to.equals(FunctionResultCode.SUCCESS);
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore - amount);
        const serviceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        assert.deepEqual(serviceAccountBalance, amount);
      });

      it('payments: non-app admin cannot write claim records', () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
              ref: `/payments/test_service_payment/${serviceUser}/0/claim/key1`,
              value: {
                amount: 100,
                target: serviceAdmin
              }
            }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: claim amount > payment balance', () => {
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/claim/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: paymentBalance + 1,
            target: serviceAdmin
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: invalid claim target', () => {
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/claim/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: paymentBalance,
            target: 'INVALID_TARGET'
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: app admin can claim payments with individual account target', async () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const paymentClaimRef = `/payments/test_service_payment/${serviceUser}/0/claim/key2`;
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentClaimRef,
          value: {
            amount: paymentBalance,
            target: serviceAdmin
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 0,
          "func_results": {
            "_claim": {
              "code": "SUCCESS",
              "gas_amount": 0,
              "op_results": [
                {
                  "path": "/transfer/payments|test_service_payment|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/1234567890000/value",
                  "result": {
                    "code": 0,
                    "func_results": {
                      "_transfer": {
                        "code": "SUCCESS",
                        "gas_amount": 0,
                        "op_results": [
                          {
                            "path": "/service_accounts/payments/test_service_payment/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                            "result": {
                              "code": 0,
                              "gas_amount": 1,
                            }
                          },
                          {
                            "path": "/accounts/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/balance",
                            "result": {
                              "code": 0,
                              "gas_amount": 1,
                            }
                          },
                          {
                            "path": "/transfer/payments|test_service_payment|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/1234567890000/result",
                            "result": {
                              "code": 0,
                              "gas_amount": 1,
                            }
                          }
                        ]
                      }
                    },
                    "gas_amount": 1,
                  }
                },
                {
                  "path": "/payments/test_service_payment/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/claim/key2/result",
                  "result": {
                    "code": 0,
                    "gas_amount": 1,
                  }
                }
              ]
            }
          },
          "gas_amount": 1,
          "gas_amount_total": {
            "app": {},
            "service": 6
          },
          "gas_cost_total": 0,
        });
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const paymentResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${paymentClaimRef}/result/code`).body.toString('utf-8')).result;
        expect(paymentResult).to.equals(FunctionResultCode.SUCCESS);
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore + paymentBalance);
        const serviceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(serviceAccountBalance).to.equals(0);
      });

      it('payments: app admin can claim payments + hold in escrow', async () => {
        // pay
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key4`;
        const amount = adminBalanceBefore - 1;
        let body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const payResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${payRef}/result/code`).body.toString('utf-8')).result;
        expect(payResult).to.equals(FunctionResultCode.SUCCESS);
        // open escrow
        const escrowConfigRef = `/escrow/payments|test_service_payment|${serviceUser}|0/${serviceAdmin}/0/config`;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: escrowConfigRef,
          value: {
            admin: {
              [serviceAdmin]: true
            }
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        // claim + hold in escrow
        const claimRef = `/payments/test_service_payment/${serviceUser}/0/claim/key4`;
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: claimRef,
          value: {
            amount: paymentBalance,
            target: serviceAdmin,
            escrow_key: 0
          }
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const claimResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${claimRef}/result/code`).body.toString('utf-8')).result;
        expect(claimResult).to.equals(FunctionResultCode.SUCCESS);
        const serviceAccountName = `payments|test_service_payment|${serviceUser}|0:${serviceAdmin}:0`;
        const escrowServiceAccountBalance = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/service_accounts/escrow/escrow/${serviceAccountName}/balance`)
            .body.toString('utf-8')).result;
        expect(escrowServiceAccountBalance).to.equals(paymentBalance);
        const userServiceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(userServiceAccountBalance).to.equals(0);
        // release escrow
        const releaseEscrowRef = `/escrow/payments|test_service_payment|${serviceUser}|0/${serviceAdmin}/0/release/key0`;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: releaseEscrowRef,
          value: {
            ratio: 1
          }
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore);
      });

      it('payments: app admin can claim payments with service account target', async () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key3`;
        const amount = adminBalanceBefore - 1;
        let body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const payResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${payRef}/result/code`).body.toString('utf-8')).result;
        expect(payResult).to.equals(FunctionResultCode.SUCCESS);

        const claimRef = `/payments/test_service_payment/${serviceUser}/0/claim/key3`;
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: claimRef,
          value: {
            amount: paymentBalance,
            target: `payments|test_service_payment|${serviceAdmin}|0`
          }
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const claimResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${claimRef}/result/code`).body.toString('utf-8')).result;
        expect(claimResult).to.equals(FunctionResultCode.SUCCESS);
        const adminServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceAdmin}|0/balance`)
                .body.toString('utf-8')).result;
        expect(adminServiceAccountBalanceAfter).to.equals(paymentBalance);
        const userServiceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(userServiceAccountBalance).to.equals(0);
      });
    });

    describe('Escrow: _hold, _release', () => {
      before(async () => {
        const appStakingPath = `/staking/test_service_escrow/${serviceAdmin}/0/stake/${Date.now()}/value`
        const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: appStakingPath,
          value: 1
        }}).body.toString('utf-8')).result;
        if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const manageAppPath = '/manage_app/test_service_escrow/create/1'
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
          },
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      describe('Escrow: individual -> individual', () => {
        it('escrow: individual -> individual: open escrow', async () => {
          const configRef = `/escrow/${serviceUser}/${serviceAdmin}/0/config`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: configRef,
            value: {
              admin: {
                [serviceAdmin]: true
              }
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 1
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const escrowAccountConfig = parseOrLog(syncRequest('GET', server1 + `/get_value?ref=${configRef}`)
              .body.toString('utf-8')).result;
          assert.deepEqual(escrowAccountConfig, { admin: { [serviceAdmin]: true } });
        });

        it("escrow: individual -> individual: cannot open escrow if it's already open", () => {
          const configRef = `/escrow/${serviceUser}/${serviceAdmin}/0/config`;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: configRef,
            value: {
              admin: {
                [serviceAdmin]: true
              }
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it("escrow: individual -> individual: non-source account cannot write hold", () => {
          const key = 1234567890000 + 1;
          const holdRef = `/escrow/${serviceUser}/${serviceAdmin}/0/hold/${key}`;
          const userBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: userBalanceBefore
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it("escrow: individual -> individual: source account can write hold", async () => {
          const key = 1234567890000 + 2;
          const holdRef = `/escrow/${serviceUser}/${serviceAdmin}/0/hold/${key}`;
          const userBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: userBalanceBefore
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_hold": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/escrow|escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": "SUCCESS",
                          "gas_amount": 1000,
                          "op_results": [
                            {
                              "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/service_accounts/escrow/escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/escrow|escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/1234567890000/result",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            }
                          ]
                        }
                      },
                      "gas_amount": 1,
                    }
                  },
                  {
                    "path": "/escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/0/hold/1234567890002/result",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 1006
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const holdResult = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=${holdRef}/result/code`).body.toString('utf-8')).result;
          expect(holdResult).to.equals(FunctionResultCode.SUCCESS);
          const escrowServiceAccountBalance = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalance).to.equals(userBalanceBefore);
        });

        it("escrow: individual -> individual: non-admin account cannot write release", () => {
          const key = 1234567890000 + 3;
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 1
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it("escrow: individual -> individual: invalid ratio (ratio = -1)", () => {
          const key = 1234567890000 + 4;
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: -1
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it("escrow: individual -> individual: invalid ratio (ratio = 1.1)", () => {
          const key = 1234567890000 + 5;
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 1.1
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it("escrow: individual -> individual: admin account can write release (ratio = 0)", async () => {
          const key = 1234567890000 + 6;
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const userBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const escrowServiceAccountBalanceBefore = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 0
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_release": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/transfer/escrow|escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": "SUCCESS",
                          "gas_amount": 0,
                          "op_results": [
                            {
                              "path": "/service_accounts/escrow/escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/transfer/escrow|escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1234567890000/result",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            }
                          ]
                        }
                      },
                      "gas_amount": 1,
                    }
                  },
                  {
                    "path": "/escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/0/release/1234567890006/result",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 6
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const holdResult = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=${releaseRef}/result/code`).body.toString('utf-8')).result;
          expect(holdResult).to.equals(FunctionResultCode.SUCCESS);
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(0);
          const userBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          expect(userBalanceAfter).to.equals(userBalanceBefore + escrowServiceAccountBalanceBefore);
        });
      });

      describe('Escrow: service -> individual', () => {
        it('escrow: service -> individual: open escrow', async () => {
          const key = 1234567890000 + 101;
          const server4Addr = parseOrLog(syncRequest(
            'GET', server4 + '/get_address').body.toString('utf-8')).result;
          const transferBody = parseOrLog(syncRequest('POST', server4 + '/set_value', {json: {
            ref: `transfer/${server4Addr}/${serviceAdmin}/${key}/value`,
            value: 100
          }}).body.toString('utf-8'));
          if (!(await waitUntilTxFinalized(serverList, _.get(transferBody, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const payRef = `/payments/test_service_escrow/${serviceUser}/0/pay/${key}`;
          const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
          const amount = adminBalanceBefore;
          const payBody = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: payRef,
            value: {
              amount
            }
          }}).body.toString('utf-8'));
          if (!(await waitUntilTxFinalized(serverList, _.get(payBody, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // open escrow
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const configRef = `/escrow/${source}/${target}/1/config`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: configRef,
            value: {
              admin: {
                [serviceAdmin]: true
              }
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 1
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const escrowAccountConfig = parseOrLog(syncRequest('GET', server1 + `/get_value?ref=${configRef}`)
              .body.toString('utf-8')).result;
          assert.deepEqual(escrowAccountConfig, { admin: { [serviceAdmin]: true } });
        });

        it("escrow: service -> individual: non-service admin cannot write hold", () => {
          const key = 1234567890000 + 102;
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const holdRef = `/escrow/${source}/${target}/1/hold/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: paymentBalanceBefore
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it("escrow: service -> individual: service admin can write hold", async () => {
          const key = 1234567890000 + 103;
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const holdRef = `/escrow/${source}/${target}/1/hold/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: paymentBalanceBefore
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_hold": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/transfer/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/escrow|escrow|payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": "SUCCESS",
                          "gas_amount": 1000,
                          "op_results": [
                            {
                              "path": "/service_accounts/payments/test_service_escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/service_accounts/escrow/escrow/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/transfer/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/escrow|escrow|payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/1234567890000/result",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            }
                          ]
                        }
                      },
                      "gas_amount": 1,
                    }
                  },
                  {
                    "path": "/escrow/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/1/hold/1234567890103/result",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 1006
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const holdResult = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=${holdRef}/result/code`).body.toString('utf-8')).result;
          expect(holdResult).to.equals(FunctionResultCode.SUCCESS);
          const escrowServiceAccountBalance = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalance).to.equals(paymentBalanceBefore);
        });

        it("escrow: service -> individual: admin account can write release (ratio = 0, refund to payments via _transfer)", async () => {
          const key = 1234567890000 + 104;
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const releaseRef = `/escrow/${source}/${target}/1/release/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const escrowServiceAccountBalanceBefore = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 0
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_release": {
                "code": "SUCCESS",
                "gas_amount": 0,
                "op_results": [
                  {
                    "path": "/transfer/escrow|escrow|payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": "SUCCESS",
                          "gas_amount": 0,
                          "op_results": [
                            {
                              "path": "/service_accounts/escrow/escrow/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/service_accounts/payments/test_service_escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            },
                            {
                              "path": "/transfer/escrow|escrow|payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/result",
                              "result": {
                                "code": 0,
                                "gas_amount": 1,
                              }
                            }
                          ]
                        }
                      },
                      "gas_amount": 1,
                    }
                  },
                  {
                    "path": "/escrow/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/1/release/1234567890104/result",
                    "result": {
                      "code": 0,
                      "gas_amount": 1,
                    }
                  }
                ]
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "app": {},
              "service": 6
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const releaseResult = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=${releaseRef}/result/code`).body.toString('utf-8')).result;
          expect(releaseResult).to.equals(FunctionResultCode.SUCCESS);
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(0);
          const paymentBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          expect(paymentBalanceAfter).to.equals(paymentBalanceBefore + escrowServiceAccountBalanceBefore);
        });

        it("escrow: service -> individual: escrow admin account can write release (ratio = 0.5)", async () => {
          // hold
          const holdKey = 1234567890000 + 105;
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const holdRef = `/escrow/${source}/${target}/1/hold/${holdKey}`;
          const paymentBalance = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          let body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: paymentBalance
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // release
          const releaseKey = 1234567890000 + 106;
          const releaseRef = `/escrow/${source}/${target}/1/release/${releaseKey}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
          const escrowServiceAccountBalanceBefore = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 0.5
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const releaseResult = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=${releaseRef}/result/code`).body.toString('utf-8')).result;
          expect(releaseResult).to.equals(FunctionResultCode.SUCCESS);
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(0);
          const paymentBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          expect(paymentBalanceAfter).to.equals(paymentBalanceBefore + escrowServiceAccountBalanceBefore / 2);
          const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
          expect(adminBalanceAfter).to.equals(adminBalanceBefore + escrowServiceAccountBalanceBefore / 2);
        });
      });
    });
  });

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

      const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
        ref: `/staking/test_billing/${serviceAdmin}/0/stake/${Date.now()}/value`,
        value: 1
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
        console.error(`Failed to check finalization of app staking tx.`);
      }

      const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
        ref: '/manage_app/test_billing/create/0',
        value: {
          admin: {
            [serviceAdmin]: true,
            [billingUserA]: true,
            [billingUserB]: true
          },
          billing: {
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
          }
        },
        nonce: -1,
        timestamp: Date.now(),
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, createAppRes.tx_hash))) {
        console.error(`Failed to check finalization of create app tx.`);
      }

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
      const tx = parseOrLog(syncRequest('GET', server2 + `/get_transaction?hash=${txRes.tx_hash}`).body.toString('utf-8')).result;
      const gasFeeCollected = parseOrLog(syncRequest(
        'GET',
        `${server2}/get_value?ref=/gas_fee/collect/${billingUserA}/${tx.number}/${txRes.tx_hash}/amount`
      ).body.toString('utf-8')).result;
      assert.deepEqual(gasFeeCollected, gasPrice * MICRO_AIN * txRes.result.gas_amount_total.service);
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
      expect(txResBody.result.result.code, 18);
      expect(txResBody.result.result.error_message.includes('No .write permission on: /gas_fee/collect/billing|test_billing|B'), true);
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
        billingAccountBalanceBefore - (gasPrice * MICRO_AIN * txRes.result.gas_amount_total.service)
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
      const tx = parseOrLog(syncRequest('GET', server2 + `/get_transaction?hash=${txRes.tx_hash}`).body.toString('utf-8')).result;
      const gasFeeCollected = parseOrLog(syncRequest(
        'GET',
        `${server2}/get_value?ref=/gas_fee/collect/${billingUserA}/${tx.number}/${txRes.tx_hash}/amount`
      ).body.toString('utf-8')).result;
      assert.deepEqual(gasFeeCollected, gasPrice * MICRO_AIN * txRes.result.gas_amount_total.service);
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
        billingAccountBalanceBefore - (gasPrice * MICRO_AIN * txRes.result.gas_amount_total.service)
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
      const tx = parseOrLog(syncRequest('GET', server2 + `/get_transaction?hash=${txRes.tx_hash}`).body.toString('utf-8')).result;
      const gasFeeCollected = parseOrLog(syncRequest(
        'GET',
        `${server2}/get_value?ref=/gas_fee/collect/${billingUserA}/${tx.number}/${txRes.tx_hash}/amount`
      ).body.toString('utf-8')).result;
      assert.deepEqual(gasFeeCollected, gasPrice * MICRO_AIN * txRes.result.gas_amount_total.service);
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
        billingAccountBalanceBefore - (gasPrice * MICRO_AIN * txRes.result.gas_amount_total.service)
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
        "error_message": "Failed to collect gas fee: Multiple app-dependent service operations for a billing account",
        "code": 16,
        "gas_amount": 0
      });
    });
  });
});
