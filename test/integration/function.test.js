const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const _ = require("lodash");
const spawn = require("child_process").spawn;
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const jayson = require('jayson/promise');
const ainUtil = require('@ainblockchain/ain-util');
const Accounts = require('web3-eth-accounts');
const stringify = require('fast-json-stable-stringify');
const {
  BlockchainConsts,
  NodeConfigs,
  BlockchainParams,
} = require('../../common/constants');
const CommonUtil = require('../../common/common-util');
const {
  parseOrLog,
  setUpApp,
  waitUntilNetworkIsReady,
  waitUntilTxFinalized,
  getBlockByNumber,
  eraseStateGas,
} = require('../test-util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');

const PROJECT_ROOT = require('path').dirname(__filename) + "/../../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const ENV_VARIABLES = [
  {
    UNSAFE_PRIVATE_KEY: 'b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96',
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes', PORT: 8081, P2P_PORT: 5001,
    ENABLE_GAS_FEE_WORKAROUND: true, ENABLE_EXPRESS_RATE_LIMIT: false,
    ENABLE_REST_FUNCTION_CALL: true,
  },
  {
    UNSAFE_PRIVATE_KEY: '921cc48e48c876fc6ed1eb02a76ad520e8d16a91487f9c7e03441da8e35a0947',
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes', PORT: 8082, P2P_PORT: 5002,
    ENABLE_GAS_FEE_WORKAROUND: true, ENABLE_EXPRESS_RATE_LIMIT: false,
    ENABLE_REST_FUNCTION_CALL: true,
  },
  {
    UNSAFE_PRIVATE_KEY: '41e6e5718188ce9afd25e4b386482ac2c5272c49a622d8d217887bce21dce560',
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes', PORT: 8083, P2P_PORT: 5003,
    ENABLE_GAS_FEE_WORKAROUND: true, ENABLE_EXPRESS_RATE_LIMIT: false,
    ENABLE_REST_FUNCTION_CALL: true,
  },
];

