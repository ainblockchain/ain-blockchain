
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

const ENV_VARIABLES = [
  {
    PRIVATE_KEY: '61a24a6825e6431e46976dc82e630906b67e732dc1a3921a95c8bb74e30ae5f',
    P2P_PORT: 5001, PORT: 9091, LOG: true, STAKE: 250, LOCAL: true, DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    PRIVATE_KEY: 'dd9b37f3e5b4db03dd90b37f1bff8ffc7b1d92e4b70edeef7ae1b12ac7766b5d',
    P2P_PORT: 5002, PORT: 9092, LOG: true, STAKE: 250, LOCAL: true, DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    PRIVATE_KEY: 'b527c57ae72e772b4b4e418a95e51cba0ba9ad70850289783235135b86cb7dc6',
    P2P_PORT: 5003, PORT: 9093, LOG: true, STAKE: 250, LOCAL: true, DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
  {
    PRIVATE_KEY: '31554fb0a188777cc434bca4f982a4cfe76c242376c5e70cb2619156eac9d764',
    P2P_PORT: 5004, PORT: 9094, LOG: true, STAKE: 250, LOCAL: true, DEBUG: true,
    ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
  },
];

const server1 = 'http://localhost:' + ENV_VARIABLES[0].PORT
const server2 = 'http://localhost:' + ENV_VARIABLES[1].PORT
const server3 = 'http://localhost:' + ENV_VARIABLES[2].PORT
const server4 = 'http://localhost:' + ENV_VARIABLES[3].PORT

function startServer(application, serverName, envVars, stdioInherit = false) {
  const options = {
    cwd: process.cwd(),
    env: {
        PATH: process.env.PATH, ...envVars
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
    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', {}, true);
    sleep(2000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0]);
    sleep(2000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1]);
    sleep(2000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2]);
    sleep(2000);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[3]);
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
