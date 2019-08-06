
const chai = require('chai');
const chaiHttp = require('chai-http');
const assert = chai.assert;
const should = chai.should();
const AfanClient = require('../afan_client')
const rimraf = require("rimraf")
const {BLOCKCHAINS_DIR} = require('../constants') 
const sleep = require('system-sleep')
const spawn = require("child_process").spawn;
const PROJECT_ROOT = require('path').dirname(__filename) + "/../" 
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"

chai.use(chaiHttp);

// Before running this test, bring up server at localhost:8080.
// npm start
const server1 = 'http://localhost:8087'
const server2 = 'http://localhost:8088'
const server3 = 'http://localhost:8089'
const server4 = 'http://localhost:8090'

describe('aFan Client Test', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc

  before(() => {
    tracker_proc = spawn('node', [TRACKER_SERVER])
    sleep(2000)
    server1_proc = spawn('node', [APP_SERVER], {env: {STAKE: 250, LOG: true, P2P_PORT:5001, PORT: 8087}})
    sleep(2000)
    server2_proc = spawn('node', [APP_SERVER], {env: {LOG: true, P2P_PORT:5002, PORT: 8088}})
    sleep(2000)
    server3_proc = spawn('node', [APP_SERVER], {env: {LOG: true, P2P_PORT:5003, PORT: 8089}})
    sleep(2000)
    server4_proc = spawn('node', [APP_SERVER], {env: {LOG: true, P2P_PORT:5004, PORT: 8090}})
    sleep(12000)
  });

  after(() => {
    tracker_proc.kill()
    server1_proc.kill()
    server2_proc.kill()
    server3_proc.kill()
    server4_proc.kill()
    rimraf.sync(BLOCKCHAINS_DIR)
  });

  set = (ref, value) => {
    return chai.request(server1)
        .post(`/set`).send({ref: ref, value: value})
  }

  update = (data) => {
    return chai.request(server2)
        .post(`/update`).send({data: data})
  }

  get = (ref) => {
    return chai.request(server3)
      .get(`/get?ref=${ref}`)
  }

  beforeEach(() => {
    return set('afan', {})
  });

  afterEach(() => {
    return set('afan', {})
  });

  describe('tx_invest', () => {
    it('send_one', () => {
      const afanClient = new AfanClient(server1)
      
      return set('/afan/balance/uid0', 10).then(() => set('/afan/balance/uid1', 10))
          .then(() => sleep(500))
          .then(() => afanClient.tx_invest('uid0', 'uid1', 1))
          .then(() => sleep(500))
          .then(() => get('/afan'))
          .then((res) => {
            const result = require('./data/tx_invest_send_one_result.js')
            res.should.have.status(200);
            res.body.result.should.be.deep.eql(result);
          });
    })
  })

  describe('crushOnPost', () => {
    it('no fan', () => {
      const afanClient = new AfanClient(server1)
      
      return set('/afan/balance/uid0', 10).then(() => set('/afan/balance/uid1', 10))
          .then(() => afanClient.tx_crushOnPost('uid0', 'uid1', 'post0', 1))
          .then(() => sleep(100))
          .then(() => get('/afan'))
          .then((res) => {
            const result = require('./data/tx_crushOnPost_no_fan_result.js')
            res.should.have.status(200);
            res.body.result.should.be.deep.eql(result);
          });
    })

    it('two fans', () => {
      const afanClient = new AfanClient(server2)
      sleep(200)
      return set('/afan/balance/uid0', 30)
          .then(() => set('/afan/balance/uid1', 10))
          .then(() => set('/afan/investors/uid1/uid2', 3))
          .then(() => set('/afan/investors/uid1/uid3', 7))
          .then(() => sleep(500))
          .then(() => afanClient.tx_crushOnPost('uid0', 'uid1', 'post0', 20))
          .then(() => sleep(500))
          .then(() => get('/afan'))
          .then((res) => {
            const result = require('./data/tx_crushOnPost_two_fans_result.js')
            res.should.have.status(200);
            res.body.result.should.be.deep.eql(result);
          });
    })
  })

  describe('crushOnReply', () => {
    it('no fan', () => {
      const afanClient = new AfanClient(server3)
      return set('/afan/balance/uid0', 10).then(() => set('/afan/balance/uid1', 10))
          .then(() => sleep(1000))
          .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 1))
          .then(() => get('/afan'))
          .then((res) => {
            const result = require('./data/tx_crushOnReply_no_fan_result.js')
            res.should.have.status(200);
            res.body.result.should.be.deep.eql(result);
          });
    })

    it('three fans', () => {
      const afanClient = new AfanClient(server4)

      return set('/afan/balance/uid0', 20)
          .then(() => set('/afan/balance/uid1', 10))
          .then(() => set('/afan/investors/uid1/uid2', 3))
          .then(() => set('/afan/investors/uid1/uid3', 2))
          .then(() => set('/afan/investors/uid1/uid4', 1))
          .then(() => sleep(1000))
          .then(() => afanClient.tx_crushOnReply('uid0', 'uid1', 'post0', 'reply0', 12))
          .then(() => sleep(500))
          .then(() => get('/afan'))
          .then((res) => {
            const result = require('./data/tx_crushOnReply_three_fans_result.js')
            res.should.have.status(200);
            res.body.result.should.be.deep.eql(result);
          });
    })
  })

  describe('ad', () => {
    it('ad propose', () => {
      const afanClient = new AfanClient(server2)
      initialData = {}
      initialData['/afan/balance/uid0'] = 10
      initialData['/afan/balance/uid1'] = 10
      return update(initialData)
          .then(() => afanClient.tx_adpropose('uid0', 'uid1', 1, 'intermed'))
          .then(() => {sleep(100)})
          .then(() => get('/afan'))
          .then((res) => {
            const result = require('./data/tx_adpropose_result.js')
            res.should.have.status(200);
            res.body.result.should.be.deep.eql(result);
          });
    })
  })

})