const server1 = 'http://localhost:8081';
const server2 = 'http://localhost:8082';
const server3 = 'http://localhost:8083';
const serverList = [ server1, server2, server3 ];

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
  let tracker_proc, server1_proc, server2_proc, server3_proc;

  before(async () => {
    rimraf.sync(NodeConfigs.CHAINS_DIR)

    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', { CONSOLE_LOG: false }, true);
    await CommonUtil.sleep(3000);
    server1_proc = startServer(APP_SERVER, 'server1', ENV_VARIABLES[0], true);
    await CommonUtil.sleep(10000);
    server2_proc = startServer(APP_SERVER, 'server2', ENV_VARIABLES[1], true);
    await CommonUtil.sleep(3000);
    server3_proc = startServer(APP_SERVER, 'server3', ENV_VARIABLES[2], true);
    await CommonUtil.sleep(3000);
    await waitUntilNetworkIsReady(serverList);

    const server1Addr = parseOrLog(syncRequest(
        'GET', server1 + '/get_address').body.toString('utf-8')).result;
    const server2Addr = parseOrLog(syncRequest(
        'GET', server2 + '/get_address').body.toString('utf-8')).result;
    const server3Addr = parseOrLog(syncRequest(
        'GET', server3 + '/get_address').body.toString('utf-8')).result;
    await setUpApp('test', serverList, {
      admin: {
        [server1Addr]: true,
        [server2Addr]: true,
        [server3Addr]: true,
      }
    });
  });

  after(() => {
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()

    rimraf.sync(NodeConfigs.CHAINS_DIR)
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
                    "function_url": "https://events.ainetwork.ai/trigger",
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
              type: 'SET_OWNER',
              ref: '/apps/test/test_function_triggering/set_owner_allowed_path_with_fid',
              value: null
            },
            {
              type: 'SET_OWNER',
              ref: '/apps/test/test_function_triggering/set_owner_not_allowed_path_with_fid',
              value: null
            },
            {
              type: 'SET_FUNCTION',
              ref: '/apps/test/test_function_triggering',
              value: null
            },
            {
              type: 'SET_RULE',
              ref: '/apps/test/test_function_triggering',
              value: null
            },
            {
              type: 'SET_VALUE',
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
            "code": 10404,
            "message": "Trying to write owner-only function: _transfer",
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

      describe('Rule config with auth.fid', () => {
        it('write rule with auth.fid: without write value permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxNotAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          body.result.result.func_results._saveLastTx.op_results['0'].result.message = 'erased';
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 10104,
            "message": "Triggered function call failed",
            "func_results": {
              "_saveLastTx": {
                "code": 20001,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/not_allowed_path_with_fid/.last_tx/value",
                    "result": {
                      "code": 12103,
                      "message": "erased",
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
          assert.deepEqual(body.code, 40001);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxNotAllowedPath + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(_.get(lastTx, 'tx_hash', null)).to.equal(null);
        });

        it('write rule with auth.fid: with write value permission', async () => {
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

      describe('Rule config with auth.fids', () => {
        it('write rule with auth.fids: without write value permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: saveLastTxNotAllowedPathWithFids + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          body.result.result.func_results._saveLastTx.op_results['0'].result.message = 'erased';
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 10104,
            "message": "Triggered function call failed",
            "func_results": {
              "_saveLastTx": {
                "code": 20001,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/not_allowed_path_with_fids/.last_tx/value",
                    "result": {
                      "code": 12103,
                      "message": "erased",
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
          assert.deepEqual(body.code, 40001);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const lastTx = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${saveLastTxNotAllowedPathWithFids + '/.last_tx/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(_.get(lastTx, 'tx_hash', null)).to.equal(null);
        });

        it('write rule with auth.fids: with write value permission', async () => {
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

      describe('Owner config with auth.fid', () => {
        it('owner config with auth.fid: without branch_owner permission', async () => {
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: setOwnerConfigNotAllowedPath + '/value',
            value: 'some value',
            timestamp: Date.now(),
            nonce: -1,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result'), {
            "code": 10104,
            "message": "Triggered function call failed",
            "func_results": {
              "_setOwnerConfig": {
                "code": 20001,
                "bandwidth_gas_amount": 0,
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/set_owner_not_allowed_path_with_fid/value",
                    "result": {
                      "code": 12502,
                      "message": "branch_owner permission evaluated false: [{\"branch_owner\":false,\"write_function\":false,\"write_owner\":false,\"write_rule\":false}] at '/apps/test/test_function_triggering/set_owner_not_allowed_path_with_fid' for owner path '/apps/test/test_function_triggering/set_owner_not_allowed_path_with_fid/value' with permission 'branch_owner', auth '{\"addr\":\"0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204\",\"fid\":\"_setOwnerConfig\",\"fids\":[\"_setOwnerConfig\"]}'",
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
          assert.deepEqual(body.code, 40001);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const ownerConfig = parseOrLog(syncRequest('GET',
              server2 + `/get_owner?ref=${setOwnerConfigNotAllowedPath + '/value'}`)
            .body.toString('utf-8')).result
          // Should be null.
          expect(ownerConfig).to.equal(null);
        });

        it('owner config with auth.fid: with branch_owner permission', async () => {
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

          // Clean up
          const res = parseOrLog(syncRequest('POST', server2 + '/set_owner', {
            json: {
              type: 'SET_OWNER',
              ref: '/apps/test/test_function_triggering/set_owner_allowed_path_with_fid/value',
              value: null,
              nonce: -1,
            }
          }).body.toString('utf-8')).result;
          assert.deepEqual(CommonUtil.isFailedTx(_.get(res, 'result')), false);
        });
      });
    });

    describe('REST functions whitelist', () => {
      it('cannot add a function url if not a whitelisted developer', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/url_whitelist/${serviceUser}/0`,
          value: 'http://localhost:3000',
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        body.result.result.message = 'erased';
        assert.deepEqual(body.result.result, {
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0,
          "message": "erased",
          "code": 12103,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 1
        });
      });

      it('cannot whitelist a developer if not an admin', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/user_whitelist/${serviceUser}`,
          value: true,
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        body.result.result.message = 'erased';
        assert.deepEqual(body.result.result, {
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0,
          "message": "erased",
          "code": 12103,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 1
        });
      });

      it('can whitelist a developer as an admin', async () => {
        const client = jayson.client.http(server1 + '/json-rpc');
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `/developers/rest_functions/user_whitelist/${serviceUser}`,
            value: true
          },
          gas_price: 0,
          timestamp: 1628255843548,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('a2b5848760d81afe205884284716f90356ad82be5ab77b8130980bdb0b7ba2ba', 'hex'));
        const res = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        });
        if (!(await waitUntilTxFinalized([server2], _.get(res, 'result.result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        assert.deepEqual(res.result.result.result, {
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": 248
            }
          },
          "gas_cost_total": 0,
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 249
        });
      });

      it('can add a function url', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/url_whitelist/${serviceUser}/0`,
          value: 'http://localhost:3000',
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        assert.deepEqual(body.result.result, {
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": 448
            }
          },
          "gas_cost_total": 0,
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 449
        });
      });

      it('cannot add an invalid function url', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/url_whitelist/${serviceUser}/1`,
          value: '*.ainetwork.ai', // missing protocol
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        body.result.result.message = 'erased';
        assert.deepEqual(body.result.result, {
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0,
          "message": "erased",
          "code": 12103,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 1
        });
      });

      it('cannot add more than the max number of function urls per developer', async () => {
        // Add 2 more & try to add 1 more
        const addRestFunctionUrl2 = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/url_whitelist/${serviceUser}/1`,
          value: 'http://localhost:3000',
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(addRestFunctionUrl2, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        expect(addRestFunctionUrl2.result.result.code).to.be.equal(0);
        const addRestFunctionUrl3 = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/url_whitelist/${serviceUser}/2`,
          value: 'http://localhost:3000',
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(addRestFunctionUrl3, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        expect(addRestFunctionUrl3.result.result.code).to.be.equal(0);
        const userRestFunctionUrls = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/developers/rest_functions/url_whitelist/${serviceUser}`).body.toString('utf-8'));
        assert.deepEqual(userRestFunctionUrls, {
          "code": 0,
          "result": {
            "0": "http://localhost:3000",
            "1": "http://localhost:3000",
            "2": "http://localhost:3000"
          }
        });
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/url_whitelist/${serviceUser}/3`,
          value: 'http://localhost:3000',
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        body.result.result.message = 'erased';
        assert.deepEqual(body.result.result, {
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0,
          "message": "erased",
          "code": 12103,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 1
        });
      });

      it('can replace a function url', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/url_whitelist/${serviceUser}/0`,
          value: 'http://localhost:8080',
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        assert.deepEqual(body.result.result, {
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0,
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 1
        });
      });

      it('can remove a function url', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/url_whitelist/${serviceUser}/0`,
          value: null,
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        assert.deepEqual(body.result.result, {
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0,
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 1
        });
      });

      it(`cannot remove other's function urls`, async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `/developers/rest_functions/url_whitelist/0xAAAf6f50A0304F12119D218b94bea8082642515B/0`,
          value: null,
          timestamp: Date.now(),
          nonce: -1,
        }}).body.toString('utf-8'));
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        body.result.result.message = 'erased';
        assert.deepEqual(body.result.result, {
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": 0
            }
          },
          "gas_cost_total": 0,
          "message": "erased",
          "code": 12103,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 1
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
          assert.deepEqual(body.code, 40001);  // Should fail.
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
          assert.deepEqual(body.code, 40001);  // Should fail.
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

    describe('Create app: _createApp', () => {
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
        const appName = 'test_service_create_app0';
        const manageAppPath = `/manage_app/${appName}/create/1`;
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
              "bandwidth_gas_amount": 2000,
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
                  "path": "/manage_app/test_service_create_app0/config/admin",
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
              "service": 2002
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

      it("when failed with null value", async () => {
        const invalidAppName = 'Test_Service_Create_App0';
        const manageAppPath = `/manage_app/${invalidAppName}/create/1`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: null,
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 12103);
        assert.deepEqual(body.code, 40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid app name", async () => {
        const invalidAppName = 'Test_Service_Create_App0';
        const manageAppPath = `/manage_app/${invalidAppName}/create/1`;
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
            "code": 10104,
            "message": "Triggered function call failed",
            "func_results": {
              "_createApp": {
                "code": 20301,
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
          "tx_hash": "0x991cb7e7f5173275bef273fbf37e9e25b9075672da2ddc717eede1591de36fd6"
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid admin config (non-boolean value)", async () => {
        const appName = 'test_service_create_app1';
        const manageAppPath = `/manage_app/${appName}/create/0`;
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: 1 }, // not a boolean
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "tx_hash": "0xbbde1064a2defd1ad0cf34fde85897d8078963a51ddf9d49c4a6cd36a1b2a21d",
          "result": {
            "gas_amount_total": {
              "bandwidth": {
                "service": 1
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
            "message": "Triggered function call failed",
            "func_results": {
              "_createApp": {
                "code": 20001,
                "bandwidth_gas_amount": 0
              }
            },
            "code": 10104,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 1
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid admin config (empty)", async () => {
        const appName = 'test_service_create_app1';
        const manageAppPath = `/manage_app/${appName}/create/0`;
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: {}, // empty
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "tx_hash": "0x513ea13f8585f6f0d9501afd7f43596485cdd24a03ba08c9c1c6280039f9c1f5",
          "result": {
            "gas_amount_total": {
              "bandwidth": {
                "service": 1
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
            "message": "Invalid object for states: /admin",
            "code": 10101,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 1
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid billing config (non-boolean value)", async () => {
        const appName = 'test_service_create_app1';
        const manageAppPath = `/manage_app/${appName}/create/0`;
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
            billing: {
              billingAccount1: {
                users: {
                  [serviceAdmin]: '1' // not a boolean
                }
              }
            }
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "tx_hash": "0x334bd9ade968329d2323b04b6c9690f93ce834980f66cb9c33a7b46f46f850bb",
          "result": {
            "gas_amount_total": {
              "bandwidth": {
                "service": 3,
                "app": {
                  "test_service_create_app1": 2
                }
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
            "message": "Triggered function call failed",
            "func_results": {
              "_createApp": {
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
                    "path": "/manage_app/test_service_create_app1/config/admin",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  },
                  "3": {
                    "path": "/manage_app/test_service_create_app1/config/billing",
                    "result": {
                      "message": "Write rule evaluated false: [(auth.fid === '_createApp' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppBillingConfig(newData) && util.checkValuePathLen(parsedValuePath, 4) === true] at '/manage_app/$app_name/config/billing' for value path '/manage_app/test_service_create_app1/config/billing' with path vars '{\"$app_name\":\"test_service_create_app1\"}', data 'null', newData '{\"billingAccount1\":{\"users\":{\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\":\"1\"}}}', auth '{\"addr\":\"0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204\",\"fid\":\"_createApp\",\"fids\":[\"_createApp\"]}', timestamp '1234567890000'",
                      "code": 12103,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 20001,
                "bandwidth_gas_amount": 0
              }
            },
            "code": 10104,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 3
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid billing config (missing users)", async () => {
        const appName = 'test_service_create_app1';
        const manageAppPath = `/manage_app/${appName}/create/0`;
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
            billing: {
              billingAccount1: {
                not_users: {
                  [serviceAdmin]: true
                }
              }
            }
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "tx_hash": "0xcae22372e7ceb17e3205c77a2e0f560211a56aea9510714783152c2ac2de2393",
          "result": {
            "gas_amount_total": {
              "bandwidth": {
                "service": 3,
                "app": {
                  "test_service_create_app1": 2
                }
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
            "message": "Triggered function call failed",
            "func_results": {
              "_createApp": {
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
                    "path": "/manage_app/test_service_create_app1/config/admin",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  },
                  "3": {
                    "path": "/manage_app/test_service_create_app1/config/billing",
                    "result": {
                      "message": "Write rule evaluated false: [(auth.fid === '_createApp' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppBillingConfig(newData) && util.checkValuePathLen(parsedValuePath, 4) === true] at '/manage_app/$app_name/config/billing' for value path '/manage_app/test_service_create_app1/config/billing' with path vars '{\"$app_name\":\"test_service_create_app1\"}', data 'null', newData '{\"billingAccount1\":{\"not_users\":{\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\":true}}}', auth '{\"addr\":\"0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204\",\"fid\":\"_createApp\",\"fids\":[\"_createApp\"]}', timestamp '1234567890000'",
                      "code": 12103,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 20001,
                "bandwidth_gas_amount": 0
              }
            },
            "code": 10104,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 3
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid billing config (non-checksum key)", async () => {
        const appName = 'test_service_create_app1';
        const manageAppPath = `/manage_app/${appName}/create/0`;
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
            billing: {
              billingAccount1: {
                users: {
                  [serviceAdmin.toLowerCase()]: true
                }
              }
            }
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "tx_hash": "0x76ed3268388b6aea0ecbf8c9113f05d7cd0b0e4b98266583a8afc5d57e0f0d50",
          "result": {
            "gas_amount_total": {
              "bandwidth": {
                "service": 3,
                "app": {
                  "test_service_create_app1": 2
                }
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
            "message": "Triggered function call failed",
            "func_results": {
              "_createApp": {
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
                    "path": "/manage_app/test_service_create_app1/config/admin",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  },
                  "3": {
                    "path": "/manage_app/test_service_create_app1/config/billing",
                    "result": {
                      "message": "Write rule evaluated false: [(auth.fid === '_createApp' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppBillingConfig(newData) && util.checkValuePathLen(parsedValuePath, 4) === true] at '/manage_app/$app_name/config/billing' for value path '/manage_app/test_service_create_app1/config/billing' with path vars '{\"$app_name\":\"test_service_create_app1\"}', data 'null', newData '{\"billingAccount1\":{\"users\":{\"0x00adec28b6a845a085e03591be7550dd68673c1c\":true}}}', auth '{\"addr\":\"0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204\",\"fid\":\"_createApp\",\"fids\":[\"_createApp\"]}', timestamp '1234567890000'",
                      "code": 12103,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 20001,
                "bandwidth_gas_amount": 0
              }
            },
            "code": 10104,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 3
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid service config (missing staking config)", async () => {
        const appName = 'test_service_create_app1';
        const manageAppPath = `/manage_app/${appName}/create/0`;
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
            service: {
              // no staking config
              some_other_key: {
                lockup_duration: 100
              }
            }
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "tx_hash": "0x99a5da5db8be83ea0ffb26acb3d0c22c224b15409ad32a48281dc9b96040d546",
          "result": {
            "gas_amount_total": {
              "bandwidth": {
                "service": 3,
                "app": {
                  "test_service_create_app1": 2
                }
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
            "message": "Triggered function call failed",
            "func_results": {
              "_createApp": {
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
                    "path": "/manage_app/test_service_create_app1/config/admin",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  },
                  "3": {
                    "path": "/manage_app/test_service_create_app1/config/service",
                    "result": {
                      "message": "Write rule evaluated false: [(auth.fid === '_createApp' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppServiceConfig(newData) && util.checkValuePathLen(parsedValuePath, 4) === true] at '/manage_app/$app_name/config/service' for value path '/manage_app/test_service_create_app1/config/service' with path vars '{\"$app_name\":\"test_service_create_app1\"}', data 'null', newData '{\"some_other_key\":{\"lockup_duration\":100}}', auth '{\"addr\":\"0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204\",\"fid\":\"_createApp\",\"fids\":[\"_createApp\"]}', timestamp '1234567890000'",
                      "code": 12103,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 20001,
                "bandwidth_gas_amount": 0
              }
            },
            "code": 10104,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 3
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid service config (invalid staking lockup_duration)", async () => {
        const appName = 'test_service_create_app1';
        const manageAppPath = `/manage_app/${appName}/create/0`;
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
            service: {
              staking: {
                lockup_duration: -1 // not a positive integer
              }
            }
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "tx_hash": "0x04b87fa1edb759e694d53fb8d79a045768475b294e8918a024044361656daa71",
          "result": {
            "gas_amount_total": {
              "bandwidth": {
                "service": 3,
                "app": {
                  "test_service_create_app1": 2
                }
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
            "message": "Triggered function call failed",
            "func_results": {
              "_createApp": {
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
                    "path": "/manage_app/test_service_create_app1/config/admin",
                    "result": {
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  },
                  "3": {
                    "path": "/manage_app/test_service_create_app1/config/service",
                    "result": {
                      "message": "Write rule evaluated false: [(auth.fid === '_createApp' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppServiceConfig(newData) && util.checkValuePathLen(parsedValuePath, 4) === true] at '/manage_app/$app_name/config/service' for value path '/manage_app/test_service_create_app1/config/service' with path vars '{\"$app_name\":\"test_service_create_app1\"}', data 'null', newData '{\"staking\":{\"lockup_duration\":-1}}', auth '{\"addr\":\"0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204\",\"fid\":\"_createApp\",\"fids\":[\"_createApp\"]}', timestamp '1234567890000'",
                      "code": 12103,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 20001,
                "bandwidth_gas_amount": 0
              }
            },
            "code": 10104,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 3
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("when failed with invalid is_public config", async () => {
        const appName = 'test_service_create_app1';
        const manageAppPath = `/manage_app/${appName}/create/0`;
        const createAppRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: manageAppPath,
          value: {
            admin: { [serviceAdmin]: true },
            is_public: 0 // not a boolean
          },
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8')).result;
        assert.deepEqual(createAppRes, {
          "tx_hash": "0x7136c45859641088c1bdbe324488e473d8a365e3f98c2fbafbdfa4888ca8398d",
          "result": {
            "gas_amount_total": {
              "bandwidth": {
                "service": 1
              },
              "state": {
                "service": 0
              }
            },
            "gas_cost_total": 0,
            "message": "Triggered function call failed",
            "func_results": {
              "_createApp": {
                "code": 20001,
                "bandwidth_gas_amount": 0
              }
            },
            "code": 10104,
            "bandwidth_gas_amount": 1,
            "gas_amount_charged": 1
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(createAppRes, 'tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('create a public app', async () => {
        const appName = 'test_service_create_app1';
        const appStakingPath =
            `/staking/${appName}/${serviceAdmin}/0/stake/${Date.now()}/value`;
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
              "bandwidth_gas_amount": 2000,
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
                  "path": "/manage_app/test_service_create_app1/config/admin",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "3": {
                  "path": "/manage_app/test_service_create_app1/config/is_public",
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
              "service": 2003
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
              "bandwidth_gas_amount": 2000
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": 'erased',
          "gas_amount_total": {
            "bandwidth": {
              "service": 2003
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
                        "bandwidth_gas_amount": 2000
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
                    "subtree_func_results": {
                      "/$staking_key/stake/$record_id/value": {},
                      "/$staking_key/unstake/$record_id/value": {},
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "3": {
                  "path": "/staking/balance_total_sum",
                  "result": {
                    "bandwidth_gas_amount": 1,
                    "code": 0,
                    "subtree_func_results": {
                      "/$user_addr/$staking_key/stake/$record_id/value": {},
                      "/$user_addr/$staking_key/unstake/$record_id/value": {}
                    }
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
              "service": 2007
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
                    "subtree_func_results": {
                      "/$staking_key/stake/$record_id/value": {},
                      "/$staking_key/unstake/$record_id/value": {},
                    },
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "3": {
                  "path": "/staking/balance_total_sum",
                  "result": {
                    "bandwidth_gas_amount": 1,
                    "code": 0,
                    "subtree_func_results": {
                      "/$user_addr/$staking_key/stake/$record_id/value": {},
                      "/$user_addr/$staking_key/unstake/$record_id/value": {}
                    }
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
              "service": 7
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
              "bandwidth_gas_amount": 100,
            }
          },
          "code": 0,
          "bandwidth_gas_amount": 1,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "test": 101
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

      it('transfer: transfer with null value', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/2/value',
          value: null,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 12103);
        assert.deepEqual(body.code, 40001);
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer: transfer with zero value', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/3/value',
          value: 0,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 12103);
        assert.deepEqual(body.code, 40001);
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer: transfer with negative value', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/4/value',
          value: -transferAmount,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 12103);
        assert.deepEqual(body.code, 40001);
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer: transfer with a value of 7 decimals', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/5/value',
          value: 0.0000001,  // a value of 7 decimals
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 12103);
        assert.deepEqual(body.code, 40001);
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toAfterBalance).to.equal(toBeforeBalance);
      });

      it('transfer: transfer more than account balance', async () => {
        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        let toBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToBalancePath}`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPath + '/6/value',
          value: fromBeforeBalance + 1
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(40001);
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
          ref: transferPath + '/7/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(40001);
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
        expect(body.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('transfer: transfer with same addresses', async () => {
        const transferPathSameAddrs = `/transfer/${transferFrom}/${transferFrom}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathSameAddrs + '/8/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(40001);
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
        expect(bodyFromLowerCase.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(bodyFromLowerCase, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        const toLowerCase = _.toLower(transferTo);
        const transferPathToLowerCase = `/transfer/${transferFrom}/${toLowerCase}`;
        const bodyToLowerCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathToLowerCase + '/102/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyToLowerCase.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(bodyToLowerCase, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        const fromUpperCase = _.toLower(transferFrom);
        const transferPathFromUpperCase = `/transfer/${fromUpperCase}/${transferTo}`;
        const bodyFromUpperCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathFromUpperCase + '/103/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyFromUpperCase.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(bodyFromUpperCase, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }

        const toUpperCase = _.toLower(transferTo);
        const transferPathToUpperCase = `/transfer/${transferFrom}/${toUpperCase}`;
        const bodyToUpperCase = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferPathToUpperCase + '/104/value',
          value: transferAmount
        }}).body.toString('utf-8'));
        expect(bodyToUpperCase.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(bodyToUpperCase, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('transfer: transfer with valid service account service type', async () => {
        const serviceType = 'staking';
        const serviceName = 'test_service';

        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const transferToService = `${serviceType}|${serviceName}|${transferTo}|0`;
        const transferToServiceBalancePath =
            `/service_accounts/${serviceType}/${serviceName}/${transferTo}|0/balance`;
        const toServiceBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToServiceBalancePath}`)
            .body.toString('utf-8')).result || 0;
        const transferServicePath = `/transfer/${transferFrom}/${transferToService}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferServicePath + '/201/value',
          value: transferAmount,
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "func_results": {
            "_transfer": {
              "code": 0,
              "bandwidth_gas_amount": 2000,
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
              "service": 2003
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
        const invalidServiceType = 'invalid_service_type';
        const serviceName = 'test_service';

        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const transferToService = `${invalidServiceType}|${serviceName}|${transferTo}|0`;
        const transferServicePath = `/transfer/${transferFrom}/${transferToService}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferServicePath + '/202/value',
          value: transferAmount,
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        body.result.result.message = 'erased';
        assert.deepEqual(body, {
          "code": 40001,
          "result": {
            "result": {
              "code": 12103,
              "message": "erased",
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
            "tx_hash": "0x21e1739495576cd1978228c6ee58ad1b090e3b2e3d90b43d8465b33b3d6a5198"
          }
        });
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
      });

      it('transfer: transfer with invalid service account service name', async () => {
        const serviceType = 'staking';
        const invalidServiceName = 'Test_Service';

        let fromBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const transferToService = `${serviceType}|${invalidServiceName}|${transferTo}|0`;
        const transferToServiceBalancePath =
            `/service_accounts/${serviceType}/${invalidServiceName}/${transferTo}|0/balance`;
        const toServiceBeforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToServiceBalancePath}`)
            .body.toString('utf-8')).result;
        const transferServicePath = `/transfer/${transferFrom}/${transferToService}`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: transferServicePath + '/203/value',
          value: transferAmount,
          nonce: -1,
          timestamp: 1234567890001,
        }}).body.toString('utf-8'));
        assert.deepEqual(eraseStateGas(_.get(body, 'result.result')), {
          "bandwidth_gas_amount": 1,
          "code": 12103,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "service": 1
            },
            "state": {
              "service": "erased"
            }
          },
          "gas_cost_total": 0,
          "message": "Write rule evaluated false: [(auth.addr === $from || auth.fid === '_stake' || auth.fid === '_unstake' || auth.fid === '_pay' || auth.fid === '_claim' || auth.fid === '_hold' || auth.fid === '_release' || auth.fid === '_collectFee' || auth.fid === '_claimReward' || auth.fid === '_openCheckout' || auth.fid === '_closeCheckout' || auth.fid === '_closeCheckin') && !getValue('transfer/' + $from + '/' + $to + '/' + $key) && (util.isServAcntName($from, blockNumber) || util.isCksumAddr($from)) && (util.isServAcntName($to, blockNumber) || util.isCksumAddr($to)) && $from !== $to && util.isNumber(newData) && newData > 0 && util.countDecimals(newData) <= 6 && util.getBalance($from, getValue) >= newData] at '/transfer/$from/$to/$key/value' for value path '/transfer/0x00ADEc28B6a845a085e03591bE7550dd68673C1C/staking|Test_Service|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0/203/value' with path vars '{\"$key\":\"203\",\"$to\":\"staking|Test_Service|0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204|0\",\"$from\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}', data 'null', newData '33', auth '{\"addr\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}', timestamp '1234567890001'",
        });
        if (!(await waitUntilTxFinalized([server2], _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const fromAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferFromBalancePath}`).body.toString('utf-8')).result;
        const toServiceAfterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${transferToServiceBalancePath}`).body.toString('utf-8')).result;
        expect(fromAfterBalance).to.equal(fromBeforeBalance);
        expect(toServiceAfterBalance).to.equal(toServiceBeforeBalance);
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

      describe('Stake:', () => {
        it('stake: stake', async () => {
          const beforeStakingBalanceTotalSum = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/balance_total_sum`).body.toString('utf-8')).result;
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
                          "bandwidth_gas_amount": 2000,
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
                      "subtree_func_results": {
                        "/$staking_key/stake/$record_id/value": {},
                        "/$staking_key/unstake/$record_id/value": {},
                      },
                      "bandwidth_gas_amount": 1,
                    }
                  },
                  "3": {
                    "path": "/staking/balance_total_sum",
                    "result": {
                      "bandwidth_gas_amount": 1,
                      "code": 0,
                      "subtree_func_results": {
                        "/$user_addr/$staking_key/stake/$record_id/value": {},
                        "/$user_addr/$staking_key/unstake/$record_id/value": {}
                      }
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
                "service": 2007
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
          const afterStakingBalanceTotalSum = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/balance_total_sum`).body.toString('utf-8')).result;
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
          expect(afterStakingBalanceTotalSum).to.equal(beforeStakingBalanceTotalSum + stakeAmount);
        });

        it('stake: stake with null value', async () => {
          const beforeBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/2/value',
            value: null,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 12103);
          assert.deepEqual(body.code, 40001);
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

        it('stake: stake more than account balance', async () => {
          const beforeBalance = parseOrLog(syncRequest('GET', server2 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePath + '/2/value',
            value: beforeBalance + 1
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(40001);
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
          expect(body.code).to.equals(40001);
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
          expect(body.code).to.equals(40001);
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
          expect(bodyLowerCase.code).to.equals(40001);
          if (!(await waitUntilTxFinalized(serverList, _.get(bodyLowerCase, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }

          const addrUpperCase = _.toUpper(serviceUser);
          const stakePathUpperCase = `/staking/checksum_addr_test_service/${addrUpperCase}/0/stake`;
          const bodyUpperCase = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: stakePathUpperCase + '/102/value',
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(bodyUpperCase.code).to.equals(40001);
          if (!(await waitUntilTxFinalized(serverList, _.get(bodyUpperCase, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });
      });

      describe('Unstake:', () => {
        it('unstake: unstake with null value', async () => {
          const beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/accounts/${serviceUserBad}/balance`)
              .body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: `${unstakePath}/1/value`,
            value: null,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 12103);
          assert.deepEqual(body.code, 40001);
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

        it('unstake: unstake by another address', async () => {
          const beforeBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/accounts/${serviceUserBad}/balance`)
              .body.toString('utf-8')).result;
          const beforeStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server3 + '/set_value', {json: {
            ref: `${unstakePath}/1/value`,
            value: stakeAmount
          }}).body.toString('utf-8'));
          expect(body.code).to.equals(40001);
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
          expect(body.code).to.equals(40001);
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
          const beforeStakingBalanceTotalSum = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/balance_total_sum`).body.toString('utf-8')).result;
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
                      "subtree_func_results": {
                        "/$staking_key/stake/$record_id/value": {},
                        "/$staking_key/unstake/$record_id/value": {},
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1,
                    }
                  },
                  "2": {
                    "path": "/staking/balance_total_sum",
                    "result": {
                      "bandwidth_gas_amount": 1,
                      "code": 0,
                      "subtree_func_results": {
                        "/$user_addr/$staking_key/stake/$record_id/value": {},
                        "/$user_addr/$staking_key/unstake/$record_id/value": {}
                      }
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
          const afterStakingBalanceTotalSum = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/balance_total_sum`).body.toString('utf-8')).result;
          const afterStakingAccountBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${stakingServiceAccountBalancePath}`).body.toString('utf-8')).result;
          const afterBalance = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=${serviceUserBalancePath}`).body.toString('utf-8')).result;
          const stakingAppBalanceTotal = parseOrLog(syncRequest('GET',
              server2 + `/get_value?ref=/staking/test_service_staking/balance_total`)
            .body.toString('utf-8')).result;
          expect(afterStakingAccountBalance).to.equal(beforeStakingAccountBalance - stakeAmount);
          expect(afterStakingBalanceTotalSum).to.equal(beforeStakingBalanceTotalSum - stakeAmount);
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

      it('payments: pay by non-app admin', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
              ref: `/payments/test_service_payment/${serviceUser}/0/pay/key1`,
              value: {
                amount: 100
              }
            }}).body.toString('utf-8'));
        expect(body.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: pay with amount = 0', async () => {
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: 0
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: pay with amount is not a number', async () => {
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: 'test'
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: pay with payment amount > admin balance', async () => {
        const adminBalance = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key1`;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: payRef,
          value: {
            amount: adminBalance + 1
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: pay with null value', async () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const payRef = `/payments/test_service_payment/${serviceUser}/0/pay/key2`;
        const serviceAccountBalanceBefore = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', { json: {
          ref: payRef,
          value: null,
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 12103);
        assert.deepEqual(body.code, 40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore);
        const serviceAccountBalanceAfter = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        expect(serviceAccountBalanceAfter).to.equals(serviceAccountBalanceBefore);
      });

      it('payments: pay by app admin', async () => {
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
                        "bandwidth_gas_amount": 2000,
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
              "service": 2004
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

      it('payments: claim by non-app admin', async () => {
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
              ref: `/payments/test_service_payment/${serviceUser}/0/claim/key1`,
              value: {
                amount: 100,
                target: serviceAdmin
              }
            }}).body.toString('utf-8'));
        expect(body.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: claim with amount > payment balance', async () => {
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
        expect(body.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: claim with invalid claim target', async () => {
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
        expect(body.code).to.equals(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it('payments: claim with null value', async () => {
        const adminBalanceBefore = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        const paymentClaimRef = `/payments/test_service_payment/${serviceUser}/0/claim/key2`;
        const serviceAccountBalanceBefore = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
            .body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
          ref: paymentClaimRef,
          value: null,
          nonce: -1,
          timestamp: 1234567890000,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 12103);
        assert.deepEqual(body.code, 40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const adminBalanceAfter = parseOrLog(syncRequest('GET', server1 +
            `/get_value?ref=/accounts/${serviceAdmin}/balance`).body.toString('utf-8')).result;
        expect(adminBalanceAfter).to.equals(adminBalanceBefore);
        const serviceAccountBalanceAfter = parseOrLog(syncRequest('GET',
            server1 + `/get_value?ref=/service_accounts/payments/test_service_payment/${serviceUser}|0/balance`)
                .body.toString('utf-8')).result;
        expect(serviceAccountBalanceAfter).to.equals(serviceAccountBalanceBefore);
      });

      it('payments: claim by app admin with individual account target', async () => {
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

      it('payments: claim + hold in escrow by app admin', async () => {
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

      it('payments: claim by app admin with service account target', async () => {
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
          expect(body.code).to.equals(40001);
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
          expect(body.code).to.equals(40001);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });

        it("escrow: individual -> individual: hold with null value", async () => {
          const key = 1234567890000 + 2;
          const holdRef = `/escrow/${serviceUser}/${serviceAdmin}/0/hold/${key}`;
          const userBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const escrowServiceAccountBalanceBefore = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
            ref: holdRef,
            value: null,
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 12103);
          assert.deepEqual(body.code, 40001);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const userBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          expect(userBalanceAfter).to.equals(userBalanceBefore);
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(escrowServiceAccountBalanceBefore);
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
                          "bandwidth_gas_amount": 2000,
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
                "service": 2004
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
          expect(body.code).to.equals(40001);
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
          expect(body.code).to.equals(40001);
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
          expect(body.code).to.equals(40001);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
        });

        it("escrow: individual -> individual: release with null value", async () => {
          const key = 1234567890000 + 6;
          const releaseRef = `/escrow/${serviceUser}/${serviceAdmin}/0/release/${key}`;
          const userBalanceBefore = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          const escrowServiceAccountBalanceBefore = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          const body = parseOrLog(syncRequest('POST', server1 + '/set_value', {json: {
            ref: releaseRef,
            value: null,
            nonce: -1,
            timestamp: 1234567890000,
          }}).body.toString('utf-8'));
          assert.deepEqual(_.get(body, 'result.result.code'), 12103);
          assert.deepEqual(body.code, 40001);
          if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
            console.error(`Failed to check finalization of tx.`);
          }
          const userBalanceAfter = parseOrLog(syncRequest('GET', server1 +
              `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
          expect(userBalanceAfter).to.equals(userBalanceBefore);
          const escrowServiceAccountBalanceAfter = parseOrLog(syncRequest('GET',
              server1 + `/get_value?ref=/service_accounts/escrow/escrow/${serviceUser}:${serviceAdmin}:0/balance`)
              .body.toString('utf-8')).result;
          expect(escrowServiceAccountBalanceAfter).to.equals(escrowServiceAccountBalanceBefore);
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
          const server3Addr = parseOrLog(syncRequest(
            'GET', server3 + '/get_address').body.toString('utf-8')).result;
          const transferBody = parseOrLog(syncRequest('POST', server3 + '/set_value', {json: {
            ref: `transfer/${server3Addr}/${serviceAdmin}/${key}/value`,
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
          expect(body.code).to.equals(40001);
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
                          "bandwidth_gas_amount": 2000,
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
                "service": 2004
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
      const chainId = 3;
      const tokenId = '0xB16c0C80a81f73204d454426fC413CAe455525A7';
      const checkoutRequestBasePath = `/checkout/requests/${networkName}/${chainId}/${tokenId}`;
      const checkoutHistoryBasePath = `/checkout/history/${networkName}/${chainId}/${tokenId}`;
      const checkoutRefundsBasePath = `/checkout/refunds/${networkName}/${chainId}/${tokenId}`;
      const tokenBridgeConfig = BlockchainParams.token.bridge[networkName][chainId][tokenId];
      const {
        token_pool: tokenPoolAddr,
        min_checkout_per_request: minCheckoutPerRequest,
        max_checkout_per_request: maxCheckoutPerRequest,
        max_checkout_per_day: maxCheckoutPerDay,
        checkout_fee_rate: checkoutFeeRate,
       } = tokenBridgeConfig;
      const checkoutAmount = minCheckoutPerRequest;
      const ethAddress = '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'; // recipient

      it('cannot open checkout with invalid params: amount < min_checkout_per_request', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const timestamp = Date.now();
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/${timestamp}`,
          value: {
            amount: minCheckoutPerRequest - 1,
            recipient: ethAddress,
            fee_rate: checkoutFeeRate,
          },
          timestamp,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutRequestBasePath}/${serviceUser}/${timestamp}`).body.toString('utf-8')).result;
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
        const timestamp = Date.now();
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/${timestamp}`,
          value: {
            amount: maxCheckoutPerRequest + 1,
            recipient: ethAddress,
            fee_rate: checkoutFeeRate,
          },
          timestamp,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutRequestBasePath}/${serviceUser}/${timestamp}`).body.toString('utf-8')).result;
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
        const timestamp = Date.now();
        const ref = `/checkout/requests/AIN/${chainId}/${tokenId}/${serviceUser}/${timestamp}`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress,
            fee_rate: checkoutFeeRate,
          },
          timestamp,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
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
        const timestamp = Date.now();
        const ref = `/checkout/requests/${networkName}/1/${tokenId}/${serviceUser}/${timestamp}`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress,
            fee_rate: checkoutFeeRate,
          },
          timestamp,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
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
        const timestamp = Date.now();
        const ref = `/checkout/requests/${networkName}/${chainId}/0xINVALID_TOKEN_ID/${serviceUser}/${timestamp}`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress,
            fee_rate: checkoutFeeRate,
          },
          timestamp,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
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
        const timestamp = Date.now();
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/${timestamp}`,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress.toLowerCase(),
            fee_rate: checkoutFeeRate,
          },
          timestamp,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutRequestBasePath}/${serviceUser}/${timestamp}`).body.toString('utf-8')).result;
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
        const timestamp = Date.now();
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/${timestamp}`,
          value: {
            amount: beforeBalance + 1,
            recipient: ethAddress,
            fee_rate: checkoutFeeRate,
          },
          timestamp,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutRequestBasePath}/${serviceUser}/${timestamp}`).body.toString('utf-8')).result;
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(checkoutRequest).to.equal(null);
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('cannot open checkout with null value', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const timestamp = 1628255843548;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/${timestamp}`,
          value: null,
          timestamp,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 12103);
        assert.deepEqual(body.code, 40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('can open checkout', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const timestamp = 1628255843548;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/${timestamp}`,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress,
            fee_rate: checkoutFeeRate,
          },
          timestamp,
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
                        "bandwidth_gas_amount": 2000
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
              "service": 2006
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
        const amountPlusFee = checkoutAmount + checkoutAmount * checkoutFeeRate;
        expect(afterRequestUserBalance).to.equal(beforeBalance - amountPlusFee);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance + amountPlusFee);
        expect(userPendingAmount).to.equal(checkoutAmount);
        expect(totalPendingAmount).to.equal(checkoutAmount);
      });

      it('cannot close checkout with a non-authorized address', async () => {
        const timestamp = 1628255843548;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutHistoryBasePath}/${serviceUser}/${timestamp}`,
          value: {
            request: {
              amount: checkoutAmount,
              recipient: ethAddress,
              fee_rate: checkoutFeeRate,
            },
            response: {
              status: true
            }
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkoutHistory = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkoutHistoryBasePath}/${serviceUser}/${timestamp}`).body.toString('utf-8')).result;
        expect(checkoutHistory).to.equal(null);
      });

      it('cannot close checkout with null value', async () => {
        const userPendingAmountBefore = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/${serviceUser}`)
            .body.toString('utf-8')).result;
        const totalPendingAmountBefore = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/total`)
            .body.toString('utf-8')).result;
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkoutHistoryBasePath}/${serviceUser}/1628255843548`,
            value: null,
          },
          gas_price: 0,
          timestamp: 1628255843548,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        });
        assert.deepEqual(_.get(res, 'result.result.result.code'), 12103);
        const txHash = _.get(res, 'result.result.tx_hash');
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const userPendingAmountAfter = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/${serviceUser}`)
            .body.toString('utf-8')).result;
        const totalPendingAmountAfter = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/checkout/stats/pending/total`)
            .body.toString('utf-8')).result;
        expect(userPendingAmountAfter).to.equal(userPendingAmountBefore);
        expect(totalPendingAmountAfter).to.equal(totalPendingAmountBefore);
      });

      it('can close a successful checkout with token pool key', async () => {
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkoutHistoryBasePath}/${serviceUser}/1628255843548`,
            value: {
              request: {
                amount: checkoutAmount,
                recipient: ethAddress,
                fee_rate: checkoutFeeRate,
              },
              response: {
                status: true,
                tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c'
              }
            }
          },
          gas_price: 0,
          timestamp: 1628255843548,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
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
                  "path": "/checkout/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1628255843548",
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
        const timestamp = 1628255843549;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkoutRequestBasePath}/${serviceUser}/${timestamp}`,
          value: {
            amount: checkoutAmount,
            recipient: ethAddress,
            fee_rate: checkoutFeeRate,
          },
          timestamp,
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
        const amountPlusFee = checkoutAmount + checkoutAmount * checkoutFeeRate;
        expect(afterRequestUserBalance).to.equal(beforeBalance - amountPlusFee);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance + amountPlusFee);
        // close failed checkout
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkoutHistoryBasePath}/${serviceUser}/${timestamp}`,
            value: {
              request: {
                amount: checkoutAmount,
                recipient: ethAddress,
                fee_rate: checkoutFeeRate,
              },
              response: {
                status: false,
                tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c',
                message: 'Ethereum tx failed'
              }
            }
          },
          gas_price: 0,
          timestamp: 1628255843550,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
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
                  "path": "/transfer/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1628255843550/value",
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
                  "path": "/checkout/refunds/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1628255843549",
                  "result": {
                    "code": 0,
                    "bandwidth_gas_amount": 1
                  }
                },
                "2": {
                  "path": "/checkout/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1628255843549",
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
            server2 + `/get_value?ref=${checkoutRefundsBasePath}/${serviceUser}/${timestamp}`).body.toString('utf-8')).result;
        assert.deepEqual(refund,
            '/transfer/0x20ADd3d38405ebA6338CB9e57a0510DEB8f8e000/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1628255843550');
        const refundTransfer = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${refund}`).body.toString('utf-8')).result;
        assert.deepEqual(refundTransfer, { "value": amountPlusFee });
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
      const chainId = 3;
      const tokenId = '0xB16c0C80a81f73204d454426fC413CAe455525A7';
      const checkinRequestBasePath = `/checkin/requests/${networkName}/${chainId}/${tokenId}`;
      const checkinHistoryBasePath = `/checkin/history/${networkName}/${chainId}/${tokenId}`;
      const tokenPoolAddr = BlockchainParams.token.bridge[networkName][chainId][tokenId].token_pool;
      const checkinAmount = 100;
      const sender = '0x09A0d53FDf1c36A131938eb379b98910e55EEfe1'; // eth address
      const senderPrivateKey = '0xee0b1315d446e5318eb6eb4e9d071cd12ef42d2956d546f9acbdc3b75c469640';
      const ethAccounts = new Accounts();

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
        const timestamp = Date.now();
        const ref = `${checkinRequestBasePath}/${serviceUser}/${timestamp}`;
        const senderProofBody = {
          ref,
          amount: 0,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: 0,
            sender,
            sender_proof: senderProof,
          },
          timestamp,
          nonce: -1,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinRequestBasePath}/${serviceUser}/${timestamp}`).body.toString('utf-8')).result;
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
        const timestamp = Date.now();
        const ref = `/checkin/requests/AIN/${chainId}/${tokenId}/${serviceUser}/${timestamp}`;
        const senderProofBody = {
          ref,
          amount: checkinAmount,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender,
            sender_proof: senderProof,
          },
          timestamp,
          nonce: -1,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
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
        const timestamp = Date.now();
        const ref = `/checkin/requests/${networkName}/1/${tokenId}/${serviceUser}/${timestamp}`;
        const senderProofBody = {
          ref,
          amount: checkinAmount,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender,
            sender_proof: senderProof,
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
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
        const timestamp = Date.now();
        const ref = `/checkin/requests/${networkName}/${chainId}/0xINVALID_TOKEN_ID/${serviceUser}/${timestamp}`;
        const senderProofBody = {
          ref,
          amount: checkinAmount,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender,
            sender_proof: senderProof,
          },
          timestamp,
          nonce: -1,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
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
        const timestamp = Date.now();
        const ref = `${checkinRequestBasePath}/${serviceUser}/${timestamp}`;
        const senderProofBody = {
          ref,
          amount: checkinAmount,
          sender: sender.toLowerCase(),
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender: sender.toLowerCase(),
            sender_proof: senderProof,
          },
          timestamp,
          nonce: -1,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
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

      it('cannot open checkin with null value', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const timestamp = 1628255843548;
        const ref = `${checkinRequestBasePath}/${serviceUser}/${timestamp}`;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: null,
          timestamp,
          nonce: -1,
        }}).body.toString('utf-8'));
        assert.deepEqual(_.get(body, 'result.result.code'), 12103);
        assert.deepEqual(body.code, 40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const afterRequestUserBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`).body.toString('utf-8')).result;
        const afterRequestTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result;
        expect(afterRequestUserBalance).to.equal(beforeBalance);
        expect(afterRequestTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('can open checkin', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const timestamp = 1628255843548;
        const ref = `${checkinRequestBasePath}/${serviceUser}/${timestamp}`;
        const senderProofBody = {
          ref,
          amount: checkinAmount,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender,
            sender_proof: senderProof,
          },
          timestamp,
          nonce: -1,
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
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${sender}`)
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
        const timestamp = Date.now();
        const ref = `${checkinRequestBasePath}/${serviceUser}/${timestamp}`;
        const senderProofBody = {
          ref,
          amount: checkinAmount,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender,
            sender_proof: senderProof,
          },
          timestamp,
          nonce: -1,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
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

      it('cannot open checkin with (amount + pending) more than token pool balance', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const timestamp = Date.now();
        const ref = `${checkinRequestBasePath}/${serviceUser}/${timestamp}`;
        const amount = beforeTokenPoolBalance - checkinAmount + 1;
        const senderProofBody = {
          ref,
          amount,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount,
            sender,
            sender_proof: senderProof,
          },
          timestamp,
          nonce: -1,
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
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

      it('cannot close checkin with a non-authorized address', async () => {
        const request = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinRequestBasePath}/${serviceUser}/1628255843548`).body.toString('utf-8')).result;
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref: `${checkinHistoryBasePath}/${serviceUser}/1628255843548`,
          value: {
            request,
            response: {
              status: true
            }
          }
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinHistory = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinHistoryBasePath}/${serviceUser}/1628255843548`).body.toString('utf-8')).result;
        expect(checkinHistory).to.equal(null);
      });

      it('cannot close checkin with null value', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const timestamp = Date.now();
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkinHistoryBasePath}/${serviceUser}/1628255843548`,
            value: null,
          },
          gas_price: 0,
          timestamp,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        });
        assert.deepEqual(_.get(res, 'result.result.result.code'), 12103);
        const txHash = _.get(res, 'result.result.tx_hash');
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const afterBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const afterTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        expect(afterBalance).to.equal(beforeBalance);
        expect(afterTokenPoolBalance).to.equal(beforeTokenPoolBalance);
      });

      it('can close a successful checkin with token pool key', async () => {
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`).body.toString('utf-8')).result;
        const timestamp = Date.now();
        const request = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinRequestBasePath}/${serviceUser}/1628255843548`).body.toString('utf-8')).result;
        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkinHistoryBasePath}/${serviceUser}/1628255843548`,
            value: {
              request,
              response: {
                status: true,
                tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c'
              }
            }
          },
          gas_price: 0,
          timestamp,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
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
                  "path": "/checkin/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1628255843548",
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
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${sender}`)
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

      it('token pool can close checkin with undefined tx_hash', async () => {
        const timestamp = 1641988209614;
        const ref = `${checkinRequestBasePath}/${serviceUser}/${timestamp}`;
        const amount = checkinAmount;
        const senderProofBody = {
          ref,
          amount,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const openCheckinRes = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender,
            sender_proof: senderProof,
          },
          gas_price: 0,
          timestamp,
          nonce: -1,
        }}).body.toString('utf-8'));
        expect(openCheckinRes.code).to.equal(0);
        if (!(await waitUntilTxFinalized(serverList, _.get(openCheckinRes, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const closeCheckinTxBody = {
          operation: {
            type: 'SET_VALUE',
            ref: `${checkinHistoryBasePath}/${serviceUser}/${timestamp}`,
            value: {
              request: {
                amount: checkinAmount,
                sender,
                sender_proof: senderProof,
              },
              response: {
                // tx_hash is undefined
                status: false
              }
            }
          },
          gas_price: 0,
          timestamp,
          nonce: -1
        };
        const signature = ainUtil.ecSignTransaction(
            closeCheckinTxBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const closeCheckinRes = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: closeCheckinTxBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
        });
        const txHash = _.get(closeCheckinRes, 'result.result.tx_hash');
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        assert.deepEqual(eraseStateGas(_.get(closeCheckinRes, 'result.result.result', null)), {
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
                  "path": "/checkin/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1641988209614",
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
      });

      it('can close a failed checkin', async () => {
        // open checkin
        const beforeBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${serviceUser}/balance`)
            .body.toString('utf-8')).result || 0;
        const beforeTokenPoolBalance = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=/accounts/${tokenPoolAddr}/balance`)
            .body.toString('utf-8')).result || 0;
        const timestamp = 1628255843549;
        const ref = `${checkinRequestBasePath}/${serviceUser}/${timestamp}`;
        const senderProofBody = {
          ref,
          amount: checkinAmount,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const request = {
          amount: checkinAmount,
          sender,
          sender_proof: senderProof,
        };
        const body = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: request,
          timestamp,
          nonce: -1,
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
            ref: `${checkinHistoryBasePath}/${serviceUser}/${timestamp}`,
            value: {
              request,
              response: {
                status: false,
                tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c',
                message: 'Ethereum tx failed'
              }
            }
          },
          gas_price: 0,
          timestamp: 1628255843548,
          nonce: -1
        };
        const signature =
            ainUtil.ecSignTransaction(txBody, Buffer.from('d42f73de4ee706a4891dad643e0a65c0677020dbc2425f585442d0de2c742a44', 'hex'));
        const res = await client.request(JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION, {
          tx_body: txBody,
          signature,
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION
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
                  "path": "/checkin/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/0x01A0980d2D4e418c7F27e1ef539d01A5b5E93204/1628255843549",
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
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${sender}`)
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
          ref: `${checkinRequestBasePath}/${serviceUser}/1628255843549`,
          value: null
        }}).body.toString('utf-8'));
        expect(body.code).to.equal(40001);
        if (!(await waitUntilTxFinalized(serverList, _.get(body, 'result.tx_hash')))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const checkinRequest = parseOrLog(syncRequest('GET',
            server2 + `/get_value?ref=${checkinRequestBasePath}/${serviceUser}/1628255843549`).body.toString('utf-8')).result;
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
        const timestamp = Date.now();
        const ref = `${checkinRequestBasePath}/${serviceUser}/${timestamp}`;
        const senderProofBody = {
          ref,
          amount: checkinAmount,
          sender,
          timestamp,
          nonce: -1,
        };
        const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(senderProofBody)), senderPrivateKey).signature;
        const requestBody = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: {
          ref,
          value: {
            amount: checkinAmount,
            sender,
            sender_proof: senderProof,
          },
          timestamp,
          nonce: -1,
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
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${sender}`)
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
          ref, value: null
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
            server2 + `/get_value?ref=/checkin/stats/pending/${networkName}/${chainId}/${tokenId}/${sender}`)
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
