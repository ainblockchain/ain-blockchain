const chai = require('chai');
const chaiHttp = require('chai-http');
const assert = chai.assert;
const spawn = require('child_process').spawn;
const PROJECT_ROOT = require('path').dirname(__filename) + '/../';
const TRACKER_SERVER = PROJECT_ROOT + 'tracker-server/index.js';
const APP_SERVER = PROJECT_ROOT + 'client/index.js';
const sleep = require('system-sleep');
const expect = chai.expect;
// eslint-disable-next-line no-unused-vars
const should = chai.should();
const path = require('path');
chai.use(chaiHttp);
const syncRequest = require('sync-request');
const itParam = require('mocha-param');
const Blockchain = require('../blockchain');
const DB = require('../db');
const TransactionPool = require('../db/transaction-pool');
const {BLOCKCHAINS_DIR} = require('../constants');
const rimraf = require('rimraf');
const jayson = require('jayson');
const NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST = 30;
const {PredefinedDbPaths} = require('../constants');

// Server configurations
const server1 = 'http://localhost:8080';
const server2 = 'http://localhost:8081';
const server3 = 'http://localhost:8082';
const server4 = 'http://localhost:8083';
const trackerServer = 'http://localhost:5000';
const SERVERS = [server1, server2, server3, server4];

const JSON_RPC_ENDPOINT = '/json-rpc';
const JSON_RPC_GET_LAST_BLOCK = 'ain_getLastBlock';
const JSON_RPC_GET_BLOCKS = 'ain_getBlockList';
const JSON_RPC_GET_BLOCK_HEADERS = 'ain_getBlockHeadersList';
const JSON_RPC_GET_PEER_PUBLIC_KEYS = 'getPeerPublicKeys';

const setEndpoint = '/set';

const ENV_VARIABLES = [{P2P_PORT: 5001, PORT: 8080, LOG: true, STAKE: 250, LOCAL: true}, {P2P_PORT: 5002, PORT: 8081, LOG: true, STAKE: 250, LOCAL: true},
  {P2P_PORT: 5003, PORT: 8082, LOG: true, STAKE: 250, LOCAL: true}, {P2P_PORT: 5004, PORT: 8083, LOG: true, STAKE: 250, LOCAL: true}];

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
  ['inc_value', {ref: 'test/increase/first/level', value: 10}],
  ['inc_value', {ref: 'test/increase/second/level/deeper', value: 20}],
  ['inc_value', {ref: 'test/increase', value: 1}],
  ['inc_value', {ref: 'test/new', value: 1}],
  ['inc_value', {ref: 'test/increase', value: -10000}],
  ['inc_value', {ref: 'test/b/u', value: 10000}],
  ['inc_value', {ref: 'test/builed/some/deep/place/next', value: 100002}],
  ['updates', {data: [{ref: 'test/increase/first/level', value: 10}, {ref: 'test/increase/first/level2', value: 20}]}],
  ['updates', {data: [{ref: 'test/increase/second/level/deeper', value: 20}, {ref: 'test/increase/second/level/deeper', value: 1000}]}],
  ['updates', {data: [{ref: 'test/increase', value: 1}]}],
  ['updates', {data: [{ref: 'test/new', value: 1, 'test/b': 30}]}],
  ['updates', {data: [{ref: 'test/increase', value: 10000, 'test/increase': 10000}]}],
  ['updates', {data: [{ref: 'test/b/u', value: 10000}]}],
  ['updates', {data: [{ref: 'test/builed/some/deep/place/next', value: 100002}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/comeonnnnnnn', value: 'testme'}, {op: 'inc_value', ref: 'test/b/u', value: 10000}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/comeonnnnnnn', value: 'no meeeee'}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/comeon/nnnnnn', value: 'through'}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/comeonnnnnnn/new', value: {'new': 'path'}}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/builed/some/deep', value: {'place': {'next': 1, 'level': 'down'}}}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/builed/heliii', value: {'range': [1, 2, 3, 1, 4, 5]}}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/b/u/i/l/e/d/hel', value: {'range': [1, 4, 5], 'another': [234]}}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/b/u/i/l/e/d/hel', value: 'very nested'}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/b/u/i/l/e/d/hel', value: {1: 2, 3: 4, 5: 6}}]}],
  ['batch', {batch_list: [{op: 'set_value', ref: 'test/new/final/path', value: {'neste': [1, 2, 3, 4, 5]}}]}],
];


