const path = require('path');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const spawn = require("child_process").spawn;
const ainUtil = require('@ainblockchain/ain-util');
const syncRequest = require('sync-request');
const jayson = require('jayson/promise');
const rimraf = require("rimraf")
const _ = require('lodash');
const { parseOrLog } = require('../unittest/test-util');
const PROJECT_ROOT = require('path').dirname(__filename) + "/../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const {
  CURRENT_PROTOCOL_VERSION,
  CHAINS_DIR,
  PredefinedDbPaths,
  WriteDbOperations,
  RuleProperties,
  ShardingProperties,
  FunctionProperties,
  FunctionTypes,
  NativeFunctionIds,
} = require('../common/constants');
const {
  ConsensusStates
} = require('../consensus/constants');
const CommonUtil = require('../common/common-util');
const {
  readConfigFile,
  waitForNewBlocks,
  waitUntilNodeSyncs,
  waitUntilTxFinalized,
  waitUntilNetworkIsReady,
  setUpApp,
} = require('../unittest/test-util');

const ENV_VARIABLES = [
  {
    // For parent chain poc node
    MIN_NUM_VALIDATORS: 1, ACCOUNT_INDEX: 0, DEBUG: true,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
  },
  {
    // For shard chain tracker
    PORT: 9090, P2P_PORT: 6000,
    CONSOLE_LOG: false
  },
  {
    GENESIS_CONFIGS_DIR: 'genesis-configs/afan-shard',
    PORT: 9091, P2P_PORT: 6001,
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    GENESIS_CONFIGS_DIR: 'genesis-configs/afan-shard',
    PORT: 9092, P2P_PORT: 6002,
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    GENESIS_CONFIGS_DIR: 'genesis-configs/afan-shard',
    PORT: 9093, P2P_PORT: 6003,
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    GENESIS_CONFIGS_DIR: 'genesis-configs/afan-shard',
    PORT: 9094, P2P_PORT: 6004,
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
];

const parentServer = 'http://localhost:8081';
const parentServerList = [ parentServer ];
const server1 = 'http://localhost:' + String(9091 + Number(ENV_VARIABLES[2].ACCOUNT_INDEX))
const server2 = 'http://localhost:' + String(9091 + Number(ENV_VARIABLES[3].ACCOUNT_INDEX))
const server3 = 'http://localhost:' + String(9091 + Number(ENV_VARIABLES[4].ACCOUNT_INDEX))
const server4 = 'http://localhost:' + String(9091 + Number(ENV_VARIABLES[5].ACCOUNT_INDEX))
const shardServerList = [ server1, server2, server3, server4 ];
const account = ainUtil.createAccount();

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

// Needed to make sure the shard initialization is finished
// before other shard nodes start
async function waitUntilShardReporterStarts() {
  let consensusStatus;
  while (true) {
    consensusStatus = parseOrLog(syncRequest('GET', server1 + '/get_consensus_status')
        .body.toString('utf-8')).result;
    if (consensusStatus && consensusStatus.state === ConsensusStates.RUNNING) return;
    await CommonUtil.sleep(1000);
  }
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
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
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
        }
      ],
    }
  }).body.toString('utf-8')).result;
  assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
  if (!(await waitUntilTxFinalized(shardServerList, res.tx_hash))) {
    console.log(`Failed to check finalization of setUp() tx.`)
  }
}

async function cleanUp() {
  let res = parseOrLog(syncRequest('POST', server2 + '/set', {
    json: {
      op_list: [
        {
          type: 'SET_VALUE',
          ref: '/apps/test/test_value/some/path',
          value: null
        },
        {
          type: 'SET_RULE',
          ref: '/apps/test/test_rule/some/path',
          value: null
        },
        {
          type: 'SET_FUNCTION',
          ref: '/apps/test/test_function/some/path',
          value: null
        },
        {
          type: 'SET_OWNER',
          ref: '/apps/test/test_owner/some/path',
          value: null
        },
      ],
    }
  }).body.toString('utf-8')).result;
  assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
  if (!(await waitUntilTxFinalized(shardServerList, res.tx_hash))) {
    console.log(`Failed to check finalization of cleanUp() tx.`)
  }
}

