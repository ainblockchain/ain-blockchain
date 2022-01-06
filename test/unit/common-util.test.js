const CommonUtil = require('../../common/common-util');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const { BlockchainParams } = require('../../common/constants');

describe("CommonUtil", () => {
  describe("numberOfZero", () => {
    it("when non-numeric input", () => {
      expect(CommonUtil.numberOrZero(null)).to.equal(0);
      expect(CommonUtil.numberOrZero(undefined)).to.equal(0);
      expect(CommonUtil.numberOrZero(Infinity)).to.equal(0);
      expect(CommonUtil.numberOrZero(NaN)).to.equal(0);
      expect(CommonUtil.numberOrZero(true)).to.equal(0);
      expect(CommonUtil.numberOrZero(false)).to.equal(0);
      expect(CommonUtil.numberOrZero('')).to.equal(0);
      expect(CommonUtil.numberOrZero('abc')).to.equal(0);
      expect(CommonUtil.numberOrZero({})).to.equal(0);
      expect(CommonUtil.numberOrZero({a: 'A'})).to.equal(0);
      expect(CommonUtil.numberOrZero([])).to.equal(0);
      expect(CommonUtil.numberOrZero([10])).to.equal(0);
    })

    it("when numeric input", () => {
      expect(CommonUtil.numberOrZero(0)).to.equal(0);
      expect(CommonUtil.numberOrZero(10)).to.equal(10);
      expect(CommonUtil.numberOrZero(-1)).to.equal(-1);
      expect(CommonUtil.numberOrZero(15.5)).to.equal(15.5);
    })
  })

  describe("toString", () => {
    it("when normal input", () => {
      expect(CommonUtil.toString(true)).to.equal('true');
      expect(CommonUtil.toString(false)).to.equal('false');
      expect(CommonUtil.toString(0)).to.equal('0');
      expect(CommonUtil.toString(100)).to.equal('100');
      expect(CommonUtil.toString(-100)).to.equal('-100');
      expect(CommonUtil.toString(10.19)).to.equal('10.19');
      expect(CommonUtil.toString(-10.19)).to.equal('-10.19');
      expect(CommonUtil.toString('')).to.equal('');
      expect(CommonUtil.toString('!@#$%^&*()_+')).to.equal('!@#$%^&*()_+');
      expect(CommonUtil.toString([])).to.equal('[]');
      expect(CommonUtil.toString([true, 10, 'abc'])).to.equal('[true,10,"abc"]');
      expect(CommonUtil.toString({})).to.equal('{}');
      expect(CommonUtil.toString({
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
      expect(CommonUtil.toString(null)).to.equal('null');
      expect(CommonUtil.toString(undefined)).to.equal('');
      expect(CommonUtil.toString(Infinity)).to.equal('null');
      expect(CommonUtil.toString(NaN)).to.equal('null');
    })
  })

  describe("toHexString", () => {
    it("when non-string input", () => {
      expect(CommonUtil.toHexString(0)).to.equal('');
      expect(CommonUtil.toHexString(10)).to.equal('');
      expect(CommonUtil.toHexString(-1)).to.equal('');
      expect(CommonUtil.toHexString(15.5)).to.equal('');
      expect(CommonUtil.toHexString(null)).to.equal('');
      expect(CommonUtil.toHexString(undefined)).to.equal('');
      expect(CommonUtil.toHexString(Infinity)).to.equal('');
      expect(CommonUtil.toHexString(NaN)).to.equal('');
      expect(CommonUtil.toHexString({})).to.equal('');
      expect(CommonUtil.toHexString({a: 'A'})).to.equal('');
      expect(CommonUtil.toHexString([])).to.equal('');
      expect(CommonUtil.toHexString([10])).to.equal('');
      expect(CommonUtil.toHexString(false)).to.equal('');
    })

    it("when non-string input with withPrefix = true", () => {
      expect(CommonUtil.toHexString(0, true)).to.equal('0x');
    })

    it("when string input", () => {
      expect(CommonUtil.toHexString('')).to.equal('');
      expect(CommonUtil.toHexString('0x0123456789abcdef')).to.equal('0123456789abcdef');
      expect(CommonUtil.toHexString('0x0123456789ABCDEF')).to.equal('0123456789abcdef');
      expect(CommonUtil.toHexString('aAzZ')).to.equal('61417a5a');
    })

    it("when string input with withPrefix = true", () => {
      expect(CommonUtil.toHexString('', true)).to.equal('0x');
      expect(CommonUtil.toHexString('0x0123456789abcdef', true)).to.equal('0x0123456789abcdef');
    })
  })

  describe("parseJsonOrNull", () => {
    it("when abnormal input", () => {
      assert.deepEqual(CommonUtil.parseJsonOrNull(''), null);
      assert.deepEqual(CommonUtil.parseJsonOrNull('<!DOCTYPE html>'), null);
    })

    it("when normal input", () => {
      assert.deepEqual(CommonUtil.parseJsonOrNull('{}'), {});
      assert.deepEqual(CommonUtil.parseJsonOrNull(
          '{ "a": true, "b": { "c": 10 }, "d": "d" }'), { a: true, b: { c: 10 }, d: "d" });
    })
  })

  describe("isJson", () => {
    it("when abnormal input", () => {
      assert.deepEqual(CommonUtil.isJson(''), false);
      assert.deepEqual(CommonUtil.isJson('<!DOCTYPE html>'), false);
    })

    it("when normal input", () => {
      assert.deepEqual(CommonUtil.isJson('{}'), true);
      assert.deepEqual(CommonUtil.isJson('{ "a": true, "b": { "c": 10 }, "d": "d" }'), true);
    })
  })

  describe("parsePath", () => {
    it("when abnormal input", () => {
      assert.deepEqual(CommonUtil.parsePath('//a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(CommonUtil.parsePath('/a//b/c'), ['a', 'b', 'c']);
      assert.deepEqual(CommonUtil.parsePath('/a/b/c//'), ['a', 'b', 'c']);
    })

    it("when normal input", () => {
      assert.deepEqual(CommonUtil.parsePath('/a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(CommonUtil.parsePath('a/b/c'), ['a', 'b', 'c']);
      assert.deepEqual(CommonUtil.parsePath('a/b/c/'), ['a', 'b', 'c']);
    })
  })

  describe("formatPath", () => {
    it("when abnormal input", () => {
      assert.deepEqual(CommonUtil.formatPath([null]), '/null');
      assert.deepEqual(CommonUtil.formatPath([undefined]), '/undefined');
      assert.deepEqual(CommonUtil.formatPath([Infinity]), '/null');
      assert.deepEqual(CommonUtil.formatPath([NaN]), '/null');
      assert.deepEqual(CommonUtil.formatPath([true]), '/true');
      assert.deepEqual(CommonUtil.formatPath([false]), '/false');
      assert.deepEqual(CommonUtil.formatPath([0]), '/0');
      assert.deepEqual(CommonUtil.formatPath(['']), '/');
      assert.deepEqual(CommonUtil.formatPath(['', '', '']), '///');
      assert.deepEqual(CommonUtil.formatPath([{}]), '/{}');
      assert.deepEqual(CommonUtil.formatPath([{a: 'A'}]), '/{"a":"A"}');
      assert.deepEqual(CommonUtil.formatPath([[]]), '/[]');
      assert.deepEqual(CommonUtil.formatPath([['a']]), '/["a"]');
    })

    it("when normal input", () => {
      assert.deepEqual(CommonUtil.formatPath(['a', 'b', 'c']), '/a/b/c');
    })
  })

  describe("appendPath", () => {
    it("when one input", () => {
      assert.deepEqual(CommonUtil.appendPath('/a/b/c'), '/a/b/c');
    })

    it("when two inputs", () => {
      assert.deepEqual(CommonUtil.appendPath('/a/b/c', '/d/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(CommonUtil.appendPath('a/b/c', '/d/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(CommonUtil.appendPath('/a/b/c', 'd/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(CommonUtil.appendPath('a/b/c', 'd/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(CommonUtil.appendPath('/a/b/c', '/'), '/a/b/c');
      assert.deepEqual(CommonUtil.appendPath('/a/b/c', '//'), '/a/b/c');
      assert.deepEqual(CommonUtil.appendPath('/a/b/c/', '/d/e/f'), '/a/b/c/d/e/f');
      assert.deepEqual(CommonUtil.appendPath('/a/b/c//', '/d/e/f'), '/a/b/c/d/e/f');
    })

    it("when more than two inputs", () => {
      assert.deepEqual(CommonUtil.appendPath('/a/b/c', '/d/e/f', '/g/h/i'), '/a/b/c/d/e/f/g/h/i');
      assert.deepEqual(CommonUtil.appendPath('a/b', 'c/d', 'e/f', 'g/h'), '/a/b/c/d/e/f/g/h');
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
      assert.deepEqual(CommonUtil.getJsObject(obj, null), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, undefined), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, true), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, 0), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, ''), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, {}), null);
    })

    it("when non-existing path", () => {
      assert.deepEqual(CommonUtil.getJsObject(obj, ['z']), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a', 'az']), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a', 'aa', 'aaz']), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a', 'ab', 'abz']), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a', 'ac', 'acz']), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a', 'ad', 'adz']), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['b', 'bz']), null);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['b', 'ba', 'baz']), null);
    })

    it("when existing path", () => {
      assert.deepEqual(CommonUtil.getJsObject(obj, []), obj);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a']), obj.a);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a', 'aa']), obj.a.aa);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a', 'ab']), obj.a.ab);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a', 'ac']), obj.a.ac);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['a', 'ad']), obj.a.ad);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['b']), obj.b);
      assert.deepEqual(CommonUtil.getJsObject(obj, ['b', 'ba']), obj.b.ba);
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
      some: 'value',
      b: 'other b value'
    };
    let obj;

    beforeEach(() => {
      obj = JSON.parse(JSON.stringify(org));
    })

    it("when abnormal path", () => {
      expect(CommonUtil.setJsObject(obj, null, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(CommonUtil.setJsObject(obj, undefined, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(CommonUtil.setJsObject(obj, true, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(CommonUtil.setJsObject(obj, 0, null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(CommonUtil.setJsObject(obj, '', null)).to.equal(false);
      assert.deepEqual(obj, org);
      expect(CommonUtil.setJsObject(obj, {}, null)).to.equal(false);
      assert.deepEqual(obj, org);
    })

    it("when non-existing path", () => {
      expect(CommonUtil.setJsObject(obj, ['z'], value)).to.equal(true);
      assert.deepEqual(obj.z, value);
      expect(CommonUtil.setJsObject(obj, ['a', 'az'], value)).to.equal(true);
      assert.deepEqual(obj.a.az, value);
      expect(CommonUtil.setJsObject(obj, ['a', 'aa', 'aaz'], value)).to.equal(true);
      assert.deepEqual(obj.a.aa.aaz, value);
      expect(CommonUtil.setJsObject(obj, ['a', 'ab', 'abz'], value)).to.equal(true);
      assert.deepEqual(obj.a.ab.abz, value);
      expect(CommonUtil.setJsObject(obj, ['a', 'ac', 'acz'], value)).to.equal(true);
      assert.deepEqual(obj.a.ac.acz, value);
      expect(CommonUtil.setJsObject(obj, ['a', 'ad', 'adz'], value)).to.equal(true);
      assert.deepEqual(obj.a.ad.adz, value);
      expect(CommonUtil.setJsObject(obj, ['b', 'bz'], value)).to.equal(true);
      assert.deepEqual(obj.b.bz, value);
      expect(CommonUtil.setJsObject(obj, ['b', 'ba', 'baz'], value)).to.equal(true);
      assert.deepEqual(obj.b.ba.baz, value);
    })

    it("when empty path with primitive value", () => {
      expect(CommonUtil.setJsObject(obj, [], 'some value')).to.equal(false);
      assert.deepEqual(obj, org);  // No change.
    })

    it("when empty path with object value", () => {
      expect(CommonUtil.setJsObject(obj, [], value)).to.equal(true);
      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          expect(obj.hasOwnProperty(key)).to.equal(true);
          assert.deepEqual(obj[key], value[key]);
        }
      }
      for (const key in org) {
        if (org.hasOwnProperty(key) && !value.hasOwnProperty(key)) {
          expect(obj.hasOwnProperty(key)).to.equal(true);
          assert.deepEqual(obj[key], org[key]);
        }
      }
    })

    it("when existing path", () => {
      expect(CommonUtil.setJsObject(obj, ['a'], value)).to.equal(true);
      assert.deepEqual(obj.a, value);
      expect(CommonUtil.setJsObject(obj, ['a', 'aa'], value)).to.equal(true);
      assert.deepEqual(obj.a.aa, value);
      expect(CommonUtil.setJsObject(obj, ['a', 'ab'], value)).to.equal(true);
      assert.deepEqual(obj.a.ab, value);
      expect(CommonUtil.setJsObject(obj, ['a', 'ac'], value)).to.equal(true);
      assert.deepEqual(obj.a.ac, value);
      expect(CommonUtil.setJsObject(obj, ['a', 'ad'], value)).to.equal(true);
      assert.deepEqual(obj.a.ad, value);
      expect(CommonUtil.setJsObject(obj, ['b'], value)).to.equal(true);
      assert.deepEqual(obj.b, value);
      expect(CommonUtil.setJsObject(obj, ['b', 'ba'], value)).to.equal(true);
      assert.deepEqual(obj.b.ba, value);
    })
  })

  describe("mergeNumericJsObjects", () => {
    it("when normal input", () => {
      assert.deepEqual(CommonUtil.mergeNumericJsObjects({
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
      assert.deepEqual(CommonUtil.mergeNumericJsObjects({
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
      expect(CommonUtil.isFailedTx(null)).to.equal(true);
      expect(CommonUtil.isFailedTx(undefined)).to.equal(true);
      expect(CommonUtil.isFailedTx(true)).to.equal(true);
      expect(CommonUtil.isFailedTx(false)).to.equal(true);
      expect(CommonUtil.isFailedTx('true')).to.equal(true);
      expect(CommonUtil.isFailedTx({})).to.equal(true);
      expect(CommonUtil.isFailedTx({
        message: 'some message'
      })).to.equal(true);
    })

    it("when single set operation without function triggering", () => {
      expect(CommonUtil.isFailedTx({
        code: 0,
        message: null
      })).to.equal(false);

      expect(CommonUtil.isFailedTx({
        code: 1,
        message: null
      })).to.equal(true);

      expect(CommonUtil.isFailedTx({
        code: 10101,
        message: 'some message'
      })).to.equal(true);
    });

    it("when single set operation with function triggering", () => {
      expect(CommonUtil.isFailedTx({
        "func_results": {
          "_saveLastTx": {
            "op_results": {
              "0": {
                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": {
                        "0": {
                          "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "bandwidth_gas_amount": 1
                          }
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 0,
                    }
                  },
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0,
          }
        },
        "code": 0,
        "bandwidth_gas_amount": 1
      })).to.equal(false);

      expect(CommonUtil.isFailedTx({
        "func_results": {
          "_saveLastTx": {
            "op_results": {
              "0": {
                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": {
                        "0": {
                          "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "bandwidth_gas_amount": 1
                          }
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 0,
                    }
                  },
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0,
          }
        },
        "code": 10201,  // The root operation failed
        "message": "Not a number type: bar or 10",
        "bandwidth_gas_amount": 1
      })).to.equal(true);

      expect(CommonUtil.isFailedTx({
        "func_results": {
          "_saveLastTx": {
            "op_results": {
              "0": {
                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": {
                        "0": {
                          "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 10201,  // A sub-operation failed
                            "message": "Not a number type: bar or 10",
                            "bandwidth_gas_amount": 1
                          }
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 0,
                    }
                  },
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0,
          }
        },
        "code": 0,
        "bandwidth_gas_amount": 1
      })).to.equal(true);

      expect(CommonUtil.isFailedTx({
        "func_results": {
          "_saveLastTx": {
            "op_results": {
              "0": {
                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": {
                        "0": {
                          "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "bandwidth_gas_amount": 1
                          }
                        }
                      },
                      "code": 20001,  // A function call failed.
                      "bandwidth_gas_amount": 0,
                    }
                  },
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0,
          }
        },
        "code": 0,
        "bandwidth_gas_amount": 1
      })).to.equal(true);
    });

    it("when single set operation with REST function triggering", () => {
      expect(CommonUtil.isFailedTx({
        "code": 0,
        "func_results": {
          "0x11111": {
            "code": 0,
            "bandwidth_gas_amount": 10,
          }
        },
        "bandwidth_gas_amount": 1,
        "gas_amount_total": {
          "bandwidth": {
            "service": 11,
          }
        },
        "gas_cost_total": 0,
      })).to.equal(false);
    });

    it("when single set operation with subtree function triggering", () => {
      expect(CommonUtil.isFailedTx({
        "code": 0,
        "func_results": {
          "0x11111": {
            "code": 0,
            "bandwidth_gas_amount": 10,
          }
        },
        "subtree_func_results": {
          "/shallow/path": {
            "/shallow/path": {
              "func_results": {
                "0x30101": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30102": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            }
          },
          "/shallow/$var_path": {
            "/shallow/path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            },
            "/shallow/other_path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            },
          },
          "/shallow/$var_path/to/$var_path2": {},
        },
        "bandwidth_gas_amount": 1,
        "gas_amount_total": {
          "bandwidth": {
            "service": 11,
          }
        },
        "gas_cost_total": 0,
      })).to.equal(false);

      expect(CommonUtil.isFailedTx({
        "code": 0,
        "func_results": {
          "0x11111": {
            "code": 0,
            "bandwidth_gas_amount": 10,
          }
        },
        "subtree_func_results": {
          "/shallow/path": {
            "/shallow/path": {
              "func_results": {
                "0x30101": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30102": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            }
          },
          "/shallow/$var_path": {
            "/shallow/path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            },
            "/shallow/other_path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 20001,  // A subtree function call failed.
                }
              },
              "func_promises": "erased"
            },
          },
          "/shallow/$var_path/to/$var_path2": {},
        },
        "bandwidth_gas_amount": 1,
        "gas_amount_total": {
          "bandwidth": {
            "service": 11,
          }
        },
        "gas_cost_total": 0,
      })).to.equal(true);
    });

    it("when multi-set operation without function triggering", () => {
      expect(CommonUtil.isFailedTx({
        "result_list": {
          "0": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
          "1": {
            "code": 0,
            "bandwidth_gas_amount": 1,
          },
          "2": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
        },
      })).to.equal(false);

      expect(CommonUtil.isFailedTx({
        "result_list": {
          "0": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
          "1": {
            "code": 10201,
            "message": "Not a number type: bar or 10",
            "bandwidth_gas_amount": 0
          },
          "2": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
        }
      })).to.equal(true);
    })

    it("when multi-set operation with function triggering", () => {
      expect(CommonUtil.isFailedTx({
        "result_list": {
          "0": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
          "1": {
            "func_results": {
              "_saveLastTx": {
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": {
                            "0": {
                              "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1
                              }
                            }
                          },
                          "code": 0,
                          "bandwidth_gas_amount": 0,
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 0,
                "bandwidth_gas_amount": 0,
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 1,
          },
          "2": {
            "code": 0,
            "bandwidth_gas_amount": 1,
          }
        }
      })).to.equal(false);

      expect(CommonUtil.isFailedTx({
        "result_list": {
          "0": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
          "1": {
            "func_results": {
              "_saveLastTx": {
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": {
                            "0": {
                              "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1
                              }
                            }
                          },
                          "code": 0,
                          "bandwidth_gas_amount": 0,
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 0,
                "bandwidth_gas_amount": 0,
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0
          },
          "2": {
            "code": 10201,  // A root operation failed.
            "message": "Not a number type: bar or 10",
            "bandwidth_gas_amount": 1,
          },
        }
      })).to.equal(true);

      expect(CommonUtil.isFailedTx({
        "result_list": {
          "0": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
          "1": {
            "func_results": {
              "_saveLastTx": {
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": {
                            "0": {
                              "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 10201,  // A sub-operation failed.
                                "message": "Not a number type: bar or 10",
                                "bandwidth_gas_amount": 1
                              }
                            }
                          },
                          "code": 0,
                          "bandwidth_gas_amount": 0,
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 0,
                "bandwidth_gas_amount": 0,
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0
          },
          "2": {
            "code": 0,
            "bandwidth_gas_amount": 1,
          },
        }
      })).to.equal(true);

      expect(CommonUtil.isFailedTx({
        "result_list": {
          "0": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
          "1": {
            "func_results": {
              "_saveLastTx": {
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": {
                            "0": {
                              "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1
                              }
                            }
                          },
                          "code": 20001,  // A function call failed.
                          "bandwidth_gas_amount": 0,
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 0,
                "bandwidth_gas_amount": 0,
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0
          },
          "2": {
            "code": 0,
            "bandwidth_gas_amount": 1,
          },
        }
      })).to.equal(true);
    })

    it("when multi-set operation with subtree function triggering", () => {
      expect(CommonUtil.isFailedTx({
        "result_list": {
          "0": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
          "1": {
            "func_results": {
              "_saveLastTx": {
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": {
                            "0": {
                              "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1
                              }
                            }
                          },
                          "code": 0,
                          "bandwidth_gas_amount": 0,
                        }
                      },
                      "subtree_func_results": {
                        "/deep/path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30101": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30102": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          }
                        },
                        "/deep/$var_path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          },
                          "/deep/other_path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          },
                        },
                        "/deep/$var_path/to/$var_path2": {},
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 0,
                "bandwidth_gas_amount": 0,
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 1,
          },
          "2": {
            "code": 0,
            "bandwidth_gas_amount": 1,
          }
        }
      })).to.equal(false);

      expect(CommonUtil.isFailedTx({
        "result_list": {
          "0": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
          "1": {
            "func_results": {
              "_saveLastTx": {
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": {
                            "0": {
                              "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1
                              }
                            }
                          },
                          "code": 0,
                          "bandwidth_gas_amount": 0,
                        }
                      },
                      "subtree_func_results": {
                        "/deep/path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30101": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30102": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          }
                        },
                        "/deep/$var_path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          },
                          "/deep/other_path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 20001,  // A subtree function call failed.
                              }
                            },
                            "func_promises": "erased"
                          },
                        },
                        "/deep/$var_path/to/$var_path2": {},
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 0,
                "bandwidth_gas_amount": 0,
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 0
          },
          "2": {
            "code": 0,
            "bandwidth_gas_amount": 1,
          },
        }
      })).to.equal(true);
    })

    it("when multi-set operation with REST function triggering", () => {
      expect(CommonUtil.isFailedTx({
        "result_list": {
          "0": {
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_total": {
              "bandwidth": {
                "service": 1,
              }
            },
            "gas_cost_total": 0
          },
          "1": {
            "code": 0,
            "func_results": {
              "0x11111": {
                "code": 0,
                "bandwidth_gas_amount": 10,
              }
            },
            "bandwidth_gas_amount": 1,
            "gas_amount_total": {
              "bandwidth": {
                "service": 11,
              }
            },
            "gas_cost_total": 0
          },
          "2": {
            "code": 0,
            "bandwidth_gas_amount": 1,
            "gas_amount_total": {
              "bandwidth": {
                "service": 1,
              }
            }
          }
        }
      })).to.equal(false);
    });
  })

  describe("getTotalBandwidthGasAmount", () => {
    const serviceOp = { ref: '/transfer/test', value: null, type: 'SET_VALUE' };
    const appOp = { ref: '/apps/test', value: null, type: 'SET_VALUE' };

    it("when abnormal input", () => {
      const emptyVal = { service: 0 };
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, null), emptyVal);
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, undefined), emptyVal);
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, {}), emptyVal);
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, { gas: 'gas' }), emptyVal);
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, { gas: {} }), emptyVal);
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, true), emptyVal);
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, 'result'), emptyVal);
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, 0), emptyVal);
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, 1), emptyVal);
    })

    it("when single operation result input (service)", () => {
      const result = {
        "func_results": {
          "_saveLastTx": {
            "op_results": {
              "0": {
                "path": "/transfer/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": {
                        "0": {
                          "path": "/transfer/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "bandwidth_gas_amount": 1
                          }
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 10
                    }
                  },
                  "subtree_func_results": {
                    "/deep/path": {
                      "/deep/path": {
                        "func_results": {
                          "0x30101": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          },
                          "0x30102": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          }
                        },
                        "func_promises": "erased"
                      }
                    },
                    "/deep/$var_path": {
                      "/deep/path": {
                        "func_results": {
                          "0x30201": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          },
                          "0x30202": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          }
                        },
                        "func_promises": "erased"
                      },
                      "/deep/other_path": {
                        "func_results": {
                          "0x30201": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          },
                          "0x30202": {
                            "bandwidth_gas_amount": 100,
                            "code": 20001,  // A subtree function call failed.
                          }
                        },
                        "func_promises": "erased"
                      }
                    },
                    "/deep/$var_path/to/$var_path2": {},
                  },
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 20,
          }
        },
        "subtree_func_results": {
          "/shallow/path": {
            "/shallow/path": {
              "func_results": {
                "0x30101": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30102": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            }
          },
          "/shallow/$var_path": {
            "/shallow/path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            },
            "/shallow/other_path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 20001,  // A subtree function call failed.
                }
              },
              "func_promises": "erased"
            }
          },
          "/shallow/$var_path/to/$var_path2": {},
        },
        "code": 0,
        "bandwidth_gas_amount": 30
      };
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(serviceOp, result), {
        service: 1262
      });
    })

    it("when single operation result input (app)", () => {
      const result = {
        "func_results": {
          "_saveLastTx": {
            "op_results": {
              "0": {
                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": {
                        "0": {
                          "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "bandwidth_gas_amount": 1
                          }
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 10
                    }
                  },
                  "subtree_func_results": {
                    "/deep/path": {
                      "/deep/path": {
                        "func_results": {
                          "0x30101": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          },
                          "0x30102": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          }
                        },
                        "func_promises": "erased"
                      }
                    },
                    "/deep/$var_path": {
                      "/deep/path": {
                        "func_results": {
                          "0x30201": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          },
                          "0x30202": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          }
                        },
                        "func_promises": "erased"
                      },
                      "/deep/other_path": {
                        "func_results": {
                          "0x30201": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          },
                          "0x30202": {
                            "bandwidth_gas_amount": 100,
                            "code": 20001,  // A subtree function call failed.
                          }
                        },
                        "func_promises": "erased"
                      }
                    },
                    "/deep/$var_path/to/$var_path2": {},
                  },
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 20,
          }
        },
        "subtree_func_results": {
          "/shallow/path": {
            "/shallow/path": {
              "func_results": {
                "0x30101": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30102": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            }
          },
          "/shallow/$var_path": {
            "/shallow/path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            },
            "/shallow/other_path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 20001,  // A subtree function call failed.
                }
              },
              "func_promises": "erased"
            }
          },
          "/shallow/$var_path/to/$var_path2": {},
        },
        "code": 0,
        "bandwidth_gas_amount": 30
      };
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(appOp, result), {
        app: {
          test: 1262
        },
        service: 0
      });
    })

    it("when single operation result input (service & app)", () => {
      const result = {
        "func_results": {
          "_saveLastTx": {
            "op_results": {
              "0": {
                "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                "result": {
                  "func_results": {
                    "_eraseValue": {
                      "op_results": {
                        "0": {
                          "path": "/transfer/test/test_function_triggering/allowed_path/.last_tx/value",
                          "result": {
                            "code": 0,
                            "bandwidth_gas_amount": 1
                          }
                        }
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 10
                    }
                  },
                  "subtree_func_results": {
                    "/deep/path": {
                      "/deep/path": {
                        "func_results": {
                          "0x30101": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          },
                          "0x30102": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          }
                        },
                        "func_promises": "erased"
                      }
                    },
                    "/deep/$var_path": {
                      "/deep/path": {
                        "func_results": {
                          "0x30201": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          },
                          "0x30202": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          }
                        },
                        "func_promises": "erased"
                      },
                      "/deep/other_path": {
                        "func_results": {
                          "0x30201": {
                            "bandwidth_gas_amount": 100,
                            "code": 0,
                          },
                          "0x30202": {
                            "bandwidth_gas_amount": 100,
                            "code": 20001,  // A subtree function call failed.
                          }
                        },
                        "func_promises": "erased"
                      }
                    },
                    "/deep/$var_path/to/$var_path2": {},
                  },
                  "code": 0,
                  "bandwidth_gas_amount": 1
                }
              }
            },
            "code": 0,
            "bandwidth_gas_amount": 20,
          }
        },
        "subtree_func_results": {
          "/shallow/path": {
            "/shallow/path": {
              "func_results": {
                "0x30101": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30102": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            }
          },
          "/shallow/$var_path": {
            "/shallow/path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                }
              },
              "func_promises": "erased"
            },
            "/shallow/other_path": {
              "func_results": {
                "0x30201": {
                  "bandwidth_gas_amount": 100,
                  "code": 0,
                },
                "0x30202": {
                  "bandwidth_gas_amount": 100,
                  "code": 20001,  // A subtree function call failed.
                }
              },
              "func_promises": "erased"
            }
          },
          "/shallow/$var_path/to/$var_path2": {},
        },
        "code": 0,
        "bandwidth_gas_amount": 30
      };
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(appOp, result), {
        app: {
          test: 1261
        },
        service: 1
      });
    })

    it("when multiple operation result input (service)", () => {
      const setTxOp = { type: 'SET', op_list: [{...serviceOp}, {...serviceOp}] };
      const result = {
        "result_list": {
          "0": {
            "func_results": {
              "_saveLastTx": {
                "op_results": {
                  "0": {
                    "path": "/transfer/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": {
                            "0": {
                              "path": "/transfer/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1
                              }
                            }
                          },
                          "code": 0,
                          "bandwidth_gas_amount": 10
                        }
                      },
                      "subtree_func_results": {
                        "/deep/path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30101": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30102": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          }
                        },
                        "/deep/$var_path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          },
                          "/deep/other_path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 20001,  // A subtree function call failed.
                              }
                            },
                            "func_promises": "erased"
                          }
                        },
                        "/deep/$var_path/to/$var_path2": {},
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 0,
                "bandwidth_gas_amount": 20
              }
            },
            "subtree_func_results": {
              "/shallow/path": {
                "/shallow/path": {
                  "func_results": {
                    "0x30101": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    },
                    "0x30102": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    }
                  },
                  "func_promises": "erased"
                }
              },
              "/shallow/$var_path": {
                "/shallow/path": {
                  "func_results": {
                    "0x30201": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    },
                    "0x30202": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    }
                  },
                  "func_promises": "erased"
                },
                "/shallow/other_path": {
                  "func_results": {
                    "0x30201": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    },
                    "0x30202": {
                      "bandwidth_gas_amount": 100,
                      "code": 20001,  // A subtree function call failed.
                    }
                  },
                  "func_promises": "erased"
                }
              },
              "/shallow/$var_path/to/$var_path2": {},
            },
            "code": 0,
            "bandwidth_gas_amount": 30
          },
          "1": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
        }
      };
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(setTxOp, result), {
        service: 1263
      });
    })

    it("when multiple operation result input (app)", () => {
      const setTxOp = { type: 'SET', op_list: [{...appOp}, {...appOp}] };
      const result = {
        "result_list": {
          "0": {
            "func_results": {
              "_saveLastTx": {
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": {
                            "0": {
                              "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1
                              }
                            }
                          },
                          "code": 0,
                          "bandwidth_gas_amount": 10
                        }
                      },
                      "subtree_func_results": {
                        "/deep/path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30101": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30102": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          }
                        },
                        "/deep/$var_path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          },
                          "/deep/other_path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 20001,  // A subtree function call failed.
                              }
                            },
                            "func_promises": "erased"
                          }
                        },
                        "/deep/$var_path/to/$var_path2": {},
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 0,
                "bandwidth_gas_amount": 20
              }
            },
            "subtree_func_results": {
              "/shallow/path": {
                "/shallow/path": {
                  "func_results": {
                    "0x30101": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    },
                    "0x30102": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    }
                  },
                  "func_promises": "erased"
                }
              },
              "/shallow/$var_path": {
                "/shallow/path": {
                  "func_results": {
                    "0x30201": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    },
                    "0x30202": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    }
                  },
                  "func_promises": "erased"
                },
                "/shallow/other_path": {
                  "func_results": {
                    "0x30201": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    },
                    "0x30202": {
                      "bandwidth_gas_amount": 100,
                      "code": 20001,  // A subtree function call failed.
                    }
                  },
                  "func_promises": "erased"
                }
              },
              "/shallow/$var_path/to/$var_path2": {},
            },
            "code": 0,
            "bandwidth_gas_amount": 30
          },
          "1": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
        }
      };
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(setTxOp, result), {
        app: {
          test: 1263
        },
        service: 0
      });
    })

    it("when multiple operation result input (service & app)", () => {
      const setTxOp = { type: 'SET', op_list: [{...appOp}, {...serviceOp}] };
      const result = {
        "result_list": {
          "0": {
            "func_results": {
              "_saveLastTx": {
                "op_results": {
                  "0": {
                    "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                    "result": {
                      "func_results": {
                        "_eraseValue": {
                          "op_results": {
                            "0": {
                              "path": "/apps/test/test_function_triggering/allowed_path/.last_tx/value",
                              "result": {
                                "code": 0,
                                "bandwidth_gas_amount": 1
                              }
                            }
                          },
                          "code": 0,
                          "bandwidth_gas_amount": 10
                        }
                      },
                      "subtree_func_results": {
                        "/deep/path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30101": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30102": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          }
                        },
                        "/deep/$var_path": {
                          "/deep/path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              }
                            },
                            "func_promises": "erased"
                          },
                          "/deep/other_path": {
                            "func_results": {
                              "0x30201": {
                                "bandwidth_gas_amount": 100,
                                "code": 0,
                              },
                              "0x30202": {
                                "bandwidth_gas_amount": 100,
                                "code": 20001,  // A subtree function call failed.
                              }
                            },
                            "func_promises": "erased"
                          }
                        },
                        "/deep/$var_path/to/$var_path2": {},
                      },
                      "code": 0,
                      "bandwidth_gas_amount": 1
                    }
                  }
                },
                "code": 0,
                "bandwidth_gas_amount": 20
              }
            },
            "subtree_func_results": {
              "/shallow/path": {
                "/shallow/path": {
                  "func_results": {
                    "0x30101": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    },
                    "0x30102": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    }
                  },
                  "func_promises": "erased"
                }
              },
              "/shallow/$var_path": {
                "/shallow/path": {
                  "func_results": {
                    "0x30201": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    },
                    "0x30202": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    }
                  },
                  "func_promises": "erased"
                },
                "/shallow/other_path": {
                  "func_results": {
                    "0x30201": {
                      "bandwidth_gas_amount": 100,
                      "code": 0,
                    },
                    "0x30202": {
                      "bandwidth_gas_amount": 100,
                      "code": 20001,  // A subtree function call failed.
                    }
                  },
                  "func_promises": "erased"
                }
              },
              "/shallow/$var_path/to/$var_path2": {},
            },
            "code": 0,
            "bandwidth_gas_amount": 30
          },
          "1": {
            "code": 0,
            "bandwidth_gas_amount": 1
          },
        }
      };
      assert.deepEqual(CommonUtil.getTotalBandwidthGasAmount(setTxOp, result), {
        app: {
          test: 1262
        },
        service: 1
      });
    })
  })

  describe("getTotalGasCost", () => {
    const gasPriceUnit = BlockchainParams.resource.gas_price_unit;
    it("when abnormal input", () => {
      assert.deepEqual(CommonUtil.getTotalGasCost(1, null, gasPriceUnit), 0);
      assert.deepEqual(CommonUtil.getTotalGasCost(1, undefined, gasPriceUnit), 0);
      assert.deepEqual(CommonUtil.getTotalGasCost(1, {}, gasPriceUnit), 0);
      assert.deepEqual(CommonUtil.getTotalGasCost(1, { gas: 'gas' }, gasPriceUnit), 0);
      assert.deepEqual(CommonUtil.getTotalGasCost(1, { gas: {} }, gasPriceUnit), 0);
      assert.deepEqual(CommonUtil.getTotalGasCost(1, true, gasPriceUnit), 0);
      assert.deepEqual(CommonUtil.getTotalGasCost(1, 'result', gasPriceUnit), 0);
    })

    it("when normal input", () => {
      assert.deepEqual(CommonUtil.getTotalGasCost(1, 0, gasPriceUnit), 0);
      assert.deepEqual(CommonUtil.getTotalGasCost(1, 1, gasPriceUnit), 0.000001);
      assert.deepEqual(CommonUtil.getTotalGasCost(0, 1, gasPriceUnit), 0);
      assert.deepEqual(CommonUtil.getTotalGasCost(1000000, 1, gasPriceUnit), 1);
      assert.deepEqual(CommonUtil.getTotalGasCost(undefined, 1, gasPriceUnit), 0);
    })
  })

  describe('getDependentAppNameFromRef', () => {
    it("when abnormal input", () => {
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef(), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef(null), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef(undefined), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef(''), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/'), null);
    });

    it("when normal input (app-dependent service path)", () => {
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/manage_app/app_a'), 'app_a');
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/payments/app_a'), 'app_a');
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/staking/app_a'), 'app_a');
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/staking/app_a/some/nested/path'), 'app_a');
    });
    
    it("when normal input (app-independent service path)", () => {
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/accounts/0xabcd/value'), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/service_accounts/staking'), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/gas_fee/gas_fee'), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/escrow/source/target/id/key/value'), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/sharding/config'), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/transfer'), null);
      assert.deepEqual(CommonUtil.getDependentAppNameFromRef('/transfer/from/to/key/value'), null);
    });
  })

  describe('getServiceDependentAppNameList', () => { 
    it("when abnormal input", () => {
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList(), []);
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList(null), []);
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList(undefined), []);
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList({}), []);
    });

    it("when normal input", () => {
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList({
        ref: '/'
      }), []);
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList({
        ref: '/transfer/from/to/key/value'
      }), []);
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList({
        ref: '/manage_app/app_a/create/key'
      }), ['app_a']);
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList({
        op_list: [
          {
            ref: '/'
          }
        ]
      }), []);
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList({
        op_list: [
          {
            ref: '/transfer/from/to/key/value'
          },
          {
            ref: '/manage_app/app_a/create/key'
          }
        ]
      }), ['app_a']);
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList({
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
      assert.deepEqual(CommonUtil.getServiceDependentAppNameList({
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
  });

  describe('getJsonDiff', () => { 
    it("when abnormal input", () => {
      assert.deepEqual(CommonUtil.getJsonDiff(null, null), '');
      assert.deepEqual(CommonUtil.getJsonDiff(null, undefined), '');
      assert.deepEqual(CommonUtil.getJsonDiff(null, []), '');
      assert.deepEqual(CommonUtil.getJsonDiff({}, null), '');
      assert.deepEqual(CommonUtil.getJsonDiff({}, undefined), '');
      assert.deepEqual(CommonUtil.getJsonDiff({}, []), '');
    });

    it("when normal input", () => {
      const diffLines = CommonUtil.getJsonDiff({
        a: 'aaa',
        b: {
          bb: 'bbbbbb'
        },
        c: 'ccc'
      }, {
        b: {
          bb: 'bbbbbb_new'
        },
        c: 'ccc',
        d: 'ddd'
      });
      assert.deepEqual(diffLines.split('\n'), [
        " {",
        "-  a: \"aaa\"",
        "+  d: \"ddd\"",
        "   b: {",
        "-    bb: \"bbbbbb\"",
        "+    bb: \"bbbbbb_new\"",
        "   }",
        " }",
        "",
      ]);
    });
  })

  describe('hasTimerFlagEnabled', () => { 
    it("when invalid input", () => {
      expect(CommonUtil.hasTimerFlagEnabled({}, 'some_flag', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled({}, 'some_flag', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled({}, 'some_flag', 100)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled({
        'some_flag': null
      }, 'some_flag', 100)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled({
        'some_flag': {
          'enabled_block': true,
        }
      }, 'some_flag', 100)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled({
        'some_flag': {
          'enabled_block': true,
          'disabled_block': true,
        }
      }, 'some_flag', 100)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled({
        'some_flag': {
          'enabled_block': '0',
          'disabled_block': '200',
        }
      }, 'some_flag', 100)).to.equal(false);
    });

    it("when valid input", () => {
      const timerFlags = {
        'flag_a': {
        },
        'flag_b': {
          'enabled_block': null,
        },
        'flag_c': {
          'enabled_block': null,
          'disabled_block': null,
        },
        'flag_d': {
          'enabled_block': 100,
        },
        'flag_e': {
          'enabled_block': 200,
          'disabled_block': null,
        },
        'flag_f': {
          'enabled_block': 300,
          'disabled_block': 350,
        },
        'flag_g': {
          'enabled_block': 400,
          'disabled_block': 401,
        },
        'flag_h': {
          'enabled_block': 500,
          'disabled_block': 500,
        },
        'flag_i': {
          'enabled_block': 600,
          'disabled_block': 550,
        },
      };

      // without enabled_block no disabled_block
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_a', undefined)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_a', null)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_a', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_a', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_a', 1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(
          timerFlags, 'flag_a', Number.MAX_SAFE_INTEGER)).to.equal(false);
      // with null enabled_block and without disabled_block
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_b', undefined)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_b', null)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_b', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_b', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_b', 1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(
          timerFlags, 'flag_b', Number.MAX_SAFE_INTEGER)).to.equal(false);
      // with null enabled_block and disabled_block
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_c', undefined)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_c', null)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_c', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_c', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_c', 1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(
          timerFlags, 'flag_c', Number.MAX_SAFE_INTEGER)).to.equal(false);
      // without disabled_block
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_d', undefined)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_d', null)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_d', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_d', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_d', 99)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_d', 100)).to.equal(true);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_d', 150)).to.equal(true);
      expect(CommonUtil.hasTimerFlagEnabled(
          timerFlags, 'flag_d', Number.MAX_SAFE_INTEGER)).to.equal(true);
      // with null disabled_block
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_e', undefined)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_e', null)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_e', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_e', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_e', 199)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_e', 200)).to.equal(true);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_e', 250)).to.equal(true);
      expect(CommonUtil.hasTimerFlagEnabled(
          timerFlags, 'flag_e', Number.MAX_SAFE_INTEGER)).to.equal(true);
      // with numeric disabled_block
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_f', undefined)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_f', null)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_f', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_f', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_f', 299)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_f', 300)).to.equal(true);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_f', 349)).to.equal(true);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_f', 350)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(
          timerFlags, 'flag_f', Number.MAX_SAFE_INTEGER)).to.equal(false);
      // with tight disabled_block
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_g', undefined)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_g', null)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_g', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_g', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_g', 399)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_g', 400)).to.equal(true);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_g', 401)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(
          timerFlags, 'flag_g', Number.MAX_SAFE_INTEGER)).to.equal(false);
      // with equal disabled_block
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_h', undefined)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_h', null)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_h', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_h', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_h', 499)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_h', 500)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_h', 501)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(
          timerFlags, 'flag_h', Number.MAX_SAFE_INTEGER)).to.equal(false);
      // with smaller disabled_block
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_i', undefined)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_i', null)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_i', -1)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_i', 0)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_i', 699)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_i', 600)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(timerFlags, 'flag_i', 601)).to.equal(false);
      expect(CommonUtil.hasTimerFlagEnabled(
          timerFlags, 'flag_i', Number.MAX_SAFE_INTEGER)).to.equal(false);
    });
  })
})