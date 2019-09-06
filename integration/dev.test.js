const chai = require('chai');
const chaiHttp = require('chai-http');
const assert = chai.assert;
const should = chai.should();
const spawn = require("child_process").spawn;
const PROJECT_ROOT = require('path').dirname(__filename) + "/../" 
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const sleep = require('system-sleep');
chai.use(chaiHttp);
const rimraf = require("rimraf")
const {BLOCKCHAINS_DIR} = require('../constants') 

const server1 = 'http://localhost:9091'
const server2 = 'http://localhost:9092'
const server3 = 'http://localhost:9093'
const server4 = 'http://localhost:9094'

describe('API Tests', () => {
  let tracker_proc, server1_proc, server2_proc, server3_proc, server4_proc

  before(() => {
    tracker_proc = spawn('node', [TRACKER_SERVER], {
      cwd: process.cwd(),
      env: {
          PATH: process.env.PATH
      },
      stdio: 'inherit'
    }).on('error', (err) => {
      console.error('Failed to start tracker server with error: ' + err.message);
    });
    sleep(2000)
    server1_proc = spawn('node', [APP_SERVER], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        STAKE: 250,
        LOG: true,
        P2P_PORT:5001,
        PORT: 9091,
        LOCAL: true
      },
    }).on('error', (err) => {
      console.error('Failed to start server1 with error: ' + err.message);
    });
    sleep(500)
    server2_proc = spawn('node', [APP_SERVER], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        LOG: true,
        P2P_PORT:5002,
        PORT: 9092,
        LOCAL: true
      },
    }).on('error', (err) => {
      console.error('Failed to start server2 with error: ' + err.message);
    });
    sleep(500)
    server3_proc = spawn('node', [APP_SERVER], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        LOG: true,
        P2P_PORT:5003,
        PORT: 9093,
        LOCAL: true
      },
    }).on('error', (err) => {
      console.error('Failed to start server3 with error: ' + err.message);
    });
    sleep(500)
    server4_proc = spawn('node', [APP_SERVER], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        LOG: true,
        P2P_PORT:5004,
        PORT: 9094,
        LOCAL: true
      },
    }).on('error', (err) => {
      console.error('Failed to start server4 with error: ' + err.message);
    });
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

  beforeEach(() => {
    return chai.request(server2)
        .post('/set_value').send({ref: 'test/test', value: 100})
  });

  afterEach(() => {
    return chai.request(server2)
        .post('/set_value').send({ref: '/', value: {}})
  });

  describe('/get', () => {
    it('get simple', () => {
      sleep(200)
      return chai.request(server1)
          .get('/get?ref=test/test')
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({code:0, result: 100});
          });
    })
  })

  describe('/set_value', () => {
    it('set simple', () => {
      return chai.request(server3)
          .post('/set_value').send({ref: 'test/value', value: "something"})
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({code:0, result: true});
          });
    })
  })

  describe('/inc_value', () => {
    it('inc_value simple', () => {
      sleep(200)
      return chai.request(server4)
          .post('/inc_value').send({ref: "test/test", value: 10})
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({code:0, result: true});
          });
    })
  })

  describe('/dec_value', () => {
    it('dec_value simple', () => {
      sleep(200)
      return chai.request(server4)
          .post('/dec_value').send({ref: "test/test", value: 10})
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({code:0, result: true});
          });
    })
  })

  describe('/updates', () => {
    it('updates simple', () => {
      return chai.request(server2)
          .post('/updates').send({
            update_list: [
              {
                type: "SET_VALUE",
                ref: "test/balance",
                value: {a:1, b:2}
              },
              {
                type: 'INC_VALUE',
                ref: "test/test",
                value: 10
              },
              {
                type: 'DEC_VALUE',
                ref: "test/test2",
                value: 10
              }
            ]
          })
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
              {
                type: 'SET_VALUE',
                ref: 'test/a',
                value: 1
              },
              {
                type: 'INC_VALUE',
                ref: "test/test",
                value: 10
              },
              {
                type: 'UPDATES',
                update_list: [
                  {
                    type: "SET_VALUE",
                    ref: "test/balance",
                    value: {
                      a:1,
                      b:2
                    }
                  },
                  {
                    type: 'INC_VALUE',
                    ref: "test/test",
                    value: 10
                  },
                  {
                    type: 'DEC_VALUE',
                    ref: "test/test2",
                    value: 10
                  }
                ]
              },
              {
                type: 'GET',
                ref: 'test/a'
              },
              {
                type: 'GET',
                ref: 'test/balance/b'
              }
          ]})
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({
              code: 0,
              result: [
                true,
                true,
                true,
                1,
                2
              ]
            });
      });
    })
  })
})

