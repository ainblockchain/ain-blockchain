const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const _ = require("lodash");
const spawn = require("child_process").spawn;
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const PROJECT_ROOT = require('path').dirname(__filename) + "/../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const {
  CHAINS_DIR,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const {
  waitUntilTxFinalized,
  parseOrLog,
  setUpApp,
} = require('../unittest/test-util');

const ENV_VARIABLES = [
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0, EPOCH_MS: 1000, DEBUG: false,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1, EPOCH_MS: 1000, DEBUG: false,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2, EPOCH_MS: 1000, DEBUG: false,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3, EPOCH_MS: 1000, DEBUG: false,
    CONSOLE_LOG: false, ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
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

describe('Homomorphic encryption', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc

  before(async () => {
    rimraf.sync(CHAINS_DIR)

    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', { CONSOLE_LOG: false }, true);
    await CommonUtil.sleep(3000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0], true);
    await CommonUtil.sleep(10000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1], true);
    await CommonUtil.sleep(3000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2], true);
    await CommonUtil.sleep(3000);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[3], true);
    await CommonUtil.sleep(3000);


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

  describe('Health care', () => {
    let serviceAdmin; // = server1
    let serviceUser; // = server2

    const appName = 'test_service_create_app0';

    before(async () => {
      serviceAdmin =
          parseOrLog(syncRequest('GET', server1 + '/get_address').body.toString('utf-8')).result;
      serviceUser =
          parseOrLog(syncRequest('GET', server2 + '/get_address').body.toString('utf-8')).result;

      // Stake
      const appStakingPath =
          `/staking/${appName}/${serviceAdmin}/0/stake/${Date.now()}/value`;
      const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
        ref: appStakingPath,
        value: 1
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
        console.error(`Failed to check finalization of tx.`);
      }

      // Create app
      const manageAppPath = `/manage_app/${appName}/create/1`;
      const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
        ref: manageAppPath,
        value: {
          admin: { [serviceAdmin]: true },
        },
        nonce: -1,
        timestamp: 1234567890000,
      }}).body.toString('utf-8')).result;
      if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
        console.error(`Failed to check finalization of tx.`);
      }
    })

    describe('App creation', () => {
      it("app creation was successful", async () => {
        const appCreationResult = parseOrLog(syncRequest(
          'GET', server2 + `/get_value?ref=/manage_app/${appName}/create/1/result`).body.toString('utf-8')).result;
        expect(appCreationResult.code).to.equal(0);
      });
    });
  });
});
