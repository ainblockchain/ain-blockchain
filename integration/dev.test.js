const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const _ = require("lodash");
const spawn = require("child_process").spawn;
const PROJECT_ROOT = require('path').dirname(__filename) + "/../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const sleep = require('system-sleep');
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const jayson = require('jayson/promise');
const ainUtil = require('@ainblockchain/ain-util');
const {
  BLOCKCHAINS_DIR,
  FunctionResultCode,
  MAX_TX_BYTES,
  GenesisAccounts,
  HASH_DELIMITER,
  PredefinedDbPaths,
  WriteDbOperations,
  OwnerProperties,
  RuleProperties,
  FunctionProperties,
  FunctionTypes,
  NativeFunctionIds,
  buildOwnerPermissions
} = require('../constants');
const ChainUtil = require('../chain-util');
const { waitUntilTxFinalized } = require('../test/test-util');
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;

const ENV_VARIABLES = [
  {
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
];

const server1 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[0].ACCOUNT_INDEX))
const server2 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[1].ACCOUNT_INDEX))
const server3 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[2].ACCOUNT_INDEX))
const server4 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[3].ACCOUNT_INDEX))
const servers = [ server1, server2, server3, server4 ];

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

setUp = () => {
  let res = JSON.parse(syncRequest('POST', server2 + '/set', {
    json: {
      op_list: [
        {
          type: 'SET_VALUE',
          ref: 'test/test',
          value: 100
        },
        {
          type: 'SET_RULE',
          ref: '/test/test_rule/some/path',
          value: {
            ".write": "auth === 'abcd'"
          }
        },
        {
          type: 'SET_FUNCTION',
          ref: '/test/test_function/some/path',
          value: {
            ".function": "some function config"
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
        }
      ]
    }
  }).body.toString('utf-8')).result;
  waitUntilTxFinalized(servers, res.tx_hash);
}

cleanUp = () => {
  let res = JSON.parse(syncRequest('POST', server2 + '/set', {
    json: {
      op_list: [
        {
          type: 'SET_OWNER',
          ref: '/test/test_owner/some/path',
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
          type: 'SET_VALUE',
          ref: 'test/test',
          value: null
        }
      ]
    }
  }).body.toString('utf-8')).result;
  waitUntilTxFinalized(servers, res.tx_hash);
}

setUpForSharding = (shardingConfig) => {
  const { shard_owner, shard_reporter, sharding_path } = shardingConfig;
  const res = JSON.parse(
    syncRequest(
      'POST',
      server1 + '/set',
      {
        json: {
          op_list: [
            {
              type: WriteDbOperations.SET_OWNER,
              ref: sharding_path,
              value: {
                [OwnerProperties.OWNER]: {
                  [OwnerProperties.OWNERS]: {
                    [shard_owner]: buildOwnerPermissions(true ,true, true, true),
                    [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false)
                  }
                }
              }
            },
            {
              type: WriteDbOperations.SET_RULE,
              ref: sharding_path,
              value: {
                [RuleProperties.WRITE]: `auth === '${shard_reporter}'`
              }
            },
            {
              type: WriteDbOperations.SET_FUNCTION,
              ref: `${sharding_path}/$block_number/proof_hash`,
              value: {
                [FunctionProperties.FUNCTION]: {
                  [FunctionProperties.FUNCTION_TYPE]: FunctionTypes.NATIVE,
                  [FunctionProperties.FUNCTION_ID]: NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT
                }
              }
            },
            {
              type: WriteDbOperations.SET_VALUE,
              ref: ChainUtil.formatPath([
                PredefinedDbPaths.SHARDING,
                PredefinedDbPaths.SHARDING_SHARD,
                ainUtil.encode(sharding_path)
              ]),
              value: shardingConfig
            }
          ]
        }
      }
    ).body.toString('utf-8')
  ).result;
  waitUntilTxFinalized(servers, res.tx_hash);
}

describe('API Tests', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc

  before(() => {
    rimraf.sync(BLOCKCHAINS_DIR)

    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', {}, false);
    sleep(2000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0]);
    sleep(2000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1]);
    sleep(2000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2]);
    sleep(2000);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[3]);
    sleep(2000);
  });

  after(() => {
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()
    server4_proc.kill()

    rimraf.sync(BLOCKCHAINS_DIR)
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
        const body = JSON.parse(syncRequest('GET', server1 + '/get_value?ref=test/test')
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: 100});
      })
    })
  
    describe('/get_function', () => {
      it('get_function', () => {
        const body =
            JSON.parse(syncRequest('GET', server1 + '/get_function?ref=/test/test_function/some/path')
              .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: {
            ".function": "some function config"
          }
        });
      })
    })
  
    describe('/get_rule', () => {
      it('get_rule', () => {
        const body =
            JSON.parse(syncRequest('GET', server1 + '/get_rule?ref=/test/test_rule/some/path')
              .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: {
            ".write": "auth === 'abcd'"
          }
        });
      })
    })
  
    describe('/get_owner', () => {
      it('get_owner', () => {
        const body = JSON.parse(syncRequest('GET', server1 +
                                            '/get_owner?ref=/test/test_owner/some/path')
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

    // TODO(minsu): fix get_proof bug and the following test case
    // describe('/get_proof', () => {
    //   const body = JSON.parse(syncRequest('GET', server1 + '/get_proof?ref=/')
    //     .body.toString('utf-8'));
    //   const ownersBody = JSON.parse(
    //     syncRequest('GET', server1 + `/get_proof?ref=/${PredefinedDbPaths.OWNERS_ROOT}`)
    //     .body.toString('utf-8'));
    //   const rulesBody = JSON.parse(
    //     syncRequest('GET', server1 + `/get_proof?ref=/${PredefinedDbPaths.RULES_ROOT}`)
    //     .body.toString('utf-8'));
    //   const valuesBody = JSON.parse(
    //     syncRequest('GET', server1 + `/get_proof?ref=/${PredefinedDbPaths.VALUES_ROOT}`)
    //     .body.toString('utf-8'));
    //   const functionsBody = JSON.parse(
    //     syncRequest('GET', server1 + `/get_proof?ref=/${PredefinedDbPaths.FUNCTIONS_ROOT}`)
    //     .body.toString('utf-8'));
    //   const ownersProof = ownersBody.result;
    //   const rulesProof = rulesBody.result;
    //   const valuesProof = valuesBody.result;
    //   const functionProof = functionsBody.result;
    //   // TODO(minsu): it needs to be updated after some updates on db/index.js
    //   // proof is somehow not updated when new blocks are added. After fixing this bug,
    //   // the if statement will be removed.
    //   if (!valuesProof && !ownersProof && !rulesProof && !functionProof) {
    //     assert.deepEqual(body, {code: 1, result: null});
    //   } else {
    //     const preimage = `owners${HASH_DELIMITER}${ownersProof}${HASH_DELIMITER}`
    //       + `rules${HASH_DELIMITER}${rulesProof}${HASH_DELIMITER}`
    //       + `values${HASH_DELIMITER}${valuesProof}${HASH_DELIMITER}`
    //       + `functions${HASH_DELIMITER}${functionProof}`;
    //     const proofHash = ChainUtil.hashString(ChainUtil.toString(preimage));
    //     assert.deepEqual(body, {code: 0, result: proofHash});
    //   }
    // });

    describe('/match_function', () => {
      let client;
      before(() => {
        client = jayson.client.http(server1 + '/json-rpc');
      })
  
      it('match_function', () => {
        sleep(200)
        const ref = "/test/test_function/some/path";
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = JSON.parse(syncRequest('GET', `${server1}/match_function?ref=${ref}`)
          .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: {
          "matched_path": {
            "target_path": "/test/test_function/some/path",
            "ref_path": "/test/test_function/some/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": "some function config",
            "path": "/test/test_function/some/path"
          },
          "subtree_configs": []
        }});
        return client.request('ain_matchFunction', request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "matched_path": {
              "target_path": "/test/test_function/some/path",
              "ref_path": "/test/test_function/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": "some function config",
              "path": "/test/test_function/some/path"
            },
            "subtree_configs": []
          });
        })
      })
    })
  
    describe('/match_rule', () => {
      let client;
      before(() => {
        client = jayson.client.http(server1 + '/json-rpc');
      })
  
      it('match_rule', () => {
        const ref = "/test/test_rule/some/path";
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = JSON.parse(syncRequest('GET', `${server1}/match_rule?ref=${ref}`)
          .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: {
          "matched_path": {
            "target_path": "/test/test_rule/some/path",
            "ref_path": "/test/test_rule/some/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": "auth === 'abcd'",
            "path": "/test/test_rule/some/path"
          },
          "subtree_configs": []
        }});
        return client.request('ain_matchRule', request)
        .then(res => {
          assert.deepEqual(res.result.result, {
            "matched_path": {
              "target_path": "/test/test_rule/some/path",
              "ref_path": "/test/test_rule/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": "auth === 'abcd'",
              "path": "/test/test_rule/some/path"
            },
            "subtree_configs": []
          });
        })
      })
    })
  
    describe('/match_owner', () => {
      let client;
      before(() => {
        client = jayson.client.http(server1 + '/json-rpc');
      })
  
      it('match_owner', () => {
        const ref = "/test/test_owner/some/path";
        const request = { ref, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = JSON.parse(syncRequest('GET', `${server1}/match_owner?ref=${ref}`)
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
        return client.request('ain_matchOwner', request)
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
  
    describe('/eval_rule', () => {
      let client;
      before(() => {
        client = jayson.client.http(server1 + '/json-rpc');
      })
  
      it('eval_rule returning true', () => {
        const ref = "/test/test_rule/some/path";
        const value = "value";
        const address = "abcd";
        const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = JSON.parse(syncRequest('POST', server1 + '/eval_rule', {json: request})
          .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: true});
        return client.request('ain_evalRule', request)
        .then(res => {
          expect(res.result.result).to.equal(true);
        })
      })
  
      it('eval_rule returning false', () => {
        const ref = "/test/test_rule/some/path";
        const value = "value";
        const address = "efgh";
        const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = JSON.parse(syncRequest('POST', server1 + '/eval_rule', {json: request})
          .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: false});
        return client.request('ain_evalRule', request)
        .then(res => {
          expect(res.result.result).to.equal(false);
        })
      })
    })
  
    describe('/eval_owner', () => {
      it('eval_owner', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const ref = "/test/test_owner/some/path";
        const address = "abcd";
        const permission = "write_owner";
        const request = { ref, permission, address, protoVer: CURRENT_PROTOCOL_VERSION };
        const body = JSON.parse(syncRequest('POST', server1 + '/eval_owner', {json: request})
          .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: true,
        });
        return client.request('ain_evalOwner', request)
        .then(res => {
          assert.deepEqual(res.result.result, true);
        })
      })
    })
  
    describe('/get', () => {
      it('get', () => {
        const request = {
          op_list: [
            {
              type: "GET_VALUE",
              ref: "/test/test",
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
        const body = JSON.parse(syncRequest('POST', server1 + '/get', {json: request})
          .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: [
            100,
            {
              ".function": "some function config"
            },
            {
              ".write": "auth === 'abcd'"
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

    describe('/ain_getProtocolVersion', () => {
      it('returns the correct version', () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        return client.request('ain_getProtocolVersion', {})
        .then(res => {
          expect(res.result.protoVer).to.equal(CURRENT_PROTOCOL_VERSION);
        })
      });
    });
  
    describe('/ain_checkProtocolVersion', () => {
      it('checks protocol versions correctly', () => {
        return new Promise((resolve, reject) => {
          const client = jayson.client.http(server1 + '/json-rpc');
          let promises = [];
          promises.push(client.request('ain_checkProtocolVersion', {}));
          promises.push(client.request('ain_checkProtocolVersion', {protoVer: '0'}));
          promises.push(client.request('ain_checkProtocolVersion', {protoVer: 0}));
          promises.push(client.request('ain_checkProtocolVersion', {protoVer: CURRENT_PROTOCOL_VERSION}));
          promises.push(client.request('ain_checkProtocolVersion', {protoVer: '0.0.1'}));
          Promise.all(promises).then(res => {
            expect(res[0].result.code).to.equal(1);
            expect(res[0].result.message).to.equal("Protocol version not specified.");
            expect(res[1].result.code).to.equal(1);
            expect(res[1].result.message).to.equal("Invalid protocol version.");
            expect(res[2].result.code).to.equal(1);
            expect(res[2].result.message).to.equal("Invalid protocol version.");
            expect(res[3].result.code).to.equal(0);
            expect(res[3].result.result).to.equal("Success");
            expect(res[4].result.code).to.equal(1);
            expect(res[4].result.message).to.equal("Incompatible protocol version.");
            resolve();
          })
        });
      });
    })

    describe('/ain_getAddress', () => {
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
        const request = {ref: 'test/value', value: "something"};
        const body = JSON.parse(syncRequest('POST', server1 + '/set_value', {json: request})
          .body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
      })
    })

    describe('/inc_value', () => {
      it('inc_value', () => {
        const request = {ref: "test/test", value: 10};
        const body = JSON.parse(syncRequest('POST', server1 + '/inc_value', {json: request})
          .body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
      })
    })

    describe('/dec_value', () => {
      it('dec_value', () => {
        const request = {ref: "test/test", value: 10};
        const body = JSON.parse(syncRequest('POST', server1 + '/dec_value', {json: request})
          .body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
      })
    })

    describe('/set_function', () => {
      it('set_function', () => {
        const request = {
          ref: "/test/test_function/other/path",
          value: {
            ".function": "some other function config"
          }
        };
        const body = JSON.parse(syncRequest('POST', server1 + '/set_function', {json: request})
          .body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
      })
    })

    describe('/set_rule', () => {
      it('set_rule', () => {
        const request = {
          ref: "/test/test_rule/other/path",
          value: {
            ".write": "some other rule config"
          }
        };
        const body = JSON.parse(syncRequest('POST', server1 + '/set_rule', {json: request})
          .body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
      })
    })

    describe('/set_owner', () => {
      it('set_owner', () => {
        const request = {
          ref: "/test/test_owner/other/path",
          value: {
            ".owner": "some other owner config"
          }
        };
        const body = JSON.parse(syncRequest('POST', server1 + '/set_owner', {json: request})
          .body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
      })
    })

    describe('/set', () => {
      it('set', () => {
        const request = {
          op_list: [
            {
              type: "SET_VALUE",
              ref: "test/balance",
              value: {a: 1, b: 2}
            },
            {
              type: 'INC_VALUE',
              ref: "test/test",
              value: 10
            },
            {
              type: 'DEC_VALUE',
              ref: "test/test2",
              value: 10
            },
            {
              type: 'SET_FUNCTION',
              ref: "/test/test_function/other2/path",
              value: {
                ".function": "some other2 function config"
              }
            },
            {
              type: 'SET_RULE',
              ref: "/test/test_rule/other2/path",
              value: {
                ".write": "some other2 rule config"
              }
            },
            {
              type: 'SET_OWNER',
              ref: "/test/test_owner/other2/path",
              value: {
                ".owner": "some other2 owner config"
              }
            }
          ]
        };
        const body = JSON.parse(syncRequest('POST', server1 + '/set', {json: request})
          .body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
      })
    })

    describe('/batch', () => {
      it('batch', () => {
        const request = {
          tx_list: [
            {
              operation: {
                // Default type: SET_VALUE
                ref: 'test/a',
                value: 1
              }
            },
            {
              operation: {
                type: 'INC_VALUE',
                ref: "test/test",
                value: 10
              }
            },
            {
              operation: {
                type: 'DEC_VALUE',
                ref: "test/test2",
                value: 10
              }
            },
            {
              operation: {
                type: 'SET_FUNCTION',
                ref: "/test/test_function/other3/path",
                value: {
                  ".function": "some other3 function config"
                }
              }
            },
            {
              operation: {
                type: 'SET_RULE',
                ref: "/test/test_rule/other3/path",
                value: {
                  ".write": "some other3 rule config"
                }
              }
            },
            {
              operation: {
                type: 'SET_OWNER',
                ref: "/test/test_owner/other3/path",
                value: {
                  ".owner": "some other3 owner config"
                }
              }
            },
            {
              operation: {
                type: 'SET',
                op_list: [
                  {
                    type: "SET_VALUE",
                    ref: "test/balance",
                    value: {
                      a:1,
                      b:2
                    }
                  },
                  {
                    type: 'INC_VALUE',
                    ref: "test/test",
                    value: 5
                  },
                  {
                    type: 'DEC_VALUE',
                    ref: "test/test2",
                    value: 5
                  },
                  {
                    type: 'SET_FUNCTION',
                    ref: "/test/test_function/other4/path",
                    value: {
                      ".function": "some other4 function config"
                    }
                  },
                  {
                    type: 'SET_RULE',
                    ref: "/test/test_rule/other4/path",
                    value: {
                      ".write": "some other4 rule config"
                    }
                  },
                  {
                    type: 'SET_OWNER',
                    ref: "/test/test_owner/other4/path",
                    value: {
                      ".owner": "some other4 owner config"
                    }
                  }
                ]
              }
            }
          ]
        };
        const body = JSON.parse(syncRequest('POST', server1 + '/batch', {json: request})
            .body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.deepEqual(body.result.result, [
          true,
          true,
          true,
          true,
          true,
          true,
          true,
        ]);
      })
    })

    describe('/ain_sendSignedTransaction', () => {
      it('rejects a transaction that exceeds the size limit.', () => {
        const account = ainUtil.createAccount();
        const client = jayson.client.http(server1 + '/json-rpc');
        let longText = '';
        for (let i = 0; i < MAX_TX_BYTES / 2; i++) {
          longText += 'a'
        }
        const transaction = {
          operation: {
            type: 'SET_VALUE',
            value: longText,
            ref: `test/test_long_text`
          },
          timestamp: Date.now() + 100000,
          nonce: -1
        }
        const signature =
            ainUtil.ecSignTransaction(transaction, Buffer.from(account.private_key, 'hex'));
        return client.request('ain_sendSignedTransaction', { transaction, signature,
            protoVer: CURRENT_PROTOCOL_VERSION })
          .then((res) => {
            assert.deepEqual(res.result, {
              code: 1,
              message: `Transaction size exceeds ${MAX_TX_BYTES} bytes.`,
              protoVer: CURRENT_PROTOCOL_VERSION
            });
          })
      })
    })
  })

  describe('Native functions', () => {
    let transferFrom; // = server1
    let transferTo; // = server2
    let transferFromBad;     // = server3
    const transferAmount = 33;
    let transferPath;
    let transferFromBalancePath;
    let transferToBalancePath;

    let depositServiceAdmin; // = server1
    let depositActor; // = server2
    let depositActorBad;     // = server3
    const depositAmount = 50;
    let depositAccountPath;
    let depositPath;
    let withdrawPath;
    let depositBalancePath;

    let shardOwner, shardReporter, shardingPath, encodedShardingPath, shardingConfig;

    before(() => {
      transferFrom =
          JSON.parse(syncRequest('GET', server1 + '/get_address').body.toString('utf-8')).result;
      transferTo =
          JSON.parse(syncRequest('GET', server2 + '/get_address').body.toString('utf-8')).result;
      transferFromBad =
          JSON.parse(syncRequest('GET', server3 + '/get_address').body.toString('utf-8')).result;
      transferPath = `/transfer/${transferFrom}/${transferTo}`;
      transferFromBalancePath = `/accounts/${transferFrom}/balance`;
      transferToBalancePath = `/accounts/${transferTo}/balance`;

      depositServiceAdmin =
          JSON.parse(syncRequest('GET', server1 + '/get_address').body.toString('utf-8')).result;
      depositActor =
          JSON.parse(syncRequest('GET', server2 + '/get_address').body.toString('utf-8')).result;
      depositActorBad =
          JSON.parse(syncRequest('GET', server3 + '/get_address').body.toString('utf-8')).result;
      depositAccountPath = `/deposit_accounts/test_service/${depositActor}`;
      depositPath = `/deposit/test_service/${depositActor}`;
      withdrawPath = `/withdraw/test_service/${depositActor}`;
      depositBalancePath = `/accounts/${depositActor}/balance`;

      shardOwner = transferFrom;
      shardReporter = transferTo;
      shardingPath = '/apps/afan';
      encodedShardingPath = ainUtil.encode(shardingPath);
      shardingConfig = {
        sharding_protocol: "POA",
        sharding_path: shardingPath,
        parent_chain_poc: server1,
        reporting_period: 5,
        shard_owner: shardOwner,
        shard_reporter: shardReporter
      };

      let res = JSON.parse(syncRequest('POST', server1+'/set_value',
                  {json: {ref: `/accounts/${depositServiceAdmin}/balance`, value: 1000}}).body.toString('utf-8')).result;
      waitUntilTxFinalized(servers, res.tx_hash);
      res = JSON.parse(syncRequest('POST', server1+'/set_value', {json: {ref: depositBalancePath, value: 1000}}).body.toString('utf-8')).result;
      waitUntilTxFinalized(servers, res.tx_hash);
      res = JSON.parse(syncRequest('POST', server1+'/set_value',
                  {json: {ref: `/accounts/${depositActorBad}/balance`, value: 1000}}).body.toString('utf-8')).result;
      waitUntilTxFinalized(servers, res.tx_hash);
    })

    describe('_transfer', () => {
      it('transfer', () => {
        let fromBeforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/1/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
        waitUntilTxFinalized(servers, body.result.tx_hash);
        const fromAfterBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const resultCode = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferPath}/1/result/code`)
          .body.toString('utf-8')).result
        expect(fromAfterBalance).to.equal(fromBeforeBalance - transferAmount);
        expect(toAfterBalance).to.equal(toBeforeBalance + transferAmount);
        expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
      });

      it('transfer more than account balance', () => {
        let fromBeforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/2/value',
          value: fromBeforeBalance + 1
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        const fromAfterBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer by another address', () => {
        let fromBeforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server3 + '/set_value', {json: {
          ref: transferPath + '/3/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        const fromAfterBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer with a duplicated key', () => {
        const body = JSON.parse(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/1/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('transfer with same addresses', () => {
        const transferPathSameAddrs = `/transfer/${transferFrom}/${transferFrom}`;
        const body = JSON.parse(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathSameAddrs + '/4/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('transfer with non-checksum addreess', () => {
        const fromLowerCase = _.toLower(transferFrom);
        const transferPathFromLowerCase = `/transfer/${fromLowerCase}/${transferTo}`;
        const bodyFromLowerCase = JSON.parse(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathFromLowerCase + '/101/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyFromLowerCase.code).to.equals(1);

        const toLowerCase = _.toLower(transferTo);
        const transferPathToLowerCase = `/transfer/${transferFrom}/${toLowerCase}`;
        const bodyToLowerCase = JSON.parse(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathToLowerCase + '/102/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyToLowerCase.code).to.equals(1);

        const fromUpperCase = _.toLower(transferFrom);
        const transferPathFromUpperCase = `/transfer/${fromUpperCase}/${transferTo}`;
        const bodyFromUpperCase = JSON.parse(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathFromUpperCase + '/103/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyFromUpperCase.code).to.equals(1);

        const toUpperCase = _.toLower(transferTo);
        const transferPathToUpperCase = `/transfer/${transferFrom}/${toUpperCase}`;
        const bodyToUpperCase = JSON.parse(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathToUpperCase + '/104/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyToUpperCase.code).to.equals(1);
      });
    })

    describe('_deposit', () => {
      it('setup deposit', () => {
        const configPath = '/deposit_accounts/test_service/config'
        const body = JSON.parse(syncRequest('POST', server2 + '/set', {json: {
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
                      "write_rule": false
                    },
                    [depositServiceAdmin]: {
                      "branch_owner": true,
                      "write_owner": true,
                      "write_rule": true
                    }
                  }
                }
              }
            },
            {
              type: 'SET_VALUE',
              ref: configPath,
              value: { lockup_duration: 1000 }
            }
          ]
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        waitUntilTxFinalized(servers, body.result.tx_hash);
      })

      it('deposit', () => {
        let beforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositBalancePath}`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server2 + '/set_value', {json: {
          ref: depositPath + '/1/value',
          value: depositAmount
        }}).body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
        waitUntilTxFinalized(servers, body.result.tx_hash);
        const depositValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositPath}/1/value`).body.toString('utf-8')).result;
        const depositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const balance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositBalancePath}`).body.toString('utf-8')).result;
        const resultCode = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositPath}/1/result/code`)
          .body.toString('utf-8')).result;
        expect(depositValue).to.equal(depositAmount);
        expect(depositAccountValue).to.equal(depositAmount);
        expect(balance).to.equal(beforeBalance - depositAmount);
        expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
      });

      it('deposit more than account balance', () => {
        const beforeBalance = JSON.parse(syncRequest('GET', server2 +
            `/get_value?ref=/accounts/${depositActor}/balance`).body.toString('utf-8')).result;
        const beforeDepositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server2 + '/set_value', {json: {
          ref: depositPath + '/2/value',
          value: beforeBalance + 1
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        const depositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const balance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositBalancePath}`).body.toString('utf-8')).result;
        expect(depositAccountValue).to.equal(beforeDepositAccountValue);
        expect(balance).to.equal(beforeBalance);
      });

      it('deposit by another address', () => {
        const beforeDepositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server3 + '/set_value', {json: {
          ref: `${depositPath}/3/value`,
          value: depositAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        const depositRequest = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositPath}/3`).body.toString('utf-8')).result;
        const depositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        expect(depositRequest).to.equal(null);
        expect(depositAccountValue).to.equal(beforeDepositAccountValue);
      });

      // TODO (lia): update test code after fixing timestamp verification logic.
      it('deposit with invalid timestamp', () => {
        const account = ainUtil.createAccount();
        const res = JSON.parse(syncRequest('POST', server2+'/set_value',
                    {json: {ref: `/accounts/${account.address}/balance`, value: 1000}}).body.toString('utf-8')).result;
        waitUntilTxFinalized(servers, res.tx_hash);
        const transaction = {
          operation: {
            type: 'SET_VALUE',
            value: depositAmount,
            ref: `deposit/test_service/${account.address}/1/value`
          },
          timestamp: Date.now() + 100000,
          nonce: 0
        }
        const signature =
            ainUtil.ecSignTransaction(transaction, Buffer.from(account.private_key, 'hex'));
        
        const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
        return jsonRpcClient.request('ain_sendSignedTransaction', { transaction, signature,
          protoVer: CURRENT_PROTOCOL_VERSION })
        .then(res => {
          const depositResult = JSON.parse(syncRequest('GET',
              server2 + `/get_value?ref=/deposit/test_service/${account.address}/1/result/code`)
            .body.toString('utf-8')).result;
          expect(depositResult).to.equal(FunctionResultCode.FAILURE);
        });
      });

      it('deposit with the same deposit_id', () => {
        const body = JSON.parse(syncRequest('POST', server2 + '/set_value', {json: {
          ref: depositPath + '/1/value',
          value: depositAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
      });

      it('deposit with non-checksum addreess', () => {
        const addrLowerCase = _.toLower(depositActor);
        const depositPathLowerCase = `/deposit/checksum_addr_test_service/${addrLowerCase}`;
        const bodyLowerCase = JSON.parse(syncRequest('POST', server2 + '/set_value', {json: {
          ref: depositPathLowerCase + '/101/value',
          value: depositAmount
        }}).body.toString('utf-8'));
        expect(bodyLowerCase.code).to.equals(1);

        const addrUpperCase = _.toUpper(depositActor);
        const depositPathUpperCase = `/deposit/checksum_addr_test_service/${addrUpperCase}`;
        const bodyUpperCase = JSON.parse(syncRequest('POST', server2 + '/set_value', {json: {
          ref: depositPathUpperCase + '/102/value',
          value: depositAmount
        }}).body.toString('utf-8'));
        expect(bodyUpperCase.code).to.equals(1);
      });
    });

    describe('_withdraw', () => {
      it('withdraw by another address', () => {
        let beforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${depositActorBad}/balance`)
          .body.toString('utf-8')).result;
        let beforeDepositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server3 + '/set_value', {json: {
          ref: `${withdrawPath}/1/value`,
          value: depositAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        const withdrawRequest = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${withdrawPath}/1`).body.toString('utf-8')).result;
        const depositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const balance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${depositActorBad}/balance`)
          .body.toString('utf-8')).result;
        expect(withdrawRequest).to.equal(null);
        expect(depositAccountValue).to.equal(beforeDepositAccountValue);
        expect(balance).to.equal(beforeBalance);
      });

      it('withdraw more than deposited amount', () => {
        let beforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositBalancePath}`).body.toString('utf-8')).result;
        let beforeDepositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${withdrawPath}/1/value`,
          value: beforeDepositAccountValue + 1
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        const depositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const balance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositBalancePath}`).body.toString('utf-8')).result;
        expect(depositAccountValue).to.equal(beforeDepositAccountValue);
        expect(balance).to.equal(beforeBalance);
      });

      it('withdraw', () => {
        let beforeBalance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositBalancePath}`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${withdrawPath}/2/value`,
          value: depositAmount,
          is_nonced_transaction: false // TODO (lia): remove this once state snapshot is fixed and txs aren't getting dropped
        }}).body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
        waitUntilTxFinalized(servers, body.result.tx_hash);
        const depositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const balance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositBalancePath}`).body.toString('utf-8')).result;
        const resultCode = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${withdrawPath}/2/result/code`)
          .body.toString('utf-8')).result;
        expect(depositAccountValue).to.equal(0);
        expect(balance).to.equal(beforeBalance + depositAmount);
        expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
      });

      it('deposit after withdraw', () => {
        const newDepositAmount = 100;
        const beforeBalance = JSON.parse(syncRequest('GET', server2 +
            `/get_value?ref=/accounts/${depositActor}/balance`).body.toString('utf-8')).result;
        const beforeDepositAccountValue = JSON.parse(syncRequest('GET', server2 +
            `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const body = JSON.parse(syncRequest('POST', server2 + '/set_value', {json: {
          ref: depositPath + '/3/value',
          value: newDepositAmount,
          is_nonced_transaction: false // TODO (lia): remove this once state snapshot is fixed and txs aren't getting dropped
        }}).body.toString('utf-8'));
        assert.equal(body.code, 0);
        assert.equal(body.result.result, true);
        waitUntilTxFinalized(servers, body.result.tx_hash);
        const depositValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositPath}/3/value`).body.toString('utf-8')).result;
        const depositAccountValue = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositAccountPath}/value`).body.toString('utf-8')).result;
        const balance = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositBalancePath}`).body.toString('utf-8')).result;
        const resultCode = JSON.parse(syncRequest('GET',
            server2 + `/get_value?ref=${depositPath}/3/result/code`)
                .body.toString('utf-8')).result;
        expect(depositValue).to.equal(newDepositAmount);
        expect(depositAccountValue).to.equal(beforeDepositAccountValue + newDepositAmount);
        expect(balance).to.equal(beforeBalance - newDepositAmount);
        expect(resultCode).to.equal(FunctionResultCode.SUCCESS);
      });
    });

    describe('_updateLatestShardReport', () => {
      before(() => {
        setUpForSharding(shardingConfig);
      });

      it('updates the block number of the latest reported proof hash', () => {
        const reportVal = {
          ref: `${shardingPath}/5/proof_hash`,
          value: "0xPROOF_HASH_5"
        }
        const shardReportRes = JSON.parse(
          syncRequest('POST', server2 + '/set_value', { json: reportVal }).body.toString('utf-8')
        ).result;
        waitUntilTxFinalized(servers, shardReportRes.tx_hash);
        const shardingPathRes = JSON.parse(
          syncRequest('GET', server1 + `/get_value?ref=${shardingPath}`).body.toString('utf-8')
        ).result;
        assert.deepEqual(shardingPathRes, {
          latest: 5,
          5: {
            proof_hash: "0xPROOF_HASH_5"
          }
        });
      });

      it('can handle reports that are out of order', () => {
        const multipleReportVal = {
          op_list: [
            {
              ref: `${shardingPath}/15/proof_hash`,
              value: "0xPROOF_HASH_15" 
            },
            {
              ref: `${shardingPath}/10/proof_hash`,
              value: "0xPROOF_HASH_10" 
            }
          ]
        }
        const shardReportRes = JSON.parse(
          syncRequest('POST', server2 + '/set', { json: multipleReportVal }).body.toString('utf-8')
        ).result;
        waitUntilTxFinalized(servers, shardReportRes.tx_hash);
        const shardingPathRes = JSON.parse(
          syncRequest('GET', server1 + `/get_value?ref=${shardingPath}`).body.toString('utf-8')
        ).result;
        assert.deepEqual(shardingPathRes, {
          latest: 15,
          5: {
            proof_hash: "0xPROOF_HASH_5"
          },
          10: {
            proof_hash: "0xPROOF_HASH_10"
          },
          15: {
            proof_hash: "0xPROOF_HASH_15"
          }
        });
      })
    });
  });
})
