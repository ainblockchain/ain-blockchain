
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


const server1 = 'http://localhost:8080'
const server2 = 'http://localhost:8081'
const server3 = 'http://localhost:8082'
const server4 = 'http://localhost:8083'
const server5 = 'http://localhost:8084'
const SERVERS = [server1, server2, server3, server4, server5]

describe('Integration Tests', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc, server5_proc

  before(() => {
    tracker_proc = spawn('node', [TRACKER_SERVER])
    sleep(100)
    server1_proc = spawn('node', [APP_SERVER])
    sleep(100)
    server2_proc = spawn('node', [APP_SERVER], {env: {P2P_PORT:5002, PORT: 8081}})
    sleep(100)
    server3_proc = spawn('node', [APP_SERVER], {env: {P2P_PORT:5003, PORT: 8082}})
    sleep(100)
    server4_proc = spawn('node', [APP_SERVER], {env: {P2P_PORT:5004, PORT: 8083}})
    sleep(100)
    server5_proc = spawn('node', [APP_SERVER], {env: {P2P_PORT:5005, PORT: 8084}})
    sleep(100)

  });

  after(() => {
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()
    server4_proc.kill()
    server5_proc.kill()
  });



  describe(`blockchain database`, () => {
    let base_db

    beforeEach(() => {

      syncRequest("POST", server1 + "/set", {json: {ref: "comeonnnnnnn", value: "testme"}})
      sleep(50)
      syncRequest("POST", server2 + "/set", {json: {ref: "comeonnnnnnn", value: "no meeeee"}})
      sleep(50)
      syncRequest("POST", server3 + "/set", {json: {ref: "comeonnnnnnn", value: "through"}})
      sleep(50)
      syncRequest("POST", server4 + "/set", {json: {ref: "comeonnnnnnn/new", value: {"new": "path"}}})
      sleep(50)
      syncRequest("POST", server5 + "/set", {json: {ref: "builed/hel", value: {"range": [1, 2, 3, 4, 5]}}})
      sleep(50)

    })

    itParam('syncs accross all peers after mining', SERVERS, (server) => {
      syncRequest('GET', server2 + '/mine-transactions')
      sleep(50)
      base_db = JSON.parse(syncRequest('GET', server1 + '/get?ref=/').body.toString("utf-8"))

      return chai.request(server).get(`/get?ref=/`).then((res) => {
              res.should.have.status(200);
              res.body.should.be.deep.eql(base_db)
      })
    })

    it("will sync to new peers after mining", () => {
      const new_server = "http://localhost:8085"
      const new_server_proc = spawn('node', [APP_SERVER], {env: {P2P_PORT:5006, PORT: 8085}})
      sleep(100)
      syncRequest('GET', server2 + '/mine-transactions')
      sleep(100)
      base_db = JSON.parse(syncRequest('GET', server1 + '/get?ref=/').body.toString("utf-8"))
      return chai.request(new_server).get(`/get?ref=/`).then((res) => {
        new_server_proc.kill()
        res.should.have.status(200);
        res.body.should.be.deep.eql(base_db)
      })
    })
  })
})

