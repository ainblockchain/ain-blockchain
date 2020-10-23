const _ = require('lodash');
const chai = require('chai');
const assert = chai.assert;
const rimraf = require('rimraf');
const sleep = require('system-sleep');
const spawn = require('child_process').spawn;
const syncRequest = require('sync-request');
const AfanClient = require('../afan_client');
const { BLOCKCHAINS_DIR } = require('../constants');
const { waitUntilTxFinalized } = require('../unittest/test-util');
const PROJECT_ROOT = require('path').dirname(__filename) + '/../';
const TRACKER_SERVER = PROJECT_ROOT + 'tracker-server/index.js';
const APP_SERVER = PROJECT_ROOT + 'client/index.js';

const ENV_VARIABLES = [
  {
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./unittest/data/rules_for_testing.json'
  },
  {
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./unittest/data/rules_for_testing.json'
  },
  {
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./unittest/data/rules_for_testing.json'
  },
  {
    NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3, HOSTING_ENV: 'local', DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./unittest/data/rules_for_testing.json'
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

describe('aFan Client Test', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc;

  before(() => {
    rimraf.sync(BLOCKCHAINS_DIR);

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
    tracker_proc.kill();
    server1_proc.kill();
    server2_proc.kill();
    server3_proc.kill();
    server4_proc.kill();

    rimraf.sync(BLOCKCHAINS_DIR);
  });

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

  describe('tx_invest', () => {
    beforeEach(() => {
      return set_value('afan', null)
      .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash));
    });

    it('send_one', () => {
      const afanClient = new AfanClient(server1);

      return set_value('/afan/balance/uid0', 10)
        .then(() => set_value('/afan/balance/uid1', 10))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => afanClient.tx_invest('uid0', 'uid1', 1))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_invest_send_one_result.js');
          assert.deepEqual(res.result, expected);
        });
    });
  });

  describe('crushOnPost', () => {
    beforeEach(() => {
      return set_value('afan', null)
      .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash));
    });

    it('no fan', () => {
      const afanClient = new AfanClient(server1);

      return set_value('/afan/balance/uid0', 10)
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => set_value('/afan/balance/uid1', 10))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => afanClient.tx_crushOnPost('uid0', 'uid1', 'post0', 1))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
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
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => set_value('/afan/balance/uid1', 10))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => set_value('/afan/investors/uid1/uid2', 3))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => set_value('/afan/investors/uid1/uid3', 7))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => afanClient.tx_crushOnPost('uid0', 'uid1', 'post0', 20))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_crushOnPost_two_fans_result.js');
          assert.deepEqual(res.result, expected);
        });
    });
  });

  describe('crushOnReply', () => {
    beforeEach(() => {
      return set_value('afan', null)
      .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash));
    });

    it('no fan', () => {
      const afanClient = new AfanClient(server3);
      return set_value('/afan/balance/uid0', 10)
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => set_value('/afan/balance/uid1', 10))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 1))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_crushOnReply_no_fan_result.js');
          assert.deepEqual(res.result, expected);
        });
    });

    it('three fans', () => {
      const afanClient = new AfanClient(server4);

      return set_value('/afan/balance/uid0', 20)
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => set_value('/afan/balance/uid1', 10))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => set_value('/afan/investors/uid1/uid2', 3))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => set_value('/afan/investors/uid1/uid3', 2))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => set_value('/afan/investors/uid1/uid4', 1))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 12))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_crushOnReply_three_fans_result.js');
          assert.deepEqual(res.result, expected);
        });
    });
  });

  describe('ad', () => {
    beforeEach(() => {
      return set_value('afan', null)
      .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash));
    });
    
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
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => afanClient.tx_adpropose('uid0', 'uid1', 1, 'intermed'))
        .then((res) => waitUntilTxFinalized(servers, res.result.tx_hash))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_adpropose_result.js');
          assert.deepEqual(res.result, expected);
        });
    });
  });
})
