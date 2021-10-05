const _ = require('lodash');
const chai = require('chai');
const assert = chai.assert;
const spawn = require('child_process').spawn;
const rimraf = require('rimraf');
const jayson = require('jayson/promise');
const PROJECT_ROOT = require('path').dirname(__filename) + '/../';
const TRACKER_SERVER = PROJECT_ROOT + 'tracker-server/index.js';
const APP_SERVER = PROJECT_ROOT + 'client/index.js';
const expect = chai.expect;
// eslint-disable-next-line no-unused-vars
const syncRequest = require('sync-request');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const {
  CURRENT_PROTOCOL_VERSION,
  CHAINS_DIR
} = require('../common/constants');
const { ConsensusConsts } = require('../consensus/constants');
const CommonUtil = require('../common/common-util');
const NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST = 5;
const MAX_CHAIN_LENGTH_DIFF = 5;
const {
  waitUntilTxFinalized,
  waitForNewBlocks,
  waitUntilNetworkIsReady,
  waitUntilNodeSyncs,
  parseOrLog,
  setUpApp
} = require('../unittest/test-util');
const { Block } = require('../blockchain/block');

const ENV_VARIABLES = [
  {
    ACCOUNT_INDEX: 0, MIN_NUM_VALIDATORS: 4, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    ACCOUNT_INDEX: 1, MIN_NUM_VALIDATORS: 4, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    ACCOUNT_INDEX: 2, MIN_NUM_VALIDATORS: 4, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
  {
    ACCOUNT_INDEX: 3, MIN_NUM_VALIDATORS: 4, DEBUG: false, CONSOLE_LOG: false,
    ENABLE_DEV_SET_CLIENT_API: true, ENABLE_GAS_FEE_WORKAROUND: true,
    ADDITIONAL_OWNERS: 'test:unittest/data/owners_for_testing.json',
    ADDITIONAL_RULES: 'test:unittest/data/rules_for_testing.json'
  },
];

// Server configurations
const trackerServer = 'http://localhost:5000';
const server1 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[0].ACCOUNT_INDEX))
const server2 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[1].ACCOUNT_INDEX))
const server3 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[2].ACCOUNT_INDEX))
const server4 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[3].ACCOUNT_INDEX))
const serverList = [server1, server2, server3, server4];

const JSON_RPC_ENDPOINT = '/json-rpc';
const JSON_RPC_GET_RECENT_BLOCK = 'ain_getRecentBlock';
const JSON_RPC_GET_BLOCKS = 'ain_getBlockList';
const JSON_RPC_GET_BLOCK_HEADERS = 'ain_getBlockHeadersList';
const JSON_RPC_GET_BLOCK_BY_HASH = 'ain_getBlockByHash';
const JSON_RPC_GET_BLOCK_BY_NUMBER = 'ain_getBlockByNumber';
const JSON_RPC_GET_NONCE = 'ain_getNonce';
const JSON_RPC_NET_SYNCING = 'net_syncing';

const SET_VALUE_ENDPOINT = '/set_value';
const GET_VALUE_ENDPOINT = '/get_value'
const BLOCKS_ENDPOINT = '/blocks'
const GET_ADDR_ENDPOINT = '/get_address';
const LAST_BLOCK_NUMBER_ENDPOINT = '/last_block_number'

