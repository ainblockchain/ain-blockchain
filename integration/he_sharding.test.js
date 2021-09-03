const path = require('path');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const spawn = require("child_process").spawn;
const ainUtil = require('@ainblockchain/ain-util');
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const _ = require('lodash');
const { parseOrLog } = require('../unittest/test-util');
const PROJECT_ROOT = require('path').dirname(__filename) + "/../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const {
  CHAINS_DIR,
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
    GENESIS_CONFIGS_DIR: 'genesis-configs/he-shard',
    PORT: 9091, P2P_PORT: 6001,
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    GENESIS_CONFIGS_DIR: 'genesis-configs/he-shard',
    PORT: 9092, P2P_PORT: 6002,
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    GENESIS_CONFIGS_DIR: 'genesis-configs/he-shard',
    PORT: 9093, P2P_PORT: 6003,
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    GENESIS_CONFIGS_DIR: 'genesis-configs/he-shard',
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

describe('HE Sharding', async () => {
  const appName = 'he_health_care';
  const token =
      readConfigFile(path.resolve(__dirname, '../genesis-configs/he-shard', 'genesis_token.json'));
  const parentAccounts =
      readConfigFile(path.resolve(__dirname, '../genesis-configs/base', 'genesis_accounts.json'));
  const parentServerAddr = parentAccounts.others[0].address;
  const accounts =
      readConfigFile(path.resolve(__dirname, '../genesis-configs/he-shard', 'genesis_accounts.json'));
  const shardOwnerAddr = accounts.owner.address;
  const shardReporterAddr = accounts.others[0].address;
  const sharding =
      readConfigFile(path.resolve(__dirname, '../genesis-configs/he-shard', 'genesis_sharding.json'));

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
    await setUpApp(appName, parentServerList, { admin: { [shardOwnerAddr]: true } });
    
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
      await setUpApp(appName, shardServerList, { admin: { [shardOwnerAddr]: true } });
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
})
