const _ = require('lodash');
const chai = require('chai');
const assert = chai.assert;
const spawn = require('child_process').spawn;
const rimraf = require('rimraf');
const jayson = require('jayson/promise');
const PROJECT_ROOT = require('path').dirname(__filename) + '/../';
const TRACKER_SERVER = PROJECT_ROOT + 'tracker-server/index.js';
const APP_SERVER = PROJECT_ROOT + 'client/index.js';
const sleep = require('system-sleep');
const expect = chai.expect;
// eslint-disable-next-line no-unused-vars
const path = require('path');
const syncRequest = require('sync-request');
const itParam = require('mocha-param');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const Blockchain = require('../blockchain');
const DB = require('../db');
const TransactionPool = require('../tx-pool');
const { BLOCKCHAINS_DIR, PredefinedDbPaths, TransactionStatus } = require('../constants');
const { ConsensusConsts } = require('../consensus/constants');
const { waitUntilTxFinalized } = require('../unittest/test-util');
const NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST = 5;
const MAX_PROMISE_STACK_DEPTH = 10;
const MAX_CHAIN_LENGTH_DIFF = 5;
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;
const { waitForNewBlocks, waitUntilNodeSyncs } = require('../unittest/test-util');

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

// Server configurations
const trackerServer = 'http://localhost:5000';
const server1 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[0].ACCOUNT_INDEX))
const server2 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[1].ACCOUNT_INDEX))
const server3 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[2].ACCOUNT_INDEX))
const server4 = 'http://localhost:' + String(8081 + Number(ENV_VARIABLES[3].ACCOUNT_INDEX))
const SERVERS = [server1, server2, server3, server4];

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
  ['set_value', {ref: 'test/comeonnnnnnn', value: 'testme'}],
  ['set_value', {ref: 'test/comeonnnnnnn', value: 'no meeeee'}],
  ['set_value', {ref: 'test/comeon/nnnnnn', value: 'through'}],
  ['set_value', {ref: 'test/comeonnnnnnn/new', value: {'new': 'path'}}],
  ['set_value', {ref: 'test/builed/some/deep', value: {'place': {'next': 1, 'level': 'down'}}}],
  ['set_value', {ref: 'test/b/u/i/l/e/d/hel', value: 'very nested'}],
  ['set_value', {ref: 'test/b/u/i/l/e/d/hel', value: {1: 2, 3: 4, 5: 6}}],
  ['set_value', {ref: 'test/new/final/path', value: {'more': {'now': 12, 'hellloooo': 123}}}],
  ['inc_value', {ref: 'test/balance/user1', value: 10}],
  ['inc_value', {ref: 'test/balance/user1', value: 20}],
  ['inc_value', {ref: 'test/balance/user2', value: 1}],
  ['inc_value', {ref: 'test/balance/user2', value: 1}],
  ['dec_value', {ref: 'test/balance/user1', value: 10000}],
  ['dec_value', {ref: 'test/balance/user1', value: 10000}],
  ['dec_value', {ref: 'test/balance/user2', value: 100002}],
  ['set_rule', {ref: 'test/test_rule/', value: { ".write": "some rule config"}}],
  ['set_function', {ref: 'test/test_function/', value: { ".function": "some function config"}}],
  ['set_owner', {ref: 'test/test_owner/', value: {
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
  ['set', {op_list: [{ref: 'test/increase/first/level', value: 10},
      {ref: 'test/increase/first/level2', value: 20}]}],
  ['set', {op_list: [{ref: 'test/increase/second/level/deeper', value: 20},
      {ref: 'test/increase/second/level/deeper', value: 1000}]}],
  ['set', {op_list: [{ref: 'test/increase', value: 1}]}],
  ['set', {op_list: [{ref: 'test/new', value: 1}]}],
  ['set', {op_list: [{ref: 'test/increase', value: 10000}]}],
  ['set', {op_list: [{ref: 'test/b/u', value: 10000}]}],
  ['set', {op_list: [{ref: 'test/builed/some/deep/place/next', value: 100002}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/comeonnnnnnn',
      value: 'no meeeee'}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/comeon/nnnnnn',
      value: 'through'}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/comeonnnnnnn/new',
      value: {'new': 'path'}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/builed/some/deep',
      value: {'place': {'next': 1, 'level': 'down'}}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/b/u/i/l/e/d/hel',
      value: {'range': [1, 4, 5], 'another': [234]}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/b/u/i/l/e/d/hel',
      value: 'very nested'}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/b/u/i/l/e/d/hel',
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

// Wait until there are two blocks of multiple validators.
function waitUntilNodeStakes() {
  let count = 0;
  let blocksAfterStaking = 0;
  let validators = {};
  while (count <= MAX_PROMISE_STACK_DEPTH && blocksAfterStaking < 2) {
    const block = JSON.parse(syncRequest('POST', server1 + '/json-rpc',
        {json: {jsonrpc: '2.0', method: JSON_RPC_GET_RECENT_BLOCK, id: 0,
                params: {protoVer: CURRENT_PROTOCOL_VERSION}}})
        .body.toString('utf-8')).result.result;
    validators = block.validators;
    if (Object.keys(validators).length >= 2) {
      blocksAfterStaking++;
    }
    count++;
    sleep(6000);
  }
}

function sendTransactions(sentOperations) {
  for (let i = 0; i < NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST; i++) {
    const randomOperation =
        RANDOM_OPERATION[Math.floor(Math.random() * RANDOM_OPERATION.length)];
    sentOperations.push(randomOperation);
    const serverIndex = Math.floor(Math.random() * SERVERS.length);
    syncRequest('POST', SERVERS[serverIndex] + '/' + randomOperation[0],
                {json: randomOperation[1]});
    sleep(200);
  }
}

describe('Blockchain', () => {
  let trackerProc;
  let numNewBlocks = 0;
  let numBlocksOnStartup;
  let jsonRpcClient;
  const sentOperations = [];
  const nodeAddressList = [];

  before(() => {
    rimraf.sync(BLOCKCHAINS_DIR);

    const promises = [];
    // Start up all servers
    trackerProc = new Process(TRACKER_SERVER, {});
    trackerProc.start(false);
    sleep(2000);
    for (let i = 0; i < SERVER_PROCS.length; i++) {
      const proc = SERVER_PROCS[i];
      proc.start();
      sleep(2000);
      const address =
          JSON.parse(syncRequest('GET', SERVERS[i] + '/get_address').body.toString('utf-8')).result;
      nodeAddressList.push(address);
    };
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
    return Promise.all(promises);
  });

  after(() => {
    // Teardown all servers
    for (let i = 0; i < SERVER_PROCS.length; i++) {
      SERVER_PROCS[i].kill();
    }
    trackerProc.kill();

    rimraf.sync(BLOCKCHAINS_DIR);
  });

  describe(`Synchronization`, () => {
    it('syncs across all blockchain nodes', () => {
      for (let i = 1; i < SERVERS.length; i++) {
        sendTransactions(sentOperations);
        waitForNewBlocks(SERVERS[i]);
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
            jayson.client.http(SERVERS[i] + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS,
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

    // TODO(seo): Uncomment this. It's flaky.
    /*
    it('syncs new peers on startup', () => {
      sendTransactions(sentOperations);
      waitForNewBlocks(server1);
      let baseChain;
      let number;
      const accountIndex = 4;
      const newServer = 'http://localhost:' + String(8081 + Number(accountIndex))
      const newServerProc = new Process(APP_SERVER, {
        ACCOUNT_INDEX: accountIndex, HOSTING_ENV: 'local', DEBUG: true,
        ADDITIONAL_OWNERS: 'test:./test/data/owners_for_testing.json',
        ADDITIONAL_RULES: 'test:./test/data/rules_for_testing.json'
      });
      newServerProc.start();
      sleep(2000);
      waitForNewBlocks(newServer);
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
   
    // TODO(seo): Uncomment this. It's flaky.
    /*
    it('all having correct number of blocks', () => {
      expect(numNewBlocks + numBlocksOnStartup).to.equal(baseChain.pop().number);
    });
    */
  });

  describe('Block validity', () => {
    it('blocks have correct validators and voting data', () => {
      for (let i = 0; i < SERVERS.length; i++) {
        sendTransactions(sentOperations);
        waitForNewBlocks(server1);
        const blocks = JSON.parse(syncRequest('POST', SERVERS[i] + '/json-rpc',
            {json: {jsonrpc: '2.0', method: JSON_RPC_GET_BLOCKS, id: 0,
                    params: {protoVer: CURRENT_PROTOCOL_VERSION}}})
            .body.toString('utf-8')).result.result;
        const len = blocks.length;
        for (let j = 2; j < len; j++) { // voting starts with block#1 (included in block#2's last_votes)
          let voteSum = 0;
          const validators = Object.assign({}, blocks[j - 1].validators);
          let totalStakedAmount = Object.values(validators).reduce((a, b) => { return a + b; }, 0);
          let majority = Math.floor(totalStakedAmount * ConsensusConsts.MAJORITY);
          for (let k = 0; k < blocks[j].last_votes.length; k++) {
            const vote = blocks[j].last_votes[k];
            if (!blocks[j - 1].validators[vote.address]) {
              assert.fail(`Invalid validator (${vote.address}) is validating block ${blocks[j - 1]}`);
            }
            if (vote.operation.value.block_hash !== blocks[j - 1].hash) {
              assert.fail('Invalid vote included in last_votes');
            }
            if (vote.operation.type === 'SET_VALUE' && vote.operation.value.stake &&
                blocks[j - 1].validators[vote.address]) {
              voteSum += vote.operation.value.stake;
            }
          }
          if (voteSum < majority) {
            assert.fail(`Insufficient votes received (${voteSum} / ${majority})`);
          }
        }
      }
    });

    it('blocks have valid hashes', () => {
      const hashString = (str) => {
        return '0x' + ainUtil.hashMessage(str).toString('hex');
      }
      const hashBlock = (block) => {
        return hashString(stringify({
          last_hash: block.last_hash,
          last_votes_hash: block.last_votes_hash,
          transactions_hash: block.transactions_hash,
          number: block.number,
          epoch: block.epoch,
          stateProofHash: block.stateProofHash,
          timestamp: block.timestamp,
          proposer: block.proposer,
          validators: block.validators,
          size: block.size
        }));
      }
      for (let i = 0; i < SERVERS.length; i++) {
        sendTransactions(sentOperations);
        waitForNewBlocks(server1);
        const blocks = JSON.parse(syncRequest('POST', SERVERS[i] + '/json-rpc',
            {json: {jsonrpc: '2.0', method: JSON_RPC_GET_BLOCKS, id: 0,
                    params: {protoVer: CURRENT_PROTOCOL_VERSION}}})
            .body.toString('utf-8')).result.result;
        const len = blocks.length;
        for (let j = 0; j < len; j++) {
          const block = blocks[j];
          if (block.hash !== hashBlock(block)) {
            assert.fail(`Block hash is incorrect for block ${JSON.stringify(block, null, 2)}` +
                        `\n(hash: ${hashBlock(block)}, node ${i})`);
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

    // TODO(seo): Uncomment or remove this once find a good solution to flaky test cases.
    /*
    it('not dropping any transations ', () => {
      let blocks;
      for (let i = 0; i < SERVERS.length; i++) {
        sendTransactions(sentOperations);
        waitForNewBlocks(SERVERS[i]);
        blocks = JSON.parse(syncRequest(
            'GET', SERVERS[i] + BLOCKS_ENDPOINT).body.toString('utf-8'))['result'];
        const transactionsOnBlockChain = [];
        blocks.forEach((block) => {
          block.transactions.forEach((transaction) => {
            // TODO(seo): Find a better way.
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
          const blockchainOp = transactionsOnBlockChain[i].operation;
          if (sentOperations[i][0].toUpperCase() === "BATCH") {
            expect(sentOp.tx_list).to.not.equal(undefined);
            expect(sentOp.tx_list[0].operation.type).to.equal(blockchainOp.type);
            expect(sentOp.tx_list[0].operation.ref).to.equal(blockchainOp.ref);
            assert.deepEqual(sentOp.tx_list[0].operation.value, blockchainOp.value);
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
    it('rules correctly prevent users from restricted areas', () => {
      sendTransactions(sentOperations);
      waitForNewBlocks(server1);
      const body = JSON.parse(syncRequest('POST', server2 + SET_VALUE_ENDPOINT, { json: {
        ref: 'restricted/path', value: 'anything', is_nonced_transaction: false
      }}).body.toString('utf-8'));
      expect(body.code).to.equals(1);
    });

    // FIXME(lia): this test case is flaky.
    /*
    it('maintaining correct order', () => {
      for (let i = 1; i < SERVERS.length; i++) {
        sendTransactions(sentOperations);
        waitForNewBlocks(SERVERS[i]);
        body1 = JSON.parse(syncRequest('GET', server1 + GET_VALUE_ENDPOINT + '?ref=test')
            .body.toString('utf-8'));
        body2 = JSON.parse(syncRequest('GET', SERVERS[i] + GET_VALUE_ENDPOINT + '?ref=test')
            .body.toString('utf-8'));
        assert.deepEqual(body1.result, body2.result);
      }
    });
    */
  });

  describe('Block APIs', () => {
    let db;

    before(() => {
      address = JSON.parse(syncRequest('GET', server2 + GET_ADDR_ENDPOINT).body.toString('utf-8')).result;
    });

    beforeEach(() =>{
      rimraf.sync(path.join(BLOCKCHAINS_DIR, 'test-integration'));
      db = new DB(null, null, false, 0);
      sentOperations.forEach((op) => {
        const operation = Object.assign({}, {type: op[0].toUpperCase()}, op[1]);
        db.executeTransaction({ operation });
      });
    });

    it('ain_getBlockHeadersList', () => {
      sendTransactions(sentOperations);
      waitForNewBlocks(server1);
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

    it('ain_getBlockByHash and ain_getBlockByNumber', () => {
      sendTransactions(sentOperations);
      waitForNewBlocks(server1);
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
      address = JSON.parse(syncRequest('GET', server2 + GET_ADDR_ENDPOINT).body.toString('utf-8')).result;
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
          syncRequest('POST', server2 + '/' + 'set_value',
                {
                  json: {
                    ref: '/test/nonce_test',
                    value: 'testing...'
                  }
                });
          promises.push(jsonRpcClient.request(JSON_RPC_GET_NONCE,
            { address, protoVer: CURRENT_PROTOCOL_VERSION }));
          promises.push(jsonRpcClient.request(JSON_RPC_GET_NONCE,
              { address, from: 'pending', protoVer: CURRENT_PROTOCOL_VERSION }));
          Promise.all(promises).then(resAfterBroadcast => {
            promises = [];
            committedNonceAfterBroadcast = resAfterBroadcast[0].result.result;
            pendingNonceAfterBroadcast = resAfterBroadcast[1].result.result;
            expect(committedNonceAfterBroadcast).to.equal(committedNonceBefore);
            expect(pendingNonceAfterBroadcast).to.equal(pendingNonceBefore + 1);
            resolve();
          });
        });
      });
    });

    it('committedNonceTracker', () => {
      return new Promise((resolve, reject) => {
        waitForNewBlocks(server1);
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
        });
      });
    });
  });

  describe('Restart', () => {
    it('blockchain nodes can be stopped and restarted', () => {
      SERVER_PROCS[0].kill();
      sleep(10000);
      SERVER_PROCS[0].start();
      sleep(10000);
      waitUntilNodeSyncs(server1);
      for (let i = 0; i < 4; i++) {
        sendTransactions(sentOperations);
        waitForNewBlocks(server1);
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
          jayson.client.http(SERVERS[1] + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS,
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

  describe('Protocol versions', () => {
    it('accepts API calls with correct protoVer', () => {
      return new Promise((resolve, reject) => {
        jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            {number: 0, protoVer: CURRENT_PROTOCOL_VERSION}, function(err, response) {
          if (err) throw err;
          expect(response.result.result.number).to.equal(0);
          expect(response.result.protoVer).to.equal(CURRENT_PROTOCOL_VERSION);
          resolve();
        });
      });
    });

    it('rejects API calls with incorrect protoVer', () => {
      return new Promise((resolve, reject) => {
        let promises = [];
        promises.push(jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            {number: 0, protoVer: 'a.b.c'}));
        promises.push(jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            {number: 0, protoVer: '0.01.0'}));
        promises.push(jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            {number: 0, protoVer: 'v0.1'}));
        promises.push(jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER,
            {number: 0, protoVer: '0.1.0'}));
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
            {number: 0},
            function(err, response) {
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