// Data options
RANDOM_OPERATION = [
  ['set_value', {ref: '/apps/test/comeonnnnnnn', value: 'testme'}],
  ['set_value', {ref: '/apps/test/comeonnnnnnn', value: 'no meeeee'}],
  ['set_value', {ref: '/apps/test/comeon/nnnnnn', value: 'through'}],
  ['set_value', {ref: '/apps/test/comeonnnnnnn/new', value: {'new': 'path'}}],
  ['set_value', {ref: '/apps/test/builed/some/deep', value: {'place': {'next': 1, 'level': 'down'}}}],
  ['set_value', {ref: '/apps/test/b/u/i/l/e/d/hel', value: 'very nested'}],
  ['set_value', {ref: '/apps/test/b/u/i/l/e/d/hel', value: {1: 2, 3: 4, 5: 6}}],
  ['set_value', {ref: '/apps/test/new/final/path', value: {'more': {'now': 12, 'hellloooo': 123}}}],
  ['inc_value', {ref: '/apps/test/balance/user1', value: 10}],
  ['inc_value', {ref: '/apps/test/balance/user1', value: 20}],
  ['inc_value', {ref: '/apps/test/balance/user2', value: 1}],
  ['inc_value', {ref: '/apps/test/balance/user2', value: 1}],
  ['dec_value', {ref: '/apps/test/balance/user1', value: 10000}],
  ['dec_value', {ref: '/apps/test/balance/user1', value: 10000}],
  ['dec_value', {ref: '/apps/test/balance/user2', value: 100002}],
  ['set_rule', {ref: '/apps/test/test_rule/', value: { ".rule": { "write": "some rule config" }}}],
  ['set_function', {ref: '/apps/test/test_function/', value: {
    ".function": {
      "fid": {
        "function_type": "REST",
        "function_id": "fid",
        "event_listener": "https://events.ainetwork.ai/trigger",
        "service_name": "https://ainetwork.ai",
      },
    }
  }}],
  ['set_owner', {ref: '/apps/test/test_owner/', value: {
    ".owner": {
      "owners": {
        "*": {
          "branch_owner": false,
          "write_function": true,
          "write_owner": true,
          "write_rule": false,
        }
      }
    }
  }}],
  ['set', {op_list: [{ref: '/apps/test/increase/first/level', value: 10},
      {ref: '/apps/test/increase/first/level2', value: 20}]}],
  ['set', {op_list: [{ref: '/apps/test/increase/second/level/deeper', value: 20},
      {ref: '/apps/test/increase/second/level/deeper', value: 1000}]}],
  ['set', {op_list: [{ref: '/apps/test/increase', value: 1}]}],
  ['set', {op_list: [{ref: '/apps/test/new', value: 1}]}],
  ['set', {op_list: [{ref: '/apps/test/increase', value: 10000}]}],
  ['set', {op_list: [{ref: '/apps/test/b/u', value: 10000}]}],
  ['set', {op_list: [{ref: '/apps/test/builed/some/deep/place/next', value: 100002}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: '/apps/test/comeonnnnnnn',
      value: 'no meeeee'}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: '/apps/test/comeon/nnnnnn',
      value: 'through'}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: '/apps/test/comeonnnnnnn/new',
      value: {'new': 'path'}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: '/apps/test/builed/some/deep',
      value: {'place': {'next': 1, 'level': 'down'}}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: '/apps/test/b/u/i/l/e/d/hel',
      value: {'range': 1, 'another': 2}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: '/apps/test/b/u/i/l/e/d/hel',
      value: 'very nested'}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: '/apps/test/b/u/i/l/e/d/hel',
      value: {1: 2, 3: 4, 5: 6}}}]}],
];

class Process {
  constructor(application, envVariables) {
    this.application = application;
    this.envVariables = envVariables;
    this.proc = null;
  }

  start(stdioInherit = false) {
    if (this.proc) {
      throw Error('Process already started');
    }
    const options = {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        ...this.envVariables,
      },
    }
    if (stdioInherit) {
      options.stdio = 'inherit';
    }
    this.proc = spawn('node', [this.application], options).on('error', (err) => {
      console.error(
          `Failed to start server${this.application} with ${this.envVariables} with error: ` +
          err.message);
    });
  }

  kill() {
    this.proc.kill();
    this.proc = null;
  }
}

const SERVER_PROCS = [];
for (let i = 0; i < ENV_VARIABLES.length; i++) {
  SERVER_PROCS.push(new Process(APP_SERVER, ENV_VARIABLES[i]));
}

