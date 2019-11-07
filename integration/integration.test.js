const chai = require('chai');
const assert = chai.assert;
const spawn = require('child_process').spawn;
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
const TransactionPool = require('../db/transaction-pool');
const { BLOCKCHAINS_DIR, PredefinedDbPaths } = require('../constants');
const rimraf = require('rimraf');
const jayson = require('jayson');
const NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST = 5;
const MAX_PROMISE_STACK_DEPTH = 10;

const ENV_VARIABLES = [
  {
    PRIVATE_KEY: '61a24a6825e6431e46976dc82e630906b67e732dc1a3921a95c8bb74e30ae5f',
    P2P_PORT: 5001, PORT: 9091, LOG: true, STAKE: 250, LOCAL: true, DEBUG: true,
    GENESIS_OWNERS: './test/data/genesis_owners_test.json',
    GENESIS_RULES: './test/data/genesis_rules_test.json'
  },
  {
    PRIVATE_KEY: 'dd9b37f3e5b4db03dd90b37f1bff8ffc7b1d92e4b70edeef7ae1b12ac7766b5d',
    P2P_PORT: 5002, PORT: 9092, LOG: true, STAKE: 250, LOCAL: true, DEBUG: true,
    GENESIS_OWNERS: './test/data/genesis_owners_test.json',
    GENESIS_RULES: './test/data/genesis_rules_test.json'
  },
  {
    PRIVATE_KEY: 'b527c57ae72e772b4b4e418a95e51cba0ba9ad70850289783235135b86cb7dc6',
    P2P_PORT: 5003, PORT: 9093, LOG: true, STAKE: 250, LOCAL: true, DEBUG: true,
    GENESIS_OWNERS: './test/data/genesis_owners_test.json',
    GENESIS_RULES: './test/data/genesis_rules_test.json'
  },
  {
    PRIVATE_KEY: '31554fb0a188777cc434bca4f982a4cfe76c242376c5e70cb2619156eac9d764',
    P2P_PORT: 5004, PORT: 9094, LOG: true, STAKE: 250, LOCAL: true, DEBUG: true,
    GENESIS_OWNERS: './test/data/genesis_owners_test.json',
    GENESIS_RULES: './test/data/genesis_rules_test.json'
  },
];

// Server configurations
const trackerServer = 'http://localhost:5000';
const server1 = 'http://localhost:' + ENV_VARIABLES[0].PORT
const server2 = 'http://localhost:' + ENV_VARIABLES[1].PORT
const server3 = 'http://localhost:' + ENV_VARIABLES[2].PORT
const server4 = 'http://localhost:' + ENV_VARIABLES[3].PORT
const SERVERS = [server1, server2, server3, server4];

const JSON_RPC_ENDPOINT = '/json-rpc';
const JSON_RPC_GET_RECENT_BLOCK = 'ain_getRecentBlock';
const JSON_RPC_GET_BLOCKS = 'ain_getBlockList';
const JSON_RPC_GET_BLOCK_HEADERS = 'ain_getBlockHeadersList';
const JSON_RPC_GET_PEER_PUBLIC_KEYS = 'getPeerPublicKeys';
const JSON_RPC_GET_BLOCK_BY_HASH = 'ain_getBlockByHash';
const JSON_RPC_GET_BLOCK_BY_NUMBER = 'ain_getBlockByNumber';

const setEndpoint = '/set_value';
const getEndpoint = '/get_value'

