
const chai = require('chai');
const chaiHttp = require('chai-http');
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

chai.use(chaiHttp);

const server1 = 'http://localhost:9091';
const server2 = 'http://localhost:9092';
const server3 = 'http://localhost:9093';
const server4 = 'http://localhost:9094';

describe('aFan Client Test', () => {
  let tracker_proc; let server1_proc; let server2_proc; let server3_proc; let server4_proc;

  before(() => {
    tracker_proc = spawn('node', [TRACKER_SERVER], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
      },
      stdio: 'inherit',
    }).on('error', (err) => {
      console.error('Failed to start tracker server with error: ' + err.message);
    });
    sleep(2000);
    server1_proc = spawn('node', [APP_SERVER], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        STAKE: 250,
        LOG: true,
        P2P_PORT: 5001,
        PORT: 9091,
        LOCAL: true,
      },
    }).on('error', (err) => {
      console.error('Failed to start server1 with error: ' + err.message);
    });
    sleep(2000);
    server2_proc = spawn('node', [APP_SERVER], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        LOG: true,
        P2P_PORT: 5002,
        PORT: 9092,
        LOCAL: true,
      },
    }).on('error', (err) => {
      console.error('Failed to start server2 with error: ' + err.message);
    });
    sleep(2000);
    server3_proc = spawn('node', [APP_SERVER], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        LOG: true,
        P2P_PORT: 5003,
        PORT: 9093,
        LOCAL: true,
      },
    }).on('error', (err) => {
      console.error('Failed to start server3 with error: ' + err.message);
    });
    sleep(2000);
    server4_proc = spawn('node', [APP_SERVER], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        LOG: true,
        P2P_PORT: 5004,
        PORT: 9094,
        LOCAL: true,
      },
    }).on('error', (err) => {
      console.error('Failed to start server4 with error: ' + err.message);
    });
    sleep(12000);
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

  beforeEach(() => {
    return set_value('afan', {});
  });

  afterEach(() => {
    return set_value('afan', {});
  });

  describe('tx_invest', () => {
    it('send_one', () => {
      const afanClient = new AfanClient(server1);

      return set_value('/afan/balance/uid0', 10)
        .then(() => set_value('/afan/balance/uid1', 10))
        .then(() => sleep(500))
        .then(() => afanClient.tx_invest('uid0', 'uid1', 1))
        .then(() => sleep(500))
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
        .then(() => sleep(100))
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
        .then(() => sleep(500))
        .then(() => afanClient.tx_crushOnPost('uid0', 'uid1', 'post0', 20))
        .then(() => sleep(500))
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
        .then(() => sleep(1000))
        .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 1))
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
        .then(() => sleep(1000))
        .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 12))
        .then(() => sleep(500))
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
        .then(() => sleep(100))
        .then(() => get_value('/afan'))
        .then((res) => {
          const expected = require('./data/tx_adpropose_result.js');
          assert.deepEqual(res.result, expected);
        });
    });
  });
});