async function sendTransactions(sentOperations) {
  const txHashList = [];
  for (let i = 0; i < NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST; i++) {
    const randomOperation =
        RANDOM_OPERATION[Math.floor(Math.random() * RANDOM_OPERATION.length)];
    sentOperations.push(randomOperation);
    const serverIndex = Math.floor(Math.random() * serverList.length);
    const value = JSON.parse(JSON.stringify(randomOperation[1]));
    const address =
            parseOrLog(syncRequest('GET', serverList[serverIndex] + '/get_address').body.toString('utf-8')).result;
    let nonce = parseOrLog(syncRequest(
      'POST', serverList[serverIndex] + '/json-rpc', {
        json: {
          jsonrpc: '2.0',
          method: 'ain_getNonce',
          id: 0,
          params: {
            address,
            from: 'pending',
            protoVer: CURRENT_PROTOCOL_VERSION
          }
        }
      }).body.toString('utf-8')).result.result;
    if (randomOperation[0] === 'batch') {
      for (const tx of value.tx_list) {
        tx.nonce = nonce++;
      }
      const res = parseOrLog(syncRequest('POST', serverList[serverIndex] + '/' + randomOperation[0],
          {json: value}).body.toString('utf-8')).result;
      res.forEach(txRes => txHashList.push(txRes.tx_hash));
    } else {
      txHashList.push(parseOrLog(syncRequest('POST',
          serverList[serverIndex] + '/' + randomOperation[0], {json: value}).body.toString('utf-8'))
              .result.tx_hash);
    }
    for (const txHash of txHashList) {
      await waitUntilTxFinalized(serverList, txHash);
    }
  }
}