// Data options
RANDOM_OPERATION = [
  ['set_value', {ref: 'test/comeonnnnnnn', value: 'testme'}],
  ['set_value', {ref: 'test/comeonnnnnnn', value: 'no meeeee'}],
  ['set_value', {ref: 'test/comeon/nnnnnn', value: 'through'}],
  ['set_value', {ref: 'test/comeonnnnnnn/new', value: {'new': 'path'}}],
  ['set_value', {ref: 'test/builed/some/deep', value: {'place': {'next': 1, 'level': 'down'}}}],
  ['set_value', {ref: 'test/builed/heliii', value: {'range': [1, 2, 3, 1, 4, 5]}}],
  ['set_value', {ref: 'test/b/u/i/l/e/d/hel', value: {'range': [1, 4, 5], 'another': [234]}}],
  ['set_value', {ref: 'test/b/u/i/l/e/d/hel', value: 'very nested'}],
  ['set_value', {ref: 'test/b/u/i/l/e/d/hel', value: {1: 2, 3: 4, 5: 6}}],
  ['set_value', {ref: 'test/new/final/path', value: {'neste': [1, 2, 3, 4, 5]}}],
  ['set_value', {ref: 'test/new/final/path', value: {'more': {'now': 12, 'hellloooo': 123}}}],
  ['inc_value', {ref: 'test/balance/user1', value: 10}],
  ['inc_value', {ref: 'test/balance/user1', value: 20}],
  ['inc_value', {ref: 'test/balance/user2', value: 1}],
  ['inc_value', {ref: 'test/balance/user2', value: 1}],
  ['dec_value', {ref: 'test/balance/user1', value: 10000}],
  ['dec_value', {ref: 'test/balance/user1', value: 10000}],
  ['dec_value', {ref: 'test/balance/user2', value: 100002}],
  ['set', {op_list: [{ref: 'test/increase/first/level', value: 10},
      {ref: 'test/increase/first/level2', value: 20}]}],
  ['set', {op_list: [{ref: 'test/increase/second/level/deeper', value: 20},
      {ref: 'test/increase/second/level/deeper', value: 1000}]}],
  ['set', {op_list: [{ref: 'test/increase', value: 1}]}],
  ['set', {op_list: [{ref: 'test/new', value: 1}]}],
  ['set', {op_list: [{ref: 'test/increase', value: 10000}]}],
  ['set', {op_list: [{ref: 'test/b/u', value: 10000}]}],
  ['set', {op_list: [{ref: 'test/builed/some/deep/place/next', value: 100002}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/comeonnnnnnn', value: 'testme'}},
      {operation: {type: 'INC_VALUE', ref: 'test/b/u', value: 10000}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/comeonnnnnnn',
      value: 'no meeeee'}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/comeon/nnnnnn',
      value: 'through'}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/comeonnnnnnn/new',
      value: {'new': 'path'}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/builed/some/deep',
      value: {'place': {'next': 1, 'level': 'down'}}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/builed/heliii',
      value: {'range': [1, 2, 3, 1, 4, 5]}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/b/u/i/l/e/d/hel',
      value: {'range': [1, 4, 5], 'another': [234]}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/b/u/i/l/e/d/hel',
      value: 'very nested'}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/b/u/i/l/e/d/hel',
      value: {1: 2, 3: 4, 5: 6}}}]}],
  ['batch', {tx_list: [{operation: {type: 'SET_VALUE', ref: 'test/new/final/path',
      value: {'neste': [1, 2, 3, 4, 5]}}}]}],
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
    const result = JSON.parse(syncRequest('POST', server1 + '/json-rpc',
        {json: {jsonrpc: '2.0', method: 'ain_getRecentBlock', id: 0}})
        .body.toString('utf-8')).result;
    validators = result.validators;
    if (Object.keys(validators).length >= 2) {
      blocksAfterStaking++;
    }
    count++;
    sleep(6000);
  }
}

function waitUntilNewBlock(jsonRpcClient, numBlocks, stackDepth) {
  return new Promise((resolve) => {
    jsonRpcClient.request(JSON_RPC_GET_RECENT_BLOCK, {}, function(err, response) {
      if (err) throw err;
      currentNumber = response.result.number;
      resolve(currentNumber - numBlocks);
    });
  }).then((numCreatedBlocks) => {
    if (numCreatedBlocks > 0) {
      console.log(`${numCreatedBlocks} new block(s) created`)
      return numCreatedBlocks;
    } else if (stackDepth >= MAX_PROMISE_STACK_DEPTH) {
      console.log(`Reached maximum promise stack depth: ${stackDepth}`)
      return numCreatedBlocks;
    } else {
      sleep(2000);
      return waitUntilNewBlock(jsonRpcClient, numBlocks, stackDepth + 1);
    }
  });
}