describe('Integration Tests', () => {
  const procs = [];
  let numNewBlocks = 0;
  let numBlocks;
  let numBlocksOnStartup;
  let jsonRpcClient;
  let trackerRpcClient;
  const sentOperations = [];
  const publicKeys = [];

  before(() => {
    // Start up all servers
    const trackerProc = spawn('node', [TRACKER_SERVER]);
    trackerRpcClient = jayson.client.http(trackerServer + JSON_RPC_ENDPOINT);
    procs.push(trackerProc);
    sleep(100);
    for (let i = 0; i < ENV_VARIABLES.length; i++) {
      const proc = spawn('node', [APP_SERVER], {env: ENV_VARIABLES[i]});
      sleep(2000);
      trackerRpcClient.request(JSON_RPC_GET_PEER_PUBLIC_KEYS, [], function(err, response) {
        if (err) throw err;
        // The newest element in this list will be the publicKey of the server just started
        publicKeys.push(response.result.pop());
      });
      procs.push(proc);
    };
    sleep(20000);
    jsonRpcClient = jayson.client.http(server2 + JSON_RPC_ENDPOINT);

    jsonRpcClient.request(JSON_RPC_GET_LAST_BLOCK, [], function(err, response) {
      if (err) throw err;
      numBlocksOnStartup = response.result.height;
    });
  });

  after(() => {
    // Teardown all servers
    for (let i = 0; i < procs.length; i++) {
      procs[i].kill();
    }
    rimraf.sync(BLOCKCHAINS_DIR);
  });

  describe(`blockchain database mining/forging`, () => {
    let randomOperation;
    let currentHeight;

    beforeEach(function(done) {
      for (let i = 0; i < NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST; i++) {
        randomOperation = RANDOM_OPERATION[Math.floor(Math.random() * RANDOM_OPERATION.length)];
        sentOperations.push(randomOperation);
        syncRequest('POST', SERVERS[Math.floor(Math.random() * SERVERS.length)] + '/' + randomOperation[0], {json: randomOperation[1]});
        sleep(100);
      }

      jsonRpcClient.request(JSON_RPC_GET_LAST_BLOCK, [], function(err, response) {
        if (err) throw err;
        numBlocks = response.result.height;
        currentHeight = numBlocks;
        while (!(currentHeight > numBlocks)) {
          jsonRpcClient.request(JSON_RPC_GET_LAST_BLOCK, [], function(err, response) {
            if (err) throw err;
            currentHeight = response.result.height;
          });
          sleep(200);
        }
        numNewBlocks++;
        done();
      });
    });

    itParam('syncs accross all peers after mine', SERVERS, (server) => {
      const baseDb = JSON.parse(syncRequest('GET', server1 + '/get?ref=/').body.toString('utf-8'));
      console.log(baseDb);
      console.log(server);
      return chai.request(server).get(`/get?ref=/`).then((res) => {
        res.should.have.status(200);
        res.body.should.be.deep.eql(baseDb);
      });
    });

    it('will sync to new peers on startup', function(done) {
      let baseChain;
      let newChain;
      const newServer = 'http://localhost:8090';
      const newServerProc = spawn('node', [APP_SERVER], {env: {P2P_PORT: 5006, PORT: 8090, LOG: true, LOCAL: true}});
      sleep(5000);
      jayson.client.http(server1 + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS, [], function(err, response) {
        if (err) throw err;
        baseChain = response.result;
        const height = baseChain[baseChain.length - 1].height;
        jayson.client.http(newServer + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS, [{to: height + 1}], function(err, response) {
          if (err) throw err;
          newChain = response.result;
          try {
            assert.deepEqual(baseChain.length, newChain.length);
            assert.deepEqual(baseChain, newChain);
            done();
          } catch (e) {
            done(e);
          }
        });
      });
      sleep(1000);
      newServerProc.kill();
    });

    describe('leads to blockchains', () => {
      let baseChain;

      beforeEach(function(done) {
        jsonRpcClient.request(JSON_RPC_GET_BLOCKS, [], function(err, response) {
          if (err) throw err;
          baseChain = response.result;
          done();
        });
      });

      itParam('syncing across all chains', SERVERS, function(done, server) {
        let newChain;
        const height = baseChain[baseChain.length - 1].height;
        jayson.client.http(server + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCKS, [{to: height + 1}], function(err, response) {
          if (err) throw err;
          newChain = response.result;
          try {
            assert.deepEqual(baseChain, newChain);
            done();
          } catch (e) {
            done(e);
          }
        });
      });

      itParam('having blocks with valid headers', SERVERS, function(done, server) {
        let transaction;
        let preVotes;
        let preCommits;
        let headers;
        jayson.client.http(server + JSON_RPC_ENDPOINT).request(JSON_RPC_GET_BLOCK_HEADERS, [], function(err, response) {
          if (err) throw err;
          headers = response.result;
          for (let i = 0; i < headers.length; i++) {
            preVotes = 0;
            preCommits = 0;
            for (let j = 0; j < headers[i].validatorTransactions.length; j++) {
              transaction = headers[i].validatorTransactions[j];
              if (headers[i].validators.indexOf(transaction.address) < 0) {
                assert.fail(`Invalid validator is validating block ${transaction.address}`);
              }
              if (PredefinedDbPaths.VOTING_ROUND_PRE_VOTES in transaction.operation.diff) {
                preVotes += transaction.operation.diff[PredefinedDbPaths.VOTING_ROUND_PRE_VOTES];
              } else if (preVotes <= headers[i].threshold) {
                assert.fail('PreCommits were made before PreVotes reached threshold');
              } else {
                preCommits += transaction.operation.diff[PredefinedDbPaths.VOTING_ROUND_PRE_COMMITS];
              }
            }
            expect(preVotes).greaterThan(headers[i].threshold);
            expect(preCommits).greaterThan(headers[i].threshold);
          }
          done();
        });
      });

      it('all having correct number of blocks', () => {
        expect(numNewBlocks + numBlocksOnStartup + 1).to.equal(baseChain.pop().height);
      });
    });

    describe('and rules', ()=> {
      it('prevent users from restructed areas', () => {
        return chai.request(server2).post(`/set`).send( {ref: 'restricted/path', value: 'anything', is_nonced_transaction: false}).then((res) => {
          res.should.have.status(401);
        });
      });
    });

    describe('and built in functions', () => {
      const expectedBalance = 50;

      beforeEach(() =>{
        syncRequest('POST', server1 + setEndpoint, {json: {ref: `/account/${publicKeys[0]}/balance`, value: 100}});
        syncRequest('POST', server2 + setEndpoint, {json: {ref: `/account/${publicKeys[1]}/balance`, value: 0}});
        sleep(200);
      });

      it('facilitate transfer between accounts', () => {
        return chai.request(server1).post(`/set`).send( {ref: `/transfer/${publicKeys[0]}/${publicKeys[1]}/1/value`, value: 50}).then((res) => {
          sleep(100);
          balance1 = JSON.parse(syncRequest('GET', server3 + `/get?ref=/account/${publicKeys[0]}/balance`).body.toString('utf-8')).result;
          balance2 = JSON.parse(syncRequest('GET', server3 + `/get?ref=/account/${publicKeys[1]}/balance`).body.toString('utf-8')).result;
          expect(balance1).to.equal(expectedBalance);
          expect(balance2).to.equal(expectedBalance);
        });
      });
    });

    describe('leads to blockchains', () => {
      let db; let body;

      beforeEach(() =>{
        rimraf.sync(path.join(BLOCKCHAINS_DIR, 'test-integration'));
        db = DB.getDatabase(new Blockchain('test-integration'), new TransactionPool());
        let op;
        sentOperations.forEach((operation) => {
          op = Object.assign({}, {type: operation[0].toUpperCase()}, operation[1]);
          db.execute(op);
        });
      });

      itParam('maintaining correct order', SERVERS, (server) => {
        body = JSON.parse(syncRequest('GET', server + '/get?ref=test').body.toString('utf-8'));
        console.log(body.result);
        assert.deepEqual(db.db['test'], body.result);
      });

      it('can be queried by index ', function(done) {
        jsonRpcClient.request(JSON_RPC_GET_BLOCK_HEADERS, [{from: 12, to: 14}], function(err, response) {
          if (err) throw err;
          body = response.result;
          assert.deepEqual([12, 13], body.map((blockHeader) =>{
            return blockHeader.height;
          }));
          done();
        });
      });

      it('not dropping any transations ', function(done) {
        jsonRpcClient.request(JSON_RPC_GET_BLOCKS, [{}], function(err, response) {
          if (err) throw err;
          body = response.result;
          const transactionsOnBlockChain = [];
          body.forEach((block) => {
            block.data.forEach((transaction) => {
              if (!(JSON.stringify(transaction).includes(PredefinedDbPaths.VOTING_ROUND) ||
                  JSON.stringify(transaction).includes(PredefinedDbPaths.RECENT_FORGERS) ||
                  JSON.stringify(transaction).includes(PredefinedDbPaths.STAKEHOLDER) ||
                  JSON.stringify(transaction).includes(PredefinedDbPaths.ACCOUNT) ||
                  JSON.stringify(transaction).includes(PredefinedDbPaths.TRANSFER))) {
                transactionsOnBlockChain.push(transaction);
              }
            });
          });
          for (let i = 0; i < transactionsOnBlockChain.length; i ++) {
            const operation = sentOperations[i][1];
            operation['type'] = sentOperations[i][0].toUpperCase();
            assert.deepEqual(operation, transactionsOnBlockChain[i].operation);
          };
          // Subtract number of transactions that have been sent since the start of the test case as they will not be on the blockchain yet
          expect(sentOperations.length - NUMBER_OF_TRANSACTIONS_SENT_BEFORE_TEST).to.equal(transactionsOnBlockChain.length);
          done();
        });
      });
    });
  });
});

