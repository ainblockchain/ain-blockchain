const path = require('path');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const spawn = require("child_process").spawn;
const ainUtil = require('@ainblockchain/ain-util');
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const _ = require('lodash');
const { NodeConfigs } = require('../../common/constants');
const {
  ConsensusStates
} = require('../../consensus/constants');
const CommonUtil = require('../../common/common-util');
const {
  parseOrLog,
  readConfigFile,
  waitForNewBlocks,
  waitForNewShardingReports,
  waitUntilNodeSyncs,
  waitUntilTxFinalized,
  waitUntilNetworkIsReady,
  setUpApp,
} = require('../test-util');

const PROJECT_ROOT = require('path').dirname(__filename) + "/../../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const ENV_VARIABLES = [
  {
    // For parent chain poc node
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/1-node', PORT: 8081, P2P_PORT: 5001,
    UNSAFE_PRIVATE_KEY: 'b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96',
    ENABLE_EXPRESS_RATE_LIMIT: false, ENABLE_GAS_FEE_WORKAROUND: true,
  },
  {
    // For shard chain tracker
    PORT: 9090, P2P_PORT: 6000,
  },
  {
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/he-shard', PORT: 9091, P2P_PORT: 6001,
    UNSAFE_PRIVATE_KEY: 'd8f77aa2afe2580a858a8cc97b6056e10f888c6fd07ebb58755d8422b03da816',
    ENABLE_EXPRESS_RATE_LIMIT: false, ENABLE_GAS_FEE_WORKAROUND: true,
  },
  {
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/he-shard', PORT: 9092, P2P_PORT: 6002,
    UNSAFE_PRIVATE_KEY: 'a3409e22bc14a3d0e73697df25617b3f2eaae9b5eade77615a32abc0ad5ee0df',
    ENABLE_EXPRESS_RATE_LIMIT: false, ENABLE_GAS_FEE_WORKAROUND: true,
  },
  {
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/he-shard', PORT: 9093, P2P_PORT: 6003,
    UNSAFE_PRIVATE_KEY: 'c4611582dbb5319f08ba0907af6430a79e02b87b112aa4039d43e8765384f568',
    ENABLE_EXPRESS_RATE_LIMIT: false, ENABLE_GAS_FEE_WORKAROUND: true,
  },
];

const parentServer = 'http://localhost:8081';
const parentServerList = [ parentServer ];
const server1 = 'http://localhost:9091';
const server2 = 'http://localhost:9092';
const server3 = 'http://localhost:9093';
const shardServerList = [ server1, server2, server3 ];

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

describe('HE Sharding', () => {
  const appName = 'he_health_care';
  const token =
      readConfigFile(path.resolve(__dirname, '../../blockchain-configs/he-shard', 'blockchain_params.json')).token;
  const parentAccounts =
      readConfigFile(path.resolve(__dirname, '../../blockchain-configs/base', 'genesis_accounts.json'));
  const parentServerAddr = parentAccounts.others[0].address;
  const accounts =
      readConfigFile(path.resolve(__dirname, '../../blockchain-configs/he-shard', 'genesis_accounts.json'));
  const shardOwnerAddr = accounts.owner.address;
  const shardReporterAddr = accounts.others[0].address;
  const sharding =
      readConfigFile(path.resolve(__dirname, '../../blockchain-configs/he-shard', 'blockchain_params.json')).sharding;

  let parent_tracker_proc, parent_server_proc,
      tracker_proc, server1_proc, server2_proc, server3_proc;

  before(async () => {
    rimraf.sync(NodeConfigs.CHAINS_DIR)

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
    await setUpApp(appName, parentServerList, {
      admin: {
        [shardOwnerAddr]: true,
        [shardReporterAddr]: true
      }
    });
    
    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', ENV_VARIABLES[1], true);
    await CommonUtil.sleep(3000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[2], true);
    await CommonUtil.sleep(10000);
    await waitUntilShardReporterStarts();
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[3], true);
    await CommonUtil.sleep(3000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[4], true);
    await CommonUtil.sleep(3000);
    await CommonUtil.sleep(3000); // Before shard reporting begins
  });

  after(() => {
    parent_tracker_proc.kill()
    parent_server_proc.kill()
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()

    rimraf.sync(NodeConfigs.CHAINS_DIR)
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
            latest_block_number: -1
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
        const body = parseOrLog(syncRequest('GET', server1 + '/get_value?ref=/blockchain_params/token')
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
        const body = parseOrLog(syncRequest('GET', server1 + '/get_value?ref=/blockchain_params/sharding')
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
        const body = parseOrLog(syncRequest('GET', server3 + '/get_rule?ref=/blockchain_params')
          .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['.rule']['write']).to.have.string(`util.isAppAdmin('consensus', auth.addr, getValue) === true`);
      })
    })

    describe('DB owners', () => {
      it('sharding', () => {
        const body = parseOrLog(syncRequest('GET', server3 + '/get_owner?ref=/blockchain_params/sharding')
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
        const sortedReports = Object.keys(body.result).sort((a, b) => Number(a) - Number(b));
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
        const latest = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${sharding.sharding_path}/.shard/latest_block_number`)
            .body.toString('utf-8')).result;
        const sortedReports = Object.keys(body.result).sort((a, b) => Number(a) - Number(b));
        const highest = sortedReports[sortedReports.length - 1];
        expect(latest).to.equal(Number(highest));
      });
    });

    describe('Shard reporter node restart', () => {
      it('can resume reporting after missing some reports', async () => {
        const latestBefore = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${sharding.sharding_path}/.shard/latest_block_number`)
          .body.toString('utf-8')).result;
        console.log(`        --> Shutting down server[0]...`);
        server1_proc.kill();
        await waitForNewBlocks(server2, sharding.reporting_period * 3);
        console.log(`        --> Restarting server[0]...`);
        server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[2]);
        await waitUntilNodeSyncs(server1);
        await waitForNewShardingReports(parentServer, sharding.sharding_path);
        const reportsAfter = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${sharding.sharding_path}/.shard/proof_hash_map`)
          .body.toString('utf-8'));
        const latestAfter = parseOrLog(syncRequest(
            'GET', parentServer + `/get_value?ref=${sharding.sharding_path}/.shard/latest_block_number`)
          .body.toString('utf-8')).result;
        let blockNumber = 0;
        const sortedReports = Object.keys(reportsAfter.result).sort((a, b) => Number(a) - Number(b));
        for (const key of sortedReports) {
          expect(blockNumber).to.equal(Number(key));
          blockNumber++;
        }
        expect(latestAfter).to.be.greaterThan(latestBefore);
      });
    });
  });
})
