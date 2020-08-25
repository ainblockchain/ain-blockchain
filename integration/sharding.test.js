const path = require('path');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const spawn = require("child_process").spawn;
const ainUtil = require('@ainblockchain/ain-util');
const PROJECT_ROOT = require('path').dirname(__filename) + "/../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const sleep = require('system-sleep');
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const {
  BLOCKCHAINS_DIR,
} = require('../constants');
const {
  readConfigFile,
} = require('../test/test-util');

const ENV_VARIABLES = [
  {
    // For parent chain poc node
    NUM_VALIDATORS: 1, ACCOUNT_INDEX: 0, HOSTING_ENV: 'local', DEBUG: true
  },
  {
    // For child chain tracker
    PORT: 9090, P2P_PORT: 6000
  },
  {
    GENESIS_CONFIGS_DIR: 'blockchain/afan_shard',
    PORT: 9091, P2P_PORT: 6001, TRACKER_WS_ADDR: 'ws://localhost:6000',
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    GENESIS_CONFIGS_DIR: 'blockchain/afan_shard',
    PORT: 9092, P2P_PORT: 6002, TRACKER_WS_ADDR: 'ws://localhost:6000',
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    GENESIS_CONFIGS_DIR: 'blockchain/afan_shard',
    PORT: 9093, P2P_PORT: 6003, TRACKER_WS_ADDR: 'ws://localhost:6000',
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    GENESIS_CONFIGS_DIR: 'blockchain/afan_shard',
    PORT: 9094, P2P_PORT: 6004, TRACKER_WS_ADDR: 'ws://localhost:6000',
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
];

const parentServer = 'http://127.0.0.1:8081';
const server1 = 'http://localhost:' + String(9091 + Number(ENV_VARIABLES[2].ACCOUNT_INDEX))
const server2 = 'http://localhost:' + String(9091 + Number(ENV_VARIABLES[3].ACCOUNT_INDEX))
const server3 = 'http://localhost:' + String(9091 + Number(ENV_VARIABLES[4].ACCOUNT_INDEX))
const server4 = 'http://localhost:' + String(9091 + Number(ENV_VARIABLES[5].ACCOUNT_INDEX))

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

describe('Sharding initialization', () => {
  const token =
      readConfigFile(path.resolve(__dirname, '../blockchain/afan_shard', 'genesis_token.json'));
  const accounts =
      readConfigFile(path.resolve(__dirname, '../blockchain/afan_shard', 'genesis_accounts.json'));
  const sharding =
      readConfigFile(path.resolve(__dirname, '../blockchain/afan_shard', 'genesis_sharding.json'));

  let parent_chain_tracker_proc, parent_chain_server_proc,
      tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc;

  before(() => {
    rimraf.sync(BLOCKCHAINS_DIR)

    parent_chain_tracker_proc = startServer(TRACKER_SERVER, 'parent tracker server', {}, false);
    sleep(2000);
    parent_chain_server_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0]);
    sleep(2000);
    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', ENV_VARIABLES[1], false);
    sleep(2000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[2]);
    sleep(2000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[3]);
    sleep(2000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[4]);
    sleep(2000);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[5]);
    sleep(2000);
  });

  after(() => {
    parent_chain_tracker_proc.kill()
    parent_chain_server_proc.kill()
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()
    server4_proc.kill()

    rimraf.sync(BLOCKCHAINS_DIR)
  });


  describe('Parent chain initialization', () => {
    describe('DB values', () => {
      it('sharding', () => {
        const body = JSON.parse(syncRequest('GET', parentServer + `/get_value?ref=/sharding/shard/${ainUtil.encode(sharding.sharding_path)}`)
        .body.toString('utf-8'));
        assert.deepEqual(body, {
          code: 0,
          result: Object.assign(
            {},
            sharding,
            {
              shard_owner: accounts.owner.address,
              shard_reporter: accounts.others[0].address
            }
          )
        });
      });
    });

    describe('DB functions', () => {
      it('sharding path', () => {
        const body = JSON.parse(syncRequest('GET', parentServer + `/get_function?ref=${sharding.sharding_path}`)
        .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result).to.not.be.null;
        assert.deepEqual(body.result, {
          "$block_number": {
            "proof_hash": {
              ".function": {
                "function_type": "NATIVE",
                "function_id": "_reportShardProofHash"
              }
            }
          }
        })
      });
    });

    describe('DB rules', () => {
      it('sharding path', () => {
        const body = JSON.parse(syncRequest('GET', parentServer + `/get_rule?ref=${sharding.sharding_path}`)
        .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['.write']).to.have.string(accounts.others[0].address);
      });
    });

    describe('DB owners', () => {
      it('sharding path', () => {
        const body = JSON.parse(syncRequest('GET', parentServer + `/get_owner?ref=${sharding.sharding_path}`)
        .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['.owner'].owners[accounts.owner.address]).to.not.be.null;
      });
    });
  });

  describe('Child chain initialization', () => {
    describe('DB values', () => {
      it('token', () => {
        const body = JSON.parse(syncRequest('GET', server1 + '/get_value?ref=/token')
            .body.toString('utf-8'));
        assert.deepEqual(body, {code: 0, result: token});
      })

      it('accounts', () => {
        const body1 = JSON.parse(syncRequest(
            'GET', server1 + '/get_value?ref=/accounts/' + accounts.owner.address + '/balance')
            .body.toString('utf-8'));
        expect(body1.code).to.equal(0);
        expect(body1.result).to.be.above(0);

        const body2 = JSON.parse(syncRequest(
            'GET', server1 + '/get_value?ref=/accounts/' + accounts.others[0].address + '/balance')
            .body.toString('utf-8'));
        expect(body2.code).to.equal(0);
        expect(body2.result).to.be.above(0);
      })

      it('sharding', () => {
        const body = JSON.parse(syncRequest('GET', server1 + '/get_value?ref=/sharding/config')
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result.sharding_protocol).to.equal(sharding.sharding_protocol);
        expect(body.result.sharding_path).to.equal(sharding.sharding_path);
      })
    })

    describe('DB functions', () => {
      it('sharding', () => {
        const body = JSON.parse(syncRequest('GET', server2 + '/get_function?ref=/transfer')
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result).to.not.be.null;
      })
    })

    describe('DB rules', () => {
      it('sharding', () => {
        const body = JSON.parse(syncRequest('GET', server3 + '/get_rule?ref=/sharding/config')
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['.write']).to.have.string(accounts.owner.address);
      })
    })
  
    describe('DB owners', () => {
      it('sharding', () => {
        const body = JSON.parse(syncRequest('GET', server4 + '/get_owner?ref=/sharding/config')
            .body.toString('utf-8'));
        expect(body.code).to.equal(0);
        expect(body.result['.owner'].owners[accounts.owner.address]).to.not.be.null;
      })
    })
  });
})
