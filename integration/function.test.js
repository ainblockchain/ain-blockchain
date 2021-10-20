const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const _ = require("lodash");
const spawn = require("child_process").spawn;
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const jayson = require('jayson/promise');
const ainUtil = require('@ainblockchain/ain-util');
const PROJECT_ROOT = require('path').dirname(__filename) + "/../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const {
  CURRENT_PROTOCOL_VERSION,
  CHAINS_DIR,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const {
  parseOrLog,
  setUpApp,
  waitUntilNetworkIsReady,
  waitUntilTxFinalized,
  getBlockByNumber,
  eraseStateGas,
} = require('../unittest/test-util');
const DB = require('../db');

const ENV_VARIABLES = [
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 0, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 1, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 2, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    MAX_BLOCK_NUMBERS_FOR_RECEIPTS: 100,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    MIN_NUM_VALIDATORS: 4, ACCOUNT_INDEX: 3, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
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

describe('Native Function', () => {
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
    await waitUntilNetworkIsReady(serverList);

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

  describe('Function triggering', () => {
    const setFunctionWithOwnerOnlyPath = '/apps/test/test_function_triggering/owner_only';
    const saveLastTxAllowedPath = '/apps/test/test_function_triggering/allowed_path_with_fid';
    const saveLastTxNotAllowedPath = '/apps/test/test_function_triggering/not_allowed_path_with_fid';
    const saveLastTxAllowedPathWithFids = '/apps/test/test_function_triggering/allowed_path_with_fids';
    const saveLastTxNotAllowedPathWithFids = '/apps/test/test_function_triggering/not_allowed_path_with_fids';
    const setOwnerConfigAllowedPath = '/apps/test/test_function_triggering/set_owner_allowed_path_with_fid';
    const setOwnerConfigNotAllowedPath = '/apps/test/test_function_triggering/set_owner_not_allowed_path_with_fid';
    const triggerRestFunctionPath = '/apps/test/test_function_triggering/rest_function_path';

    let transferFrom; // = server1
    let transferTo; // = server2
    const transferAmount = 33;
    let transferPath;
    let transferFromBalancePath;
    let transferToBalancePath;

    let serviceAdmin; // = server1
    let serviceUser; // = server2
    let serviceUserBad;     // = server3
    const stakeAmount = 50;
    let stakingServiceAccountBalancePath;
    let stakePath;
    let unstakePath;
    let serviceUserBalancePath;

    let triggerTransferToIndividualAccountPath1;
    let triggerTransferToIndividualAccountPath2;
    let triggerTransferToServiceAccountPath1;
    let triggerTransferToServiceAccountPath2;

    before(() => {
      transferFrom = parseOrLog(
          syncRequest('GET', server1 + '/get_address').body.toString('utf-8')).result;
      transferTo =
          parseOrLog(syncRequest('GET', server2 + '/get_address').body.toString('utf-8')).result;
      transferPath = `/transfer/${transferFrom}/${transferTo}`;
      transferFromBalancePath = `/accounts/${transferFrom}/balance`;
      transferToBalancePath = `/accounts/${transferTo}/balance`;

      serviceAdmin =
          parseOrLog(syncRequest('GET', server1 + '/get_address').body.toString('utf-8')).result;
      serviceUser =
          parseOrLog(syncRequest('GET', server2 + '/get_address').body.toString('utf-8')).result;
      serviceUserBad =
          parseOrLog(syncRequest('GET', server3 + '/get_address').body.toString('utf-8')).result;
      stakingServiceAccountBalancePath = `/service_accounts/staking/test_service_staking/${serviceUser}|0/balance`;
      stakePath = `/staking/test_service_staking/${serviceUser}/0/stake`;
      unstakePath = `/staking/test_service_staking/${serviceUser}/0/unstake`;
      serviceUserBalancePath = `/accounts/${serviceUser}/balance`;

      triggerTransferToIndividualAccountPath1 =
          `/transfer/${serviceUser}/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/0/value`;
      triggerTransferToIndividualAccountPath2 =
          `/transfer/${serviceUser}/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/1/value`;
      triggerTransferToServiceAccountPath1 =
          `/staking/test_service_gas_fee/${serviceUser}/0/stake/100/value`;
      triggerTransferToServiceAccountPath2 =
          `/staking/test_service_gas_fee/${serviceUser}/0/stake/101/value`;
    })

    beforeEach(async () => {
      const res = parseOrLog(syncRequest('POST', server2 + '/set', {
        json: {
          op_list: [
            // allowed_path_with_fid
            {
              type: 'SET_FUNCTION',
              ref: '/apps/test/test_function_triggering/allowed_path_with_fid/value',
              value: {
                ".function": {
                  "_saveLastTx": {
                    "function_type": "NATIVE",
                    "function_id": "_saveLastTx"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering/allowed_path_with_fid/value',
              value: {
                ".rule": {
                  "write": true
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering/allowed_path_with_fid/.last_tx/value',
              value: {
                ".rule": {
                  "write": "auth.fid === '_saveLastTx'"
                }
              }
            },
            // not_allowed_path_with_fid
            {
              type: 'SET_FUNCTION',
              ref: '/apps/test/test_function_triggering/not_allowed_path_with_fid/value',
              value: {
                ".function": {
                  "_saveLastTx": {
                    "function_type": "NATIVE",
                    "function_id": "_saveLastTx"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering/not_allowed_path_with_fid/value',
              value: {
                ".rule": {
                  "write": true
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering/not_allowed_path_with_fid/.last_tx/value',
              value: {
                ".rule": {
                  "write": "auth.fid === 'some function id'"
                }
              }
            },
            // allowed_path_with_fids
            {
              type: 'SET_FUNCTION',
              ref: '/apps/test/test_function_triggering/allowed_path_with_fids/value',
              value: {
                ".function": {
                  "_saveLastTx": {
                    "function_type": "NATIVE",
                    "function_id": "_saveLastTx"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering/allowed_path_with_fids/value',
              value: {
                ".rule": {
                  "write": true
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering/allowed_path_with_fids/.last_tx/value',
              value: {
                ".rule": {
                  "write": "util.includes(auth.fids, '_saveLastTx')"
                }
              }
            },
            // not_allowed_path_with_fids
            {
              type: 'SET_FUNCTION',
              ref: '/apps/test/test_function_triggering/not_allowed_path_with_fids/value',
              value: {
                ".function": {
                  "_saveLastTx": {
                    "function_type": "NATIVE",
                    "function_id": "_saveLastTx"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering/not_allowed_path_with_fids/value',
              value: {
                ".rule": {
                  "write": true
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering/not_allowed_path_with_fids/.last_tx/value',
              value: {
                ".rule": {
                  "write": "util.includes(auth.fids, 'some function id')"
                }
              }
            },
            // set_owner_allowed_path_with_fid
            {
              type: 'SET_FUNCTION',
              ref: '/apps/test/test_function_triggering/set_owner_allowed_path_with_fid/value',
              value: {
                ".function": {
                  "_setOwnerConfig": {
                    "function_type": "NATIVE",
                    "function_id": "_setOwnerConfig"
                  }
                }
              }
            },
            {
              type: 'SET_OWNER',
              ref: '/apps/test/test_function_triggering/set_owner_allowed_path_with_fid',
              value: {
                ".owner": {
                  "owners": {
                    "fid:_setOwnerConfig": {
                      "branch_owner": true,  // allow branching
                      "write_function": false,
                      "write_owner": false,
                      "write_rule": false,
                    },
                    "*": {
                      "branch_owner": false,  // not allow branching
                      "write_function": true,
                      "write_owner": true,
                      "write_rule": true,
                    }
                  }
                }
              }
            },
            // set_owner_not_allowed_path_with_fid
            {
              type: 'SET_FUNCTION',
              ref: '/apps/test/test_function_triggering/set_owner_not_allowed_path_with_fid/value',
              value: {
                ".function": {
                  "_setOwnerConfig": {
                    "function_type": "NATIVE",
                    "function_id": "_setOwnerConfig"
                  }
                }
              }
            },
            {
              type: 'SET_OWNER',
              ref: '/apps/test/test_function_triggering/set_owner_not_allowed_path_with_fid',
              value: {
                ".owner": {
                  "owners": {
                    "fid:_setOwnerConfig": {
                      "branch_owner": false,  // not allow branching
                      "write_function": false,
                      "write_owner": false,
                      "write_rule": false,
                    },
                    "*": {
                      "branch_owner": false,  // not allow branching
                      "write_function": true,
                      "write_owner": true,
                      "write_rule": true,
                    }
                  }
                }
              }
            },
            // rest_function_path
            {
              type: 'SET_FUNCTION',
              ref: '/apps/test/test_function_triggering/rest_function_path',
              value: {
                ".function": {
                  "0x11111": {
                    "function_type": "REST",
                    "event_listener": "https://events.ainetwork.ai/trigger",
                    "service_name": "https://ainetwork.ai",
                    "function_id": "0x11111"
                  }
                }
              }
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering/rest_function_path',
              value: {
                ".rule": {
                  "write": true
                }
              }
            },
          ],
          nonce: -1,
        }
      }).body.toString('utf-8')).result;
      assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
      if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
        console.error(`Failed to check finalization of function triggering setup tx.`);
      }
    })

    afterEach(async () => {
      const res = parseOrLog(syncRequest('POST', server2 + '/set', {
        json: {
          op_list: [
            {
              type: 'SET_VALUE',
              ref: '/apps/test/test_function_triggering',
              value: null
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering',
              value: null
            },
            {
              type: 'SET_FUNCTION',
              ref: '/apps/test/test_function_triggering',
              value: null
            },
            {
              type: 'SET_OWNER',
              ref: '/apps/test/test_function_triggering',
              value: null
            },
          ],
          nonce: -1,
        }
      }).body.toString('utf-8')).result;
      assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
      if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
        console.error(`Failed to check finalization of function triggering cleanup tx.`);
      }
    })

    describe('Function permission', () => {
      describe('Owner only', async () => {
        beforeEach(async () => {
          const res = parseOrLog(syncRequest('POST', server2 + '/set_function', {
            json: {
              ref: setFunctionWithOwnerOnlyPath,
              value: null,
              timestamp: Date.now(),
              nonce: -1,
            }
          }).body.toString('utf-8')).result;
          assert.deepEqual(_.get(res, 'result.code'), 0);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of owner only cleanup tx.`);
          }
        })

        it('owner only: set_function with ownerOnly = false (_saveLastTx)', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_function', {json: {
            ref: setFunctionWithOwnerOnlyPath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            },
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const resp = parseOrLog(syncRequest('GET',
              server2 + `/get_function?ref=${setFunctionWithOwnerOnlyPath}`)
            .body.toString('utf-8')).result
          // Should not be null.
          expect(resp).to.not.equal(null);
        });

        it('owner only: set_function with ownerOnly = true (_transfer)', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_function', {json: {
            ref: setFunctionWithOwnerOnlyPath,
            value: {
              ".function": {
                "_transfer": {
                  "function_type": "NATIVE",
                  "function_id": "_transfer"
                }
              }
            },
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 403,
            "error_message": "Trying to write owner-only function: _transfer",
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 0,
            "gas_amount_total": {
              "bandwidth": {
                "app": {
                  "test": 1
                },
                "service": 0
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
          })
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const resp = parseOrLog(syncRequest('GET',
              server2 + `/get_function?ref=${setFunctionWithOwnerOnlyPath}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(resp).to.equal(null);
        });
      });

      describe('Write rule: auth.fid', () => {
        it('write rule: auth.fid: without function permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxNotAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 105,
            "error_message": "Triggered function call failed",
            "func_results": {
              "_saveLastTx": {
                "code": 1,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/not_allowed_path_with_fid/.last_tx/value",
                    "result": {
                      "code": 103,
                      "error_message": "No write permission on: /apps/test/test_function_triggering/not_allowed_path_with_fid/.last_tx/value",
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
                  "test": 2
                },
                "service": 0
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxNotAllowedPath + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(_.get(lastTx, 'tx_hash', null)).to.equal(null);
        });

        it('write rule: auth.fid: with function permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_saveLastTx": {
                "code": 0,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path_with_fid/.last_tx/value",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1,
                    }
                  }
                }
              }
            },
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 8,
            "gas_amount_total": {
              "bandwidth": {
                "app": {
                  "test": 2
                },
                "service": 0
              },
              "state": {
                "app": {
                  "test": 1412
                },
                "service": 8
              }
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxAllowedPath + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be the tx hash value.
          assert.deepEqual(_.get(lastTx, 'tx_hash', null), body.result.tx_hash);
        });
      });

      describe('Write rule: auth.fids', () => {
        it('write rule: auth.fids: without function permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxNotAllowedPathWithFids + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 105,
            "error_message": "Triggered function call failed",
            "func_results": {
              "_saveLastTx": {
                "code": 1,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/not_allowed_path_with_fids/.last_tx/value",
                    "result": {
                      "code": 103,
                      "error_message": "No write permission on: /apps/test/test_function_triggering/not_allowed_path_with_fids/.last_tx/value",
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
                  "test": 2
                },
                "service": 0
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxNotAllowedPathWithFids + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(_.get(lastTx, 'tx_hash', null)).to.equal(null);
        });

        it('write rule: auth.fids: with function permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxAllowedPathWithFids + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_saveLastTx": {
                "code": 0,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path_with_fids/.last_tx/value",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1,
                    }
                  }
                }
              }
            },
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 8,
            "gas_amount_total": {
              "bandwidth": {
                "app": {
                  "test": 2
                },
                "service": 0
              },
              "state": {
                "app": {
                  "test": 1414
                },
                "service": 8
              }
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxAllowedPathWithFids + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be the tx hash value.
          assert.deepEqual(_.get(lastTx, 'tx_hash', null), body.result.tx_hash);
        });
      });

      describe('Owner rule: auth.fid', () => {
        it('owner rule: auth.fid: without function permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: setOwnerConfigNotAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 105,
            "error_message": "Triggered function call failed",
            "func_results": {
              "_setOwnerConfig": {
                "code": 1,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/set_owner_not_allowed_path_with_fid/value",
                    "result": {
                      "code": 603,
                      "error_message": "No write_owner or branch_owner permission on: /apps/test/test_function_triggering/set_owner_not_allowed_path_with_fid/value",
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
                  "test": 2
                },
                "service": 0
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const ownerConfig = parseOrLog(syncRequest('GET',
              server2 + `/get_owner?ref=${setOwnerConfigNotAllowedPath + '/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(ownerConfig).to.equal(null);
        });

        it('owner rule: auth.fid: with function permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: setOwnerConfigAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 0,
            "func_results": {
              "_setOwnerConfig": {
                "code": 0,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/set_owner_allowed_path_with_fid/value",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1,
                    }
                  }
                }
              }
            },
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 8,
            "gas_amount_total": {
              "bandwidth": {
                "app": {
                  "test": 2
                },
                "service": 0
              },
              "state": {
                "app": {
                  "test": 3200
                },
                "service": 8
              }
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const ownerConfig = parseOrLog(syncRequest('GET',
              server2 + `/get_owner?ref=${setOwnerConfigAllowedPath + '/value'}`)
            .body.toString('utf-8')).result
          // Should be not null.
          expect(ownerConfig).to.not.equal(null);
        });
      });
    });

    describe('Function execution', () => {
      before(async () => {
        const appStakingPath =
            `/staking/test/${serviceAdmin}/0/stake/${Date.now()}/value`;
        const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: appStakingPath,
          value: 1
        }}).body.toString('utf-8')).result;
        if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      describe('/set_value', () => {
        it("when successful with function triggering", async () => {
          const valuePath = '/apps/test/test_function_triggering/allowed_path1/value';
          const functionResultPath = '/apps/test/test_function_triggering/allowed_path1/.last_tx/value';
          const value = 'some value';
          const timestamp = 1234567890000;

          // Config
          const res = parseOrLog(syncRequest('POST', server2 + '/set', { json: {
            op_list: [
              {
                type: 'SET_FUNCTION',
                ref: valuePath,
                value: {
                  ".function": {
                    "_saveLastTx": {
                      "function_type": "NATIVE",
                      "function_id": "_saveLastTx"
                    }
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: valuePath,
                value: {
                  ".rule": {
                    "write": true
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: functionResultPath,
                value: {
                  ".rule": {
                    "write": true  // Allow all.
                  }
                }
              },
              {
                type: 'SET_FUNCTION',
                ref: functionResultPath,
                value: {
                  ".function": {
                    "_eraseValue": {
                      "function_type": "NATIVE",
                      "function_id": "_eraseValue"
                    }
                  }
                }
              },
            ],
            nonce: -1,
          }}).body.toString('utf-8')).result;
          assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of function triggering setup tx.`);
          }

          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: valuePath,
            value,
            gas_price: 1,
            nonce: -1,
            timestamp,
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 0);  // Should succeed.
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // Confirm that the value change is committed.
          assert.deepEqual(parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result, value);
        });

        it("when failed with function triggering", async () => {
          const valuePath = '/apps/test/test_function_triggering/allowed_path2/value';
          const functionResultPath = '/apps/test/test_function_triggering/allowed_path2/.last_tx/value';
          const value = 'some value';
          const timestamp = 1234567890000 + 1;
          let valueBefore = null;
          let valueAfter = null;

          // Config
          const res = parseOrLog(syncRequest('POST', server2 + '/set', { json: {
            op_list: [
              {
                type: 'SET_FUNCTION',
                ref: valuePath,
                value: {
                  ".function": {
                    "_saveLastTx": {
                      "function_type": "NATIVE",
                      "function_id": "_saveLastTx"
                    }
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: valuePath,
                value: {
                  ".rule": {
                    "write": true
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: functionResultPath,
                value: {
                  ".rule": {
                    "write": "auth.fid !== '_eraseValue'"  // Do NOT allow writes by the last function.
                  }
                }
              },
              {
                type: 'SET_FUNCTION',
                ref: functionResultPath,
                value: {
                  ".function": {
                    "_eraseValue": {
                      "function_type": "NATIVE",
                      "function_id": "_eraseValue"
                    }
                  }
                }
              },
            ],
            nonce: -1,
          }}).body.toString('utf-8')).result;
          assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of function triggering setup tx.`);
          }

          valueBefore = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result;

          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: valuePath,
            value,
            gas_price: 1,
            nonce: -1,
            timestamp,
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 1);  // Should fail.
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // Confirm that the value change is undone.
          valueAfter = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result;
          assert.deepEqual(valueAfter, valueBefore);
        });
      });

      describe('/set', () => {
        it("when successful with function triggering", async () => {
          const valuePath = '/apps/test/test_function_triggering/allowed_path101/value';
          const functionResultPath = '/apps/test/test_function_triggering/allowed_path101/.last_tx/value';
          const value = 'some value';
          const timestamp = 1234567890000;

          // Config
          const res = parseOrLog(syncRequest('POST', server2 + '/set', { json: {
            op_list: [
              {
                type: 'SET_FUNCTION',
                ref: valuePath,
                value: {
                  ".function": {
                    "_saveLastTx": {
                      "function_type": "NATIVE",
                      "function_id": "_saveLastTx"
                    }
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: valuePath,
                value: {
                  ".rule": {
                    "write": true
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: functionResultPath,
                value: {
                  ".rule": {
                    "write": true  // Allow all.
                  }
                }
              },
              {
                type: 'SET_FUNCTION',
                ref: functionResultPath,
                value: {
                  ".function": {
                    "_eraseValue": {
                      "function_type": "NATIVE",
                      "function_id": "_eraseValue"
                    }
                  }
                }
              },
            ],
            nonce: -1,
          }}).body.toString('utf-8')).result;
          assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of function triggering setup tx.`);
          }

          const body = parseOrLog(syncRequest('POST', server2 + '/set', {json: {
            op_list: [
              {
                ref: valuePath,
                value,
              },
              {
                // Default type: SET_VALUE
                ref: "/apps/test/nested/far/down101",
                value: {
                  "new": 12345
                },
              },
            ],
            gas_price: 1,
            nonce: -1,
            timestamp,
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 0);  // Should succeed.
          if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // Confirm that the value change is committed.
          assert.deepEqual(parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result, value);
        });

        it("when failed with function triggering", async () => {
          const valuePath = '/apps/test/test_function_triggering/allowed_path102/value';
          const functionResultPath = '/apps/test/test_function_triggering/allowed_path102/.last_tx/value';
          const value = 'some value';
          const timestamp = 1234567890000 + 1;
          let valueBefore = null;
          let valueAfter = null;

          const res = parseOrLog(syncRequest('POST', server2 + '/set', { json: {
            op_list: [
              {
                type: 'SET_FUNCTION',
                ref: valuePath,
                value: {
                  ".function": {
                    "_saveLastTx": {
                      "function_type": "NATIVE",
                      "function_id": "_saveLastTx"
                    }
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: valuePath,
                value: {
                  ".rule": {
                    "write": true
                  }
                }
              },
              {
                type: 'SET_RULE',
                ref: functionResultPath,
                value: {
                  ".rule": {
                    "write": "auth.fid !== '_eraseValue'"  // Do NOT allow writes by the last function.
                  }
                }
              },
              {
                type: 'SET_FUNCTION',
                ref: functionResultPath,
                value: {
                  ".function": {
                    "_eraseValue": {
                      "function_type": "NATIVE",
                      "function_id": "_eraseValue"
                    }
                  }
                }
              },
            ],
            nonce: -1,
          }}).body.toString('utf-8')).result;
          assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
          if (!(await waitUntilTxFinalized(serverList, _.get(res, 'tx_hash')))) {
            console.error(`Failed to check finalization of function triggering setup tx.`);
          }

          valueBefore = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result;

          const body = parseOrLog(syncRequest('POST', server2 + '/set', {json: {
            op_list: [
              {
                ref: valuePath,
                value,
              },
              {
                // Default type: SET_VALUE
                ref: "/apps/test/nested/far/down102",
                value: {
                  "new": 12345
                },
              },
            ],
            gas_price: 1,
            nonce: -1,
            timestamp,
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 1);  // Should fail.
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // Confirm that the value change is undone.
          valueAfter = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${valuePath}`).body.toString('utf-8')).result;
          assert.deepEqual(valueAfter, valueBefore);
        });
      });
    });

    describe('App creation', () => {
      before(async () => {
        const appStakingPath =
            `/staking/test_service_create_app0/${serviceAdmin}/0/stake/${Date.now()}/value`;
        const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: appStakingPath,
          value: 1
        }}).body.toString('utf-8')).result;
        if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when successful with valid app name", async () => {
        const manageAppPath = '/manage_app/test_service_create_app0/create/1';
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(createAppRes.result), {
          "func_results": {
            "_createApp": {
              "code": 0,
              "bandwidth_gas_amount": 0,
              "op_results": {
                "0": {
                  "path": "/apps/test_service_create_app0",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/apps/test_service_create_app0",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": "/manage_app/test_service_create_app0/config",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              }
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "test_service_create_app0": 2
              },
              "service": 2
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid app name", async () => {
        const manageAppPath = '/manage_app/0test_service_create_app/create/1';
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "result": {
            "code": 105,
            "error_message": "Triggered function call failed",
            "func_results": {
              "_createApp": {
                "code": 300,
                "bandwidth_gas_amount": 0
              }
            },
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 1,
            "gas_amount_total": {
              "bandwidth": {
                "service": 1
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0
          },
          "tx_hash": "0x60f6a71fedc8bbe457680ff6cf2e24b5c2097718f226c4f40fb4f9849d52f7fa"
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('create a public app', async () => {
        const appStakingPath =
            `/staking/test_service_create_app1/${serviceAdmin}/0/stake/${Date.now()}/value`;
        const appStakingRes = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: appStakingPath,
          value: 1
        }}).body.toString('utf-8')).result;
        if (!(await waitUntilTxFinalized(serverList, appStakingRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const manageAppPath = '/manage_app/test_service_create_app1/create/0';
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
            is_public: true
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(createAppRes.result), {
          "func_results": {
            "_createApp": {
              "code": 0,
              "bandwidth_gas_amount": 0,
              "op_results": {
                "0": {
                  "path": "/apps/test_service_create_app1",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/apps/test_service_create_app1",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": "/manage_app/test_service_create_app1/config",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              }
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "test_service_create_app1": 2
              },
              "service": 2
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0
        });
        if (!(await waitUntilTxFinalized(serverList, createAppRes.tx_hash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const appConfig = parseOrLog(syncRequest('GET', 
            server2 + `/get_value?ref=/manage_app/test_service_create_app1/config`)
            .body.toString('utf-8')).result;
        assert.deepEqual(appConfig, {
          "admin": {
            "0x00ADEc28B6a845a085e03591bE7550dd68673C1C": true
          },
          "is_public": true
        });
        const appWriteRule = parseOrLog(syncRequest('GET', 
            server2 + `/get_rule?ref=/apps/test_service_create_app1`).body.toString('utf-8')).result;
        assert.deepEqual(appWriteRule, {
          ".rule": {
            "write": true
          }
        });
        const appOwnerRule = parseOrLog(syncRequest('GET', 
            server2 + `/get_owner?ref=/apps/test_service_create_app1`).body.toString('utf-8')).result;
        assert.deepEqual(appOwnerRule, {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": false,
                "write_rule": true
              },
              "0x00ADEc28B6a845a085e03591bE7550dd68673C1C": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true
              }
            }
          }        
        });
      });
    });

    describe('Gas fee', () => {
      before(async () => {
        await setUpApp('test_service_gas_fee', serverList, { admin: { [serviceAdmin]: true } });
      });

      it("native function (_transfer) with individual account registration", async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerTransferToIndividualAccountPath1,
          value: 10,
          timestamp: 1234567890000,
          nonce: -1,
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "func_results": {
            "_transfer": {
              "op_results": {
                "0": {
                  "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/accounts/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/balance",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 1000
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 1003
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("native function (_transfer) without individual account registration", async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerTransferToIndividualAccountPath2,
          value: 10,
          timestamp: 1234567890000,
          nonce: -1,
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "func_results": {
            "_transfer": {
              "op_results": {
                "0": {
                  "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/accounts/0x107Ab4369070716cEA7f0d34359fa6a99F54951F/balance",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 3
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("native function (_transfer) with service account registration", async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerTransferToServiceAccountPath1,
          value: 10,
          timestamp: 1234567890000,
          nonce: -1,
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "func_results": {
            "_stake": {
              "op_results": {
                "0": {
                  "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/staking|test_service_gas_fee|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/value",
                  "result": {
                    "func_results": {
                      "_transfer": {
                        "op_results": {
                          "0": {
                            "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          },
                          "1": {
                            "path": "/service_accounts/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          }
                        },
                        "code": 0,
                        "bandwidth_gas_amount": 1000
                      }
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/expire_at",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": "/staking/test_service_gas_fee/balance_total",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 1006
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("native function (_transfer) without service account registration", async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerTransferToServiceAccountPath2,
          value: 10,
          timestamp: 1234567890001,
          nonce: -1,
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "func_results": {
            "_stake": {
              "op_results": {
                "0": {
                  "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/staking|test_service_gas_fee|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890001/value",
                  "result": {
                    "func_results": {
                      "_transfer": {
                        "op_results": {
                          "0": {
                            "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          },
                          "1": {
                            "path": "/service_accounts/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          }
                        },
                        "code": 0,
                        "bandwidth_gas_amount": 0
                      }
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/staking/test_service_gas_fee/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/expire_at",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": "/staking/test_service_gas_fee/balance_total",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 6
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("REST function with external RPC call", async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: triggerRestFunctionPath,
          value: 'some value',
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result'), ['test']), {
          "func_results": {
            "0x11111": {
              "code": 0,
              "bandwidth_gas_amount": 10,
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "test": 11
              },
              "service": 0
            },
            "state": {
              "app": {
                "test": "erased"
              },
              "service": "erased"
            }
          },
          "gas_cost_total": 0,
        });
        assert.deepEqual(body.code, 0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });
    });

    describe('Transfer: _transfer', () => {
      it('transfer: transfer', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/1/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 0);
        assert.deepEqual(body.code, 0);
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance - transferAmount);
        expect(toAfterBalance).to.equal(toBeforeBalance + transferAmount);
      });

      it('transfer: transfer more than account balance', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/2/value',
          value: fromBeforeBalance + 1
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer: transfer by another address', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server3 + '/set_value', {json: {
          ref: transferPath + '/3/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer: transfer with a duplicated key', async () => {
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/1/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('transfer: transfer with same addresses', async () => {
        const transferPathSameAddrs = `/transfer/${transferFrom}/${transferFrom}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathSameAddrs + '/4/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('transfer: transfer with non-checksum addreess', async () => {
        const fromLowerCase = _.toLower(transferFrom);
        const transferPathFromLowerCase = `/transfer/${fromLowerCase}/${transferTo}`;
        const bodyFromLowerCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathFromLowerCase + '/101/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyFromLowerCase.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(bodyFromLowerCase, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        const toLowerCase = _.toLower(transferTo);
        const transferPathToLowerCase = `/transfer/${transferFrom}/${toLowerCase}`;
        const bodyToLowerCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathToLowerCase + '/102/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyToLowerCase.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(bodyToLowerCase, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        const fromUpperCase = _.toLower(transferFrom);
        const transferPathFromUpperCase = `/transfer/${fromUpperCase}/${transferTo}`;
        const bodyFromUpperCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathFromUpperCase + '/103/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyFromUpperCase.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(bodyFromUpperCase, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        const toUpperCase = _.toLower(transferTo);
        const transferPathToUpperCase = `/transfer/${transferFrom}/${toUpperCase}`;
        const bodyToUpperCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathToUpperCase + '/104/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyToUpperCase.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(bodyToUpperCase, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('transfer: transfer with valid service account service type', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const transferToService = `staking|test_service|${transferTo}|0`;
        const transferToServiceBalancePath =
            `/service_accounts/staking/test_service/${transferTo}|0/balance`;
        const toServiceBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToServiceBalancePath}`)
            .body.toString('utf-8')).result || 0;
        const transferServicePath = `/transfer/${transferFrom}/${transferToService}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferServicePath + '/1/value',
          value: transferAmount,
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "func_results": {
            "_transfer": {
              "code": 0,
              "bandwidth_gas_amount": 1000,
              "op_results": {
                "0": {
                  "path": "/accounts/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/balance",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/service_accounts/staking/test_service/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              }
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 1003
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0
        });
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toServiceAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToServiceBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance - transferAmount);
        expect(toServiceAfterBalance).to.equal(toServiceBeforeBalance + transferAmount);
      });

      it('transfer: transfer with invalid service account service type', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const transferToService = `invalid_service_type|test_service|${transferTo}|0`;
        const transferServicePath = `/transfer/${transferFrom}/${transferToService}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferServicePath + '/1/value',
          value: transferAmount,
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(body, {
          "code": 1,
          "result": {
            "result": {
              "code": 103,
              "error_message": "No write permission on: /transfer/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/invalid_service_type|test_service|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1/value",
              "bandwidth_gas_amount": 1,
              "gas_amount_charged": 1,
              "gas_amount_total": {
                "bandwidth": {
                  "service": 1
                },
                "state": {
                  "service": 0
                }
              },
              "gas_cost_total": 0
            },
            "tx_hash": "0x6cce46b284beb254c6b67205f5ba00f04c85028d7457410b4fa4b4d8522c14be"
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
      });
    })

    describe('Staking: _stake, _unstake', () => {
      before(async () => {
        await setUpApp('test_service_staking', serverList, {
          admin: { [serviceAdmin]: true },
          service: {
            staking: { lockup_duration: 1000 }
          }
        });
      })

      describe('Stake', () => {
        it('stake: stake', async () => {
          let beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/1/value',
            value: stakeAmount,
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
            "func_results": {
              "_stake": {
                "code": 0,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/staking|test_service_staking|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": 0,
                          "bandwidth_gas_amount": 1000,
                          "op_results": {
                            "0": {
                              "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            },
                            "1": {
                              "path": "/service_accounts/staking/test_service_staking/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            }
                          }
                        }
                      },
                      "bandwidth_gas_amount": 1,
                    }
                  },
                  "1": {
                    "path": "/staking/test_service_staking/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0/expire_at",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1,
                    }
                  },
                  "2": {
                    "path": "/staking/test_service_staking/balance_total",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1,
                    }
                  }
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 'erased',
            "gas_amount_total": {
              "bandwidth": {
                "service": 1006
              },
              "state": {
                "service": 'erased'
              }
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const stakeValue = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakePath}/1/value`).body.toString('utf-8')).result;
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const stakingAppBalanceTotal = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/test_service_staking/balance_total`)
            .body.toString('utf-8')).result;
          expect(stakeValue).to.equal(stakeAmount);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance + stakeAmount);
          expect(afterBalance).to.equal(beforeBalance - stakeAmount);
          expect(stakingAppBalanceTotal).to.equal(stakeAmount + 1);
        });

        it('stake: stake more than account balance', async () => {
          const beforeBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/2/value',
            value: beforeBalance + 1
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance);
          expect(afterBalance).to.equal(beforeBalance);
        });

        it('stake: stake by another address', async () => {
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server3 + '/set_value', {json: {
            ref: `${stakePath}/3/value`,
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const stakeRequest = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakePath}/3`).body.toString('utf-8')).result;
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          expect(stakeRequest).to.equal(null);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance);
        });

        it('stake: stake with the same record_id', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/1/value',
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });

        it('stake: stake with non-checksum addreess', async () => {
          const addrLowerCase = _.toLower(serviceUser);
          const stakePathLowerCase = `/staking/checksum_addr_test_service/${addrLowerCase}/0/stake`;
          const bodyLowerCase = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePathLowerCase + '/101/value',
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(bodyLowerCase.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(bodyLowerCase, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }

          const addrUpperCase = _.toUpper(serviceUser);
          const stakePathUpperCase = `/staking/checksum_addr_test_service/${addrUpperCase}/0/stake`;
          const bodyUpperCase = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePathUpperCase + '/102/value',
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(bodyUpperCase.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(bodyUpperCase, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });
      });

      describe('Unstake', () => {
        it('unstake: unstake by another address', async () => {
          let beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/accounts/${serviceUserBad}/balance`)
              .body.toString('utf-8')).result;
          let beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server3 + '/set_value', {json: {
            ref: `${unstakePath}/1/value`,
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const unstakeRequest = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${unstakePath}/1`).body.toString('utf-8')).result;
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const balance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/accounts/${serviceUserBad}/balance`)
              .body.toString('utf-8')).result;
          expect(unstakeRequest).to.equal(null);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance);
          expect(balance).to.equal(beforeBalance);
        });

        it('unstake: unstake more than staked amount', async () => {
          let beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          let beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: `${unstakePath}/1/value`,
            value: beforeStakingAccountBalance + 1
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const balance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance);
          expect(balance).to.equal(beforeBalance);
        });

        it('unstake: unstake', async () => {
          const beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: `${unstakePath}/2/value`,
            value: stakeAmount,
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
            "func_results": {
              "_unstake": {
                "code": 0,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/transfer/staking|test_service_staking|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": 0,
                          "bandwidth_gas_amount": 0,
                          "op_results": {
                            "0": {
                              "path": "/service_accounts/staking/test_service_staking/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            },
                            "1": {
                              "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            }
                          }
                        }
                      },
                      "bandwidth_gas_amount": 1,
                    }
                  },
                  "1": {
                    "path": "/staking/test_service_staking/balance_total",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1,
                    }
                  }
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 'erased',
            "gas_amount_total": {
              "bandwidth": {
                "service": 5
              },
              "state": {
                "service": 'erased'
              }
            },
            "gas_cost_total": 0,
          });
          assert.deepEqual(body.code, 0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const stakingAppBalanceTotal = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/test_service_staking/balance_total`)
            .body.toString('utf-8')).result;
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance - stakeAmount);
          expect(afterBalance).to.equal(beforeBalance + stakeAmount);
          expect(stakingAppBalanceTotal).to.equal(1);
        });

        it('unstake: stake after unstake', async () => {
          const newStakingAmount = 100;
          const beforeBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/3/value',
            value: newStakingAmount
          }}).body.toString('utf-8'));
          assert.deepEqual(body.code, 0);
          assert.deepEqual(_.get(body, 'result.result.code'), 0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const stakeValue = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakePath}/3/value`).body.toString('utf-8')).result;
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          expect(stakeValue).to.equal(newStakingAmount);
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance + newStakingAmount);
          expect(afterBalance).to.equal(beforeBalance - newStakingAmount);
        });
      });
    });

    describe('Payments: _pay, _claim', () => {
      before(async () => {
        await setUpApp('test_service_payment', serverList, { admin: { [serviceAdmin]: true } });
      });

      it('payments: non-app admin cannot write pay records', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
              ref: `/payments/test_service_payment/${serviceUser}/0/pay/key1`,
              value: {
                amount: 100
              }
            }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: amount = 0', async () => {
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: 0
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: amount is not a number', async () => {
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: 'test'
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: payment amount > admin balance', async () => {
        const adminBalance = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: adminBalance + 1
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: app admin can write pay records', async () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key2`;
        const amount = adminBalanceBefore - 1;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', { json: {
          ref: payRef,
          value: {
            amount
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "func_results": {
            "_pay": {
              "code": 0,
              "bandwidth_gas_amount": 0,
              "op_results": {
                "0": {
                  "path": "/transfer/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/payments|test_service_payment|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/value",
                  "result": {
                    "code": 0,
                    "func_results": {
                      "_transfer": {
                        "code": 0,
                        "bandwidth_gas_amount": 1000,
                        "op_results": {
                          "0": {
                            "path": "/accounts/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1,
                            }
                          },
                          "1": {
                            "path": "/service_accounts/payments/test_service_payment/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1,
                            }
                          }
                        }
                      }
                    },
                    "bandwidth_gas_amount": 1,
                  }
                }
              }
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 1004
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0,
        });
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore - amount);
        const serviceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        assert.deepEqual(serviceAccountBalance, amount);
      });

      it('payments: non-app admin cannot write claim records', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
              ref: `/payments/test_service_payment/${serviceUser}/0/claim/key1`,
              value: {
                amount: 100,
                target: serviceAdmin
              }
            }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: claim amount > payment balance', async () => {
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/claim/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: paymentBalance + 1,
            target: serviceAdmin
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: invalid claim target', async () => {
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/claim/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: paymentBalance,
            target: 'INVALID_TARGET'
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: app admin can claim payments with individual account target', async () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const paymentClaimRef = `/payments/test_service_payment/${serviceUser}/0/claim/key2`;
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentClaimRef,
          value: {
            amount: paymentBalance,
            target: serviceAdmin
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "func_results": {
            "_claim": {
              "code": 0,
              "bandwidth_gas_amount": 0,
              "op_results": {
                "0": {
                  "path": "/transfer/payments|test_service_payment|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/1234567890000/value",
                  "result": {
                    "code": 0,
                    "func_results": {
                      "_transfer": {
                        "code": 0,
                        "bandwidth_gas_amount": 0,
                        "op_results": {
                          "0": {
                            "path": "/service_accounts/payments/test_service_payment/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1,
                            }
                          },
                          "1": {
                            "path": "/accounts/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1,
                            }
                          }
                        }
                      }
                    },
                    "bandwidth_gas_amount": 1,
                  }
                }
              }
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 4
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0,
        });
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore + paymentBalance);
        const serviceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(serviceAccountBalance).to.equals(0);
      });

      it('payments: app admin can claim payments + hold in escrow', async () => {
        // pay
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key4`;
        const amount = adminBalanceBefore - 1;
        let body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        // open escrow
        const escrowConfigRef = `/escrow/payments|test_service_payment|${serviceUser}|0/${serviceAdmin}/0/config`;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: escrowConfigRef,
          value: {
            admin: {
              [serviceAdmin]: true
            }
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        // claim + hold in escrow
        const claimRef = `/payments/test_service_payment/${serviceUser}/0/claim/key4`;
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: claimRef,
          value: {
            amount: paymentBalance,
            target: serviceAdmin,
            escrow_key: 0
          }
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const serviceAccountName = `payments|test_service_payment|${serviceUser}|0:${serviceAdmin}:0`;
        const escrowServiceAccountBalance = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/service_accounts/escrow/escrow/${serviceAccountName}/balance`)
            .body.toString('utf-8')).result;
        expect(escrowServiceAccountBalance).to.equals(paymentBalance);
        const userServiceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(userServiceAccountBalance).to.equals(0);
        // release escrow
        const releaseEscrowRef = `/escrow/payments|test_service_payment|${serviceUser}|0/${serviceAdmin}/0/release/key0`;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: releaseEscrowRef,
          value: {
            ratio: 1
          }
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore);
      });

      it('payments: app admin can claim payments with service account target', async () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key3`;
        const amount = adminBalanceBefore - 1;
        let body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        const claimRef = `/payments/test_service_payment/${serviceUser}/0/claim/key3`;
        const paymentBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: claimRef,
          value: {
            amount: paymentBalance,
            target: `payments|test_service_payment|${serviceAdmin}|0`
          }
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const adminServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceAdmin}|0/balance`)
                .body.toString('utf-8')).result;
        expect(adminServiceAccountBalanceAfter).to.equals(paymentBalance);
        const userServiceAccountBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(userServiceAccountBalance).to.equals(0);
      });
    });

    describe('Escrow: _hold, _release', () => {
      before(async () => {
        await setUpApp('test_service_escrow', serverList, { admin: { [serviceAdmin]: true } });
      });

      describe('Escrow: individual -> individual', () => {
        it('escrow: individual -> individual: open escrow', async () => {
          const configRef = `/escrow/${serviceUser}/${serviceAdmin}/0/config`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: configRef,
            value: {
              admin: {
                [serviceAdmin]: true
              }
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 'erased',
            "gas_amount_total": {
              "bandwidth": {
                "service": 1
              },
              "state": {
                "service": 'erased'
              }
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const escrowAccountConfig = parseOrLog(syncRequest('GET', server1 + `/get_value?ref=${configRef}`)
              .body.toString('utf-8')).result;
          assert.deepEqual(escrowAccountConfig, { admin: { [serviceAdmin]: true } });
        });

        it("escrow: individual -> individual: cannot open escrow if it's already open", async () => {
          const configRef = `/escrow/${serviceUser}/${serviceAdmin}/0/config`;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: configRef,
            value: {
              admin: {
                [serviceAdmin]: true
              }
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });

        it("escrow: individual -> individual: non-source account cannot write hold", async () => {
          const key = 1234567890000 + 1;
          const holdRef = `/escrow/${serviceUser}/${serviceAdmin}/0/hold/${key}`;
          const userBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: userBalanceBefore
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });

        it("escrow: individual -> individual: source account can write hold", async () => {
          const key = 1234567890000 + 2;
          const holdRef = `/escrow/${serviceUser}/${serviceAdmin}/0/hold/${key}`;
          const userBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: userBalanceBefore
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
            "func_results": {
              "_hold": {
                "code": 0,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/escrow|escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": 0,
                          "bandwidth_gas_amount": 1000,
                          "op_results": {
                            "0": {
                              "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            },
                            "1": {
                              "path": "/service_accounts/escrow/escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            }
                          }
                        }
                      },
                      "bandwidth_gas_amount": 1,
                    }
                  }
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 'erased',
            "gas_amount_total": {
              "bandwidth": {
                "service": 1004
              },
              "state": {
                "service": 'erased'
              }
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const escrowServiceAccountBalance = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalance).to.equals(userBalanceBefore);
        });

        it("escrow: individual -> individual: non-admin account cannot write release", async () => {
          const key = 1234567890000 + 3;
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 1
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });

        it("escrow: individual -> individual: invalid ratio (ratio = -1)", async () => {
          const key = 1234567890000 + 4;
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: -1
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });

        it("escrow: individual -> individual: invalid ratio (ratio = 1.1)", async () => {
          const key = 1234567890000 + 5;
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 1.1
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });

        it("escrow: individual -> individual: admin account can write release (ratio = 0)", async () => {
          const key = 1234567890000 + 6;
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const userBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const escrowServiceAccountBalanceBefore = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 0
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
            "func_results": {
              "_release": {
                "code": 0,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/transfer/escrow|escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": 0,
                          "bandwidth_gas_amount": 0,
                          "op_results": {
                            "0": {
                              "path": "/service_accounts/escrow/escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:0/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            },
                            "1": {
                              "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            }
                          }
                        }
                      },
                      "bandwidth_gas_amount": 1,
                    }
                  }
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 'erased',
            "gas_amount_total": {
              "bandwidth": {
                "service": 4
              },
              "state": {
                "service": 'erased'
              }
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(0);
          const userBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          expect(userBalanceAfter).to.equals(userBalanceBefore + escrowServiceAccountBalanceBefore);
        });
      });

      describe('Escrow: service -> individual', () => {
        it('escrow: service -> individual: open escrow', async () => {
          const key = 1234567890000 + 101;
          const server4Addr = parseOrLog(syncRequest(
            'GET', server4 + '/get_address').body.toString('utf-8')).result;
          const transferBody = parseOrLog(syncRequest('POST', server4 + '/set_value', {json: {
            ref: `transfer/${server4Addr}/${serviceAdmin}/${key}/value`,
            value: 100
          }}).body.toString('utf-8'));
          if (!(await waitUntilTxFinalized(serverList, _.get(transferBody, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const payRef = `/payments/test_service_escrow/${serviceUser}/0/pay/${key}`;
          const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
          const amount = adminBalanceBefore;
          const payBody = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: payRef,
            value: {
              amount
            }
          }}).body.toString('utf-8'));
          if (!(await waitUntilTxFinalized(serverList, _.get(payBody, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // open escrow
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const configRef = `/escrow/${source}/${target}/1/config`;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: configRef,
            value: {
              admin: {
                [serviceAdmin]: true
              }
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 'erased',
            "gas_amount_total": {
              "bandwidth": {
                "service": 1
              },
              "state": {
                "service": 'erased'
              }
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const escrowAccountConfig = parseOrLog(syncRequest('GET', server1 + `/get_value?ref=${configRef}`)
              .body.toString('utf-8')).result;
          assert.deepEqual(escrowAccountConfig, { admin: { [serviceAdmin]: true } });
        });

        it("escrow: service -> individual: non-service admin cannot write hold", async () => {
          const key = 1234567890000 + 102;
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const holdRef = `/escrow/${source}/${target}/1/hold/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: paymentBalanceBefore
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(1);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });

        it("escrow: service -> individual: service admin can write hold", async () => {
          const key = 1234567890000 + 103;
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const holdRef = `/escrow/${source}/${target}/1/hold/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: paymentBalanceBefore
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
            "func_results": {
              "_hold": {
                "code": 0,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/transfer/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/escrow|escrow|payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": 0,
                          "bandwidth_gas_amount": 1000,
                          "op_results": {
                            "0": {
                              "path": "/service_accounts/payments/test_service_escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            },
                            "1": {
                              "path": "/service_accounts/escrow/escrow/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            }
                          }
                        }
                      },
                      "bandwidth_gas_amount": 1,
                    }
                  }
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 'erased',
            "gas_amount_total": {
              "bandwidth": {
                "service": 1004
              },
              "state": {
                "service": 'erased'
              }
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const escrowServiceAccountBalance = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalance).to.equals(paymentBalanceBefore);
        });

        it("escrow: service -> individual: admin account can write release (ratio = 0, refund to payments via _transfer)", async () => {
          const key = 1234567890000 + 104;
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const releaseRef = `/escrow/${source}/${target}/1/release/${key}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const escrowServiceAccountBalanceBefore = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 0
            },
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
            "func_results": {
              "_release": {
                "code": 0,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/transfer/escrow|escrow|payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/1234567890000/value",
                    "result": {
                      "code": 0,
                      "func_results": {
                        "_transfer": {
                          "code": 0,
                          "bandwidth_gas_amount": 0,
                          "op_results": {
                            "0": {
                              "path": "/service_accounts/escrow/escrow/payments|test_service_escrow|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0:0x00ADEc28B6a845a085e03591bE7550dd68673C1C:1/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            },
                            "1": {
                              "path": "/service_accounts/payments/test_service_escrow/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/balance",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1,
                              }
                            }
                          }
                        }
                      },
                      "bandwidth_gas_amount": 1,
                    }
                  }
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 'erased',
            "gas_amount_total": {
              "bandwidth": {
                "service": 4
              },
              "state": {
                "service": 'erased'
              }
            },
            "gas_cost_total": 0,
          });
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(0);
          const paymentBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          expect(paymentBalanceAfter).to.equals(paymentBalanceBefore + escrowServiceAccountBalanceBefore);
        });

        it("escrow: service -> individual: escrow admin account can write release (ratio = 0.5)", async () => {
          // hold
          const holdKey = 1234567890000 + 105;
          const source = `payments|test_service_escrow|${serviceUser}|0`;
          const target = serviceAdmin;
          const holdRef = `/escrow/${source}/${target}/1/hold/${holdKey}`;
          const paymentBalance = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          let body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: holdRef,
            value: {
              amount: paymentBalance
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          // release
          const releaseKey = 1234567890000 + 106;
          const releaseRef = `/escrow/${source}/${target}/1/release/${releaseKey}`;
          const paymentBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
          const escrowServiceAccountBalanceBefore = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: {
              ratio: 0.5
            }
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(0);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${source}:${target}:1/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(0);
          const paymentBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/service_accounts/payments/test_service_escrow/${serviceUser}|0/balance`)
                  .body.toString('utf-8')).result;
          expect(paymentBalanceAfter).to.equals(paymentBalanceBefore + escrowServiceAccountBalanceBefore / 2);
          const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
          expect(adminBalanceAfter).to.equals(adminBalanceBefore + escrowServiceAccountBalanceBefore / 2);
        });
      });
    });

    describe('Checkout: _openCheckout, _closeCheckout', () => {
      const client = jayson.client.http(server1 + '/json-rpc');
      const networkName = 'ETH';
      const chainId = '3';
      const tokenId = '0xB16c0C80a81f73204d454426fC413CAe455525A7';
      const checkoutRequestBasePath = `/checkout/requests/${networkName}/${chainId}/${tokenId}`;
      const checkoutHistoryBasePath = `/checkout/history/${networkName}/${chainId}/${tokenId}`;
      const tokenBridgeConfig = require('../genesis-configs/base/genesis_token.json')
          .bridge[networkName][chainId][tokenId];
      const {
        token_pool: tokenPoolAddr,
        min_checkout_per_request: minCheckoutPerRequest,
        max_checkout_per_request: maxCheckoutPerRequest,
        max_checkout_per_day: maxCheckoutPerDay,
       } = tokenBridgeConfig;
      const checkoutAmount = 100;
      const ethAddress = '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'; // recipient

      it('cannot open checkout with invalid params: amount < min_checkout_per_request', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/0`,
          value: {
            amount: minCheckoutPerRequest - 1,
            recipient: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutRequestBasePath}/${serviceUser}/0`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkoutRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkout with invalid params: amount > max_checkout_per_request', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/0`,
          value: {
            amount: maxCheckoutPerRequest + 1,
            recipient: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutRequestBasePath}/${serviceUser}/0`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkoutRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkout with invalid params: network name', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const ref = `/checkout/requests/AIN/${chainId}/${tokenId}/${serviceUser}/0`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${ref}`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkoutRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkout with invalid params: chain id', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const ref = `/checkout/requests/${networkName}/1/${tokenId}/${serviceUser}/0`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${ref}`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkoutRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkout with invalid params: token id', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const ref = `/checkout/requests/${networkName}/${chainId}/0xINVALID_TOKEN_ID/${serviceUser}/0`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${ref}`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkoutRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkout with invalid params: recipient', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/0`,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress.toLowerCase()
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutRequestBasePath}/${serviceUser}/0`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkoutRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkout with insufficient funds', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/0`,
          value: {
            amount: beforeBalance + 1,
            recipient: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutRequestBasePath}/${serviceUser}/0`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkoutRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('can open checkout', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/0`,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress
          },
          timestamp: 1628255843548
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "func_results": {
            "_openCheckout": {
              "op_results": {
                "0": {
                  "path": "/checkout/stats/pending/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/checkout/stats/pending/total",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": "/transfer/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000/1628255843548/value",
                  "result": {
                    "func_results": {
                      "_transfer": {
                        "op_results": {
                          "0": {
                            "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          },
                          "1": {
                            "path": "/accounts/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          }
                        },
                        "code": 0,
                        "bandwidth_gas_amount": 1000
                      }
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 1006
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0
        });
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        const userPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/${serviceUser}`)
            .body.toString('utf-8')).result;
        const totalPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/total`)
            .body.toString('utf-8')).result;
        expect(afterRequestUserBalance).to.equal(beforeBalance - checkoutAmount);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance + checkoutAmount);
        expect(userPendingAmount).to.equal(checkoutAmount);
        expect(totalPendingAmount).to.equal(checkoutAmount);
      });

      it('cannot close checkout with a non-authorized address', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutHistoryBasePath}/${serviceUser}/0`,
          value: {
            request: {
              amount: checkoutAmount,
              recipient: ethAddress
            },
            response: {
              status: 0
            }
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutHistory = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutHistoryBasePath}/${serviceUser}/0`).body.toString('utf-8')).result;
        expect(checkoutHistory).to.equal(null);
      });

      it('can close a successful checkout with token pool key', async () => {
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkoutHistoryBasePath}/${serviceUser}/0`,
            value: {
              request: {
                amount: checkoutAmount,
                recipient: ethAddress
              },
              response: {
                status: 0,
                tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c'
              }
            }
          },
          timestamp: 1628255843548,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request('ain_sendSignedTransaction', {
          tx_body: txBody,
          signature,
          protoVer: CURRENT_PROTOCOL_VERSION
        });
        const txHash = _.get(res, 'result.result.tx_hash');
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const txRes = parseOrLog(syncRequest('GET', server2 + `/get_transaction?hash=${txHash}`)
            .body.toString('utf-8')).result;
        const blockTime = _.get(getBlockByNumber(server2, txRes.number), 'timestamp');
        assert.deepEqual(eraseStateGas(_.get(res, 'result.result.result', null)), {
          "func_results": {
            "_closeCheckout": {
              "op_results": {
                "0": {
                  "path": `/checkout/stats/complete/${CommonUtil.getDayTimestamp(blockTime)}`,
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/checkout/stats/complete/total",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": "/checkout/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0",
                  "result": {
                    "bandwidth_gas_amount": 1,
                    "code": 0,
                    "func_results": {
                      "_openCheckout": {
                        "bandwidth_gas_amount": 0,
                        "code": 0
                      }
                    }
                  }
                },
                "3": {
                  "path": "/checkout/stats/pending/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204",
                  "result": {
                    "bandwidth_gas_amount": 1,
                    "code": 0
                  }
                },
                "4": {
                  "path": "/checkout/stats/pending/total",
                  "result": {
                    "bandwidth_gas_amount": 1,
                    "code": 0
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 6
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0
        });
        const userPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/${serviceUser}`)
            .body.toString('utf-8')).result;
        const totalPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/total`)
            .body.toString('utf-8')).result;
        const todayCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/complete/${CommonUtil.getDayTimestamp(blockTime)}`)
            .body.toString('utf-8')).result;
        const totalCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/complete/total`)
            .body.toString('utf-8')).result;
        expect(userPendingAmount).to.equal(0);
        expect(totalPendingAmount).to.equal(0);
        expect(todayCompleteAmount).to.equal(checkoutAmount);
        expect(totalCompleteAmount).to.equal(checkoutAmount);
      });

      it('can close a failed checkout and refund with token pool key', async () => {
        // open checkout
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result || 0;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result || 0;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/1`,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        expect(_.get(body, 'result.result.code')).to.equal(0);
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result || 0;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result || 0;
        expect(afterRequestUserBalance).to.equal(beforeBalance - checkoutAmount);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance + checkoutAmount);
        // close failed checkout
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkoutHistoryBasePath}/${serviceUser}/1`,
            value: {
              request: {
                amount: checkoutAmount,
                recipient: ethAddress
              },
              response: {
                status: 1,
                tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c',
                error_message: 'Ethereum tx failed'
              }
            }
          },
          timestamp: 1628255843548,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request('ain_sendSignedTransaction', {
          tx_body: txBody,
          signature,
          protoVer: CURRENT_PROTOCOL_VERSION
        });
        const txHash = _.get(res, 'result.result.tx_hash');
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const txRes = parseOrLog(syncRequest('GET', server2 + `/get_transaction?hash=${txHash}`)
            .body.toString('utf-8')).result;
        const blockTime = _.get(getBlockByNumber(server2, txRes.number), 'timestamp');
        assert.deepEqual(eraseStateGas(_.get(res, 'result.result.result')), {
          "func_results": {
            "_closeCheckout": {
              "op_results": {
                "0": {
                  "path": "/transfer/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1628255843548/value",
                  "result": {
                    "func_results": {
                      "_transfer": {
                        "op_results": {
                          "0": {
                            "path": "/accounts/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          },
                          "1": {
                            "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          }
                        },
                        "code": 0,
                        "bandwidth_gas_amount": 0
                      }
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/checkout/history/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1/refund",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": "/checkout/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1",
                  "result": {
                    "func_results": {
                      "_openCheckout": {
                        "code": 0,
                        "bandwidth_gas_amount": 0
                      }
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "3": {
                  "path": "/checkout/stats/pending/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "4": {
                  "path": "/checkout/stats/pending/total",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 8
            },
            "state": {
              "service": 'erased'
            }
          },
          "gas_cost_total": 0
        });
        const refund = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutHistoryBasePath}/${serviceUser}/1/refund`).body.toString('utf-8')).result;
        assert.deepEqual(refund,
            '/transfer/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1628255843548');
        const refundTransfer = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${refund}`).body.toString('utf-8')).result;
        assert.deepEqual(refundTransfer, { "value": 100 });
        const afterCloseUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result || 0;
        const afterCloseTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result || 0;
        const userPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/${serviceUser}`)
            .body.toString('utf-8')).result;
        const totalPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/total`)
            .body.toString('utf-8')).result;
        const todayCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/complete/${CommonUtil.getDayTimestamp(blockTime)}`)
            .body.toString('utf-8')).result;
        const totalCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/complete/total`)
            .body.toString('utf-8')).result;
        expect(afterCloseUserBalance).to.equal(beforeBalance);
        expect(afterCloseTokenPoolBalance).to.equal(beforeTokenPoolBalance);
        expect(userPendingAmount).to.equal(0);
        expect(totalPendingAmount).to.equal(0);
        expect(todayCompleteAmount).to.equal(checkoutAmount);
        expect(totalCompleteAmount).to.equal(checkoutAmount);
      });
    });

    describe('Checkin: _openCheckin, _cancelCheckin, _closeCheckin', () => {
      const client = jayson.client.http(server1 + '/json-rpc');
      const networkName = 'ETH';
      const chainId = '3';
      const tokenId = '0xB16c0C80a81f73204d454426fC413CAe455525A7';
      const checkinRequestBasePath = `/checkin/requests/${networkName}/${chainId}/${tokenId}`;
      const checkinHistoryBasePath = `/checkin/history/${networkName}/${chainId}/${tokenId}`;
      const tokenPoolAddr = require('../genesis-configs/base/genesis_token.json')
          .bridge[networkName][chainId][tokenId].token_pool;
      const checkinAmount = 100;
      const ethAddress = '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'; // sender

      before(async () => {
        // Send some AIN to tokenPoolAddr
        const body = parseOrLog(syncRequest('POST', server3 + '/set_value', {json: {
          ref: `/transfer/${serviceUserBad}/${tokenPoolAddr}/${Date.now()}/value`,
          value: 1000
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('cannot open checkin with invalid params: amount <= 0', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinRequestBasePath}/${serviceUser}/0`,
          value: {
            amount: 0,
            sender: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinRequestBasePath}/${serviceUser}/0`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkinequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkin with invalid params: network name', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const ref = `/checkin/requests/AIN/${chainId}/${tokenId}/${serviceUser}/0`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${ref}`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkinRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkin with invalid params: chain id', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const ref = `/checkin/requests/${networkName}/1/${tokenId}/${serviceUser}/0`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${ref}`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkinRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkin with invalid params: token id', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const ref = `/checkin/requests/${networkName}/${chainId}/0xINVALID_TOKEN_ID/${serviceUser}/0`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${ref}`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkinRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkin with invalid params: sender', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinRequestBasePath}/${serviceUser}/0`,
          value: {
            amount: checkinAmount,
            sender: ethAddress.toLowerCase()
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinRequestBasePath}/${serviceUser}/0`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkinRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('can open checkin', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinRequestBasePath}/${serviceUser}/0`,
          value: {
            amount: checkinAmount,
            sender: ethAddress
          },
          timestamp: 1628255843548
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "gas_amount_total": {
            "bandwidth": {
              "service": 3
            },
            "state": {
              "service": "erased"
            }
          },
          "gas_cost_total": 0,
          "func_results": {
            "_openCheckin": {
              "op_results": {
                "0": {
                  "path": "/checkin/stats/pending/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/checkin/stats/pending/token_pool/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            },
            "_cancelCheckin": {
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": "erased"
        });
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        const senderPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${ethAddress}`)
            .body.toString('utf-8')).result;
        const tokenPoolPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/token_pool/${tokenPoolAddr}`)
            .body.toString('utf-8')).result;
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
        expect(senderPendingAmount).to.equal(checkinAmount);
        expect(tokenPoolPendingAmount).to.equal(checkinAmount);
      });

      it('cannot open checkin when sender already has a pending request', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinRequestBasePath}/${serviceUser}/1`,
          value: {
            amount: checkinAmount,
            sender: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinRequestBasePath}/${serviceUser}/1`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkinRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkin with (amount + pending) more than token pool balance', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinRequestBasePath}/${serviceUser}/1`,
          value: {
            amount: beforeTokenPoolBalance - checkinAmount + 1,
            sender: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinRequestBasePath}/${serviceUser}/1`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkinRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot close checkin with a non-authorized address', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinHistoryBasePath}/${serviceUser}/0`,
          value: {
            request: {
              amount: checkinAmount,
              sender: ethAddress
            },
            response: {
              status: 0
            }
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinHistory = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinHistoryBasePath}/${serviceUser}/0`).body.toString('utf-8')).result;
        expect(checkinHistory).to.equal(null);
      });

      it('can close a successful checkin with token pool key', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const timestamp = Date.now();
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkinHistoryBasePath}/${serviceUser}/0`,
            value: {
              request: {
                amount: checkinAmount,
                sender: ethAddress
              },
              response: {
                status: 0,
                tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c'
              }
            }
          },
          timestamp,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request('ain_sendSignedTransaction', {
          tx_body: txBody,
          signature,
          protoVer: CURRENT_PROTOCOL_VERSION
        });
        const txHash = _.get(res, 'result.result.tx_hash');
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        assert.deepEqual(eraseStateGas(_.get(res, 'result.result.result', null)), {
          "gas_amount_total": {
            "bandwidth": {
              "service": 9
            },
            "state": {
              "service": "erased"
            }
          },
          "gas_cost_total": 0,
          "func_results": {
            "_closeCheckin": {
              "op_results": {
                "0": {
                  "path": "/checkin/stats/complete/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/checkin/stats/complete/total",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": `/transfer/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/${timestamp}/value`,
                  "result": {
                    "func_results": {
                      "_transfer": {
                        "op_results": {
                          "0": {
                            "path": "/accounts/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          },
                          "1": {
                            "path": "/accounts/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/balance",
                            "result": {
                              "code": 0,
                              "bandwidth_gas_amount": 1
                            }
                          }
                        },
                        "code": 0,
                        "bandwidth_gas_amount": 0
                      }
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "3": {
                  "path": "/checkin/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/0",
                  "result": {
                    "func_results": {
                      "_openCheckin": {
                        "code": 0,
                        "bandwidth_gas_amount": 0
                      },
                      "_cancelCheckin": {
                        "code": 0,
                        "bandwidth_gas_amount": 0
                      }
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "4": {
                  "path": "/checkin/stats/pending/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "5": {
                  "path": "/checkin/stats/pending/token_pool/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": "erased"
        });
        const afterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const afterTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const senderPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${ethAddress}`)
            .body.toString('utf-8')).result;
        const tokenPoolPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/token_pool/${tokenPoolAddr}`)
            .body.toString('utf-8')).result;
        const userCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/complete/${serviceUser}`)
            .body.toString('utf-8')).result;
        const totalCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/complete/total`)
            .body.toString('utf-8')).result;
        expect(afterBalance).to.equal(beforeBalance + checkinAmount);
        expect(afterTokenPoolBalance).to.equal(beforeTokenPoolBalance - checkinAmount);
        expect(senderPendingAmount).to.equal(0);
        expect(tokenPoolPendingAmount).to.equal(0);
        expect(userCompleteAmount).to.equal(checkinAmount);
        expect(totalCompleteAmount).to.equal(checkinAmount);
      });

      it('can close a failed checkin', async () => {
        // open checkin
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result || 0;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result || 0;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinRequestBasePath}/${serviceUser}/1`,
          value: {
            amount: checkinAmount,
            sender: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        expect(_.get(body, 'result.result.code')).to.equal(0);
        // close failed checkin
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkinHistoryBasePath}/${serviceUser}/1`,
            value: {
              request: {
                amount: checkinAmount,
                sender: ethAddress
              },
              response: {
                status: 1,
                tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c',
                error_message: 'Ethereum tx failed'
              }
            }
          },
          timestamp: 1628255843548,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request('ain_sendSignedTransaction', {
          tx_body: txBody,
          signature,
          protoVer: CURRENT_PROTOCOL_VERSION
        });
        const txHash = _.get(res, 'result.result.tx_hash');
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        assert.deepEqual(eraseStateGas(_.get(res, 'result.result.result')), {
          "gas_amount_total": {
            "bandwidth": {
              "service": 4
            },
            "state": {
              "service": "erased"
            }
          },
          "gas_cost_total": 0,
          "func_results": {
            "_closeCheckin": {
              "op_results": {
                "0": {
                  "path": "/checkin/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1",
                  "result": {
                    "func_results": {
                      "_openCheckin": {
                        "code": 0,
                        "bandwidth_gas_amount": 0
                      },
                      "_cancelCheckin": {
                        "code": 0,
                        "bandwidth_gas_amount": 0
                      }
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "1": {
                  "path": "/checkin/stats/pending/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x09A0d53FDf1c36A131938eb379b98910e55EEfe1",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": "/checkin/stats/pending/token_pool/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                }
              },
              "code": 0,
              "bandwidth_gas_amount": 0
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": "erased"
        });
        const afterUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result || 0;
        const afterTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result || 0;
        const senderPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${ethAddress}`)
            .body.toString('utf-8')).result;
        const tokenPoolPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/token_pool/${tokenPoolAddr}`)
            .body.toString('utf-8')).result;
        const userCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/complete/${serviceUser}`)
            .body.toString('utf-8')).result;
        const totalCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/complete/total`)
            .body.toString('utf-8')).result;
        expect(afterUserBalance).to.equal(beforeBalance);
        expect(afterTokenPoolBalance).to.equal(beforeTokenPoolBalance);
        expect(senderPendingAmount).to.equal(0);
        expect(tokenPoolPendingAmount).to.equal(0);
        expect(userCompleteAmount).to.equal(checkinAmount);
        expect(totalCompleteAmount).to.equal(checkinAmount);
      });

      it('cannot cancel a closed checkin request', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinRequestBasePath}/${serviceUser}/1`,
          value: null
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(1);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinRequestBasePath}/${serviceUser}/1`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkinRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('can cancel an unclosed checkin request', async () => {
        // open checkin
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result || 0;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result || 0;
        const requestBody = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinRequestBasePath}/${serviceUser}/1`,
          value: {
          amount: checkinAmount,
          sender: ethAddress
          }
        }}).body.toString('utf-8'));
        expect(requestBody.code).to.equal(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(requestBody, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of request tx.`);
        }
        expect(_.get(requestBody, 'result.result.code')).to.equal(0);
        const afterRequestBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const afterRequestSenderPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${ethAddress}`)
            .body.toString('utf-8')).result;
        const afterRequestTokenPoolPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/token_pool/${tokenPoolAddr}`)
            .body.toString('utf-8')).result;
        expect(afterRequestBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
        expect(afterRequestSenderPendingAmount).to.equal(checkinAmount);
        expect(afterRequestTokenPoolPendingAmount).to.equal(checkinAmount);

        // cancel checkin
        const beforeUserCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/complete/${serviceUser}`)
            .body.toString('utf-8')).result;
        const beforeTotalCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/complete/total`)
            .body.toString('utf-8')).result;
        const cancelBody = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinRequestBasePath}/${serviceUser}/1`,
          value: null
        }}).body.toString('utf-8'));
        expect(cancelBody.code).to.equal(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(cancelBody, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of cancel tx.`);
        }
        const afterCancelBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const afterCancelTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const afterCancelSenderPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${ethAddress}`)
            .body.toString('utf-8')).result;
        const afterCancelTokenPoolPendingAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/pending/token_pool/${tokenPoolAddr}`)
            .body.toString('utf-8')).result;
        const afterCancelUserCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/complete/${serviceUser}`)
            .body.toString('utf-8')).result;
        const afterCancelTotalCompleteAmount = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkin/stats/complete/total`)
            .body.toString('utf-8')).result;
        expect(afterCancelBalance).to.equal(beforeBalance);
        expect(afterCancelTokenPoolBalance).to.equal(beforeTokenPoolBalance);
        expect(afterCancelSenderPendingAmount).to.equal(0);
        expect(afterCancelTokenPoolPendingAmount).to.equal(0);
        expect(afterCancelUserCompleteAmount).to.equal(beforeUserCompleteAmount);
        expect(afterCancelTotalCompleteAmount).to.equal(beforeTotalCompleteAmount);
      });
    });
  });
});
