const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const _ = require("lodash");
const spawn = require("child_process").spawn;
const sleep = require('sleep').msleep;
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
  FunctionResultCode,
  TX_BYTES_LIMIT,
  GenesisAccounts,
  HASH_DELIMITER,
  ProofProperties,
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const { waitUntilTxFinalized, parseOrLog } = require('../unittest/test-util');

const ENV_VARIABLES = [
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0, EPOCH_MS: 1000, DEBUG: false,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1, EPOCH_MS: 1000, DEBUG: false,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2, EPOCH_MS: 1000, DEBUG: false,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3, EPOCH_MS: 1000, DEBUG: false,
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

function setUp() {
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
              "fid": "some function config"
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
  assert.deepEqual(_.get(res, 'result.code'), 0);
  if (!waitUntilTxFinalized(serverList, _.get(res, 'tx_hash'))) {
    console.log(`Failed to check finalization of setUp() tx.`)
  }
}

function cleanUp() {
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
  assert.deepEqual(_.get(res, 'result.code'), 0);
  if (!waitUntilTxFinalized(serverList, _.get(res, 'tx_hash'))) {
    console.log(`Failed to check finalization of cleanUp() tx.`)
  }
}

function setUpForNativeFunctions() {
  const res = parseOrLog(syncRequest('POST', server2 + '/set', {
    json: {
      op_list: [
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_native_function/allowed_path/value',
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
          ref: '/test/test_native_function/allowed_path/value',
          value: {
            ".write": true,
          }
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_native_function/allowed_path/.last_tx/value',
          value: {
            ".write": "auth.fid === '_saveLastTx'",
          }
        },
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_native_function/not_allowed_path/value',
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
          ref: '/test/test_native_function/not_allowed_path/value',
          value: {
            ".write": true,
          }
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_native_function/not_allowed_path/.last_tx/value',
          value: {
            ".write": "auth.fid === 'some function id'",
          }
        },
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_native_function/allowed_path_with_fids/value',
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
          ref: '/test/test_native_function/allowed_path_with_fids/value',
          value: {
            ".write": true,
          }
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_native_function/allowed_path_with_fids/.last_tx/value',
          value: {
            ".write": "util.includes(auth.fids, '_saveLastTx')",
          }
        },
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_native_function/not_allowed_path_with_fids/value',
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
          ref: '/test/test_native_function/not_allowed_path_with_fids/value',
          value: {
            ".write": true,
          }
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_native_function/not_allowed_path_with_fids/.last_tx/value',
          value: {
            ".write": "util.includes(auth.fids, 'some function id')",
          }
        },
      ],
      nonce: -1,
    }
  }).body.toString('utf-8')).result;
  assert.deepEqual(_.get(res, 'result.code'), 0);
  if (!waitUntilTxFinalized(serverList, _.get(res, 'tx_hash'))) {
    console.log(`Failed to check finalization of setUpForNativeFunctions() tx.`)
  }
}

function cleanUpForNativeFunctions() {
  const res = parseOrLog(syncRequest('POST', server2 + '/set', {
    json: {
      op_list: [
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_native_function/allowed_path/value',
          value: null
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_native_function/allowed_path/value',
          value: null
        },
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_native_function/not_allowed_path/value',
          value: null
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_native_function/not_allowed_path/value',
          value: null
        },
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_native_function/allowed_path_with_fids/value',
          value: null
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_native_function/allowed_path_with_fids/value',
          value: null
        },
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_native_function/not_allowed_path_with_fids/value',
          value: null
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_native_function/not_allowed_path_with_fids/value',
          value: null
        },
      ],
      nonce: -1,
    }
  }).body.toString('utf-8')).result;
  assert.deepEqual(_.get(res, 'result.code'), 0);
  if (!waitUntilTxFinalized(serverList, _.get(res, 'tx_hash'))) {
    console.log(`Failed to check finalization of cleanUpForNativeFunctions() tx.`)
  }
}

