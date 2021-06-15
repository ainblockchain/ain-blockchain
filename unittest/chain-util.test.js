const ChainUtil = require('../common/chain-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("ChainUtil", () => {
  describe("numberOfZero", () => {
    it("when non-numeric input", () => {
      expect(ChainUtil.numberOrZero(null)).to.equal(0);
      expect(ChainUtil.numberOrZero(undefined)).to.equal(0);
      expect(ChainUtil.numberOrZero(Infinity)).to.equal(0);
      expect(ChainUtil.numberOrZero(NaN)).to.equal(0);
      expect(ChainUtil.numberOrZero(true)).to.equal(0);
      expect(ChainUtil.numberOrZero(false)).to.equal(0);
      expect(ChainUtil.numberOrZero('')).to.equal(0);
      expect(ChainUtil.numberOrZero('abc')).to.equal(0);
      expect(ChainUtil.numberOrZero({})).to.equal(0);
      expect(ChainUtil.numberOrZero({a: 'A'})).to.equal(0);
      expect(ChainUtil.numberOrZero([])).to.equal(0);
      expect(ChainUtil.numberOrZero([10])).to.equal(0);
    })

    it("when numeric input", () => {
      expect(ChainUtil.numberOrZero(0)).to.equal(0);
      expect(ChainUtil.numberOrZero(10)).to.equal(10);
      expect(ChainUtil.numberOrZero(-1)).to.equal(-1);
      expect(ChainUtil.numberOrZero(15.5)).to.equal(15.5);
    })
  })

  describe("toString", () => {
    it("when normal input", () => {
      expect(ChainUtil.toString(true)).to.equal('true');
      expect(ChainUtil.toString(false)).to.equal('false');
      expect(ChainUtil.toString(0)).to.equal('0');
      expect(ChainUtil.toString(100)).to.equal('100');
      expect(ChainUtil.toString(-100)).to.equal('-100');
      expect(ChainUtil.toString(10.19)).to.equal('10.19');
      expect(ChainUtil.toString(-10.19)).to.equal('-10.19');
      expect(ChainUtil.toString('')).to.equal('');
      expect(ChainUtil.toString('!@#$%^&*()_+')).to.equal('!@#$%^&*()_+');
      expect(ChainUtil.toString([])).to.equal('[]');
      expect(ChainUtil.toString([true, 10, 'abc'])).to.equal('[true,10,"abc"]');
      expect(ChainUtil.toString({})).to.equal('{}');
      expect(ChainUtil.toString({
        bool: true,
        num: 10,
        str: 'abc',
        obj: {
          nil: null,
          undef: undefined,
          inf: Infinity,
          nan: NaN,
        }
      })).to.equal('{"bool":true,"num":10,"str":"abc","obj":{"nil":null,"inf":null,"nan":null}}');
      expect(ChainUtil.toString(null)).to.equal('null');
      expect(ChainUtil.toString(undefined)).to.equal('');
      expect(ChainUtil.toString(Infinity)).to.equal('null');
      expect(ChainUtil.toString(NaN)).to.equal('null');
    })
  })

  describe("parseJsonOrNull", () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.parseJsonOrNull(''), null);
      assert.deepEqual(ChainUtil.parseJsonOrNull('<!DOCTYPE html>'), null);
    })

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.parseJsonOrNull('{}'), {});
      assert.deepEqual(ChainUtil.parseJsonOrNull(
          '{ "a": true, "b": { "c": 10 }, "d": "d" }'), { a: true, b: { c: 10 }, d: "d" });
    })
  })

  describe("isJson", () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.isJson(''), false);
      assert.deepEqual(ChainUtil.isJson('<!DOCTYPE html>'), false);
    })

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.isJson('{}'), true);
      assert.deepEqual(ChainUtil.isJson('{ "a": true, "b": { "c": 10 }, "d": "d" }'), true);
    })
  })

  describe("parsePath", () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.parsePath('//a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('/a//b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('/a/b/c//'), ['a', 'b', 'c']);
    })

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.parsePath('/a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(ChainUtil.parsePath('a/b/c/'), ['a', 'b', 'c']);
    })
  })

  describe("formatPath", () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.formatPath([null]), '/null');
      assert.deepEqual(ChainUtil.formatPath([undefined]), '/undefined');
      assert.deepEqual(ChainUtil.formatPath([Infinity]), '/null');
      assert.deepEqual(ChainUtil.formatPath([NaN]), '/null');
      assert.deepEqual(ChainUtil.formatPath([true]), '/true');
      assert.deepEqual(ChainUtil.formatPath([false]), '/false');
      assert.deepEqual(ChainUtil.formatPath([0]), '/0');
      assert.deepEqual(ChainUtil.formatPath(['']), '/');
      assert.deepEqual(ChainUtil.formatPath(['', '', '']), '///');
      assert.deepEqual(ChainUtil.formatPath([{}]), '/{}');
      assert.deepEqual(ChainUtil.formatPath([{a: 'A'}]), '/{"a":"A"}');
      assert.deepEqual(ChainUtil.formatPath([[]]), '/[]');
      assert.deepEqual(ChainUtil.formatPath([['a']]), '/["a"]');
    })

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.formatPath(['a', 'b', 'c']), '/a/b/c');
    })
  })

  describe("appendPath", () => {
    it("when one input", () => {
      assert.deepEqual(ChainUtil.appendPath('/a/b/c'), '/a/b/c');
    })

    it("when two inputs", () => {
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', '/d/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('a/b/c', '/d/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', 'd/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('a/b/c', 'd/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', '/'), '/a/b/c');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', '//'), '/a/b/c');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c/', '/d/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(ChainUtil.appendPath('/a/b/c//', '/d/e/f'), '/a/b/c/d/e/f');
    })

    it("when more than two inputs", () => {
      assert.deepEqual(ChainUtil.appendPath('/a/b/c', '/d/e/f', '/g/h/i'), '/a/b/c/d/e/f/g/h/i');
      assert.deepEqual(ChainUtil.appendPath('a/b', 'c/d', 'e/f', 'g/h'), '/a/b/c/d/e/f/g/h');
    })
  })

  describe("getJsObject", () => {
    let obj;

    beforeEach(() => {
      obj = {
        a: {
          aa: '/a/aa',
          ab: true,
          ac: 10,
          ad: [],
        },
        b: {
          ba: '/b/ba'
        }
      };
    })

    it("when abnormal path", () => {
      assert.deepEqual(ChainUtil.getJsObject(obj, null), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, undefined), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, true), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, 0), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ''), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, {}), null);
    })

    it("when non-existing path", () => {
      assert.deepEqual(ChainUtil.getJsObject(obj, ['z']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'az']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'aa', 'aaz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ab', 'abz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ac', 'acz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ad', 'adz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['b', 'bz']), null);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['b', 'ba', 'baz']), null);
    })

    it("when existing path", () => {
      assert.deepEqual(ChainUtil.getJsObject(obj, []), obj);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a']), obj.a);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'aa']), obj.a.aa);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ab']), obj.a.ab);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ac']), obj.a.ac);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['a', 'ad']), obj.a.ad);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['b']), obj.b);
      assert.deepEqual(ChainUtil.getJsObject(obj, ['b', 'ba']), obj.b.ba);
    })
  })

  describe("setJsObject", () => {
    const org = {
      a: {
        aa: '/a/aa',
        ab: true,
        ac: 10,
        ad: [],
      },
      b: {
        ba: '/b/ba'
      }
    };
    const value = {
      some: 'value'
    };
    let obj;

    beforeEach(() => {
      obj = JSON.parse(JSON.stringify(org));
    })

    it("when abnormal path", () => {
      expect(ChainUtil.setJsObject(obj, null, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, undefined, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, true, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, 0, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, '', null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(ChainUtil.setJsObject(obj, {}, null)).to.equal(false);
      assert.deepEqual(obj, org);
    })

    it("when non-existing path", () => {
      expect(ChainUtil.setJsObject(obj, ['z'], value)).to.equal(true);
      assert.deepEqual(obj.z, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'az'], value)).to.equal(true);
      assert.deepEqual(obj.a.az, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'aa', 'aaz'], value)).to.equal(true);
      assert.deepEqual(obj.a.aa.aaz, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ab', 'abz'], value)).to.equal(true);
      assert.deepEqual(obj.a.ab.abz, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ac', 'acz'], value)).to.equal(true);
      assert.deepEqual(obj.a.ac.acz, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ad', 'adz'], value)).to.equal(true);
      assert.deepEqual(obj.a.ad.adz, value);
      expect(ChainUtil.setJsObject(obj, ['b', 'bz'], value)).to.equal(true);
      assert.deepEqual(obj.b.bz, value);
      expect(ChainUtil.setJsObject(obj, ['b', 'ba', 'baz'], value)).to.equal(true);
      assert.deepEqual(obj.b.ba.baz, value);
    })

    it("when empty path", () => {
      expect(ChainUtil.setJsObject(obj, [], value)).to.equal(false);
      assert.deepEqual(obj, org);  // No change.
    })

    it("when existing path", () => {
      expect(ChainUtil.setJsObject(obj, ['a'], value)).to.equal(true);
      assert.deepEqual(obj.a, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'aa'], value)).to.equal(true);
      assert.deepEqual(obj.a.aa, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ab'], value)).to.equal(true);
      assert.deepEqual(obj.a.ab, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ac'], value)).to.equal(true);
      assert.deepEqual(obj.a.ac, value);
      expect(ChainUtil.setJsObject(obj, ['a', 'ad'], value)).to.equal(true);
      assert.deepEqual(obj.a.ad, value);
      expect(ChainUtil.setJsObject(obj, ['b'], value)).to.equal(true);
      assert.deepEqual(obj.b, value);
      expect(ChainUtil.setJsObject(obj, ['b', 'ba'], value)).to.equal(true);
      assert.deepEqual(obj.b.ba, value);
    })
  })

  describe("mergeNumericJsObjects", () => {
    it("when normal input", () => {
      assert.deepEqual(ChainUtil.mergeNumericJsObjects({
        "node1": {
          "node11": {
            "node111": 1,
            "node112": 2
          },
          "node12": {
            "node121": 3,
            "node122": 4
          },
        }
      }, {
        "node1": {
          "node11": {
            "node111": 10,
            "node112": 20
          },
          "node13": {
            "node131": 5,
            "node132": 6
          },
        }
      }), {
        "node1": {
          "node11": {
            "node111": 11,
            "node112": 22
          },
          "node12": {
            "node121": 3,
            "node122": 4
          },
          "node13": {
            "node131": 5,
            "node132": 6
          },
        }
      });
    });

    it("when normal input with null values", () => {
      assert.deepEqual(ChainUtil.mergeNumericJsObjects({
        "node1": {
          "node11": {
            "node111": 1,
            "node112": 2
          },
          "node12": {
            "node121": 3,
            "node122": 4
          },
          "node13": null
        }
      }, {
        "node1": {
          "node11": {
            "node111": 10,
            "node112": 20
          },
          "node13": {
            "node131": 5,
            "node132": 6
          },
        }
      }), {
        "node1": {
          "node11": {
            "node111": 11,
            "node112": 22
          },
          "node12": {
            "node121": 3,
            "node122": 4
          },
          "node13": {
            "node131": 5,
            "node132": 6
          },
        }
      });
    });
  })

  describe("isFailedTx", () => {
    it("when abnormal input", () => {
      expect(ChainUtil.isFailedTx(null)).to.equal(true);
      expect(ChainUtil.isFailedTx(undefined)).to.equal(true);
      expect(ChainUtil.isFailedTx(true)).to.equal(true);
      expect(ChainUtil.isFailedTx(false)).to.equal(true);
      expect(ChainUtil.isFailedTx('true')).to.equal(true);
      expect(ChainUtil.isFailedTx({})).to.equal(true);
      expect(ChainUtil.isFailedTx({
        error_message: 'some message'
      })).to.equal(true);
    })

    it("when single set operation without function triggering", () => {
      expect(ChainUtil.isFailedTx({
        code: 0,
        error_message: null
      })).to.equal(false);

      expect(ChainUtil.isFailedTx({
        code: 1,
        error_message: null
      })).to.equal(true);

      expect(ChainUtil.isFailedTx({
        code: 100,
        error_message: 'some message'
      })).to.equal(true);
    });

    it("when single set operation with native function triggering", () => {
      expect(ChainUtil.isFailedTx({
        "func_results": {
          "_saveLastTx": {
            "op_results": [
              {
                "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": [
                        {
                          "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "gas_amount": 1
                          }
                        }
                      ],
                      "code": "SUCCESS",
                      "gas_amount": 0,
                    }
                  },
                  "code": 0,
                  "gas_amount": 1
                }
              }
            ],
            "code": "SUCCESS",
            "gas_amount": 0,
          }
        },
        "code": 0,
        "gas_amount": 1
      })).to.equal(false);

      expect(ChainUtil.isFailedTx({
        "func_results": {
          "_saveLastTx": {
            "op_results": [
              {
                "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": [
                        {
                          "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "gas_amount": 1
                          }
                        }
                      ],
                      "code": "SUCCESS",
                      "gas_amount": 0,
                    }
                  },
                  "code": 0,
                  "gas_amount": 1
                }
              }
            ],
            "code": "SUCCESS",
            "gas_amount": 0,
          }
        },
        "code": 201,  // The root operation failed
        "error_message": "Not a number type: bar or 10",
        "gas_amount": 1
      })).to.equal(true);

      expect(ChainUtil.isFailedTx({
        "func_results": {
          "_saveLastTx": {
            "op_results": [
              {
                "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": [
                        {
                          "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 201,  // A sub-operation failed
                            "error_message": "Not a number type: bar or 10",
                            "gas_amount": 1
                          }
                        }
                      ],
                      "code": "SUCCESS",
                      "gas_amount": 0,
                    }
                  },
                  "code": 0,
                  "gas_amount": 1
                }
              }
            ],
            "code": "SUCCESS",
            "gas_amount": 0,
          }
        },
        "code": 0,
        "gas_amount": 1
      })).to.equal(true);

      expect(ChainUtil.isFailedTx({
        "func_results": {
          "_saveLastTx": {
            "op_results": [
              {
                "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": [
                        {
                          "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "gas_amount": 1
                          }
                        }
                      ],
                      "code": "FAILURE",  // A function failed.
                      "gas_amount": 0,
                    }
                  },
                  "code": 0,
                  "gas_amount": 1
                }
              }
            ],
            "code": "SUCCESS",
            "gas_amount": 0,
          }
        },
        "code": 0,
        "gas_amount": 1
      })).to.equal(true);
    });

    it("when single set operation with REST function triggering", () => {
      expect(ChainUtil.isFailedTx({
        "code": 0,
        "func_results": {
          "0x11111": {
            "code": "SUCCESS",
            "gas_amount": 10,
          }
        },
        "gas_amount": 1,
        "gas_amount_total": 11,
        "gas_cost_total": 0,
      })).to.equal(false);
    });

    it("when multi-set operation without function triggering", () => {
      expect(ChainUtil.isFailedTx({
        "result_list": [
          {
            "code": 0,
            "gas_amount": 1
          },
          {
            "code": 0,
            "gas_amount": 1,
          },
          {
            "code": 0,
            "gas_amount": 1
          },
        ],
      })).to.equal(false);

      expect(ChainUtil.isFailedTx({
        "result_list": [
          {
            "code": 0,
            "gas_amount": 1
          },
          {
            "code": 201,
            "error_message": "Not a number type: bar or 10",
            "gas_amount": 0
          },
          {
            "code": 0,
            "gas_amount": 1
          },
        ]
      })).to.equal(true);
    })

    it("when multi-set operation with native function triggering", () => {
      expect(ChainUtil.isFailedTx({
        "result_list": [
          {
            "code": 0,
            "gas_amount": 1
          },
          {
            "func_results": {
              "_saveLastTx": {
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": [
                            {
                              "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "gas_amount": 1
                              }
                            }
                          ],
                          "code": "SUCCESS",
                          "gas_amount": 0,
                        }
                      },
                      "code": 0,
                      "gas_amount": 1
                    }
                  }
                ],
                "code": "SUCCESS",
                "gas_amount": 0,
              }
            },
            "code": 0,
            "gas_amount": 1,
          },
          {
            "code": 0,
            "gas_amount": 1,
          }
        ]
      })).to.equal(false);

      expect(ChainUtil.isFailedTx({
        "result_list": [
          {
            "code": 0,
            "gas_amount": 1
          },
          {
            "func_results": {
              "_saveLastTx": {
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": [
                            {
                              "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "gas_amount": 1
                              }
                            }
                          ],
                          "code": "SUCCESS",
                          "gas_amount": 0,
                        }
                      },
                      "code": 0,
                      "gas_amount": 1
                    }
                  }
                ],
                "code": "SUCCESS",
                "gas_amount": 0,
              }
            },
            "code": 0,
            "gas_amount": 0
          },
          {
            "code": 201,  // One of the root operations failed.
            "error_message": "Not a number type: bar or 10",
            "gas_amount": 1,
          },
        ]
      })).to.equal(true);

      expect(ChainUtil.isFailedTx({
        "result_list": [
          {
            "code": 0,
            "gas_amount": 1
          },
          {
            "func_results": {
              "_saveLastTx": {
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": [
                            {
                              "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 201,  // A sub-operation failed.
                                "error_message": "Not a number type: bar or 10",
                                "gas_amount": 1
                              }
                            }
                          ],
                          "code": "SUCCESS",
                          "gas_amount": 0,
                        }
                      },
                      "code": 0,
                      "gas_amount": 1
                    }
                  }
                ],
                "code": "SUCCESS",
                "gas_amount": 0,
              }
            },
            "code": 0,
            "gas_amount": 0
          },
          {
            "code": 0,
            "gas_amount": 1,
          },
        ]
      })).to.equal(true);

      expect(ChainUtil.isFailedTx({
        "result_list": [
          {
            "code": 0,
            "gas_amount": 1
          },
          {
            "func_results": {
              "_saveLastTx": {
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": [
                            {
                              "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "gas_amount": 1
                              }
                            }
                          ],
                          "code": "FAILURE",  // A function failed.
                          "gas_amount": 0,
                        }
                      },
                      "code": 0,
                      "gas_amount": 1
                    }
                  }
                ],
                "code": "SUCCESS",
                "gas_amount": 0,
              }
            },
            "code": 0,
            "gas_amount": 0
          },
          {
            "code": 0,
            "gas_amount": 1,
          },
        ]
      })).to.equal(true);
    })

    it("when multi-set operation with REST function triggering", () => {
      expect(ChainUtil.isFailedTx({
        "result_list": [
          {
            "code": 0,
            "gas_amount": 1,
            "gas_amount_total": {
              "service": 1,
              "app": {}
            },
            "gas_cost_total": 0
          },
          {
            "code": 0,
            "func_results": {
              "0x11111": {
                "code": "SUCCESS",
                "gas_amount": 10,
              }
            },
            "gas_amount": 1,
            "gas_amount_total": {
              "service": 11,
              "app": {}
            },
            "gas_cost_total": 0
          },
          {
            "code": 0,
            "gas_amount": 1,
            "gas_amount_total": {
              "service": 1,
              "app": {}
            }
          }
        ]
      })).to.equal(false);
    });
  })

  describe("getTotalGasAmount", () => {
    const op = { ref: '/test', value: null, type: 'SET_VALUE' };
    const appOp = { ref: '/apps/test', value: null, type: 'SET_VALUE' };

    it("when abnormal input", () => {
      const emptyVal = { app: {}, service: 0 };
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, null), emptyVal);
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, undefined), emptyVal);
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, {}), emptyVal);
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, { gas: 'gas' }), emptyVal);
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, { gas: {} }), emptyVal);
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, true), emptyVal);
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, 'result'), emptyVal);
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, 0), emptyVal);
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, 1), emptyVal);
    })

    it("when single operation result input (service)", () => {
      const result = {
        "func_results": {
          "_saveLastTx": {
            "op_results": [
              {
                "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": [
                        {
                          "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "gas_amount": 1
                          }
                        }
                      ],
                      "code": "SUCCESS",
                      "gas_amount": 10
                    }
                  },
                  "code": 0,
                  "gas_amount": 1
                }
              }
            ],
            "code": "SUCCESS",
            "gas_amount": 20,
          }
        },
        "code": 0,
        "gas_amount": 30
      };
      assert.deepEqual(ChainUtil.getTotalGasAmount(op, result), {
        app: {},
        service: 62
      });
    })

    it("when single operation result input (app)", () => {
      const result = {
        "func_results": {
          "_saveLastTx": {
            "op_results": [
              {
                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": [
                        {
                          "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "gas_amount": 1
                          }
                        }
                      ],
                      "code": "SUCCESS",
                      "gas_amount": 10
                    }
                  },
                  "code": 0,
                  "gas_amount": 1
                }
              }
            ],
            "code": "SUCCESS",
            "gas_amount": 20,
          }
        },
        "code": 0,
        "gas_amount": 30
      };
      assert.deepEqual(ChainUtil.getTotalGasAmount(appOp, result), {
        app: {
          test: 62
        },
        service: 0
      });
    })

    it("when single operation result input (service & app)", () => {
      const result = {
        "func_results": {
          "_saveLastTx": {
            "op_results": [
              {
                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": [
                        {
                          "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "gas_amount": 1
                          }
                        }
                      ],
                      "code": "SUCCESS",
                      "gas_amount": 10
                    }
                  },
                  "code": 0,
                  "gas_amount": 1
                }
              }
            ],
            "code": "SUCCESS",
            "gas_amount": 20,
          }
        },
        "code": 0,
        "gas_amount": 30
      };
      assert.deepEqual(ChainUtil.getTotalGasAmount(appOp, result), {
        app: {
          test: 61
        },
        service: 1
      });
    })

    it("when multiple operation result input (service)", () => {
      const setTxOp = { type: 'SET', op_list: [{...op}, {...op}] };
      const result = {
        "result_list": [
          {
            "func_results": {
              "_saveLastTx": {
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": [
                            {
                              "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "gas_amount": 1
                              }
                            }
                          ],
                          "code": "SUCCESS",
                          "gas_amount": 10
                        }
                      },
                      "code": 0,
                      "gas_amount": 1
                    }
                  }
                ],
                "code": "SUCCESS",
                "gas_amount": 20
              }
            },
            "code": 0,
            "gas_amount": 30
          },
          {
            "code": 0,
            "gas_amount": 1
          },
        ]
      };
      assert.deepEqual(ChainUtil.getTotalGasAmount(setTxOp, result), {
        app: {},
        service: 63
      });
    })

    it("when multiple operation result input (app)", () => {
      const setTxOp = { type: 'SET', op_list: [{...appOp}, {...appOp}] };
      const result = {
        "result_list": [
          {
            "func_results": {
              "_saveLastTx": {
                "op_results": [
                  {
                    "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": [
                            {
                              "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "gas_amount": 1
                              }
                            }
                          ],
                          "code": "SUCCESS",
                          "gas_amount": 10
                        }
                      },
                      "code": 0,
                      "gas_amount": 1
                    }
                  }
                ],
                "code": "SUCCESS",
                "gas_amount": 20
              }
            },
            "code": 0,
            "gas_amount": 30
          },
          {
            "code": 0,
            "gas_amount": 1
          },
        ]
      };
      assert.deepEqual(ChainUtil.getTotalGasAmount(setTxOp, result), {
        app: {
          test: 63
        },
        service: 0
      });
    })

    it("when multiple operation result input (service & app)", () => {
      const setTxOp = { type: 'SET', op_list: [{...appOp}, {...op}] };
      const result = {
        "result_list": [
          {
            "func_results": {
              "_saveLastTx": {
                "op_results": [
                  {
                    "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": [
                            {
                              "path": "/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "gas_amount": 1
                              }
                            }
                          ],
                          "code": "SUCCESS",
                          "gas_amount": 10
                        }
                      },
                      "code": 0,
                      "gas_amount": 1
                    }
                  }
                ],
                "code": "SUCCESS",
                "gas_amount": 20
              }
            },
            "code": 0,
            "gas_amount": 30
          },
          {
            "code": 0,
            "gas_amount": 1
          },
        ]
      };
      assert.deepEqual(ChainUtil.getTotalGasAmount(setTxOp, result), {
        app: {
          test: 50
        },
        service: 13
      });
    })
  })

  describe("getTotalGasCost", () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.getTotalGasCost(1, null), 0);
      assert.deepEqual(ChainUtil.getTotalGasCost(1, undefined), 0);
      assert.deepEqual(ChainUtil.getTotalGasCost(1, {}), 0);
      assert.deepEqual(ChainUtil.getTotalGasCost(1, { gas: 'gas' }), 0);
      assert.deepEqual(ChainUtil.getTotalGasCost(1, { gas: {} }), 0);
      assert.deepEqual(ChainUtil.getTotalGasCost(1, true), 0);
      assert.deepEqual(ChainUtil.getTotalGasCost(1, 'result'), 0);
    })

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.getTotalGasCost(1, 0), 0);
      assert.deepEqual(ChainUtil.getTotalGasCost(1, 1), 0.000001);
      assert.deepEqual(ChainUtil.getTotalGasCost(0, 1), 0);
      assert.deepEqual(ChainUtil.getTotalGasCost(1000000, 1), 1);
      assert.deepEqual(ChainUtil.getTotalGasCost(undefined, 1), 0);
    })
  })

  describe('getDependentAppNameFromRef', () => {
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef(), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef(null), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef(undefined), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef(''), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/'), null);
    });

    it("when normal input (app-dependent service path)", () => {
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/manage_app/app_a'), 'app_a');
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/payments/app_a'), 'app_a');
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/staking/app_a'), 'app_a');
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/staking/app_a/some/nested/path'), 'app_a');
    });
    
    it("when normal input (app-independent service path)", () => {
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/accounts/0xabcd/value'), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/service_accounts/staking'), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/gas_fee/gas_fee'), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/escrow/source/target/id/key/value'), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/sharding/config'), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/transfer'), null);
      assert.deepEqual(ChainUtil.getDependentAppNameFromRef('/transfer/from/to/key/value'), null);
    });
  })

  describe('getServiceDependentAppNameList', () => { 
    it("when abnormal input", () => {
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList(), []);
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList(null), []);
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList(undefined), []);
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList({}), []);
    });

    it("when normal input", () => {
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList({
        ref: '/'
      }), []);
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList({
        ref: '/transfer/from/to/key/value'
      }), []);
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList({
        ref: '/manage_app/app_a/create/key'
      }), ['app_a']);
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList({
        op_list: [
          {
            ref: '/'
          }
        ]
      }), []);
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList({
        op_list: [
          {
            ref: '/transfer/from/to/key/value'
          },
          {
            ref: '/manage_app/app_a/create/key'
          }
        ]
      }), ['app_a']);
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList({
        op_list: [
          {
            ref: '/transfer/from/to/key/value'
          },
          {
            ref: '/manage_app/app_a/create/key'
          },
          {
            ref: '/payments/app_a/user/id/pay/key'
          }
        ]
      }), ['app_a']);
      assert.deepEqual(ChainUtil.getServiceDependentAppNameList({
        op_list: [
          {
            ref: '/transfer/from/to/key/value'
          },
          {
            ref: '/manage_app/app_a/create/key'
          },
          {
            ref: '/payments/app_b/user/id/pay/key'
          }
        ]
      }), ['app_a', 'app_b']);
    });
  })
})