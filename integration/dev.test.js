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
const rimraf = require("rimraf")
const {BLOCKCHAINS_DIR} = require('../config') 


const server1 = 'http://localhost:8085'
const server2 = 'http://localhost:8089'
const server3 = 'http://localhost:8087'
const server4 = 'http://localhost:8088'


describe('API Tests', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc

  before(() => {
    tracker_proc = spawn('node', [TRACKER_SERVER])
    sleep(500)
    server1_proc = spawn('node', [APP_SERVER], {env: {LOG: true, P2P_PORT:5001, PORT: 8085}})
    sleep(500)
    server2_proc = spawn('node', [APP_SERVER], {env: {LOG: true,P2P_PORT:5002, PORT: 8089}})
    sleep(500)
    server3_proc = spawn('node', [APP_SERVER], {env: {LOG: true,P2P_PORT:5003, PORT: 8087}})
    sleep(500)
    server4_proc = spawn('node', [APP_SERVER], {env: {LOG: true,P2P_PORT:5004, PORT: 8088}})
    sleep(500)

  });

  after(() => {
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()
    server4_proc.kill()
    rimraf.sync(BLOCKCHAINS_DIR)
  });

  beforeEach(() => {
    return chai.request(server2)
        .post(`/set`).send({ref: 'test/test', value: 1})
      
  });

  afterEach(() => {
    return chai.request(server2)
        .post(`/set`).send({ref: '/', value: {}})
  });

  describe('/get ref', () => {
    it('get simple', () => {
      sleep(200)
      return chai.request(server1)
          .get(`/get?ref=test/test`)
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({code:0, result: 1});
          });
    })
  })

  describe('/set ref', () => {
    it('set simple', () => {
      return chai.request(server3)
          .post(`/set`).send({ref: 'test/value', value: "something"})
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({code:0});
          });
    })
  })

  describe('/increase ref', () => {
    it('increase simple', () => {
      sleep(200)
      return chai.request(server4)
          .post(`/increase`).send({diff: {"test/test": 10}})
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({code:0, result: {"test/test": 11}});
          });
    })
  })

  describe('/update', () => {
    it('update simple', () => {
      return chai.request(server2)
          .post(`/update`).send({data: {"test/balance": {a:1, b:2}}})
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({code:0, result: true});
          });
     })
   })

   describe('/batch', () => {
    it('batch simple', () => {
      return chai.request(server1)
          .post(`/batch`).send({
            batch_list: [
              {op: 'set', ref: 'test/a', value: 1},
              {op: 'increase', diff: {"test/test": 10}},
              {op: 'update', data: {"test/balance": {a:1, b:2}}},
              {op: 'get', ref: 'test/a'},
              {op: 'get', ref: 'test/balance/b'}
          ]})
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql([
              true,
              {"test/test": 11},
              true,
              1,
              2
            ]);
      });
    })
  })
})

