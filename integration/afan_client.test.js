const chai = require('chai');
const assert = chai.assert;
const rimraf = require('rimraf');
const sleep = require('system-sleep');
const spawn = require('child_process').spawn;
const syncRequest = require('sync-request');
const AfanClient = require('../afan_client');
const {BLOCKCHAINS_DIR} = require('../constants');
const PROJECT_ROOT = require('path').dirname(__filename) + '/../';
const TRACKER_SERVER = PROJECT_ROOT + 'tracker-server/index.js';
const APP_SERVER = PROJECT_ROOT + 'client/index.js';
const LAST_BLOCK_NUMBER_ENDPOINT = '/last_block_number';

const ENV_VARIABLES = [
  {
    ACCOUNT_INDEX: 0, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    ACCOUNT_INDEX: 1, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    ACCOUNT_INDEX: 2, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    ACCOUNT_INDEX: 3, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
];

const server1 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[0].ACCOUNT_INDEX))
const server2 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[1].ACCOUNT_INDEX))
const server3 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[2].ACCOUNT_INDEX))
const server4 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[3].ACCOUNT_INDEX))

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

describe('aFan Client Test', () => {
  let tracker_proc; let server1_proc; let server2_proc; let server3_proc; let server4_proc;

  before(() => {
    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', {}, false);
    sleep(2000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0]);
    sleep(2000);
    waitForNewBlocks(server1);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1]);
    sleep(2000);
    waitForNewBlocks(server2);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2]);
    sleep(2000);
    waitForNewBlocks(server3);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[3]);
    sleep(2000);
    waitForNewBlocks(server4);
  });

  after(() => {
    tracker_proc.kill();
    server1_proc.kill();
    server2_proc.kill();
    server3_proc.kill();
    server4_proc.kill();
    rimraf.sync(BLOCKCHAINS_DIR);
  });

  waitForNewBlocks = (server, numNewBlocks = 1) => {
    const initialLastBlockNumber =
        JSON.parse(syncRequest('GET', server + LAST_BLOCK_NUMBER_ENDPOINT)
          .body.toString('utf-8'))['result'];
    let updatedLastBlockNumber = initialLastBlockNumber;
    console.log(`Initial last block number: ${initialLastBlockNumber}`)
    while (updatedLastBlockNumber < initialLastBlockNumber + numNewBlocks) {
      sleep(1000);
      updatedLastBlockNumber = JSON.parse(syncRequest('GET', server + LAST_BLOCK_NUMBER_ENDPOINT)
        .body.toString('utf-8'))['result'];
    }
    console.log(`Updated last block number: ${updatedLastBlockNumber}`)
  }

  set_value = (ref, value) => {
    return Promise.resolve(JSON.parse(syncRequest('POST', server1 + '/set_value',
                           {json: {ref, value}}).body.toString('utf-8')));
  };

  set = (op_list) => {
    return Promise.resolve(JSON.parse(syncRequest('POST', server2 + '/set',
                           {json: {op_list}}).body.toString('utf-8')));
  };

  get_value = (ref) => {
    return Promise.resolve(JSON.parse(syncRequest('GET',
                           server3 + `/get_value?ref=${ref}`).body.toString('utf-8')));
  };

  beforeEach(() => {
    return set_value('afan', {})
      .then(() => waitForNewBlocks(server1));
  });

  afterEach(() => {
    return set_value('afan', {})
      .then(() => waitForNewBlocks(server1));
  });

  describe('tx_invest', () => {
    it('send_one', () => {
      const afanClient = new AfanClient(server1);

      return set_value('/afan/balance/uid0', 10)
        .then(() => set_value('/afan/balance/uid1', 10))
        .then(() => sleep(500))
        .then(() => afanClient.tx_invest('uid0', 'uid1', 1))
        .then(() => waitForNewBlocks(server1, 2))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_invest_send_one_result.js');
          assert.deepEqual(res.result, expected);
        });
    });
  });

  describe('crushOnPost', () => {
    it('no fan', () => {
      const afanClient = new AfanClient(server1);

      return set_value('/afan/balance/uid0', 10).then(() => set_value('/afan/balance/uid1', 10))
        .then(() => afanClient.tx_crushOnPost('uid0', 'uid1', 'post0', 1))
        .then(() => waitForNewBlocks(server1, 2))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_crushOnPost_no_fan_result.js');
          assert.deepEqual(res.result, expected);
        });
    });

    it('two fans', () => {
      const afanClient = new AfanClient(server2);
      sleep(200);
      return set_value('/afan/balance/uid0', 30)
        .then(() => set_value('/afan/balance/uid1', 10))
        .then(() => set_value('/afan/investors/uid1/uid2', 3))
        .then(() => set_value('/afan/investors/uid1/uid3', 7))
        .then(() => afanClient.tx_crushOnPost('uid0', 'uid1', 'post0', 20))
        .then(() => waitForNewBlocks(server2, 2))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_crushOnPost_two_fans_result.js');
          assert.deepEqual(res.result, expected);
        });
    });
  });

  describe('crushOnReply', () => {
    it('no fan', () => {
      const afanClient = new AfanClient(server3);
      return set_value('/afan/balance/uid0', 10).then(() => set_value('/afan/balance/uid1', 10))
        .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 1))
        .then(() => waitForNewBlocks(server3, 2))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_crushOnReply_no_fan_result.js');
          assert.deepEqual(res.result, expected);
        });
    });

    it('three fans', () => {
      const afanClient = new AfanClient(server4);

      return set_value('/afan/balance/uid0', 20)
        .then(() => set_value('/afan/balance/uid1', 10))
        .then(() => set_value('/afan/investors/uid1/uid2', 3))
        .then(() => set_value('/afan/investors/uid1/uid3', 2))
        .then(() => set_value('/afan/investors/uid1/uid4', 1))
        .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 12))
        .then(() => waitForNewBlocks(server4, 2))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_crushOnReply_three_fans_result.js');
          assert.deepEqual(res.result, expected);
        });
    });
  });

  describe('ad', () => {
    it('ad propose', () => {
      const afanClient = new AfanClient(server2);
      const op_list = [
        {
          type: 'SET_VALUE',
          ref: '/afan/balance/uid0',
          value: 10,
        },
        {
          type: 'SET_VALUE',
          ref: '/afan/balance/uid1',
          value: 10,
        },
      ];
      return set(op_list)
        .then(() => afanClient.tx_adpropose('uid0', 'uid1', 1, 'intermed'))
        .then(() => waitForNewBlocks(server2, 2))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_adpropose_result.js');
          assert.deepEqual(res.result, expected);
        });
    });
  });
});