describe('Sharding', async () => {
  const token =
      readConfigFile(path.resolve(__dirname, '../genesis-configs/afan-shard', 'genesis_token.json'));
  const parentAccounts =
      readConfigFile(path.resolve(__dirname, '../genesis-configs/base', 'genesis_accounts.json'));
  const parentServerAddr = parentAccounts.others[0].address;
  const accounts =
      readConfigFile(path.resolve(__dirname, '../genesis-configs/afan-shard', 'genesis_accounts.json'));
  const shardOwnerAddr = accounts.owner.address;
  const shardReporterAddr = accounts.others[0].address;
  const sharding =
      readConfigFile(path.resolve(__dirname, '../genesis-configs/afan-shard', 'genesis_sharding.json'));

  let parent_tracker_proc, parent_server_proc,
      tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc;

  before(async () => {
    rimraf.sync(CHAINS_DIR)

    parent_tracker_proc =
        startServer(TRACKER_SERVER, 'parent tracker server', { CONSOLE_LOG: false }, true);
    await CommonUtil.sleep(2000);
    parent_server_proc = startServer(APP_SERVER, 'parent server', ENV_VARIABLES[0], true);
    await CommonUtil.sleep(15000);
    // Give AIN to sharding owner and reporter
    const shardReportRes = parseOrLog(syncRequest(
      'POST', parentServer + '/set', { json: {
        op_list: [
          {
            type: 'SET_VALUE',
            ref: `/transfer/${parentServerAddr}/${shardOwnerAddr}/${Date.now()}/value`,
            value: 100
          },
          {
            type: 'SET_VALUE',
            ref: `/transfer/${parentServerAddr}/${shardReporterAddr}/${Date.now()}/value`,
            value: 100
          }
        ],
        nonce: -1
      } }).body.toString('utf-8')
    ).result;
    await waitUntilTxFinalized(parentServerList, shardReportRes.tx_hash);
    // Create app at the parent chain for the shard
    await setUpApp('afan', parentServerList, { admin: { [shardOwnerAddr]: true } });
    
    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', ENV_VARIABLES[1], true);
    await CommonUtil.sleep(3000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[2], true);
    await CommonUtil.sleep(10000);
    await waitUntilShardReporterStarts();
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[3], true);
    await CommonUtil.sleep(3000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[4], true);
    await CommonUtil.sleep(3000);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[5], true);
    await CommonUtil.sleep(3000); // Before shard reporting begins
  });

  after(() => {
    parent_tracker_proc.kill()
    parent_server_proc.kill()
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()
    server4_proc.kill()

    rimraf.sync(CHAINS_DIR)
  });

  describe('Parent chain initialization', () => {
    describe('DB values', () => {
      it('sharding', () => {
        const body = parseOrLog(syncRequest(
            'GET', parentServer +
            `/get_value?ref=/sharding/shard/${ainUtil.encode(sharding.sharding_path)}`)
          .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: Object.assign(
            {},
            sharding,
            {
              shard_owner: shardOwnerAddr,
              shard_reporter: shardReporterAddr
            }
          )
        });
      });

      it('.shard', () => {
        const body = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${sharding.sharding_path}/.shard`)
          .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: {
            sharding_enabled: true,
            proof_hash_map: {
              latest: -1
            }
          },
        });
      });
    });

    describe('DB functions', () => {
      it('sharding path', () => {
        const body = parseOrLog(syncRequest(
            'GET', parentServer +
            `/get_function?ref=${sharding.sharding_path}/.shard/proof_hash_map`)
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result).to.not.be.null;
        assert.deepEqual(body.result, {
          "$block_number": {
            "proof_hash": {
              ".function": {
                "_updateLatestShardReport": {
                  "function_type": "NATIVE",
                  "function_id": "_updateLatestShardReport"
                }
              }
            }
          }
        })
      });
    });

    describe('DB rules', () => {
      it('sharding path', () => {
        const body = parseOrLog(syncRequest(
            'GET', parentServer +
            `/get_rule?ref=${sharding.sharding_path}/` +
            `.shard/proof_hash_map/$block_number/proof_hash`)
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['.rule']['write']).to.have.string(shardReporterAddr);
      });
    });

    describe('DB owners', () => {
      it('sharding path', () => {
        const body = parseOrLog(syncRequest(
            'GET', parentServer + `/get_owner?ref=${sharding.sharding_path}`)
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['.owner'].owners[shardOwnerAddr]).to.not.be.null;
      });
    });
  });

  describe('Shard chain initialization', () => {
    before(async () => {
      await waitUntilNetworkIsReady(shardServerList);
      await setUpApp('afan', shardServerList, { admin: { [shardOwnerAddr]: true } });
    });
    
    describe('DB values', () => {
      it('token', () => {
        const body = parseOrLog(syncRequest('GET', server1 + '/get_value?ref=/token')
          .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: token});
      })

      it('accounts', () => {
        const body1 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/accounts/' + shardOwnerAddr + '/balance')
          .body.toString('utf-8'));
        expect(body1.code).to.equal(0);
        expect(body1.result).to.be.above(0);

        const body2 = parseOrLog(syncRequest(
            'GET', server1 + '/get_value?ref=/accounts/' + shardReporterAddr + '/balance')
          .body.toString('utf-8'));
        expect(body2.code).to.equal(0);
        expect(body2.result).to.be.above(0);
      })

      it('sharding', () => {
        const body = parseOrLog(syncRequest('GET', server1 + '/get_value?ref=/sharding/config')
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result.sharding_protocol).to.equal(sharding.sharding_protocol);
        expect(body.result.sharding_path).to.equal(sharding.sharding_path);
      })
    })

    describe('DB functions', () => {
      it('sharding', () => {
        const body = parseOrLog(syncRequest('GET', server2 + '/get_function?ref=/transfer')
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result).to.not.be.null;
      })
    })

    describe('DB rules', () => {
      it('sharding', () => {
        const body = parseOrLog(syncRequest('GET', server3 + '/get_rule?ref=/sharding/config')
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['.rule']['write']).to.have.string(shardOwnerAddr);
      })
    })

    describe('DB owners', () => {
      it('sharding', () => {
        const body = parseOrLog(syncRequest('GET', server4 + '/get_owner?ref=/sharding/config')
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['.owner'].owners[shardOwnerAddr]).to.not.be.null;
      })
    })
  });

  describe('State proof hash reporting', () => {
    before(async () => {
      await waitForNewBlocks(server1, sharding.reporting_period * 3);
    });

    describe('Periodic reports', () => {
      it ('reports proof hashes periodically', () => {
        const body = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${sharding.sharding_path}/.shard/proof_hash_map`)
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        let blockNumber = 0;
        const sortedReports = _.without(
            Object.keys(body.result), 'latest').sort((a, b) => Number(a) - Number(b));
        for (const key of sortedReports) {
          expect(blockNumber).to.equal(Number(key));
          blockNumber++;
        }
      });
    });

    describe('Latest block number', () => {
      it ('updates latest block number', () => {
        const body = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${sharding.sharding_path}/.shard/proof_hash_map`)
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        const latest = body.result.latest;
        const sortedReports = _.without(
            Object.keys(body.result), 'latest').sort((a, b) => Number(a) - Number(b));
        const highest = sortedReports[sortedReports.length - 1];
        expect(latest).to.equal(Number(highest));
      });
    });

    describe('Shard reporter node restart', () => {
      it('can resume reporting after missing some reports', async () => {
        const reportsBefore = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${sharding.sharding_path}/.shard/proof_hash_map`)
          .body.toString('utf-8'));
        console.log(`        --> Shutting down server[0]...`);
        server1_proc.kill();
        await waitForNewBlocks(server2, sharding.reporting_period);
        console.log(`        --> Restarting server[0]...`);
        server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[2]);
        await waitForNewBlocks(server2, sharding.reporting_period * 2);
        await waitUntilNodeSyncs(server1);
        await waitForNewBlocks(server1, sharding.reporting_period);
        const reportsAfter = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${sharding.sharding_path}/.shard/proof_hash_map`)
          .body.toString('utf-8'));
        let blockNumber = 0;
        const sortedReports = _.without(
            Object.keys(reportsAfter.result), 'latest').sort((a, b) => Number(a) - Number(b));
        for (const key of sortedReports) {
          expect(blockNumber).to.equal(Number(key));
          blockNumber++;
        }
        expect(reportsAfter.result.latest).to.be.greaterThan(reportsBefore.result.latest);
      });
    });
  });

  describe('API Tests', () => {
    describe('Get API', () => {
      before(async () => {
        const server1Addr = parseOrLog(syncRequest(
            'GET', server1 + '/get_address').body.toString('utf-8')).result;
        const server2Addr = parseOrLog(syncRequest(
            'GET', server2 + '/get_address').body.toString('utf-8')).result;
        const server3Addr = parseOrLog(syncRequest(
            'GET', server3 + '/get_address').body.toString('utf-8')).result;
        const server4Addr = parseOrLog(syncRequest(
            'GET', server4 + '/get_address').body.toString('utf-8')).result;
        await setUpApp('test', shardServerList, { admin: {
          [account.address]: true,
          [server1Addr]: true,
          [server2Addr]: true,
          [server3Addr]: true,
          [server4Addr]: true
        } });
        await setUp();
      })

      after(async () => {
        await cleanUp();
      })

      describe('/get_value', () => {
        it('/get_value with is_global = false', () => {
          const body = parseOrLog(
              syncRequest('GET', server1 + '/get_value?ref=/apps/test/test_value/some/path')
            .body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(body.result, 100);
        })

        it('/get_value with is_global = false (explicit)', () => {
          const body = parseOrLog(syncRequest(
              'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path&is_global=false')
            .body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(body.result, 100);
        })

        it('/get_value with is_global = true', () => {
          const body = parseOrLog(syncRequest(
              'GET', server1 + '/get_value?ref=/apps/afan/apps/test/test_value/some/path&is_global=true')
            .body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(body.result, 100);
        })
      })

      describe('/get_function', () => {
        it('/get_function with is_global = false', () => {
          const body = parseOrLog(
              syncRequest('GET', server1 + '/get_function?ref=/apps/test/test_function/some/path')
            .body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(body.result, {
            '.function': {
              "fid": {
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
            }
          });
        })

        it('/get_function with is_global = true', () => {
          const body = parseOrLog(syncRequest(
              'GET', server1 + '/get_function?ref=/apps/afan/apps/test/test_function/some/path&is_global=true')
            .body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(body.result, {
            '.function': {
              "fid": {
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
            }
          });
        })
      })

      describe('/get_rule', () => {
        it('/get_rule with is_global = false', () => {
          const body = parseOrLog(
              syncRequest('GET', server1 + '/get_rule?ref=/apps/test/test_rule/some/path')
            .body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(body.result, {
            '.rule': {
              'write': 'auth.addr === \'abcd\''
            }
          });
        })

        it('/get_rule with is_global = true', () => {
          const body = parseOrLog(syncRequest(
              'GET', server1 + '/get_rule?ref=/apps/afan/apps/test/test_rule/some/path&is_global=true')
            .body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(body.result, {
            '.rule': {
              'write': 'auth.addr === \'abcd\''
            }
          });
        })
      })

      describe('/get_owner', () => {
        it('/get_owner with is_global = false', () => {
          const body = parseOrLog(
              syncRequest('GET', server1 + '/get_owner?ref=/apps/test/test_owner/some/path')
            .body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(body.result, {
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
        })

        it('/get_owner with is_global = true', () => {
          const body = parseOrLog(syncRequest(
              'GET', server1 + '/get_owner?ref=/apps/afan/apps/test/test_owner/some/path&is_global=true')
            .body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(body.result, {
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
        })
      })

      describe('/match_function', () => {
        it('/match_function with is_global = false', () => {
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

        it('/match_function with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_function/some/path";
          const body =
              parseOrLog(syncRequest('GET', `${server1}/match_function?ref=${ref}&is_global=true`)
            .body.toString('utf-8'));
          assert.deepEqual(body, {code: 0, result: {
            "matched_path": {
              "target_path": "/apps/afan/apps/test/test_function/some/path",
              "ref_path": "/apps/afan/apps/test/test_function/some/path",
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
              "path": "/apps/afan/apps/test/test_function/some/path"
            },
            "subtree_configs": []
          }});
        })
      })

      describe('/match_rule', () => {
        it('/match_rule with is_global = false', () => {
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

        it('/match_rule with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_rule/some/path";
          const body =
              parseOrLog(syncRequest('GET', `${server1}/match_rule?ref=${ref}&is_global=true`)
            .body.toString('utf-8'));
          assert.deepEqual(body, {code: 0, result: {
            "matched_path": {
              "target_path": "/apps/afan/apps/test/test_rule/some/path",
              "ref_path": "/apps/afan/apps/test/test_rule/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "write": "auth.addr === 'abcd'"
              },
              "path": "/apps/afan/apps/test/test_rule/some/path"
            },
            "subtree_configs": []
          }});
        })
      })

      describe('/match_owner', () => {
        it('/match_owner with is_global = false', () => {
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

        it('/match_owner with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_owner/some/path";
          const body =
              parseOrLog(syncRequest('GET', `${server1}/match_owner?ref=${ref}&is_global=true`)
              .body.toString('utf-8'));
          assert.deepEqual(body, {code: 0, result: {
            "matched_path": {
              "target_path": "/apps/afan/apps/test/test_owner/some/path"
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
              "path": "/apps/afan/apps/test/test_owner/some/path"
            }
          }});
        })
      })

      describe('/eval_rule', () => {
        it('/eval_rule with is_global = false', () => {
          const ref = "/apps/test/test_rule/some/path";
          const value = "value";
          const address = "abcd";
          const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
          const body = parseOrLog(syncRequest('POST', server1 + '/eval_rule', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(body, {code: 0, result: true});
        })

        it('/eval_rule with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_rule/some/path";
          const value = "value";
          const address = "abcd";
          const is_global = true;
          const request = { ref, value, address, is_global, protoVer: CURRENT_PROTOCOL_VERSION };
          const body = parseOrLog(syncRequest('POST', server1 + '/eval_rule', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(body, {code: 0, result: true});
        })
      })

      describe('/eval_owner', () => {
        it('/eval_owner with is_global = false', () => {
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

        it('/eval_owner with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_owner/some/path";
          const address = "abcd";
          const permission = "write_owner";
          const is_global = true;
          const request =
              { ref, permission, address, is_global, protoVer: CURRENT_PROTOCOL_VERSION };
          const body = parseOrLog(syncRequest('POST', server1 + '/eval_owner', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(body, {
            code: 0,
            result: true,
          });
        })
      })

      describe('/get', () => {
        it('/get with is_global = false', () => {
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
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid",
                    "function_type": "REST",
                    "service_name": "https://ainetwork.ai"
                  }
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

        it('/get with is_global = true', () => {
          const request = {
            op_list: [
              {
                type: "GET_VALUE",
                ref: "/apps/afan/apps/test/test_value/some/path",
                is_global: true,
              },
              {
                type: 'GET_FUNCTION',
                ref: "/apps/afan/apps/test/test_function/some/path",
                is_global: true,
              },
              {
                type: 'GET_RULE',
                ref: "/apps/afan/apps/test/test_rule/some/path",
                is_global: true,
              },
              {
                type: 'GET_OWNER',
                ref: "/apps/afan/apps/test/test_owner/some/path",
                is_global: true,
              },
              {
                type: 'EVAL_RULE',
                ref: "/apps/afan/apps/test/test_rule/some/path",
                value: "value",
                address: "abcd",
                is_global: true,
              },
              {
                type: 'EVAL_OWNER',
                ref: "/apps/afan/apps/test/test_owner/some/path",
                permission: "write_owner",
                address: "abcd",
                is_global: true,
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
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "function_id": "fid",
                    "function_type": "REST",
                    "service_name": "https://ainetwork.ai"
                  }
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

      describe('ain_get', () => {
        it('ain_get with is_global = false', () => {
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

        it('ain_get with is_global = false (explicit)', () => {
          const expected = 100;
          const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
          return jsonRpcClient.request('ain_get', {
            protoVer: CURRENT_PROTOCOL_VERSION,
            type: 'GET_VALUE',
            ref: "/apps/test/test_value/some/path",
            is_global: false,
          })
          .then(res => {
            expect(res.result.result).to.equal(expected);
          });
        });

        it('ain_get with is_global = true', () => {
          const expected = 100;
          const jsonRpcClient = jayson.client.http(server2 + '/json-rpc');
          return jsonRpcClient.request('ain_get', {
            protoVer: CURRENT_PROTOCOL_VERSION,
            type: 'GET_VALUE',
            ref: "/apps/afan/apps/test/test_value/some/path",
            is_global: true,
          })
          .then(res => {
            expect(res.result.result).to.equal(expected);
          });
        });
      })

      describe('ain_matchFunction', () => {
        it('ain_matchFunction with is_global = false', () => {
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

        it('ain_matchFunction with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_function/some/path";
          const request = { ref, is_global: true, protoVer: CURRENT_PROTOCOL_VERSION };
          return jayson.client.http(server1 + '/json-rpc').request('ain_matchFunction', request)
          .then(res => {
            assert.deepEqual(res.result.result, {
              "matched_path": {
                "target_path": "/apps/afan/apps/test/test_function/some/path",
                "ref_path": "/apps/afan/apps/test/test_function/some/path",
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
                "path": "/apps/afan/apps/test/test_function/some/path"
              },
              "subtree_configs": []
            });
          })
        })
      })

      describe('ain_matchRule', () => {
        it('ain_matchRule with is_global = false', () => {
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

        it('ain_matchRule with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_rule/some/path";
          const request = { ref, is_global: true, protoVer: CURRENT_PROTOCOL_VERSION };
          return jayson.client.http(server1 + '/json-rpc').request('ain_matchRule', request)
          .then(res => {
            assert.deepEqual(res.result.result, {
              "matched_path": {
                "target_path": "/apps/afan/apps/test/test_rule/some/path",
                "ref_path": "/apps/afan/apps/test/test_rule/some/path",
                "path_vars": {},
              },
              "matched_config": {
                "config": {
                  "write": "auth.addr === 'abcd'"
                },
                "path": "/apps/afan/apps/test/test_rule/some/path"
              },
              "subtree_configs": []
            });
          })
        })
      })

      describe('ain_matchOwner', () => {
        it('ain_matchOwner with is_global = false', () => {
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

        it('ain_matchOwner with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_owner/some/path";
          const request = { ref, is_global: true, protoVer: CURRENT_PROTOCOL_VERSION };
          return jayson.client.http(server1 + '/json-rpc').request('ain_matchOwner', request)
          .then(res => {
            assert.deepEqual(res.result.result, {
              "matched_path": {
                "target_path": "/apps/afan/apps/test/test_owner/some/path"
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
                "path": "/apps/afan/apps/test/test_owner/some/path"
              }
            });
          })
        })
      })

      describe('ain_evalRule', () => {
        it('ain_evalRule with is_global = false', () => {
          const ref = "/apps/test/test_rule/some/path";
          const value = "value";
          const address = "abcd";
          const request = { ref, value, address, protoVer: CURRENT_PROTOCOL_VERSION };
          return jayson.client.http(server1 + '/json-rpc').request('ain_evalRule', request)
          .then(res => {
            expect(res.result.result).to.equal(true);
          })
        })

        it('ain_evalRule with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_rule/some/path";
          const value = "value";
          const address = "abcd";
          const request =
              { ref, value, address, is_global: true, protoVer: CURRENT_PROTOCOL_VERSION };
          return jayson.client.http(server1 + '/json-rpc').request('ain_evalRule', request)
          .then(res => {
            expect(res.result.result).to.equal(true);
          })
        })
      })

      describe('ain_evalOwner', () => {
        it('ain_evalOwner with is_global = false', () => {
          const ref = "/apps/test/test_owner/some/path";
          const address = "abcd";
          const permission = "write_owner";
          const request = { ref, permission, address, protoVer: CURRENT_PROTOCOL_VERSION };
          return jayson.client.http(server1 + '/json-rpc').request('ain_evalOwner', request)
          .then(res => {
            assert.deepEqual(res.result.result, true);
          })
        })

        it('ain_evalOwner with is_global = true', () => {
          const ref = "/apps/afan/apps/test/test_owner/some/path";
          const address = "abcd";
          const permission = "write_owner";
          const request =
              { ref, permission, address, is_global: true, protoVer: CURRENT_PROTOCOL_VERSION };
          return jayson.client.http(server1 + '/json-rpc').request('ain_evalOwner', request)
          .then(res => {
            assert.deepEqual(res.result.result, true);
          })
        })
      })
    })

    describe('Set API', () => {
      beforeEach(async () => {
        await setUp();
      })

      afterEach(async () => {
        await cleanUp();
      })

      describe('/set_value', () => {
        it('/set_value with is_global = false', () => {
          // Check the original value.
          const resultBefore = parseOrLog(syncRequest(
              'GET', server1 + '/get_value?ref=/apps/test/test_value/some/path')
              .body.toString('utf-8')).result;
          assert.deepEqual(resultBefore, 100);

          const request = {ref: '/apps/test/test_value/some/path', value: "some value", nonce: -1};
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })

        it('/set_value with is_global = false (explicit)', () => {
          const request = {ref: '/apps/test/test_value/some/path', value: "some value", is_global: false, nonce: -1};
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })

        it('/set_value with is_global = true', () => {
          const request = {
            ref: 'apps/afan/apps/test/test_value/some/path', value: "some value", is_global: true, nonce: -1
          };
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })
      })

      describe('/inc_value', () => {
        it('/inc_value with is_global = false', () => {
          const request = {ref: '/apps/test/test_value/some/path', value: 10, nonce: -1};
          const body = parseOrLog(syncRequest('POST', server1 + '/inc_value', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })

        it('/inc_value with is_global = true', () => {
          const request = {
            ref: 'apps/afan/apps/test/test_value/some/path', value: 10, is_global: true, nonce: -1
          };
          const body = parseOrLog(syncRequest('POST', server1 + '/inc_value', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })
      })

      describe('/dec_value', () => {
        it('/dec_value with is_global = false', () => {
          const request = {ref: '/apps/test/test_value/some/path', value: 10, nonce: -1};
          const body = parseOrLog(syncRequest('POST', server1 + '/dec_value', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })

        it('/dec_value with is_global = true', () => {
          const request = {
            ref: 'apps/afan/apps/test/test_value/some/path', value: 10, is_global: true, nonce: -1
          };
          const body = parseOrLog(syncRequest('POST', server1 + '/dec_value', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })
      })

      describe('/set_function', () => {
        it('/set_function with is_global = false', () => {
          const request = {
            ref: "/apps/test/test_function/other/path",
            value: {
              ".function": {
                "fid": {
                  "event_listener": "https://events.ainetwork.ai/trigger2",  // Listener 2
                  "function_id": "fid",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              }
            },
            nonce: -1
          };
          const body = parseOrLog(syncRequest('POST', server1 + '/set_function', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })

        it('/set_function with is_global = true', () => {
          const request = {
            ref: "apps/afan/apps/test/test_function/other/path",
            value: {
              ".function": {
                "fid": {
                  "event_listener": "https://events.ainetwork.ai/trigger3",  // Listener 3
                  "function_id": "fid",
                  "function_type": "REST",
                  "service_name": "https://ainetwork.ai"
                }
              }
            },
            is_global: true,
            nonce: -1
          };
          const body = parseOrLog(syncRequest('POST', server1 + '/set_function', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })
      })

      describe('/set_rule', () => {
        it('/set_rule with is_global = false', () => {
          const request = {
            ref: "/apps/test/test_rule/other/path",
            value: {
              ".rule": {
                "write": "some other rule config"
              }
            },
            nonce: -1
          };
          const body = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })

        it('/set_rule with is_global = true', () => {
          const request = {
            ref: "apps/afan/apps/test/test_rule/other/path",
            value: {
              ".rule": {
                "write": "some other rule config"
              }
            },
            is_global: true,
            nonce: -1
          };
          const body = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })
      })

      describe('/set_owner', () => {
        it('/set_owner with is_global = false', () => {
          const request = {
            ref: "/apps/test/test_owner/other/path",
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
            },
            nonce: -1
          };
          const body = parseOrLog(syncRequest('POST', server1 + '/set_owner', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })

        it('/set_owner with is_global = true', () => {
          const request = {
            ref: "apps/afan/apps/test/test_owner/other2/path",
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
            },
            is_global: true,
            nonce: -1,
          };
          const body = parseOrLog(syncRequest('POST', server1 + '/set_owner', {json: request})
              .body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
        })
      })

      describe('/set', () => {
        it('/set with is_global = false', () => {
          const request = {
            op_list: [
              {
                // Default type: SET_VALUE
                ref: "/apps/test/test_value/other3/path",
                value: "some other3 value",
              },
              {
                type: 'INC_VALUE',
                ref: "/apps/test/test_value/some/path",
                value: 10
              },
              {
                type: 'DEC_VALUE',
                ref: "/apps/test/test_value/some/path2",
                value: 10
              },
              {
                type: 'SET_FUNCTION',
                ref: "/apps/test/test_function/other3/path",
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
                ref: "/apps/test/test_rule/other3/path",
                value: {
                  ".rule": {
                    "write": "some other3 rule config"
                  }
                }
              },
              {
                type: 'SET_OWNER',
                ref: "/apps/test/test_owner/other3/path",
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
            ],
            nonce: -1
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
                  "test": 4422
                },
                "service": 0
              }
            },
            "gas_cost_total": 0
          });
          assert.deepEqual(body.code, 0);
        })

        it('/set with is_global = true', () => {
          const request = {
            op_list: [
              {
                // Default type: SET_VALUE
                ref: "/apps/test/test_value/other4/path",
                value: "some other4 value",
                is_global: true,
              },
              {
                type: 'INC_VALUE',
                ref: "/apps/test/test_value/some/path",
                value: 10,
                is_global: true,
              },
              {
                type: 'DEC_VALUE',
                ref: "/apps/test/test_value/some/path4",
                value: 10,
                is_global: true,
              },
              {
                type: 'SET_FUNCTION',
                ref: "/apps/test/test_function/other4/path",
                value: {
                  ".function": {
                    "fid": {
                      "event_listener": "https://events.ainetwork.ai/trigger",
                      "function_id": "fid",
                      "function_type": "REST",
                      "service_name": "https://ainetwork.ai"
                    }
                  }
                },
                is_global: true,
              },
              {
                type: 'SET_RULE',
                ref: "/apps/test/test_rule/other4/path",
                value: {
                  ".rule": {
                    "write": "some other4 rule config"
                  }
                },
                is_global: true,
              },
              {
                type: 'SET_OWNER',
                ref: "/apps/test/test_owner/other4/path",
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
                },
                is_global: true,
              }
            ],
            nonce: -1
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
                "service": 0
              }
            },
            "gas_cost_total": 0
          });
          assert.deepEqual(body.code, 0);
        })
      })

      describe('ain_sendSignedTransaction', () => {
        it('ain_sendSignedTransaction with is_global = false', () => {
          const client = jayson.client.http(server1 + '/json-rpc');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              value: 'some other value',
              ref: `/apps/test/test_value/some/path`
            },
            timestamp: Date.now(),
            nonce: -1
          }
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request('ain_sendSignedTransaction',
              { tx_body: txBody, signature, protoVer: CURRENT_PROTOCOL_VERSION })
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

        it('ain_sendSignedTransaction with is_global = false (explicit)', () => {
          const client = jayson.client.http(server1 + '/json-rpc');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              value: 'some other value',
              ref: `/apps/test/test_value/some/path`,
              is_global: false,
            },
            timestamp: Date.now(),
            nonce: -1
          }
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request('ain_sendSignedTransaction', { tx_body: txBody, signature,
              protoVer: CURRENT_PROTOCOL_VERSION })
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

        it('ain_sendSignedTransaction with is_global = true', () => {
          const client = jayson.client.http(server1 + '/json-rpc');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              value: 'some other value',
              ref: `apps/afan/apps/test/test_value/some/path`,
              is_global: true,
            },
            timestamp: Date.now(),
            nonce: -1
          }
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request('ain_sendSignedTransaction', { tx_body: txBody, signature,
              protoVer: CURRENT_PROTOCOL_VERSION })
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
                          afan: 1
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
      })

      describe('ain_sendSignedTransactionBatch', () => {
        it('ain_sendSignedTransactionBatch with is_global = false', () => {
          const client = jayson.client.http(server1 + '/json-rpc');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              value: 'some other value',
              ref: `/apps/test/test_value/some/path`
            },
            timestamp: Date.now(),
            nonce: -1
          }
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request('ain_sendSignedTransactionBatch', {
            tx_list: [
              {
                tx_body: txBody,
                signature
              }
            ],
            signature,
            protoVer: CURRENT_PROTOCOL_VERSION
          }).then((res) => {
            const resultList = _.get(res, 'result.result', null);
            expect(CommonUtil.isArray(resultList)).to.equal(true);
            assert.deepEqual(res.result, {
              protoVer: CURRENT_PROTOCOL_VERSION,
              result: [
                {
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
                },
              ]
            });
          })
        })

        it('ain_sendSignedTransactionBatch with is_global = false (explicit)', () => {
          const client = jayson.client.http(server1 + '/json-rpc');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              value: 'some other value',
              ref: `/apps/test/test_value/some/path`,
              is_global: false,
            },
            timestamp: Date.now(),
            nonce: -1
          }
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request('ain_sendSignedTransactionBatch', {
            tx_list: [
              {
                tx_body: txBody,
                signature
              }
            ],
            signature,
            protoVer: CURRENT_PROTOCOL_VERSION
          }).then((res) => {
            const resultList = _.get(res, 'result.result', null);
            expect(CommonUtil.isArray(resultList)).to.equal(true);
            for (let i = 0; i < resultList.length; i++) {
              const result = resultList[i];
            }
            assert.deepEqual(res.result, {
              protoVer: CURRENT_PROTOCOL_VERSION,
              result: [
                {
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
                },
              ]
            });
          })
        })

        it('ain_sendSignedTransactionBatch with is_global = true', () => {
          const client = jayson.client.http(server1 + '/json-rpc');
          const txBody = {
            operation: {
              type: 'SET_VALUE',
              value: 'some other value',
              ref: `apps/afan/apps/test/test_value/some/path`,
              is_global: true,
            },
            timestamp: Date.now(),
            nonce: -1
          }
          const signature =
              ainUtil.ecSignTransaction(txBody, Buffer.from(account.private_key, 'hex'));
          return client.request('ain_sendSignedTransactionBatch', {
            tx_list: [
              {
                tx_body: txBody,
                signature
              }
            ],
            signature,
            protoVer: CURRENT_PROTOCOL_VERSION
          }).then((res) => {
            const resultList = _.get(res, 'result.result', null);
            expect(CommonUtil.isArray(resultList)).to.equal(true);
            for (let i = 0; i < resultList.length; i++) {
              const result = resultList[i];
            }
            assert.deepEqual(res.result, {
              protoVer: CURRENT_PROTOCOL_VERSION,
              result: [
                {
                  result: {
                    code: 0,
                    bandwidth_gas_amount: 1,
                    gas_amount_charged: 0,
                    gas_amount_total: {
                      bandwidth: {
                        app: {
                          afan: 1
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
                },
              ]
            });
          });
        })
      })
    })
  })

  describe('Native functions', () => {
    let parentAddr; // = parentServer

    let shardOwner, shardReporter, shardingPath, shardingConfig;

    before(() => {
      parentAddr = parseOrLog(syncRequest(
          'GET', parentServer + '/get_address').body.toString('utf-8')).result;

      shardOwner = parentAddr;
      shardReporter = parentAddr;
      shardingPath = '/apps/a_dapp';
      shardingConfig = {
        sharding_protocol: "POA",
        sharding_path: shardingPath,
        parent_chain_poc: parentServer,
        reporting_period: 5,
        shard_owner: shardOwner,
        shard_reporter: shardReporter
      };
    })

    describe('_updateLatestShardReport', () => {
      before(async () => {
        const { shard_owner, sharding_path } = shardingConfig;
        await setUpApp('a_dapp', parentServerList, { admin: { [shard_owner]: true } });

        const res = parseOrLog(syncRequest('POST', parentServer + '/set', {
          json: {
            op_list: [
              {
                type: WriteDbOperations.SET_RULE,
                ref: `${sharding_path}/${ShardingProperties.LATEST}`,
                value: {
                  [PredefinedDbPaths.DOT_RULE]: {
                    [RuleProperties.WRITE]: `auth.fid === '${NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT}'`
                  }
                }
              },
              {
                type: WriteDbOperations.SET_FUNCTION,
                ref: `${sharding_path}/$block_number/${ShardingProperties.PROOF_HASH}`,
                value: {
                  [PredefinedDbPaths.DOT_FUNCTION]: {
                    [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: {
                      [FunctionProperties.FUNCTION_TYPE]: FunctionTypes.NATIVE,
                      [FunctionProperties.FUNCTION_ID]: NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT
                    }
                  }
                }
              },
              {
                type: WriteDbOperations.SET_VALUE,
                ref: CommonUtil.formatPath([
                  PredefinedDbPaths.SHARDING,
                  PredefinedDbPaths.SHARDING_SHARD,
                  ainUtil.encode(sharding_path)
                ]),
                value: shardingConfig
              }
            ],
          }
        }).body.toString('utf-8')).result;
        assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
        if (!(await waitUntilTxFinalized(parentServerList, res.tx_hash))) {
          console.log(`Failed to check finalization of sharding setup tx.`)
        }
      });

      it('update latest shard report', async () => {
        const reportVal = {
          ref: `${shardingPath}/5/proof_hash`,
          value: "0xPROOF_HASH_5",
          nonce: -1,
        }
        const shardReportBody = parseOrLog(syncRequest(
            'POST', parentServer + '/set_value', { json: reportVal }).body.toString('utf-8')
        );
        assert.deepEqual(_.get(shardReportBody, 'result.result'), {
          "code": 0,
          "func_results": {
            "_updateLatestShardReport": {
              "code": 0,
              "bandwidth_gas_amount": 0,
              "op_results": {
                "0": {
                  "path": "/apps/a_dapp/latest",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1,
                  }
                }
              }
            }
          },
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "a_dapp": 2
              },
              "service": 0
            },
            "state": {
              "app": {
                "a_dapp": 710
              },
              "service": 0
            }
          },
          "gas_cost_total": 0,
        });
        expect(shardReportBody.code).to.equal(0);
        await waitUntilTxFinalized(parentServerList, _.get(shardReportBody, 'result.tx_hash'));
        const shardingPathRes = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${shardingPath}`).body.toString('utf-8')
        ).result;
        assert.deepEqual(shardingPathRes, {
          latest: 5,
          5: {
            proof_hash: "0xPROOF_HASH_5"
          }
        });
      });

      it('update latest shard report - can handle reports that are out of order', async () => {
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
          ],
          nonce: -1,
        }
        const shardReportBody = parseOrLog(syncRequest(
            'POST', parentServer + '/set', { json: multipleReportVal }).body.toString('utf-8')
        );
        assert.deepEqual(_.get(shardReportBody, 'result.result'), {
          "result_list": {
            "0": {
              "code": 0,
              "func_results": {
                "_updateLatestShardReport": {
                  "code": 0,
                  "bandwidth_gas_amount": 0,
                  "op_results": {
                    "0": {
                      "path": "/apps/a_dapp/latest",
                      "result": {
                        "code": 0,
                        "bandwidth_gas_amount": 1,
                      }
                    }
                  }
                }
              },
              "bandwidth_gas_amount": 1,
            },
            "1": {
              "code": 0,
              "func_results": {
                "_updateLatestShardReport": {
                  "code": 0,
                  "bandwidth_gas_amount": 0,
                }
              },
              "bandwidth_gas_amount": 1
            }
          },
          "gas_amount_charged": 0,
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "a_dapp": 3
              },
              "service": 0
            },
            "state": {
              "app": {
                "a_dapp": 748
              },
              "service": 0
            }
          },
          "gas_cost_total": 0,
        });
        expect(shardReportBody.code).to.equal(0);
        await waitUntilTxFinalized(parentServerList, _.get(shardReportBody, 'result.tx_hash'));
        const shardingPathRes = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${shardingPath}`).body.toString('utf-8')
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
