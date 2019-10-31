const chai = require('chai');
const chaiHttp = require('chai-http');
const assert = chai.assert;
const expect = chai.expect;
const should = chai.should();
const spawn = require("child_process").spawn;
const PROJECT_ROOT = require('path').dirname(__filename) + "/../"
const TRACKER_SERVER = PROJECT_ROOT + "tracker-server/index.js"
const APP_SERVER = PROJECT_ROOT + "client/index.js"
const sleep = require('system-sleep');
chai.use(chaiHttp);
const syncRequest = require('sync-request');
const rimraf = require("rimraf")
const {BLOCKCHAINS_DIR, PredefinedDbPaths, FunctionResultCode} = require('../constants')

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
        LOCAL: true,
        DEBUG: true
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
        LOCAL: true,
        DEBUG: true
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
        LOCAL: true,
        DEBUG: true
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
        LOCAL: true,
        DEBUG: true
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
    syncRequest('POST', server2 + '/set_value', {
      json: {
        ref: 'test/test',
        value: 100
      }
    });
    syncRequest('POST', server2 + '/set_rule', {
      json: {
        ref: '/rule/some/path',
        value: {
          ".write": "some rule config"
        }
      }
    });
    syncRequest('POST', server2 + '/set_owner', {
      json: {
        ref: '/owner/some/path',
        value: {
          ".owner": "some owner config"
        }
      }
    });
  });

  afterEach(() => {
    syncRequest('POST', server2 + '/set_value', {
      json: {
        ref: '/',
        value: {}
      }
    });
    syncRequest('POST', server2 + '/set_rule', {
      json: {
        ref: '/rule/some/path',
        value: {}
      }
    });
    syncRequest('POST', server2 + '/set_owner', {
      json: {
        ref: '/owner/some/path',
        value: {}
      }
    });
  });

  describe('/get_value', () => {
    it('get_value simple', () => {
      sleep(200)
      return chai.request(server1)
          .get('/get_value?ref=test/test')
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({code: 0, result: 100});
          });
    })
  })

  describe('/get_rule', () => {
    it('get_rule simple', () => {
      sleep(200)
      return chai.request(server1)
          .get('/get_rule?ref=/rule/some/path')
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({
              code: 0,
              result: {
                ".write": "some rule config"
              }
            });
          });
    })
  })

  describe('/get_owner', () => {
    it('get_owner simple', () => {
      sleep(200)
      return chai.request(server1)
          .get('/get_owner?ref=/owner/some/path')
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({
              code: 0,
              result: {
                ".owner": "some owner config"
              }
            });
          });
    })
  })

  describe('/get', () => {
    it('get simple', () => {
      sleep(200)
      return chai.request(server1)
          .post('/get').send({
            op_list: [
              {
                type: "GET_VALUE",
                ref: "/test/test",
              },
              {
                type: 'GET_RULE',
                ref: "/rule/some/path",
              },
              {
                type: 'GET_OWNER',
                ref: "/owner/some/path",
              }
            ]
          })
          .then((res) => {
            res.should.have.status(200);
            res.body.should.be.deep.eql({
              code: 0,
              result: [
                100,
                {
                  ".write": "some rule config"
                },
                {
                  ".owner": "some owner config"
                }
              ]
            });
          });
    })
  })

  describe('/set_value', () => {
    it('set simple', () => {
      return chai.request(server3)
          .post('/set_value').send({ref: 'test/value', value: "something"})
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({code: 0, result: true});
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
            res.body.should.be.deep.eql({code: 0, result: true});
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
            res.body.should.be.deep.eql({code: 0, result: true});
          });
    })
  })

  describe('/set_rule', () => {
    it('set_rule simple', () => {
      sleep(200)
      return chai.request(server4)
          .post('/set_rule').send({
            ref: "/rule/other/path",
            value: {
              ".write": "some rule config"
            }
          })
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({code: 0, result: true});
          });
    })
  })

  describe('/set_owner', () => {
    it('set_owner simple', () => {
      sleep(200)
      return chai.request(server4)
          .post('/set_owner').send({
            ref: "/owner/other/path",
            value: {
              ".owner": "some owner config"
            }
          })
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({code: 0, result: true});
          });
    })
  })

  describe('/set', () => {
    it('set simple', () => {
      return chai.request(server2)
          .post('/set').send({
            op_list: [
              {
                type: "SET_VALUE",
                ref: "test/balance",
                value: {a: 1, b: 2}
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
              },
              {
                type: 'SET_RULE',
                ref: "/rule/other/path",
                value: {
                  ".write": "some rule config"
                }
              },
              {
                type: 'SET_OWNER',
                ref: "/owner/other/path",
                value: {
                  ".owner": "some owner config"
                }
              }
            ]
          })
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({code: 0, result: true});
          });
    })
  })

  describe('/batch', () => {
    it('batch simple', () => {
      return chai.request(server1)
          .post(`/batch`).send({
            tx_list: [
              {
                operation: {
                  // Default type: SET_VALUE
                  ref: 'test/a',
                  value: 1
                }
              },
              {
                operation: {
                  type: 'INC_VALUE',
                  ref: "test/test",
                  value: 10
                }
              },
              {
                operation: {
                  type: 'DEC_VALUE',
                  ref: "test/test2",
                  value: 10
                }
              },
              {
                operation: {
                  type: 'SET_RULE',
                  ref: "/rule/other/path",
                  value: {
                    ".write": "some rule config"
                  }
                }
              },
              {
                operation: {
                  type: 'SET_OWNER',
                  ref: "/owner/other/path",
                  value: {
                    ".owner": "some owner config"
                  }
                }
              },
              {
                operation: {
                  type: 'SET',
                  op_list: [
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
                      value: 5
                    },
                    {
                      type: 'DEC_VALUE',
                      ref: "test/test2",
                      value: 5
                    },
                    {
                      type: 'SET_RULE',
                      ref: "/rule/other/path",
                      value: {
                        ".write": "some rule config"
                      }
                    },
                    {
                      type: 'SET_OWNER',
                      ref: "/owner/other/path",
                      value: {
                        ".owner": "some owner config"
                      }
                    }
                  ]
                }
              }
            ]
          })
          .then((res) => {
            res.should.have.status(201);
            res.body.should.be.deep.eql({
              code: 0,
              result: [
                true,
                true,
                true,
                true,
                true,
                true,
              ]
            });
      });
    })
  })

  describe('/deposit', () => {
    let serviceAdmin; // = server1
    let depositActor; // = server2
    let badActor;     // = server3
    const val = 50;
    let depositAccountPath;
    let depositPath;
    let withdrawPath;
    let balancePath;

    before(() => {
      serviceAdmin = JSON.parse(syncRequest('GET', server1 + '/node_address').body.toString('utf-8')).result;
      depositActor = JSON.parse(syncRequest('GET', server2 + '/node_address').body.toString('utf-8')).result;
      badActor = JSON.parse(syncRequest('GET', server3 + '/node_address').body.toString('utf-8')).result;
      depositAccountPath = `/deposit_accounts/test_service/${depositActor}`;
      depositPath = `/deposit/test_service/${depositActor}`;
      withdrawPath = `/withdraw/test_service/${depositActor}`;
      balancePath = `/account/${depositActor}/balance`;
      syncRequest('POST', server1+'/set_value', {json: {ref: `/account/${serviceAdmin}/balance`, value: 1000}});
      syncRequest('POST', server1+'/set_value', {json: {ref: balancePath, value: 1000}});
      syncRequest('POST', server1+'/set_value', {json: {ref: `/account/${badActor}/balance`, value: 1000}});
    })

    it('setup deposit', () => {
      const configPath = '/deposit_accounts/test_service/config'
      const result = syncRequest('POST', server1 + '/set', {json: {
        op_list: [
          {
            type: 'SET_OWNER',
            ref: configPath,
            value: {
              ".owner": {
                "owners": {
                  "*": {
                    "write_owner": false,
                    "write_rule": false,
                    "branch_owner": false
                  },
                  [serviceAdmin]: {
                    "write_owner": true,
                    "write_rule": true,
                    "branch_owner": true
                  }
                }
              }
            }
          },
          {
            type: 'SET_VALUE',
            ref: configPath,
            value: { lockup_duration: 1000 }
          }
        ]
      }})
      expect(result.statusCode).to.equal(201);
    })

    it('deposit', () => {
      let beforeBalance = JSON.parse(syncRequest('GET', server2 +
          `/get_value?ref=/account/${depositActor}/balance`).body.toString('utf-8'))
              .result;
      const result = syncRequest('POST', server2 + '/set_value', {json: {
            ref: depositPath + '/1/value',
            value: val
          }});
      expect(result.statusCode).to.equal(201);
      const depositValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositPath}/1/value`)
              .body.toString('utf-8')).result
      const depositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result
      const balance = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${balancePath}`)
              .body.toString('utf-8')).result
      const statusCode = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositPath}/1/result/code`)
              .body.toString('utf-8')).result
      expect(depositValue).to.equal(val);
      expect(depositAccountValue).to.equal(val);
      expect(balance).to.equal(beforeBalance - val);
      expect(statusCode).to.equal(FunctionResultCode.SUCCESS);
    });

    it('deposit more than account balance', () => {
      const beforeBalance = JSON.parse(syncRequest('GET', server2 +
          `/get_value?ref=/account/${depositActor}/balance`).body.toString('utf-8'))
              .result;
      const beforeDepositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result
      const result = syncRequest('POST', server2 + '/set_value', {json: {
            ref: depositPath + '/2/value',
            value: beforeBalance + 1
          }});
      expect(result.statusCode).to.equal(401);
      const depositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result
      const balance = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${balancePath}`)
              .body.toString('utf-8')).result
      expect(depositAccountValue).to.equal(beforeDepositAccountValue);
      expect(balance).to.equal(beforeBalance);
    });

    it('deposit by another address', () => {
      const beforeDepositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result
      const result = syncRequest('POST', server3 + '/set_value', {json: {
            ref: `${depositPath}/3/value`,
            value: val
          }});
      expect(result.statusCode).to.equal(401);
      const depositRequest = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositPath}/3`)
              .body.toString('utf-8')).result;
      const depositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result;
      expect(depositRequest).to.equal(null);
      expect(depositAccountValue).to.equal(beforeDepositAccountValue);
    });

    it('withdraw by another address', () => {
      sleep(1000);
      let beforeBalance = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=/account/${badActor}/balance`)
              .body.toString('utf-8')).result;
      let beforeDepositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result;
      const result = syncRequest('POST', server3 + '/set_value', {json: {
            ref: `${withdrawPath}/1/value`,
            value: val
          }});
      expect(result.statusCode).to.equal(401);
      const withdrawRequest = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${withdrawPath}/1`)
              .body.toString('utf-8')).result;
      const depositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result;
      const balance = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=/account/${badActor}/balance`)
              .body.toString('utf-8')).result;
      expect(withdrawRequest).to.equal(null);
      expect(depositAccountValue).to.equal(beforeDepositAccountValue);
      expect(balance).to.equal(beforeBalance);
    });

    it('withdraw more than deposited amount', () => {
      let beforeBalance = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${balancePath}`).body.toString('utf-8')).result;
      let beforeDepositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result;
      const result = syncRequest('POST', server2 + '/set_value', {json: {
            ref: `${withdrawPath}/1/value`,
            value: beforeDepositAccountValue + 1
          }});
      expect(result.statusCode).to.equal(401);
      const depositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result;
      const balance = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${balancePath}`)
              .body.toString('utf-8')).result;
      expect(depositAccountValue).to.equal(beforeDepositAccountValue);
      expect(balance).to.equal(beforeBalance);
    });

    it('withdraw', () => {
      let beforeBalance = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${balancePath}`).body.toString('utf-8')).result;
      const depositAccountBefore = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=/deposit_accounts`)
              .body.toString('utf-8')).result
      const result = syncRequest('POST', server2 + '/set_value', {json: {
            ref: `${withdrawPath}/2/value`,
            value: val
          }});
      expect(result.statusCode).to.equal(201);
      const depositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result
      const balance = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${balancePath}`)
              .body.toString('utf-8')).result
      const statusCode = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${withdrawPath}/2/result/code`)
              .body.toString('utf-8')).result
      expect(depositAccountValue).to.equal(0);
      expect(balance).to.equal(beforeBalance + val);
      expect(statusCode).to.equal(FunctionResultCode.SUCCESS);
    });

    it('deposit with the same deposit_id', () => {
      const result = syncRequest('POST', server2 + '/set_value', {json: {
            ref: depositPath + '/1/value',
            value: val
          }});
      expect(result.statusCode).to.equal(401);
    });

    it('deposit after withdraw', () => {
      const newVal = 100;
      let beforeBalance = JSON.parse(syncRequest('GET', server2 +
          `/get_value?ref=/account/${depositActor}/balance`).body.toString('utf-8'))
              .result;
      const result = syncRequest('POST', server2 + '/set_value', {json: {
            ref: depositPath + '/3/value',
            value: newVal
          }});
      expect(result.statusCode).to.equal(201);
      const depositValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositPath}/3/value`)
              .body.toString('utf-8')).result
      const depositAccountValue = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositAccountPath}/value`)
              .body.toString('utf-8')).result
      const balance = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${balancePath}`)
              .body.toString('utf-8')).result
      const statusCode = JSON.parse(syncRequest('GET',
          server2 + `/get_value?ref=${depositPath}/3/result/code`)
              .body.toString('utf-8')).result
      expect(depositValue).to.equal(newVal);
      expect(depositAccountValue).to.equal(newVal);
      expect(balance).to.equal(beforeBalance - newVal);
      expect(statusCode).to.equal(FunctionResultCode.SUCCESS);
    });
  });
})
