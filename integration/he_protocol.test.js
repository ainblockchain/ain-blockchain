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
  waitUntilNetworkIsReady,
  parseOrLog,
  setUpApp,
  eraseStateGas,
} = require('../unittest/test-util');

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

describe('HE Protocol', () => {
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

  describe('Health care app', () => {
    let serviceAdmin; // = server1
    let serviceUser; // = server2

    const appName = 'he_health_care';
    const appScenario1Label = 'app_scenario1';
    const appScenario1TaskPath = `/apps/${appName}/${appScenario1Label}/tasks/$task_id`;

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

    describe('Create app', () => {
      it("app creation was successful", async () => {
        const appCreationResult = parseOrLog(syncRequest(
          'GET', server2 + `/get_value?ref=/manage_app/${appName}/create/1`).body.toString('utf-8')).result;
        assert.deepEqual(appCreationResult, {
          "admin": {
            "0x00ADEc28B6a845a085e03591bE7550dd68673C1C": true
          }
        });
      });
    });

    describe('Set owner', () => {
      it("owner was configured properly", async () => {
        const ownerConfig = parseOrLog(syncRequest(
          'GET', server2 + `/get_owner?ref=/apps/${appName}`).body.toString('utf-8')).result;
        assert.deepEqual(ownerConfig, {
          ".owner": {
            "owners": {
              "0x00ADEc28B6a845a085e03591bE7550dd68673C1C": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          }
        })
      });
    });

    describe('Set rule', () => {
      after(async () => {
        // Clear rule
        const request = {
          ref: `${appScenario1TaskPath}`,
          value: null,
          gas_price: 1,
        };
        const res = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: request})
            .body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(res.result), {
          "bandwidth_gas_amount": 1,
          "code": 0,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "he_health_care": 1
              },
              "service": 0
            },
            "state": {
              "service": "erased"
            }
          },
          "gas_cost_total": 0
        });

        // Confirm that the rule clear tx is finalized
        const txHash = _.get(res, 'tx_hash');
        expect(txHash).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("initial rule was configured properly", async () => {
        const ruleConfig = parseOrLog(syncRequest('GET', server2 + `/get_rule?ref=/apps/${appName}`)
            .body.toString('utf-8')).result;
        assert.deepEqual(ruleConfig, {
          ".rule": {
            "write": "auth.addr === '0x00ADEc28B6a845a085e03591bE7550dd68673C1C'"
          }
        })
      });

      it("owner can set rule", async () => {
        // Check the initial rule.
        const ruleBefore = parseOrLog(syncRequest('GET',
            server2 + `/get_rule?ref=${appScenario1TaskPath}`).body.toString('utf-8')).result;
        assert.deepEqual(ruleBefore, null);

        // Set rule
        const request = {
          ref: `${appScenario1TaskPath}`,
          value: {
            ".rule": {
              "write": "some rule config"
            }
          },
          gas_price: 1,
        };
        const res = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: request})
            .body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(res.result), {
          "bandwidth_gas_amount": 1,
          "code": 0,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "he_health_care": 1
              },
              "service": 0
            },
            "state": {
              "app": {
                "he_health_care": "erased"
              },
              "service": "erased"
            }
          },
          "gas_cost_total": 0
        });

        // Confirm that the rule set tx is finalized
        const txHash = _.get(res, 'tx_hash');
        expect(txHash).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const ruleAfter = parseOrLog(syncRequest(
            'GET', server2 + `/get_rule?ref=${appScenario1TaskPath}`)
            .body.toString('utf-8')).result;
        assert.deepEqual(ruleAfter, {
          ".rule": {
            "write": "some rule config"
          }
        });
      });
    });

    describe('Set function', () => {
      after(async () => {
        // Clear function
        const request = {
          ref: `${appScenario1TaskPath}`,
          value: null
        };
        const res = parseOrLog(syncRequest('POST', server1 + '/set_function', {json: request})
            .body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(res.result), {
          "bandwidth_gas_amount": 1,
          "code": 0,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "he_health_care": 1
              },
              "service": 0
            },
            "state": {
              "service": "erased"
            }
          },
          "gas_cost_total": 0
        });

        // Confirm that the function clear tx is finalized
        const txHash = _.get(res, 'tx_hash');
        expect(txHash).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("owner can set function", async () => {
        // Check the initial function.
        const functionBefore = parseOrLog(syncRequest('GET',
            server2 + `/get_function?ref=${appScenario1TaskPath}`)
            .body.toString('utf-8')).result;
        assert.deepEqual(functionBefore, null);

        // Set function
        const request = {
          ref: `${appScenario1TaskPath}`,
          value: {
            ".function": {
              "fid": {
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "fid",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
            }
          }
        };
        const res = parseOrLog(syncRequest('POST', server1 + '/set_function', {json: request})
            .body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(res.result), {
          "bandwidth_gas_amount": 1,
          "code": 0,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "he_health_care": 1
              },
              "service": 0
            },
            "state": {
              "app": {
                "he_health_care": "erased"
              },
              "service": "erased"
            }
          },
          "gas_cost_total": 0
        });

        // Confirm that the function set tx is finalized
        const txHash = _.get(res, 'tx_hash');
        expect(txHash).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const functionAfter = parseOrLog(syncRequest(
            'GET', server2 + `/get_function?ref=${appScenario1TaskPath}`)
            .body.toString('utf-8')).result;
        assert.deepEqual(functionAfter, {
          ".function": {
            "fid": {
              "event_listener": "https://events.ainetwork.ai/trigger",
              "function_id": "fid",
              "function_type": "REST",
              "service_name": "https://ainetwork.ai"
            }
          }
        });
      });
    });

    describe('Set value', () => {
      before(async () => {
        // Set rule
        const ruleRequest = {
          ref: `${appScenario1TaskPath}`,
          value: {
            ".rule": {
              "write": true
            }
          },
          gas_price: 1,
        };
        const ruleResp = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: ruleRequest})
            .body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(ruleResp.result), {
          "bandwidth_gas_amount": 1,
          "code": 0,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "he_health_care": 1
              },
              "service": 0
            },
            "state": {
              "app": {
                "he_health_care": "erased"
              },
              "service": "erased"
            }
          },
          "gas_cost_total": 0
        });

        // Confirm that the rule set tx is finalized
        const ruleTxHash = _.get(ruleResp, 'tx_hash');
        expect(ruleTxHash).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, ruleTxHash))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Set function
        const functionRequest = {
          ref: `${appScenario1TaskPath}`,
          value: {
            ".function": {
              "call_he_worker": {
                "event_listener": "https://events.ainetwork.ai/trigger",
                "function_id": "call_he_worker",
                "function_type": "REST",
                "service_name": "https://ainetwork.ai"
              }
            }
          }
        };
        const functionResp = parseOrLog(syncRequest('POST',
            server1 + '/set_function', {json: functionRequest})
            .body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(functionResp.result), {
          "bandwidth_gas_amount": 1,
          "code": 0,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "he_health_care": 1
              },
              "service": 0
            },
            "state": {
              "app": {
                "he_health_care": "erased"
              },
              "service": "erased"
            }
          },
          "gas_cost_total": 0
        });

        // Confirm that the function set tx is finalized
        const functionTxHash = _.get(functionResp, 'tx_hash');
        expect(functionTxHash).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, functionTxHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      after(async () => {
        // Clear rule
        const ruleRequest = {
          ref: `${appScenario1TaskPath}`,
          value: null,
          gas_price: 1,
        };
        const ruleResp = parseOrLog(syncRequest('POST', server1 + '/set_rule', {json: ruleRequest})
            .body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(ruleResp.result), {
          "bandwidth_gas_amount": 1,
          "code": 0,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "he_health_care": 1
              },
              "service": 0
            },
            "state": {
              "service": "erased"
            }
          },
          "gas_cost_total": 0
        });

        // Confirm that the rule clear tx is finalized
        const ruleTxHash = _.get(ruleResp, 'tx_hash');
        expect(ruleTxHash).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, ruleTxHash))) {
          console.error(`Failed to check finalization of tx.`);
        }

        // Clear function
        const functioinRequest = {
          ref: `${appScenario1TaskPath}`,
          value: null
        };
        const functionResp = parseOrLog(syncRequest('POST',
            server1 + '/set_function', {json: functioinRequest})
            .body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(functionResp.result), {
          "bandwidth_gas_amount": 1,
          "code": 0,
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "he_health_care": 1
              },
              "service": 0
            },
            "state": {
              "service": "erased"
            }
          },
          "gas_cost_total": 0
        });

        // Confirm that the function clear tx is finalized
        const functionTxHash = _.get(functionResp, 'tx_hash');
        expect(functionTxHash).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, functionTxHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
      });

      it("user can set value to trigger function", async () => {
        const task0Path = `/apps/${appName}/${appScenario1Label}/tasks/0`;

        // Check the initial value.
        const valueBefore = parseOrLog(syncRequest('GET', server1 + `/get_value?ref=${task0Path}`)
            .body.toString('utf-8')).result;
        assert.deepEqual(valueBefore, null);

        // Set value
        const request = {
          ref: `${task0Path}`,
          value: {
            data: 'task0 data'
          }
        };
        const res = parseOrLog(syncRequest('POST', server2 + '/set_value', {json: request})
            .body.toString('utf-8')).result;
        assert.deepEqual(eraseStateGas(res.result), {
          "bandwidth_gas_amount": 1,
          "code": 0,
          "func_results": {
            "call_he_worker": {  // Function triggering was done
              "bandwidth_gas_amount": 10,
              "code": 0
            }
          },
          "gas_amount_charged": "erased",
          "gas_amount_total": {
            "bandwidth": {
              "app": {
                "he_health_care": 11
              },
              "service": 0
            },
            "state": {
              "app": {
                "he_health_care": "erased"
              },
              "service": "erased"
            }
          },
          "gas_cost_total": 0
        });

        // Confirm that the value set tx is finalized
        const txHash = _.get(res, 'tx_hash');
        expect(txHash).to.not.equal(null);
        if (!(await waitUntilTxFinalized(serverList, txHash))) {
          console.error(`Failed to check finalization of tx.`);
        }
        const valueAfter = parseOrLog(syncRequest('GET', server1 + `/get_value?ref=${task0Path}`)
            .body.toString('utf-8')).result;
        assert.deepEqual(valueAfter, {
          "data": "task0 data"
        });
      });
    });
  });
});