describe('Blockchain Node', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc

  before(() => {
    rimraf.sync(CHAINS_DIR)

    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', {}, false);
    sleep(2000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0], false);
    sleep(2000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1], false);
    sleep(2000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2], false);
    sleep(2000);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[3], false);
    sleep(2000);
  });

  after(() => {
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()
    server4_proc.kill()

    rimraf.sync(CHAINS_DIR)
  });

  describe('APIs (gets)', () => {
    before(() => {
      setUp();
    })

    after(() => {
      cleanUp();
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
              "fid": "some function config"
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
              "fid": "some function config"
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
                "fid": "some function config"
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
                "fid": "some function config"
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

  describe('APIs (sets)', () => {
    beforeEach(() => {
      setUp();
    })

    afterEach(() => {
      cleanUp();
    })

    describe('/set_value', () => {
      it('set_value', () => {
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
        expect(body.code).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);

        // Confirm that the value is set properly.
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value");
      })

      it('set_value with timestamp', () => {
        const request = {
          ref: 'test/test_value/some/path',
          value: "some value with timestamp",
          timestamp: Date.now(),
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_value', {json: request}).body.toString('utf-8'));
        expect(body.code).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);

        // Confirm that the value is set properly.
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value with timestamp");
      })

      it('set_value with nonce unordered (-1)', () => {
        const request = {
          ref: 'test/test_value/some/path',
          value: "some value with nonce unordered",
          nonce: -1,
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_value', {json: request}).body.toString('utf-8'));
        expect(body.code).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);

        // Confirm that the value is set properly.
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value with nonce unordered");
      })

      it('set_value with nonce strictly ordered', () => {
        const nonce = parseOrLog(
            syncRequest('GET', server1 + '/get_nonce').body.toString('utf-8')).result;
        const request = {
          ref: 'test/test_value/some/path',
          value: "some value with nonce strictly ordered",
          nonce,
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_value', {json: request}).body.toString('utf-8'));
        expect(body.code).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);

        // Confirm that the value is set properly.
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, "some value with nonce strictly ordered");
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
        expect(body.code).to.equal(1);
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 103,
          "error_message": "No .write permission on: some/wrong/path"
        });

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/inc_value', () => {
      it('inc_value', () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "test/test_value/some/path2", value: 10};
        const body = parseOrLog(syncRequest('POST', server1 + '/inc_value', {json: request})
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);

        // Confirm that the value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
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
        expect(body.code).to.equal(1);
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 103,
          "error_message": "No .write permission on: some/wrong/path2"
        });

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path2')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/dec_value', () => {
      it('dec_value', () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);

        const request = {ref: "test/test_value/some/path3", value: 10};
        const body = parseOrLog(syncRequest('POST', server1 + '/dec_value', {json: request})
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);

        // Confirm that the value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
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
        expect(body.code).to.equal(1);
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 103,
          "error_message": "No .write permission on: some/wrong/path3"
        });

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=some/wrong/path3')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/set_function', () => {
      it('set_function', () => {
        // Check the original function.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=test/test_function/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, {
          ".function": {
            "fid": "some function config"
          }
        });

        const request = {
          ref: "/test/test_function/some/path",
          value: {
            ".function": {
              "fid": "some other function config"
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
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=test/test_function/some/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, {
          ".function": {
            "fid": "some other function config"
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
              "fid": "some other function config"
            }
          }
        };
        const body = parseOrLog(syncRequest(
            'POST', server1 + '/set_function', {json: request})
            .body.toString('utf-8'));
        expect(body.code).to.equal(1);
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 404,
          "error_message": "No write_function permission on: /some/wrong/path"
        });

        // Confirm that the original function is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_function?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/set_rule', () => {
      it('set_rule', () => {
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
        expect(body.code).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);

        // Confirm that the value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
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
        expect(body.code).to.equal(1);
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 503,
          "error_message": "No write_rule permission on: /some/wrong/path"
        });

        // Confirm that the original rule is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_rule?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/set_owner', () => {
      it('set_owner', () => {
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
        expect(body.code).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);

        // Confirm that the value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
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
            ".owner": "some other owner config"
          }
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set_owner', {json: request})
            .body.toString('utf-8'));
        expect(body.code).to.equal(1);
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 603,
          "error_message": "No write_owner or branch_owner permission on: /some/wrong/path"
        });

        // Confirm that the original owner is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_owner?ref=some/wrong/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/set', () => {
      it('set', () => {
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
                ".function": "some other100 function config"
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
                ".owner": "some other100 owner config"
              }
            }
          ]
        };
        const body = parseOrLog(syncRequest('POST', server1 + '/set', {json: request})
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        assert.deepEqual(_.get(body, 'result.result.code'), 0);

        // Confirm that the original value is set properly.
        expect(_.get(body, 'result.tx_hash')).to.not.equal(null);
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
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
                ".function": "some other101 function config"
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
        expect(body.code).to.equal(1);
        assert.deepEqual(_.get(body, 'result.result'), {
          "code": 103,
          "error_message": "No .write permission on: some/wrong/path"
        });

        // Confirm that the original value is not altered.
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some101/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, null);
      })
    })

    describe('/batch', () => {
      it('batch', () => {
        // Check the original value.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some200/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);
        const resultBefore2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some201/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore2, null);

        const nonce = parseOrLog(syncRequest('GET', server1 + '/get_nonce').body.toString('utf-8')).result;
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
                  ".function": "some other200 function config"
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
                  ".owner": "some other200 owner config"
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
                      ".function": "some other201 function config"
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
                      ".owner": "some other201 owner config"
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
        expect(body.code).to.equal(0);
        expect(Array.isArray(body.result)).to.equal(true);
        for (let i = 0; i < body.result.length; i++) {
          const result = body.result[i];
          result.tx_hash = 'erased';
        }
        assert.deepEqual(body.result, [
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          }
        ]);

        // Confirm that the value is set properly.
        sleep(3);
        const resultAfter = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some200/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter, 'some other200 value');
        const resultAfter2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some201/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultAfter2, 'some other201 value');
      })

      it('batch with a failing transaction', () => {
        // Check the original values.
        const resultBefore = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some202/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore, null);
        const resultBefore2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=test/test_value/some203/path')
            .body.toString('utf-8')).result;
        assert.deepEqual(resultBefore2, null);
        const nonce = parseOrLog(syncRequest('GET', server1 + '/get_nonce').body.toString('utf-8')).result;

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
                  ".function": "some other202 function config"
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
                  ".owner": "some other202 owner config"
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
                      ".function": "some other203 function config"
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
                      ".owner": "some other203 owner config"
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
        expect(body.code).to.equal(0);
        expect(Array.isArray(body.result)).to.equal(true);
        for (let i = 0; i < body.result.length; i++) {
          const result = body.result[i];
          result.tx_hash = 'erased';
        }
        assert.deepEqual(body.result, [
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 103,
              "error_message": "No .write permission on: some/wrong/path",
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          },
          {
            "result": {
              "code": 0,
              "receipt": {
                "gas_amount": 1
              }
            },
            "tx_hash": "erased"
          }
        ]);

        // Confirm that the value is set properly.
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
      it('accepts a transaction with nonce unordered (-1)', () => {
        const account = ainUtil.createAccount();
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
                receipt: {
                  gas_amount: 1
                }
              },
              tx_hash: ChainUtil.hashSignature(signature),
            }
          });
        })
      })

      it('accepts a transaction with nonce strictly ordered', () => {
        const account = ainUtil.createAccount();
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
            nonce,  // strictly ordered nonce
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
                  receipt: {
                    gas_amount: 1
                  }
                },
                tx_hash: ChainUtil.hashSignature(signature),
              }
            });
          });
        });
      })

      it('rejects a transaction that exceeds the size limit.', () => {
        const account = ainUtil.createAccount();
        const client = jayson.client.http(server1 + '/json-rpc');
        let longText = '';
        for (let i = 0; i < TX_BYTES_LIMIT / 2; i++) {
          longText += 'a'
        }
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
              message: `Transaction size exceeds ${TX_BYTES_LIMIT} bytes.`,
            },
            protoVer: CURRENT_PROTOCOL_VERSION
          });
        })
      })

      it('rejects a transaction of missing properties.', () => {
        const account = ainUtil.createAccount();
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
        const account = ainUtil.createAccount();
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
      it('accepts a batch transaction', () => {
        const account = ainUtil.createAccount();
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
                ".function": "some other300 function config"
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
                ".owner": "some other300 owner config"
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
                    ".function": "some other301 function config"
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
                    ".owner": "some other301 owner config"
                  }
                }
              ]
            },
            timestamp: Date.now(),
            nonce: -1
          }
        ]
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
          expect(Array.isArray(resultList)).to.equal(true);
          const expected = [];
          for (const tx of txList) {
            expected.push({
              result: {
                code: 0,
                receipt: {
                  gas_amount: 1
                }
              },
              tx_hash: ChainUtil.hashSignature(tx.signature),
            })
          }
          assert.deepEqual(res.result, {
            result: expected,
            protoVer: CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('rejects a batch transaction that exceeds the size limit.', () => {
        const account = ainUtil.createAccount();
        const client = jayson.client.http(server1 + '/json-rpc');
        let longText = '';
        for (let i = 0; i < TX_BYTES_LIMIT / 2; i++) {
          longText += 'a'
        }
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
        return client.request('ain_sendSignedTransactionBatch', {
          tx_list: [
            {
              tx_body: txBody,
              signature,
            }
          ],
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          const resultList = _.get(res, 'result.result');
          expect(Array.isArray(resultList)).to.equal(false);
          assert.deepEqual(res.result, {
            result: {
              code: 1,
              message: `Transaction size exceeds ${TX_BYTES_LIMIT} bytes.`,
            },
            protoVer: CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('rejects a batch transaction of invalid batch transaction format.', () => {
        const account = ainUtil.createAccount();
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
              code: 2,
              message: `Invalid batch transaction format.`
            },
            protoVer: CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('rejects a batch transaction of missing transaction properties.', () => {
        const account = ainUtil.createAccount();
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
              tx_body: txBody,
              // missing signature
            }
          ],
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: {
              code: 3,
              message: `Missing properties of transaction[0].`,
            },
            protoVer: CURRENT_PROTOCOL_VERSION,
          });
        })
      })

      it('rejects a batch transaction of invalid transaction format.', () => {
        const account = ainUtil.createAccount();
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
              tx_body: txBody,
              signature,
            }
          ],
          protoVer: CURRENT_PROTOCOL_VERSION
        }).then((res) => {
          assert.deepEqual(res.result, {
            result: {
              code: 4,
              message: `Invalid format of transaction[0].`
            },
            protoVer: CURRENT_PROTOCOL_VERSION
          });
        })
      })
    })
  })

  describe('Native functions', () => {
    const saveLastTxAllowedPath = '/test/test_native_function/allowed_path';
    const saveLastTxNotAllowedPath = '/test/test_native_function/not_allowed_path';
    const saveLastTxAllowedPathWithFids = '/test/test_native_function/allowed_path_with_fids';
    const saveLastTxNotAllowedPathWithFids = '/test/test_native_function/not_allowed_path_with_fids';
    const setFunctionWithOwnerOnlyPath = '/test/test_native_function/owner_only';

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
      stakingServiceAccountBalancePath = `/service_accounts/staking/test_service/${serviceUser}|0/balance`;
      stakePath = `/staking/test_service/${serviceUser}/0/stake`;
      unstakePath = `/staking/test_service/${serviceUser}/0/unstake`;
      serviceUserBalancePath = `/accounts/${serviceUser}/balance`;
    })

    beforeEach(() => {
      setUpForNativeFunctions();
    })

    afterEach(() => {
      cleanUpForNativeFunctions();
    })

    describe('Function permission (_saveLastTx, _transfer)', () => {
      describe('Owner only', () => {
        beforeEach(() => {
          const res = parseOrLog(syncRequest('POST', server2 + '/set_function', {json: {
            ref: setFunctionWithOwnerOnlyPath,
            value: null,
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8')).result;
          assert.deepEqual(_.get(res, 'result.code'), 0);
          if (!waitUntilTxFinalized(serverList, _.get(res, 'tx_hash'))) {
            console.log(`Failed to check finalization of owner only cleanup tx.`)
          }
        })

        it('owner only: set_function with ownerOnly = false (_saveLastTx)', () => {
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
          if (!waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash'))) {
            console.error(`Failed to check finalization of tx.`)
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
            "error_message": "Trying to write owner-only function: _transfer"
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
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
          if (!waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash'))) {
            console.error(`Failed to check finalization of tx.`)
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxNotAllowedPath + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(_.get(lastTx, 'tx_hash', null)).to.equal(null);
        });

        it('write rule: auth.fid: with function permission', () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
          if (!waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash'))) {
            console.error(`Failed to check finalization of tx.`)
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
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
          if (!waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash'))) {
            console.error(`Failed to check finalization of tx.`)
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxNotAllowedPathWithFids + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(_.get(lastTx, 'tx_hash', null)).to.equal(null);
        });

        it('write rule: auth.fids: with function permission', () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxAllowedPathWithFids + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
          if (!waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash'))) {
            console.error(`Failed to check finalization of tx.`)
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxAllowedPathWithFids + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be the tx hash value.
          assert.deepEqual(_.get(lastTx, 'tx_hash', null), body.result.tx_hash);
        });
      });
    });

    describe('Transfer (_transfer)', () => {
      it('transfer: transfer', () => {
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
        if (!waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
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
    })

    describe('Staking (_stake, _unstake)', () => {
      describe('Stake', () => {
        it('stake: setup app', () => {
          const manageAppPath = '/manage_app/test_service/create/1'
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: manageAppPath,
            value: {
              admin: { serviceAdmin: true },
              service: {
                staking: { lockup_duration: 1000 }
              }
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
        })

        it('stake: stake', () => {
          let beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/1/value',
            value: stakeAmount
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
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
              server2 + `/get_value?ref=/staking/test_service/balance_total`)
            .body.toString('utf-8')).result;
          expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
          expect(stakeValue).to.equal(stakeAmount);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance + stakeAmount);
          expect(afterBalance).to.equal(beforeBalance - stakeAmount);
          expect(stakingAppBalanceTotal).to.equal(stakeAmount);
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

        it('stake: stake with invalid timestamp', () => {
          const account = ainUtil.createAccount();
          const transferPath = `/transfer/${transferFrom}/${account.address}`;
          const res = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: transferPath + '/100/value',
            value: 1000
          }}).body.toString('utf-8')).result;
          if (!waitUntilTxFinalized(serverList, _.get(res, 'tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              value: stakeAmount,
              ref: `/staking/test_service/${account.address}/0/stake/1/value`
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
            const stakeResult = parseOrLog(syncRequest('GET',
                server2 + `/get_value?ref=/staking/test_service/${account.address}/0/stake/1/result/code`)
                .body.toString('utf-8')).result;
            expect(stakeResult).to.equal(FunctionResultCode.FAILURE);
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

        it('unstake: unstake', () => {
          const beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: `${unstakePath}/2/value`,
            value: stakeAmount
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const resultCode = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${unstakePath}/2/result/code`)
              .body.toString('utf-8')).result;
          const stakingAppBalanceTotal = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/test_service/balance_total`)
            .body.toString('utf-8')).result;
          expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance - stakeAmount);
          expect(afterBalance).to.equal(beforeBalance + stakeAmount);
          expect(stakingAppBalanceTotal).to.equal(0);
        });

        it('unstake: stake after unstake', () => {
          const newStakingAmount = 100;
          const beforeBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/3/value',
            value: newStakingAmount
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
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

    describe('Payments (_pay, _claim)', () => {
      it('payments: setup payments', () => {
        const configPath = '/payments/test_service/config'
        const body = parseOrLog(syncRequest('POST', server1 + '/set', {json: {
          op_list: [
            {
              type: 'SET_OWNER',
              ref: configPath,
              value: {
                ".owner": {
                  "owners": {
                    "*": {
                      "branch_owner": false,
                      "write_owner": false,
                      "write_rule": false,
                      "write_function": false
                    },
                    [serviceAdmin]: {
                      "branch_owner": true,
                      "write_owner": true,
                      "write_rule": true,
                      "write_function": true
                    }
                  }
                }
              }
            },
            {
              type: 'SET_VALUE',
              ref: `${configPath}/admin/${serviceAdmin}`,
              value: true
            }
          ]
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
      });

      it('payments: original admin can add another admin', () => {
        const configPath = `/payments/test_service/config/admin/${serviceUser}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: configPath,
          value: true
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const admins = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/payments/test_service/config/admin`).body.toString('utf-8')).result;
        assert.deepEqual(admins, {
          [serviceAdmin]: true,
          [serviceUser]: true
        });
      });

      it('payments: original admin can remove other admin', () => {
        const configPath = `/payments/test_service/config/admin/${serviceUser}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: configPath,
          value: null
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const admins = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/payments/test_service/config/admin`).body.toString('utf-8')).result;
        assert.deepEqual(admins, { [serviceAdmin]: true });
      });

      it('payments: non-admin cannot overwrite payment config', () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
              ref: `/payments/test_service/config`,
              value: { admin: serviceUser }
            }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: non-admin cannot write pay records', () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
              ref: `/payments/test_service/${serviceUser}/0/pay/key1`,
              value: {
                amount: 100
              }
            }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: amount = 0', () => {
        const paymentRef = `/payments/test_service/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentRef,
          value: {
            amount: 0
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: amount is not a number', () => {
        const paymentRef = `/payments/test_service/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentRef,
          value: {
            amount: 'test'
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: payment amount > admin balance', () => {
        const adminBalance = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const paymentRef = `/payments/test_service/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentRef,
          value: {
            amount: adminBalance + 1
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const paymentResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${paymentRef}/result/code`).body.toString('utf-8')).result;
        expect(paymentResult).to.equals(FunctionResultCode.INTERNAL_ERROR);
      });

      it('payments: admin can write pay records', () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const paymentRef = `/payments/test_service/${serviceUser}/0/pay/key2`;
        const amount = adminBalanceBefore - 1;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentRef,
          value: {
            amount
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const paymentResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${paymentRef}/result/code`).body.toString('utf-8')).result;
        expect(paymentResult).to.equals(FunctionResultCode.SUCCESS);
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore - amount);
        const serviceAccount = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0`)
            .body.toString('utf-8')).result;
        assert.deepEqual(serviceAccount, {
          balance: amount,
          admin: {
            [serviceAdmin]: true
          }
        });
      });

      it('payments: non-admin cannot write claim records', () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
              ref: `/payments/test_service/${serviceUser}/0/claim/key1`,
              value: {
                amount: 100,
                target: serviceAdmin
              }
            }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: claim amount > payment balance', () => {
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const paymentRef = `/payments/test_service/${serviceUser}/0/claim/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentRef,
          value: {
            amount: paymentBalance + 1,
            target: serviceAdmin
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const paymentResult = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=${paymentRef}/result/code`).body.toString('utf-8')).result;
        expect(paymentResult).to.equals(FunctionResultCode.INTERNAL_ERROR);
      });

      it('payments: invalid claim target', () => {
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const paymentRef = `/payments/test_service/${serviceUser}/0/claim/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentRef,
          value: {
            amount: paymentBalance,
            target: 'INVALID_TARGET'
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('payments: admin can claim payments (target = address)', () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const paymentClaimRef = `/payments/test_service/${serviceUser}/0/claim/key2`;
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentClaimRef,
          value: {
            amount: paymentBalance,
            target: serviceAdmin
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const paymentResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${paymentClaimRef}/result/code`).body.toString('utf-8')).result;
        expect(paymentResult).to.equals(FunctionResultCode.SUCCESS);
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore + paymentBalance);
        const serviceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(serviceAccountBalance).to.equals(0);
      });

      it('payments: admin can claim payments + hold in escrow', () => {
        // pay
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service/${serviceUser}/0/pay/key4`;
        const amount = adminBalanceBefore - 1;
        let body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const payResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${payRef}/result/code`).body.toString('utf-8')).result;
        expect(payResult).to.equals(FunctionResultCode.SUCCESS);
        // open escrow
        const openEscrowRef = `/escrow/payments|test_service|${serviceUser}|0/${serviceAdmin}/0/open`;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: openEscrowRef,
          value: {
            admin: {
              [serviceAdmin]: true
            }
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        // claim + hold in escrow
        const claimRef = `/payments/test_service/${serviceUser}/0/claim/key4`;
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: claimRef,
          value: {
            amount: paymentBalance,
            target: serviceAdmin,
            escrow_key: 0
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const claimResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${claimRef}/result/code`).body.toString('utf-8')).result;
        expect(claimResult).to.equals(FunctionResultCode.SUCCESS);
        const serviceAccountName = `payments|test_service|${serviceUser}|0:${serviceAdmin}:0`;
        const escrowServiceAccountBalance = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/service_accounts/escrow/escrow/${serviceAccountName}/balance`)
            .body.toString('utf-8')).result;
        expect(escrowServiceAccountBalance).to.equals(paymentBalance);
        const userServiceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(userServiceAccountBalance).to.equals(0);
        // release escrow
        const releaseEscrowRef = `/escrow/payments|test_service|${serviceUser}|0/${serviceAdmin}/0/release/key0`;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: releaseEscrowRef,
          value: {
            ratio: 1
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore);
      });

      it('payments: admin can claim payments (target = service account)', () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service/${serviceUser}/0/pay/key3`;
        const amount = adminBalanceBefore - 1;
        let body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const payResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${payRef}/result/code`).body.toString('utf-8')).result;
        expect(payResult).to.equals(FunctionResultCode.SUCCESS);

        const claimRef = `/payments/test_service/${serviceUser}/0/claim/key3`;
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: claimRef,
          value: {
            amount: paymentBalance,
            target: `payments|test_service|${serviceAdmin}|0`
          }
        }}).body.toString('utf-8'));
        if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
          console.log(`Failed to check finalization of tx.`)
        }
        const claimResult = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=${claimRef}/result/code`).body.toString('utf-8')).result;
        expect(claimResult).to.equals(FunctionResultCode.SUCCESS);
        const adminServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceAdmin}|0/balance`)
                .body.toString('utf-8')).result;
        expect(adminServiceAccountBalanceAfter).to.equals(paymentBalance);
        const userServiceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(userServiceAccountBalance).to.equals(0);
      });
    });

    describe('Escrow (_openEscrow, _hold, _release)', () => {
      describe('Escrow: individual -> individual', () => {
        it('escrow: individual -> individual: open escrow', () => {
          const openRef = `/escrow/${serviceUser}/${serviceAdmin}/0/open`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: openRef,
            value: {
              admin: {
                [serviceAdmin]: true
              }
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          const escrowServiceAccountAdmin = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/admin/${serviceAdmin}`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountAdmin).to.equals(true);
        });

        it("escrow: individual -> individual: cannot open escrow if it's already open", () => {
          const openRef = `/escrow/${serviceUser}/${serviceAdmin}/0/open`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: openRef,
            value: {
              admin: {
                [serviceAdmin]: true
              }
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it("escrow: individual -> individual: non-source account cannot write hold", () => {
          const key = Date.now();
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

        it("escrow: individual -> individual: source account can write hold", () => {
          const key = Date.now();
          const holdRef = `/escrow/${serviceUser}/${serviceAdmin}/0/hold/${key}`;
          const userBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: userBalanceBefore
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
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
          const key = Date.now();
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
          const key = Date.now();
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
          const key = Date.now();
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 1.1
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it("escrow: individual -> individual: admin account can write release (ratio = 0)", () => {
          const key = Date.now();
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
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
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
        it('escrow: service -> individual: open escrow', () => {
          // set up payments & service accounts for payments
          const configPath = '/payments/test_service/config'
          let body = parseOrLog(syncRequest('POST', server1 + '/set', {json: {
            op_list: [
              {
                type: 'SET_OWNER',
                ref: configPath,
                value: {
                  ".owner": {
                    "owners": {
                      "*": {
                        "branch_owner": false,
                        "write_owner": false,
                        "write_rule": false,
                        "write_function": false
                      },
                      [serviceAdmin]: {
                        "branch_owner": true,
                        "write_owner": true,
                        "write_rule": true,
                        "write_function": true
                      }
                    }
                  }
                }
              },
              {
                type: 'SET_VALUE',
                ref: `${configPath}/admin/${serviceAdmin}`,
                value: true
              }
            ]
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          const key = Date.now();
          const payRef = `/payments/test_service/${serviceUser}/0/pay/${key}`;
          const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
          const amount = adminBalanceBefore;
          body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: payRef,
            value: {
              amount
            }
          }}).body.toString('utf-8'));
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          // open escrow
          const source = `payments|test_service|${serviceUser}|0`;
          const target = serviceAdmin;
          const openRef = `/escrow/${source}/${target}/1/open`;
          body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: openRef,
            value: {
              admin: {
                [serviceAdmin]: true
              }
            },
            nonce: -1
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          const escrowServiceAccountAdmin = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/admin/${serviceAdmin}`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountAdmin).to.equals(true);
        });

        it("escrow: service -> individual: non-service account admin cannot write hold", () => {
          const key = Date.now();
          const source = `payments|test_service|${serviceUser}|0`;
          const target = serviceAdmin;
          const holdRef = `/escrow/${source}/${target}/1/hold/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: paymentBalanceBefore
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
        });

        it("escrow: service -> individual: service account admin can write hold", () => {
          const key = Date.now();
          const source = `payments|test_service|${serviceUser}|0`;
          const target = serviceAdmin;
          const holdRef = `/escrow/${source}/${target}/1/hold/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: paymentBalanceBefore
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          const holdResult = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=${holdRef}/result/code`).body.toString('utf-8')).result;
          expect(holdResult).to.equals(FunctionResultCode.SUCCESS);
          const escrowServiceAccountBalance = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalance).to.equals(paymentBalanceBefore);
        });

        it("escrow: service -> individual: admin account can write release (ratio = 0, refund to payments via _transfer)", () => {
          const key = Date.now();
          const source = `payments|test_service|${serviceUser}|0`;
          const target = serviceAdmin;
          const releaseRef = `/escrow/${source}/${target}/1/release/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const escrowServiceAccountBalanceBefore = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 0
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          const releaseResult = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=${releaseRef}/result/code`).body.toString('utf-8')).result;
          expect(releaseResult).to.equals(FunctionResultCode.SUCCESS);
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(0);
          const paymentBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          expect(paymentBalanceAfter).to.equals(paymentBalanceBefore + escrowServiceAccountBalanceBefore);
        });

        it("escrow: service -> individual: admin account can write release (ratio = 0.5)", () => {
          // hold
          let key = Date.now();
          const source = `payments|test_service|${serviceUser}|0`;
          const target = serviceAdmin;
          const holdRef = `/escrow/${source}/${target}/1/hold/${key}`;
          const paymentBalance = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          let body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: paymentBalance
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          // release
          key = Date.now();
          const releaseRef = `/escrow/${source}/${target}/1/release/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
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
          if (!waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash'))) {
            console.log(`Failed to check finalization of tx.`)
          }
          const releaseResult = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=${releaseRef}/result/code`).body.toString('utf-8')).result;
          expect(releaseResult).to.equals(FunctionResultCode.SUCCESS);
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(0);
          const paymentBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          expect(paymentBalanceAfter).to.equals(paymentBalanceBefore + escrowServiceAccountBalanceBefore / 2);
          const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
          expect(adminBalanceAfter).to.equals(adminBalanceBefore + escrowServiceAccountBalanceBefore / 2);
        });
      });
    });
  });
});
