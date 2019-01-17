const chai = require('chai');
const chaiHttp = require('chai-http');
const assert = chai.assert;
const should = chai.should();
const spawn = require("child_process").spawn;
const PROJECT_ROOT = require('path').dirname(__filename) + "/../" 
const TRACKER_SERVER = PROJECT_ROOT + "server/tracker-server.js"
const APP_SERVER = PROJECT_ROOT + "server/index.js"
const sleep = require('system-sleep');
const expect = chai.expect
chai.use(chaiHttp);
const syncRequest = require('sync-request')
const itParam = require('mocha-param');
const Blockchain = require('../blockchain');
const {BLOCKCHAINS_DIR} = require('../config') 



// Server configurations
const server1 = 'http://localhost:8080'
const server2 = 'http://localhost:8081'
const server3 = 'http://localhost:8082'
const server4 = 'http://localhost:8083'
const SERVERS = [server1, server2, server3, server4]
const ENV_VARIABLES = [{P2P_PORT:5001, PORT: 8080, LOG: true}, {P2P_PORT:5002, PORT: 8081}, {P2P_PORT:5003, PORT: 8082, LOG: true}, {P2P_PORT:5004, PORT: 8083}]

// Paths to current Blockchains (These will be needed in order to assure that all db operations are recorded by this test case)
const CHAIN_LOCATION = BLOCKCHAINS_DIR + "/" + "8080"

// Data options
RANDOM_OPERATION = [
  ["set", {ref: "comeonnnnnnn", value: "testme"}],
  ["set", {ref: "comeonnnnnnn", value: "no meeeee"}],
  ["set", {ref: "comeon/nnnnnn", value: "through"}],
  ["set", {ref: "comeonnnnnnn/new", value: {"new": "path"}}],
  ["set", {ref: "builed/some/deep", value: {"place": {"next":1, "level": "down"}}}],
  ["set", {ref: "builed/heliii", value: {"range": [1, 2, 3, 01, 4, 5]}}],
  ["set", {ref: "b/u/i/l/e/d/hel", value: {"range": [1, 4, 5], "another": [234]}}],
  ["set", {ref: "b/u/i/l/e/d/hel", value: "very nested"}],
  ["set", {ref: "b/u/i/l/e/d/hel", value: {1:2,3:4,5:6}}],
  ["set", {ref: "new/final/path", value: {"neste": [1, 2, 3, 4, 5]}}],
  ["set", {ref: "new/final/path", value: {"more": {"now":12, "hellloooo": 123}}}],
  ["increase", {diff: {"increase/first/level": 10, "increase/first/level2": 20}}],
  ["increase", {diff: {"increase/second/level/deeper": 20, "increase/second/level/deeper": 1000}}],
  ["increase", {diff: {"increase": 1}}],
  ["increase", {diff: {"new":1, "b": 30}}],
  ["increase", {diff: {"test/increase": -10000, "test/increase": 10000}}],
  ["increase", {diff: {"b/u": 10000}}],
  ["increase", {diff: {"builed/some/deep/place/next": 100002}}]
]



describe('Integration Tests', () => {
  let procs = []
  let preTestChainInfo  = {}
  let operationCounter = 0
  let numMines = 0

  before(() => {
    // Start up all servers
    var tracker_proc = spawn('node', [TRACKER_SERVER])
    procs.push(tracker_proc)
    sleep(100)
    for(var i=0; i<ENV_VARIABLES.length; i++){
      var proc = spawn('node', [APP_SERVER], {env: ENV_VARIABLES[i]})
      sleep(1500)
      procs.push(proc)
    };

    var chain = Blockchain.loadChain(CHAIN_LOCATION)
    preTestChainInfo["numBlocks"] = chain.length
    preTestChainInfo["numTransactions"] = chain.reduce((acc, block) => {
        return acc + block.data.length
      }, 0)
      console.log(`Initial block chain is ${preTestChainInfo["numBlocks"]} blocks long containing ${preTestChainInfo["numTransactions"]} database transactions` )
  })

  after(() => {
    // Teardown all servers
    for(var i=0; i<procs.length; i++){
      procs[i].kill()
    }
  });

  describe(`blockchain database mining`, () => {
    let random_operation
   
    beforeEach(() => {
      
      for(var i=0; i<6; i++){
        for(var j=0; j<SERVERS.length; j++){
          random_operation = RANDOM_OPERATION[Math.floor(Math.random()*RANDOM_OPERATION.length)]
          syncRequest("POST", SERVERS[j] + "/" + random_operation[0], {json: random_operation[1]})
          operationCounter++
          sleep(100)
        }
      }

      syncRequest('GET', server3 + '/mine-transactions')
      numMines++
      sleep(100)
    })

    itParam('syncs accross all peers after mine', SERVERS, (server) => {
      base_db = JSON.parse(syncRequest('GET', server1 + '/get?ref=/').body.toString("utf-8"))
      console.log(base_db)
      return chai.request(server).get(`/get?ref=/`).then((res) => {
              res.should.have.status(200);
              res.body.should.be.deep.eql(base_db)
      })
    })

    it("will sync to new peers on startup", () => {
      const new_server = "http://localhost:8085"
      const new_server_proc = spawn('node', [APP_SERVER], {env: {P2P_PORT:5006, PORT: 8085}})
      sleep(500)
      base_db = JSON.parse(syncRequest('GET', server1 + '/blocks').body.toString("utf-8"))
      return chai.request(new_server).get(`/blocks`).then((res) => {
        new_server_proc.kill()
        res.should.have.status(200);
        res.body.should.be.deep.eql(base_db)
      })
    })

    describe("leads to blockchains", () => {
      let blocks

      beforeEach(() =>{
        blocks = JSON.parse(syncRequest('GET', server2 + '/blocks').body.toString("utf-8"))
      })

      itParam('syncing across all chains', SERVERS, (server) => {
        return chai.request(server).get(`/blocks`).then((res) => {
          res.should.have.status(200);
          res.body.should.be.deep.eql(blocks)
        })
      })

      it('all having correct number of transactions', () => {
        var numTransactions = 0
        blocks.forEach(block => block.data.forEach(_ => {
          numTransactions = numTransactions + 1
        }))
        // Subtract pe chain number of transactions as one is the rule transaction set loaded in initial block 
        expect(operationCounter).to.equal(numTransactions - preTestChainInfo["numTransactions"])
      })

      it('all having correct number of blocks', () => {
        expect(numMines).to.equal(blocks.length - preTestChainInfo["numBlocks"])
      })
    })
  })
})

