const _ = require('lodash');
const chai = require('chai');
const assert = chai.assert;
const rimraf = require('rimraf');
const spawn = require('child_process').spawn;
const syncRequest = require('sync-request');
const AfanClient = require('../afan_client');
const { CHAINS_DIR } = require('../common/constants');
const CommonUtil = require('../common/common-util');
const {
  waitUntilTxFinalized,
  waitUntilNetworkIsReady,
  parseOrLog,
  setUpApp
} = require('../unittest/test-util');
const PROJECT_ROOT = require('path').dirname(__filename) + '/../';
const TRACKER_SERVER = PROJECT_ROOT + 'tracker-server/index.js';
const APP_SERVER = PROJECT_ROOT + 'client/index.js';

const ENV_VARIABLES = [
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
  },
];

const server1 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[0].ACCOUNT_INDEX));
const server2 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[1].ACCOUNT_INDEX));
const server3 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[2].ACCOUNT_INDEX));
const server4 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[3].ACCOUNT_INDEX));
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

async function setUp() {
  const server1Addr = parseOrLog(syncRequest(
      'GET', server1 + '/get_address').body.toString('utf-8')).result;
  const server2Addr = parseOrLog(syncRequest(
      'GET', server2 + '/get_address').body.toString('utf-8')).result;
  const server3Addr = parseOrLog(syncRequest(
      'GET', server3 + '/get_address').body.toString('utf-8')).result;
  const server4Addr = parseOrLog(syncRequest(
      'GET', server4 + '/get_address').body.toString('utf-8')).result;

  await setUpApp('afan', serverList, {
    admin: {
      [server1Addr]: true,
      [server2Addr]: true,
      [server3Addr]: true,
      [server4Addr]: true,
    }
  });
}

async function cleanUp() {
  let res = parseOrLog(syncRequest('POST', server2 + '/set', {
    json: {
      op_list: [
        {
          type: 'SET_VALUE',
          ref: '/apps/afan',
          value: null
        },
        {
          type: 'SET_RULE',
          ref: '/apps/afan',
          value: null
        },
      ],
      nonce: -1,
    }
  }).body.toString('utf-8')).result;
  assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
  if (!(await waitUntilTxFinalized(serverList, res.tx_hash))) {
    console.log(`Failed to check finalization of cleanUp() tx.`)
  }
}

describe('DApp Test', async () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc;

  before(async () => {
    rimraf.sync(CHAINS_DIR);
    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', { CONSOLE_LOG: false }, true);
    await CommonUtil.sleep(3000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0], true);
    await CommonUtil.sleep(10000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1], true);
    await CommonUtil.sleep(3000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2], true);
    await CommonUtil.sleep(3000);
    server4_proc = startServer(APP_SERVER, 'server4', ENV_VARIABLES[3], true);
    await waitUntilNetworkIsReady(serverList);
  });

  after(() => {
    tracker_proc.kill();
    server1_proc.kill();
    server2_proc.kill();
    server3_proc.kill();
    server4_proc.kill();

    rimraf.sync(CHAINS_DIR);
  });

  set_value = (ref, value) => {
    return Promise.resolve(parseOrLog(syncRequest(
        'POST', server1 + '/set_value', {json: {ref, value}}).body.toString('utf-8')));
  };

  set = (op_list) => {
    return Promise.resolve(parseOrLog(syncRequest(
        'POST', server2 + '/set', {json: {op_list}}).body.toString('utf-8')));
  };

  get_value = (ref) => {
    return Promise.resolve(parseOrLog(syncRequest(
        'GET', server3 + `/get_value?ref=${ref}`).body.toString('utf-8')));
  };

  describe('aFan Txs', () => {
    before(async () => {
      await setUp();
    })

    after(async () => {
      await cleanUp();
    })

    describe('tx_invest', () => {
      beforeEach(() => {
        return set_value('/apps/afan', null)
        .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')));
      });

      it('send_one', () => {
        const afanClient = new AfanClient(server1);

        return set_value('/apps/afan/balance/uid0', 10)
          .then(() => set_value('/apps/afan/balance/uid1', 10))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => afanClient.tx_invest('uid0', 'uid1', 1))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => get_value('/apps/afan'))
          .then((res) => {
            const expected = require('./data/tx_invest_send_one_result.js');
            assert.deepEqual(res.result, expected);
          });
      });
    });

    describe('tx_crushOnPost', () => {
      beforeEach(() => {
        return set_value('/apps/afan', null)
        .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')));
      });

      it('no fan', () => {
        const afanClient = new AfanClient(server1);

        return set_value('/apps/afan/balance/uid0', 10)
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => set_value('/apps/afan/balance/uid1', 10))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => afanClient.tx_crushOnPost('uid0', 'uid1', 'post0', 1))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => get_value('/apps/afan'))
          .then((res) => {
            const expected = require('./data/tx_crushOnPost_no_fan_result.js');
            assert.deepEqual(res.result, expected);
          });
      });

      it('two fans', async () => {
        const afanClient = new AfanClient(server2);
        await CommonUtil.sleep(200);
        return set_value('/apps/afan/balance/uid0', 30)
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => set_value('/apps/afan/balance/uid1', 10))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => set_value('/apps/afan/investors/uid1/uid2', 3))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => set_value('/apps/afan/investors/uid1/uid3', 7))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => afanClient.tx_crushOnPost('uid0', 'uid1', 'post0', 20))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => get_value('/apps/afan'))
          .then((res) => {
            const expected = require('./data/tx_crushOnPost_two_fans_result.js');
            assert.deepEqual(res.result, expected);
          });
      });
    });

    describe('tx_crushOnReply', () => {
      beforeEach(() => {
        return set_value('/apps/afan', null)
        .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')));
      });

      it('no fan', () => {
        const afanClient = new AfanClient(server3);
        return set_value('/apps/afan/balance/uid0', 10)
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => set_value('/apps/afan/balance/uid1', 10))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 1))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => get_value('/apps/afan'))
          .then((res) => {
            const expected = require('./data/tx_crushOnReply_no_fan_result.js');
            assert.deepEqual(res.result, expected);
          });
      });

      it('three fans', () => {
        const afanClient = new AfanClient(server4);

        return set_value('/apps/afan/balance/uid0', 20)
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => set_value('/apps/afan/balance/uid1', 10))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => set_value('/apps/afan/investors/uid1/uid2', 3))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => set_value('/apps/afan/investors/uid1/uid3', 2))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => set_value('/apps/afan/investors/uid1/uid4', 1))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 12))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => get_value('/apps/afan'))
          .then((res) => {
            const expected = require('./data/tx_crushOnReply_three_fans_result.js');
            assert.deepEqual(res.result, expected);
          });
      });
    });

    describe('tx_adpropose', () => {
      beforeEach(() => {
        return set_value('/apps/afan', null)
        .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')));
      });

      it('ad propose', () => {
        const afanClient = new AfanClient(server2);
        const op_list = [
          {
            type: 'SET_VALUE',
            ref: '/apps/afan/balance/uid0',
            value: 10,
          },
          {
            type: 'SET_VALUE',
            ref: '/apps/afan/balance/uid1',
            value: 10,
          },
        ];
        return set(op_list)
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => afanClient.tx_adpropose('uid0', 'uid1', 1, 'intermed'))
          .then(async (res) => await waitUntilTxFinalized(serverList, _.get(res, 'result.tx_hash')))
          .then(() => get_value('/apps/afan'))
          .then((res) => {
            const expected = require('./data/tx_adpropose_result.js');
            assert.deepEqual(res.result, expected);
          });
      });
    });
  });
});
