const chai = require('chai');
const chaiHttp = require('chai-http');
const assert = chai.assert;
const should = chai.should();
const spawn = require("child_process").spawn;
const PROJECT_ROOT = require('path').dirname(__filename) + "/../" 
const TRACKER_SERVER = PROJECT_ROOT + "server/tracker-server.js"
const APP_SERVER = PROJECT_ROOT + "server/index.js"
const sleep = require('system-sleep');
chai.use(chaiHttp);
const syncRequest = require('sync-request')
var itParam = require('mocha-param');


// Server configurations
const server1 = 'http://localhost:8080'
const server2 = 'http://localhost:8081'
const server3 = 'http://localhost:8082'
const server4 = 'http://localhost:8083'
const SERVERS = [server1, server2, server3, server4]
const ENV_VARIABLES = [{P2P_PORT:5001, PORT: 8080}, {P2P_PORT:5002, PORT: 8081}, {P2P_PORT:5003, PORT: 8082}, {P2P_PORT:5004, PORT: 8083}]

// Data options
RANDOM_SET_ITEMS = [
  {ref: "comeonnnnnnn", value: "testme"},
  {ref: "comeonnnnnnn", value: "no meeeee"},
  {ref: "comeon/nnnnnn", value: "through"},
  {ref: "comeonnnnnnn/new", value: {"new": "path"}},
  {ref: "builed/some/deep", value: {"place": {"next":1, "level": "down"}}},
  {ref: "builed/heliii", value: {"range": [1, 2, 3, 01, 4, 5]}},
  {ref: "b/u/i/l/e/d/hel", value: {"range": [1, 4, 5], "another": [234]}},
  {ref: "b/u/i/l/e/d/hel", value: "very nested"},
  {ref: "b/u/i/l/e/d/hel", value: {1:2,3:4,5:6}},
  {ref: "new/final/path", value: {"neste": [1, 2, 3, 4, 5]}},
  {ref: "new/final/path", value: {"more": {"now":12, "hellloooo": 123}}},
]



describe('Integration Tests', () => {
  let procs = []

  before(() => {
    // Start up all servers
    var tracker_proc = spawn('node', [TRACKER_SERVER])
    procs.push(tracker_proc)
    sleep(100)
    for(var i=0; i<ENV_VARIABLES.length; i++){
      var proc = spawn('node', [APP_SERVER], {env: ENV_VARIABLES[i]})
      sleep(2000)
      procs.push(proc)
    };
  })

  after(() => {
    // Teardown all servers
    for(var i=0; i<procs.length; i++){
      procs[i].kill()
    }
  });

  describe(`blockchain database mining`, () => {
    let random_set_item

    beforeEach(() => {
      
      for(var i = 0; i<2; i++){
        for(var j = 0; j<SERVERS.length; j++){
          random_set_item = RANDOM_SET_ITEMS[Math.floor(Math.random()*RANDOM_SET_ITEMS.length)]
          syncRequest("POST", SERVERS[i] + "/set", {json: random_set_item})
          sleep(300)
        }
      }
      syncRequest('GET', server3 + '/mine-transactions')
      sleep(500)
    })

    itParam('syncs accross all peers after one mine', SERVERS, (server) => {
      base_db = JSON.parse(syncRequest('GET', server1 + '/get?ref=/').body.toString("utf-8"))
      console.log(base_db)
      return chai.request(server).get(`/get?ref=/`).then((res) => {
              res.should.have.status(200);
              res.body.should.be.deep.eql(base_db)
      })
    })

    it("will sync to new peers after one mine", () => {
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
        blocks = JSON.parse(syncRequest('GET', server1 + '/blocks').body.toString("utf-8"))
      })

      itParam('syncing across all chains', SERVERS, (server) => {
        return chai.request(server).get(`/blocks`).then((res) => {
          res.should.have.status(200);
          res.body.should.be.deep.eql(blocks)
        })
      })
    })
  })
})