describe('Blockchain Cluster', () => {
  let trackerProc;
  let numNewBlocks = 0;
  let numBlocksOnStartup;
  let jsonRpcClient;
  const sentOperations = [];
  const nodeAddressList = [];

  before(async () => {
    rimraf.sync(CHAINS_DIR);

    const promises = [];
    // Start up all servers
    trackerProc = new Process(TRACKER_SERVER, { CONSOLE_LOG: false });
    trackerProc.start(true);
    await CommonUtil.sleep(3000);
    for (let i = 0; i < SERVER_PROCS.length; i++) {
      const proc = SERVER_PROCS[i];
      proc.start(true);
      await CommonUtil.sleep(i === 0 ? 10000 : 3000);
      const address =
          parseOrLog(syncRequest('GET', serverList[i] + '/get_address').body.toString('utf-8')).result;
      nodeAddressList.push(address);
    };
    await waitUntilNetworkIsReady(serverList);
    jsonRpcClient = jayson.client.http(server2 + JSON_RPC_ENDPOINT);
    promises.push(new Promise((resolve) => {
      jsonRpcClient.request(JSON_RPC_GET_RECENT_BLOCK,
          {protoVer: CURRENT_PROTOCOL_VERSION}, function(err, response) {
        if (err) {
          resolve();
          throw err;
        }
        numBlocksOnStartup = response.result.result ? response.result.result.number : 0;
        resolve();
      });
    }));
    await Promise.all(promises);

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
    // Teardown all servers
    for (let i = 0; i < SERVER_PROCS.length; i++) {
      SERVER_PROCS[i].kill();
    }
    trackerProc.kill();

    rimraf.sync(CHAINS_DIR);
  });

  describe(`Synchronization`, () => {
    it('syncs across all blockchain nodes', async () => {
      for (let i = 1; i < serverList.length; i++) {
        await sendTransactions(sentOperations);
        return new Promise((resolve) => {
          jayson.client.http(server1 + JSON_RPC_ENDPOINT)
          .request(JSON_RPC_GET_BLOCKS, {protoVer: CURRENT_PROTOCOL_VERSION},
              function(err, response) {
            if (err) throw err;
            baseChain = response.result.result;
            resolve();
          });
        }).then(() => {
          return new Promise((resolve) => {
            jayson.client.http(serverList[i] + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS,
                {protoVer: CURRENT_PROTOCOL_VERSION},
                function(err, response) {
                  if (err) throw err;
                  const newChain = response.result.result;
                  const diff = Math.abs(baseChain.length - newChain.length);
                  assert.isBelow(diff, MAX_CHAIN_LENGTH_DIFF);
                  while (baseChain.length !== newChain.length) {
                    if (baseChain.length > newChain.length) {
                      baseChain.pop();
                    } else  {
                      newChain.pop();
                    }
                  }
                  assert.deepEqual(newChain.length, baseChain.length);
                  assert.deepEqual(newChain, baseChain);
                  resolve();
                });
          });
        });
      }
    });

    // TODO(platfowner): Uncomment this. It's flaky.
    /*
    it('syncs new peers on startup', async () => {
      await sendTransactions(sentOperations);
      await waitForNewBlocks(server1);
      let baseChain;
      let number;
      const accountIndex = 4;
      const newServer = 'http://localhost:' + String(8081 + Number(accountIndex))
      const newServerProc = new Process(APP_SERVER, {
        ACCOUNT_INDEX: accountIndex, DEBUG: true,
        ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
        ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
      });
      newServerProc.start();
      await CommonUtil.sleep(2000);
      await waitForNewBlocks(newServer);
      return new Promise((resolve) => {
        jayson.client.http(server1 + JSON_RPC_ENDPOINT)
        .request(JSON_RPC_GET_BLOCKS, {protoVer: CURRENT_PROTOCOL_VERSION},
            function(err, response) {
          if (err) throw err;
          baseChain = response.result.result;
          number = baseChain[baseChain.length - 1].number;
          resolve();
        });
      }).then(() => {
        return new Promise((resolve) => {
          jayson.client.http(newServer + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS,
              {to: number + 1, protoVer: CURRENT_PROTOCOL_VERSION},
              function(err, response) {
                if (err) throw err;
                const newChain = response.result.result;
                assert.deepEqual(baseChain.length, newChain.length);
                assert.deepEqual(baseChain, newChain);
                newServerProc.kill();
                resolve();
              });
        });
      });
    });
    */

    // TODO(platfowner): Uncomment this. It's flaky.
    /*
    it('all having correct number of blocks', () => {
      expect(numNewBlocks + numBlocksOnStartup).to.equal(baseChain.pop().number);
    });
    */
  });

  describe('Block validity', () => {
    it('blocks have correct validators and voting data', async () => {
      for (let i = 0; i < serverList.length; i++) {
        await sendTransactions(sentOperations);
        const blocks = parseOrLog(syncRequest(
            'POST', serverList[i] + '/json-rpc', {
              json: {
                jsonrpc: '2.0',
                method: JSON_RPC_GET_BLOCKS,
                id: 0,
                params: {
                  protoVer: CURRENT_PROTOCOL_VERSION
                }
              }
            }).body.toString('utf-8')).result.result;
        const len = blocks.length;
        for (let j = 2; j < len; j++) { // voting starts with block#1 (included in block#2's last_votes)
          let voteSum = 0;
          const validators = Object.assign({}, blocks[j - 1].validators);
          let totalStakedAmount = Object.values(validators).reduce((acc, cur) => { return acc + cur.stake; }, 0);
          let majority = Math.floor(totalStakedAmount * ConsensusConsts.MAJORITY);
          for (let k = 0; k < blocks[j].last_votes.length; k++) {
            const vote = blocks[j].last_votes[k];
            if (!blocks[j - 1].validators[vote.address].stake) {
              assert.fail(`Invalid validator (${vote.address}) is validating block ${blocks[j - 1]}`);
            }
            if (vote.tx_body.operation.type === 'SET_VALUE') {
              if (vote.tx_body.operation.value.block_hash !== blocks[j - 1].hash) {
                assert.fail('Invalid vote included in last_votes');
              }
              if (vote.tx_body.operation.value.stake && blocks[j - 1].validators[vote.address].stake) {
                voteSum += vote.tx_body.operation.value.stake;
              }
            } else if (vote.tx_body.operation.type === 'SET') {
              if (vote.tx_body.operation.op_list[0].value.block_hash !== blocks[j - 1].hash) {
                assert.fail('Invalid vote included in last_votes');
              }
            } else {
              assert.fail('Invalid operation type in last_votes');
            }
          }
          if (voteSum < majority) {
            assert.fail(`Insufficient votes received (${voteSum} / ${majority})`);
          }
        }
      }
    });

    it('blocks have valid hashes', async () => {
      const hashString = (str) => {
        return '0x' + ainUtil.hashMessage(str).toString('hex');
      }
      for (let i = 0; i < serverList.length; i++) {
        await sendTransactions(sentOperations);
        const blocks = parseOrLog(syncRequest('POST', serverList[i] + '/json-rpc',
            {json: {jsonrpc: '2.0', method: JSON_RPC_GET_BLOCKS, id: 0,
                    params: {protoVer: CURRENT_PROTOCOL_VERSION}}})
            .body.toString('utf-8')).result.result;
        const len = blocks.length;
        for (let j = 0; j < len; j++) {
          const block = blocks[j];
          if (block.hash !== Block.hash(block)) {
            assert.fail(`Block hash is incorrect for block ${JSON.stringify(block, null, 2)}` +
                        `\n(hash: ${Block.hash(block)}, node ${i})`);
          }
          if (block.transactions_hash !== hashString(stringify(block.transactions))) {
            assert.fail(`Transactions or transactions_hash is incorrect for block ${block.hash}`);
          }
          if (block.last_votes_hash !== hashString(stringify(block.last_votes))) {
            assert.fail(`Last votes or last_votes_hash is incorrect for block ${block.hash}`);
          }
        }
      }
    });

    // TODO(platfowner): Uncomment or remove this once find a good solution to flaky test cases.
    /*
    it('not dropping any transations ', async () => {
      let blocks;
      for (let i = 0; i < serverList.length; i++) {
        await sendTransactions(sentOperations);
        await waitForNewBlocks(serverList[i]);
        blocks = parseOrLog(syncRequest(
            'GET', serverList[i] + BLOCKS_ENDPOINT).body.toString('utf-8'))['result'];
        const transactionsOnBlockChain = [];
        blocks.forEach((block) => {
          block.transactions.forEach((transaction) => {
            // TODO(platfowner): Find a better way.
            if (!(JSON.stringify(transaction).includes(PredefinedDbPaths.VOTING_ROUND) ||
                JSON.stringify(transaction).includes(PredefinedDbPaths.RECENT_PROPOSERS) ||
                JSON.stringify(transaction).includes(PredefinedDbPaths.STAKEHOLDER) ||
                JSON.stringify(transaction).includes(PredefinedDbPaths.ACCOUNTS) ||
                JSON.stringify(transaction).includes(PredefinedDbPaths.TRANSFER) ||
                JSON.stringify(transaction).includes(PredefinedDbPaths.DEPOSIT_CONSENSUS))) {
              transactionsOnBlockChain.push(transaction);
            }
          });
        });
        expect(sentOperations.length - NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST)
          .to.equal(transactionsOnBlockChain.length);
        for (let i = 0; i < transactionsOnBlockChain.length; i++) {
          const sentOp = sentOperations[i][1];
          const blockchainOp = transactionsOnBlockChain[i].tx_body.operation;
          if (sentOperations[i][0].toUpperCase() === "BATCH") {
            expect(sentOp.tx_list).to.not.equal(undefined);
            expect(sentOp.tx_list[0].tx_body.operation.type).to.equal(blockchainOp.type);
            expect(sentOp.tx_list[0].tx_body.operation.ref).to.equal(blockchainOp.ref);
            assert.deepEqual(sentOp.tx_list[0].tx_body.operation.value, blockchainOp.value);
          } else {
            expect(sentOperations[i][0].toUpperCase()).to.equal(blockchainOp.type);
            expect(sentOp.ref).to.equal(blockchainOp.ref);
            assert.deepEqual(sentOp.value, blockchainOp.value);
          }
        };
      }
    });
    */
  });

  describe('Database', () => {
    it('rules correctly prevent users from restricted areas', async () => {
      await sendTransactions(sentOperations);
      const body = parseOrLog(syncRequest('POST', server2 + SET_VALUE_ENDPOINT, { json: {
        ref: 'restricted/path', value: 'anything' 
      }}).body.toString('utf-8'));
      expect(body.code).to.equals(1);
    });

    // FIXME(liayoo): This test case is flaky.
    /*
    it('maintaining correct order', async () => {
      for (let i = 1; i < serverList.length; i++) {
        await sendTransactions(sentOperations);
        await waitForNewBlocks(serverList[i]);
        body1 = parseOrLog(syncRequest('GET', server1 + GET_VALUE_ENDPOINT + '?ref=/apps/test')
            .body.toString('utf-8'));
        body2 = parseOrLog(syncRequest('GET', serverList[i] + GET_VALUE_ENDPOINT + '?ref=/apps/test')
            .body.toString('utf-8'));
        assert.deepEqual(body1.result, body2.result);
      }
    });
    */
  });

  describe('Block API', () => {
    it('ain_getBlockHeadersList', async () => {
      await sendTransactions(sentOperations);
      return new Promise((resolve) => {
        jsonRpcClient.request(JSON_RPC_GET_BLOCK_HEADERS,
                              {from: 2, to: 4, protoVer: CURRENT_PROTOCOL_VERSION},
                              function(err, response) {
          if (err) throw err;
          const body = response.result.result;
          assert.deepEqual([2, 3], body.map((blockHeader) => {
            return blockHeader.number;
          }));
          resolve();
        });
      })
    });

    it('ain_getBlockByHash and ain_getBlockByNumber', async () => {
      await sendTransactions(sentOperations);
      return new Promise((resolve) => {
        jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            {number: 2, protoVer: CURRENT_PROTOCOL_VERSION}, function(err, response) {
          if (err) throw err;
          resolve(response.result.result);
        });
      }).then((resultByNumber) => {
        return new Promise((resolve) => {
          jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_HASH,
              {hash: resultByNumber.hash, protoVer: CURRENT_PROTOCOL_VERSION},
                                function(err, response) {
            if (err) throw err;
            const resultByHash = response.result.result;
            assert.deepEqual(resultByHash, resultByNumber);
            resolve();
          });
        });
      })
    });
  });

  describe('Nonces', () => {
    let address, committedNonceAfterBroadcast, pendingNonceAfterBroadcast;

    before(() => {
      address = parseOrLog(syncRequest(
          'GET', server2 + GET_ADDR_ENDPOINT).body.toString('utf-8')).result;
    });

    it('pendingNonceTracker', () => {
      return new Promise((resolve, reject) => {
        let promises = [];
        promises.push(jsonRpcClient.request(JSON_RPC_GET_NONCE,
            { address, protoVer: CURRENT_PROTOCOL_VERSION }));
        promises.push(jsonRpcClient.request(JSON_RPC_GET_NONCE,
            { address, from: 'pending', protoVer: CURRENT_PROTOCOL_VERSION }));
        Promise.all(promises).then(res => {
          promises = [];
          const committedNonceBefore = res[0].result.result;
          const pendingNonceBefore = res[1].result.result;
          const txHash = parseOrLog(syncRequest('POST', server2 + '/' + 'set_value',
                {
                  json: {
                    ref: '/apps/test/nonce_test',
                    value: 'testing...'
                  }
                }).body.toString('utf-8')).result.tx_hash;
          promises.push(jsonRpcClient.request(JSON_RPC_GET_NONCE,
              { address, protoVer: CURRENT_PROTOCOL_VERSION }));
          promises.push(jsonRpcClient.request(JSON_RPC_GET_NONCE,
              { address, from: 'pending', protoVer: CURRENT_PROTOCOL_VERSION }));
          Promise.all(promises).then(async resAfterBroadcast => {
            promises = [];
            committedNonceAfterBroadcast = resAfterBroadcast[0].result.result;
            pendingNonceAfterBroadcast = resAfterBroadcast[1].result.result;
            expect(committedNonceAfterBroadcast).to.equal(committedNonceBefore);
            expect(pendingNonceAfterBroadcast).to.equal(pendingNonceBefore + 1);
            await waitUntilTxFinalized(serverList, txHash);
            resolve();
          })
          .catch((e) => {
            console.log("error:", e);
            reject();
          });
        });
      });
    });

    it('committedNonceTracker', async () => {
      return new Promise(async (resolve, reject) => {
        await waitForNewBlocks(server2);
        let promises = [];
        promises.push(jsonRpcClient.request(JSON_RPC_GET_NONCE,
            { address, protoVer: CURRENT_PROTOCOL_VERSION }));
        promises.push(jsonRpcClient.request(JSON_RPC_GET_NONCE,
            { address, from: 'pending', protoVer: CURRENT_PROTOCOL_VERSION }));
        Promise.all(promises).then(resAfterCommit => {
          const committedNonceAfterCommit = resAfterCommit[0].result.result;
          const pendingNonceAfterCommit = resAfterCommit[1].result.result;
          expect(committedNonceAfterCommit).to.be.at.least(committedNonceAfterBroadcast);
          expect(pendingNonceAfterCommit).to.be.at.least(pendingNonceAfterBroadcast);
          resolve();
        })
        .catch((e) => {
          console.log("error:", e);
          reject();
        });
      });
    });
  });

  describe('Gas fee', () => {
    it('collected gas cost matches the gas_cost_total in the block', () => {
      return new Promise((resolve) => {
        jayson.client.http(serverList[1] + JSON_RPC_ENDPOINT).request
            (JSON_RPC_GET_BLOCKS, {protoVer: CURRENT_PROTOCOL_VERSION}, function(err, response) {
              if (err) throw err;
              const chain = response.result.result;
              for (const block of chain) {
                if (block.number > 0) {
                  // Amount specified in block
                  const gasCostTotal = block.gas_cost_total;
                  // Amount actually collected & distributed. Write rule prevents writing a gas_cost_total
                  // that is different from the value at /service_accounts/gas_fee/gas_fee/${block.number}/balance.
                  const collectedGas = parseOrLog(syncRequest(
                      'GET', server1 + GET_VALUE_ENDPOINT + `?ref=/consensus/number/${block.number}/propose/gas_cost_total`)
                      .body.toString('utf-8')).result;
                  assert.deepEqual(gasCostTotal, collectedGas);
                }
              }
              resolve();
            }
        );
      });
    });
  });

  // NOTE(liayoo): Below test is flaky. Uncomment once the problem is fixed.
  /*
  describe('Restart', () => {
    it('blockchain nodes can be stopped and restarted', async () => {
      SERVER_PROCS[0].kill();
      await CommonUtil.sleep(10000);
      SERVER_PROCS[0].start();
      await CommonUtil.sleep(10000);
      await waitUntilNodeSyncs(server1);
      for (let i = 0; i < 4; i++) {
        await sendTransactions(sentOperations);
      }
      return new Promise((resolve) => {
        jayson.client.http(server1 + JSON_RPC_ENDPOINT)
        .request(JSON_RPC_GET_BLOCKS, {protoVer: CURRENT_PROTOCOL_VERSION},
            function(err, response) {
          if (err) throw err;
          stoppedChain = response.result.result;
          resolve();
        });
      }).then(() => {
        return new Promise((resolve) => {
          jayson.client.http(serverList[1] + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS,
              {protoVer: CURRENT_PROTOCOL_VERSION},
              function(err, response) {
                if (err) throw err;
                const baseChain = response.result.result;
                const diff = Math.abs(stoppedChain.length - baseChain.length);
                assert.isBelow(diff, MAX_CHAIN_LENGTH_DIFF);
                while (stoppedChain.length !== baseChain.length) {
                  if (stoppedChain.length > baseChain.length) {
                    stoppedChain.pop();
                  } else  {
                    baseChain.pop();
                  }
                }
                assert.deepEqual(stoppedChain.length, baseChain.length);
                assert.deepEqual(stoppedChain, baseChain);
                resolve();
              });
        });
      });
    });
  });
*/

  describe('Protocol versions', () => {
    it('accepts API calls with correct protoVer', () => {
      return new Promise((resolve, reject) => {
        jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
          { number: 0, protoVer: CURRENT_PROTOCOL_VERSION }, function (err, response) {
            if (err) throw err;
            expect(response.result.result.number).to.equal(0);
            expect(response.result.protoVer).to.equal(CURRENT_PROTOCOL_VERSION);
            resolve();
          });
      });
    });

    it('rejects API calls with incorrect protoVer', async () => {
      return new Promise((resolve, reject) => {
        let promises = [];
        promises.push(jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            { number: 0, protoVer: 'a.b.c' }));
        promises.push(jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            { number: 0, protoVer: '0.01.0' }));
        promises.push(jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            { number: 0, protoVer: 'v0.1' }));
        promises.push(jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            { number: 0, protoVer: '0.1.0' }));
        Promise.all(promises).then(res => {
          expect(res[0].code).to.equal(1);
          expect(res[0].message).to.equal("Invalid protocol version.");
          expect(res[1].code).to.equal(1);
          expect(res[1].message).to.equal("Invalid protocol version.");
          expect(res[2].code).to.equal(1);
          expect(res[2].message).to.equal("Incompatible protocol version.");
          expect(res[3].code).to.equal(1);
          expect(res[3].message).to.equal("Incompatible protocol version.");
          resolve();
        })
      });
    });

    it('rejects API calls with no protoVer', () => {
      return new Promise((resolve, reject) => {
        jsonRpcClient.request(
          JSON_RPC_GET_BLOCK_BY_NUMBER,
          { number: 0 },
          function (err, response) {
            if (err) throw err;
            expect(response.code).to.equal(1);
            expect(response.message).to.equal("Protocol version not specified.");
            resolve();
          }
        );
      });
    });
  });
});