describe('Integration Tests', () => {
  let trackerProc;
  let numNewBlocks = 0;
  let numBlocks;
  let numBlocksOnStartup;
  let jsonRpcClient;
  let trackerRpcClient;
  const sentOperations = [];
  const publicKeys = [];

  before(() => {
    console.log('Removing stored blockchain data...');
    rimraf.sync(BLOCKCHAINS_DIR);
    const promises = [];
    // Start up all servers
    // const trackerProc = spawn('node', [TRACKER_SERVER]);
    trackerProc = new Process(TRACKER_SERVER, {});
    console.log('Starting tracker server...');
    trackerProc.start(true);
    trackerRpcClient = jayson.client.http(trackerServer + JSON_RPC_ENDPOINT);
    sleep(2000);
    for (let i = 0; i < SERVER_PROCS.length; i++) {
      proc = SERVER_PROCS[i];
      console.log(`Starting server[${i}]...`);
      proc.start();
      sleep(2000);
      promises.push(new Promise((resolve) => {
        trackerRpcClient.request(JSON_RPC_GET_PEER_PUBLIC_KEYS, [], function(err, response) {
          if (err) throw err;
          // The newest element in this list will be the publicKey of the server just started
          publicKeys.push(response.result.pop());
          resolve();
        });
      }));
    };
    sleep(20000);
    jsonRpcClient = jayson.client.http(server2 + JSON_RPC_ENDPOINT);
    promises.push(new Promise((resolve) => {
      jsonRpcClient.request(JSON_RPC_GET_RECENT_BLOCK, {}, function(err, response) {
        if (err) throw err;
        numBlocksOnStartup = response.result.number;
        resolve();
      });
    }));
    return Promise.all(promises);
  });

  after(() => {
    // Teardown all servers
    for (let i = 0; i < SERVER_PROCS.length; i++) {
      console.log(`Shutting down server[${i}]...`);
      SERVER_PROCS[i].kill();
    }
    console.log('Shutting down tracker server...');
    trackerProc.kill();
    console.log('Removing stored blockchain data...');
    rimraf.sync(BLOCKCHAINS_DIR);
  });

  describe(`blockchain database mining/forging`, () => {
    beforeEach(() => {
      for (let i = 0; i < NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST; i++) {
        const randomOperation =
            RANDOM_OPERATION[Math.floor(Math.random() * RANDOM_OPERATION.length)];
        sentOperations.push(randomOperation);
        const serverIndex = Math.floor(Math.random() * SERVERS.length);
        syncRequest('POST', SERVERS[serverIndex] + '/' + randomOperation[0],
                    {json: randomOperation[1]});
        sleep(200);
      }
      return new Promise((resolve) => {
        jsonRpcClient.request(JSON_RPC_GET_RECENT_BLOCK, {}, function(err, response) {
          if (err) throw err;
          numBlocks = response.result.number;
          currentNumber = numBlocks;
          resolve();
        });
      // TODO(seo): Uncomment or remove this once find a good solution to flaky test cases.
      /*
      }).then(() => {
        return waitUntilNewBlock(jsonRpcClient, numBlocks, 1);
      }).then((numCreatedBlocks) => {
        numNewBlocks += numCreatedBlocks;
        return true;
      */
      });
    });

    it('syncs accross all peers after mine', () => {
      const baseValues = JSON.parse(syncRequest('GET', server1 + getEndpoint + '?ref=/')
      .body.toString('utf-8'));
      for (let i = 1; i < SERVERS.length; i++) {
        const values = JSON.parse(syncRequest('GET', SERVERS[i] + getEndpoint + '?ref=/')
        .body.toString('utf-8'));
        assert.deepEqual(values, baseValues)
      }
    });

    // TODO(seo): Uncomment this test case. (see
    // https://www.notion.so/comcom/438194a854554dee9532678d2ee3a2f2?v=a17b78ac99684b72b158deba529f66e0&p=5f4246fb8ec24813978e7145d00ae217)
    /*
    it('will sync to new peers on startup', () => {
      let baseChain;
      let number;
      const newServer = 'http://localhost:9095';
      const newServerProc = new Process(APP_SERVER, {P2P_PORT: 5005, PORT: 9095, LOG: true,
                                        STAKE: 250, LOCAL: true, DEBUG: true});
      newServerProc.start();
      sleep(5000);
      return new Promise((resolve) => {
        jayson.client.http(server1 + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS, {},
            function(err, response) {
          if (err) throw err;
          baseChain = response.result;
          number = baseChain[baseChain.length - 1].number;
          resolve();
        });
      }).then(() => {
        return new Promise((resolve) => {
          jayson.client.http(newServer + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS,
              {to: number + 1}, function(err, response) {
            if (err) throw err;
            const newChain = response.result;
            assert.deepEqual(baseChain.length, newChain.length);
            assert.deepEqual(baseChain, newChain);
            newServerProc.kill();
            resolve();
          });
        });
      });
    });
    */

    describe('leads to blockchains', () => {
      let baseChain;

      before(() => {
        waitUntilNodeStakes();
      })

      beforeEach(() => {
        return new Promise((resolve) => {
          jsonRpcClient.request(JSON_RPC_GET_BLOCKS, {}, function(err, response) {
            if (err) throw err;
            baseChain = response.result;
            resolve();
          });
        });
      });

      // TODO(seo): Uncomment this test case. (see
      // https://www.notion.so/comcom/438194a854554dee9532678d2ee3a2f2?v=a17b78ac99684b72b158deba529f66e0&p=5f4246fb8ec24813978e7145d00ae217)
      /*
      itParam('syncing across all chains', SERVERS, function(server) {
        let newChain;
        const number = baseChain[baseChain.length - 1].number;
        return new Promise((resolve) => {
          jayson.client.http(server + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS,
              {to: number + 1}, function(err, response) {
            if (err) throw err;
            newChain = response.result;
            assert.deepEqual(baseChain, newChain);
            resolve();
          });
        });
      });
      */

      it('blocks have correct validators and voting data', () => {
        let threshold = 0.6666; // TODO (lia): define this as a constant in genesis.
        for (let i = 0; i < SERVERS.length; i++) {
          const blocks = JSON.parse(syncRequest('POST', SERVERS[i] + '/json-rpc',
              {json: {jsonrpc: '2.0', method: JSON_RPC_GET_BLOCKS, id: 0, params: {}}})
              .body.toString('utf-8')).result;
          const len = blocks.length;
          // The genesis and the following blocks are exceptions
          // (validators and next_round_validators are set 'arbitrarily')
          for (let j = 2; j < len; j++) {
            let preVotes = 0;
            let preCommits = 0;
            const validatorsMinusProposer = Object.assign({}, blocks[j - 1].validators);
            delete validatorsMinusProposer[blocks[j - 1].proposer];
            let totalStakedAmount = Object.values(validatorsMinusProposer)
                .reduce((a, b) => { return a + b; }, 0);
            let majority = Math.floor(totalStakedAmount * threshold);
            for (let k = 0; k < blocks[j].last_votes.length; k++) {
              const last_vote = blocks[j].last_votes[k];
              // if (blocks[j - 1].validators.indexOf(vote.address) < 0) {
              if (!blocks[j - 1].validators[last_vote.address]) {
                assert.fail(`Invalid validator is validating block ${last_vote.address}`);
              }
              if (last_vote.operation.ref === PredefinedDbPaths.VOTING_ROUND_BLOCK_HASH) {
                continue;
              } else if (last_vote.operation.ref === PredefinedDbPaths.VOTING_ROUND_PRE_VOTES) {
                preVotes += last_vote.operation.value;
              } else if (preVotes <= majority) {
                // TODO (lia): fix this issue. sometimes it fails this check.
                assert.fail('PreCommits were made before PreVotes reached threshold');
              } else {
                preCommits += last_vote.operation.value;
              }
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
            timestamp: block.timestamp,
            proposer: block.proposer,
            validators: block.validators,
            size: block.size
          }));
        }
        for (let i = 0; i < SERVERS.length; i++) {
          const blocks = JSON.parse(syncRequest('POST', SERVERS[i] + '/json-rpc',
              {json: {jsonrpc: '2.0', method: JSON_RPC_GET_BLOCKS, id: 0, params: {}}})
              .body.toString('utf-8')).result;
          const len = blocks.length;
          for (let j = 0; j < len; j++) {
            const block = blocks[j];
            if (block.hash !== hashBlock(block)) {
              assert.fail(`Block hash is incorrect for  block ${block.hash}`);
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

      // TODO(seo): Uncomment this. It's flacky.
      /*
      it('all having correct number of blocks', () => {
        expect(numNewBlocks + numBlocksOnStartup).to.equal(baseChain.pop().number);
      });
      */
    });

    describe('and rules', () => {
      it('prevent users from restructed areas', () => {
        const result = syncRequest('POST', server2 + setEndpoint,
            {json: {ref: 'restricted/path', value: 'anything', is_nonced_transaction: false}});
        expect(result.statusCode).to.equal(401);
      });
    });

    describe('and built in functions', () => {
      beforeEach(() => {
        syncRequest('POST', server1 + setEndpoint,
            {json: {ref: `/accounts/${publicKeys[0]}/balance`, value: 100}});
        syncRequest('POST', server2 + setEndpoint,
            {json: {ref: `/accounts/${publicKeys[1]}/balance`, value: 0}});
        sleep(200);
      });

      it('facilitate transfer between accounts', () => {
        syncRequest('POST', server1 + setEndpoint,
            {json: {ref: `/transfer/${publicKeys[0]}/${publicKeys[1]}/1/value`, value: 10}});
        sleep(500);
        const balance1 = JSON.parse(syncRequest('GET',
            server3 + getEndpoint + `?ref=/accounts/${publicKeys[0]}/balance`)
            .body.toString('utf-8')).result;
        const balance2 = JSON.parse(syncRequest('GET',
            server3 + getEndpoint + `?ref=/accounts/${publicKeys[1]}/balance`)
            .body.toString('utf-8')).result;
        expect(balance1).to.equal(90);
        expect(balance2).to.equal(10);
      });
    });

    describe('leads to blockchains', () => {
      let db; let body;

      beforeEach(() =>{
        rimraf.sync(path.join(BLOCKCHAINS_DIR, 'test-integration'));
        db = DB.getDatabase(new Blockchain('test-integration'), new TransactionPool());
        sentOperations.forEach((op) => {
          const operation = Object.assign({}, {type: op[0].toUpperCase()}, op[1]);
          db.executeTransaction({ operation });
        });
      });

      it('can be queried by index ', () => {
        return new Promise((resolve) => {
          jsonRpcClient.request(JSON_RPC_GET_BLOCK_HEADERS,
                                {from: 2, to: 4}, function(err, response) {
            if (err) throw err;
            body = response.result;
            assert.deepEqual([2, 3], body.map((blockHeader) => {
              return blockHeader.number;
            }));
            resolve();
          });
        })
      });

      it('can be queried by hash ', () => {
        return new Promise((resolve) => {
          jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_NUMBER, {number: 2}, function(err, response) {
            if (err) throw err;
            resolve(response.result);
          });
        }).then((resultByNumber) => {
          return new Promise((resolve) => {
            jsonRpcClient.request(JSON_RPC_GET_BLOCK_BY_HASH, {hash: resultByNumber.hash},
                                  function(err, response) {
              if (err) throw err;
              const resultByHash = response.result;
              assert.deepEqual(resultByHash, resultByNumber);
              resolve();
            });
          });
        })
      });

      it('not dropping any transations ', function() {
        return new Promise((resolve) => {
          jsonRpcClient.request(JSON_RPC_GET_BLOCKS, {}, function(err, response) {
            if (err) throw err;
            body = response.result;
            const transactionsOnBlockChain = [];
            body.forEach((block) => {
              block.transactions.forEach((transaction) => {
                // TODO(seo): Find a better way.
                if (!(JSON.stringify(transaction).includes(PredefinedDbPaths.VOTING_ROUND) ||
                    JSON.stringify(transaction).includes(PredefinedDbPaths.RECENT_PROPOSERS) ||
                    JSON.stringify(transaction).includes(PredefinedDbPaths.STAKEHOLDER) ||
                    JSON.stringify(transaction).includes(PredefinedDbPaths.ACCOUNTS) ||
                    JSON.stringify(transaction).includes(PredefinedDbPaths.TRANSFER))) {
                  transactionsOnBlockChain.push(transaction);
                }
              });
            });
            for (let i = 0; i < transactionsOnBlockChain.length; i ++) {
              const sentOp = sentOperations[i][1];
              const blockchainOp = transactionsOnBlockChain[i].operation;
              if (sentOperations[i][0].toUpperCase() === "BATCH") {
                expect(sentOp.tx_list).to.not.equal(undefined);
                // NOTE(seo): Sometimes test run fails at this point.
                expect(sentOp.tx_list[0].operation.type).to.equal(blockchainOp.type);
                expect(sentOp.tx_list[0].operation.ref).to.equal(blockchainOp.ref);
                assert.deepEqual(sentOp.tx_list[0].operation.value, blockchainOp.value);
              } else {
                expect(sentOperations[i][0].toUpperCase()).to.equal(blockchainOp.type);
                // NOTE(seo): Sometimes test run fails at this point.
                expect(sentOp.ref).to.equal(blockchainOp.ref);
                assert.deepEqual(sentOp.value, blockchainOp.value);
              }
            };
            // Subtract number of transactions that have been sent since the start of the test case
            // as they will not be on the blockchain yet
            // TODO(seo): Uncomment or remove this once find a good solution to flaky test cases.
            // expect(sentOperations.length - NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST)
            // .to.equal(transactionsOnBlockChain.length);
            resolve();
          });
        });
      });

      it('maintaining correct order', () => {
        body1 = JSON.parse(syncRequest('GET', server1 + getEndpoint + '?ref=test')
            .body.toString('utf-8'));
        body2 = JSON.parse(syncRequest('GET', server2 + getEndpoint + '?ref=test')
            .body.toString('utf-8'));
        assert.deepEqual(body1.result, body2.result);
      });

      // TODO(seo): Uncomment or remove this once find a good solution to flaky test cases.
      /*
      it('and can be stopped and restarted', () => {
        console.log(`Shutting down server[1]...`);
        SERVER_PROCS[1].kill();
        sleep(5000);
        console.log(`Starting server[1]...`);
        SERVER_PROCS[1].start();
        sleep(30000);
        const lastBlockFromRunningBlockchain =
            JSON.parse(syncRequest('GET', server1 + '/blocks').body.toString('utf-8')).result.pop();
        const lastBlockFromStoppedBlockchain =
            JSON.parse(syncRequest('GET', server2 + '/blocks').body.toString('utf-8')).result.pop();
        assert.deepEqual(lastBlockFromRunningBlockchain.transactions,
                         lastBlockFromStoppedBlockchain.transactions);
        expect(lastBlockFromRunningBlockchain.hash).to.equal(lastBlockFromStoppedBlockchain.hash);
        expect(lastBlockFromRunningBlockchain.number)
        .to.equal(lastBlockFromStoppedBlockchain.number);
      });
      */
    });
  });
});
