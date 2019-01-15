
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

const server1 = 'http://localhost:8080'
const server2 = 'http://localhost:8081'
const server3 = 'http://localhost:8082'
const server4 = 'http://localhost:8083'


describe('API Tests', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc

  before(() => {
    tracker_proc = spawn('node', [TRACKER_SERVER])
    sleep(500)
    server1_proc = spawn('node', [APP_SERVER], {env: {LOG: true}})
    sleep(500)
    server2_proc = spawn('node', [APP_SERVER], {env: {P2P_PORT:5002, PORT: 8081}})
    sleep(500)
    server3_proc = spawn('node', [APP_SERVER], {env: {P2P_PORT:5003, PORT: 8082}})
    sleep(500)
    server4_proc = spawn('node', [APP_SERVER], {env: {P2P_PORT:5004, PORT: 8083}})
    sleep(500)

  });

  after(() => {
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()
    server4_proc.kill()
  });

  beforeEach(() => {
    return chai.request(server2)
        .post(`/set`).send({ref: 'test', value: 1})
      
  });

  afterEach(() => {
    return chai.request(server2)
        .post(`/set`).send({ref: '/', value: {}})
  });

  describe('/get ref', () => {
    it('get simple', () => {
      sleep(200)
      return chai.request(server1)
          .get(`/get?ref=test`)
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({code:0, result: 1});
          });
    })
  })

  describe('/set ref', () => {
    it('set simple', () => {
      return chai.request(server3)
          .post(`/set`).send({ref: ''})
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({code:0});
          });
    })
  })

  describe('/increase ref', () => {
    it('increase simple', () => {
      sleep(200)
      return chai.request(server4)
          .post(`/increase`).send({diff: {test: 10}})
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({code:0, result: {test: 11}});
          });
    })
  })
})

