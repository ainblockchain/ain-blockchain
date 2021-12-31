const ObjectUtil = require('../../common/object-util');
const chai = require('chai');
const assert = chai.assert;

describe("ObjectUtil", () => {
  describe("toChunks", () => {
    it("when non-object input", () => {
      assert.deepEqual(ObjectUtil.toChunks(true, 100), [
        {
          "data": true,
          "path": [],
          "size": 4,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks(false, 100), [
        {
          "data": false,
          "path": [],
          "size": 4,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks(0, 100), [
        {
          "data": 0,
          "path": [],
          "size": 8,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks(10, 100), [
        {
          "data": 10,
          "path": [],
          "size": 8,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks(null, 100), [
        {
          "data": null,
          "path": [],
          "size": 0,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks(Infinity, 100), [
        {
          "data": null,
          "path": [],
          "size": 8,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks(NaN, 100), [
        {
          "data": null,
          "path": [],
          "size": 8,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks('', 100), [
        {
          "data": "",
          "path": [],
          "size": 0,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks('abc', 100), [
        {
          "data": "abc",
          "path": [],
          "size": 6,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks('0', 100), [
        {
          "data": "0",
          "path": [],
          "size": 2,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks([], 100), [
        {
          "data": [],
          "path": [],
          "size": 0,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks([10], 100), [
        {
          "data": [10],
          "path": [],
          "size": 8,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks([10, 'abc'], 100), [
        {
          "data": [10,"abc"],
          "path": [],
          "size": 14,
        }
      ]);
    })

    it("when object input: size", () => {
      assert.deepEqual(ObjectUtil.toChunks({}, 100), [
        {
          "data": {},
          "path": [],
          "size": 0,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks({
        a: 'aaaa',
      }, 100), [
        {
          "data": {
            "a": "aaaa"
          },
          "path": [],
          "size": 10,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks({
        aaaa: 'a',
      }, 100), [
        {
          "data": {
            "aaaa": "a"
          },
          "path": [],
          "size": 10,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks({
        a: 'aaaa',
        b: 'bbbb',
      }, 100), [
        {
          "data": {
            "a": "aaaa",
            "b": "bbbb",
          },
          "path": [],
          "size": 20,
        }
      ]);
      assert.deepEqual(ObjectUtil.toChunks({
        ccccc: {
          a: 'aaaa',
          b: 'bbbb',
        }
      }, 100), [
        {
          "data": {
            "ccccc": {
              "a": "aaaa",
              "b": "bbbb"
            }
          },
          "path": [],
          "size": 30,
        }
      ]);
    });

    it("when object input: child order", () => {
      const obj = {
        aa1: {
          b11: 'b11',
          b12: 'b12',
        },
        aa2: {
          b21: 'b21',
          b22: 'b22',
        },
      };
      const objReverse = {
        aa2: {
          b22: 'b22',
          b21: 'b21',
        },
        aa1: {
          b12: 'b12',
          b11: 'b11',
        },
      };

      assert.deepEqual(ObjectUtil.toChunks(JSON.parse(JSON.stringify(obj)), 10), [
        {
          "data": {
            "aa1": null,
            "aa2": null,
          },
          "path": [],
          "size": 12,
        },
        {
          "data": {
            "b21": "b21",
            "b22": "b22",
          },
          "path": [
            "aa2"
          ],
          "size": 24
        },
        {
          "data": {
            "b11": "b11",
            "b12": "b12",
          },
          "path": [
            "aa1"
          ],
          "size": 24
        }
      ]);

      assert.deepEqual(ObjectUtil.toChunks(JSON.parse(JSON.stringify(objReverse)), 10), [
        {
          "data": {
            "aa1": null,
            "aa2": null,
          },
          "path": [],
          "size": 12,
        },
        {
          "data": {
            "b21": "b21",
            "b22": "b22",
          },
          "path": [
            "aa2"
          ],
          "size": 24
        },
        {
          "data": {
            "b11": "b11",
            "b12": "b12",
          },
          "path": [
            "aa1"
          ],
          "size": 24
        }
      ]);
    });

    it("when object input: chunkSize", () => {
      const obj1 = {
        aa1: {
          b11: 'b11',
          b12: 'b12',
        },
        aa2: {
          b21: 'b21',
          b22: 'b22',
        },
      };

      const obj2 = {
        aaaa1: {
          bbb11: {
            cc111: {
              d1111: 'd1111',
              d1112: 'd1112',
              d1113: 'd1113',
            },
            cc112: {
              d1121: 'd1121',
              d1122: 'd1122',
              d1123: 'd1123',
            },
          },
          bbb12: {
            cc121: {
              d1211: 'd1211',
              d1212: 'd1212',
              d1213: 'd1213',
            },
            cc122: {
              d1221: 'd1221',
              d1222: 'd1222',
              d1223: 'd1223',
            },
          }
        },
        aaaa2: {
          bbb21: {
            cc211: {
              d2111: 'd2111',
              d2112: 'd2112',
              d2113: 'd2113',
            },
            cc212: {
              d2121: 'd2121',
              d2122: 'd2122',
              d2123: 'd2123',
            },
          },
          bbb22: {
            cc221: {
              d2211: 'd2211',
              d2212: 'd2212',
              d2213: 'd2213',
            },
            cc222: {
              d2221: 'd2221',
              d2222: 'd2222',
              d2223: 'd2223',
            },
          }
        },
      };

      assert.deepEqual(ObjectUtil.toChunks(JSON.parse(JSON.stringify(obj1)), 0), [
        {
          "data": {
            "aa1": null,
            "aa2": null,
          },
          "path": [],
          "size": 12,
        },
        {
          "data": {
            "b21": null,
            "b22": null,
          },
          "path": [
            "aa2"
          ],
          "size": 12
        },
        {
          "data": "b22",
          "path": [
            "aa2",
            "b22",
          ],
          "size": 6,
        },
        {
          "data": "b21",
          "path": [
            "aa2",
            "b21",
          ],
          "size": 6,
        },
        {
          "data": {
            "b11": null,
            "b12": null,
          },
          "path": [
            "aa1"
          ],
          "size": 12
        },
        {
          "data": "b12",
          "path": [
            "aa1",
            "b12"
          ],
          "size": 6
        },
        {
          "data": "b11",
          "path": [
            "aa1",
            "b11",
          ],
          "size": 6
        }
      ]);

      assert.deepEqual(ObjectUtil.toChunks(JSON.parse(JSON.stringify(obj1)), 10), [
        {
          "data": {
            "aa1": null,
            "aa2": null,
          },
          "path": [],
          "size": 12,
        },
        {
          "data": {
            "b21": "b21",
            "b22": "b22",
          },
          "path": [
            "aa2"
          ],
          "size": 24
        },
        {
          "data": {
            "b11": "b11",
            "b12": "b12",
          },
          "path": [
            "aa1"
          ],
          "size": 24
        }
      ]);

      assert.deepEqual(ObjectUtil.toChunks(JSON.parse(JSON.stringify(obj2)), 100), [
        {
          "data": {
            "aaaa1": {
              "bbb11": null,
              "bbb12": null,
            },
            "aaaa2": {
              "bbb21": null,
              "bbb22": null,
            }
          },
          "path": [],
          "size": 60,
        },
        {
          "data": {
            "cc221": {
              "d2211": "d2211",
              "d2212": "d2212",
              "d2213": "d2213",
            },
            "cc222": {
              "d2221": "d2221",
              "d2222": "d2222",
              "d2223": "d2223",
            }
          },
          "path": [
            "aaaa2",
            "bbb22",
          ],
          "size": 140
        },
        {
          "data": {
            "cc211": {
              "d2111": "d2111",
              "d2112": "d2112",
              "d2113": "d2113",
            },
            "cc212": {
              "d2121": "d2121",
              "d2122": "d2122",
              "d2123": "d2123",
            }
          },
          "path": [
            "aaaa2",
            "bbb21",
          ],
          "size": 140
        },
        {
          "data": {
            "cc121": {
              "d1211": "d1211",
              "d1212": "d1212",
              "d1213": "d1213",
            },
            "cc122": {
              "d1221": "d1221",
              "d1222": "d1222",
              "d1223": "d1223",
            }
          },
          "path": [
            "aaaa1",
            "bbb12",
          ],
          "size": 140
        },
        {
          "data": {
            "cc111": {
              "d1111": "d1111",
              "d1112": "d1112",
              "d1113": "d1113",
            },
            "cc112": {
              "d1121": "d1121",
              "d1122": "d1122",
              "d1123": "d1123",
            }
          },
          "path": [
            "aaaa1",
            "bbb11",
          ],
          "size": 140
        }
      ]);

      assert.deepEqual(ObjectUtil.toChunks(JSON.parse(JSON.stringify(obj2)), 200), [
        {
          "data": {
            "aaaa1": null,
            "aaaa2": null,
          },
          "path": [],
          "size": 20,
        },
        {
          "data": {
            "bbb21": {
              "cc211": {
                "d2111": "d2111",
                "d2112": "d2112",
                "d2113": "d2113",
              },
              "cc212": {
                "d2121": "d2121",
                "d2122": "d2122",
                "d2123": "d2123",
              }
            },
            "bbb22": {
              "cc221": {
                "d2211": "d2211",
                "d2212": "d2212",
                "d2213": "d2213",
              },
              "cc222": {
                "d2221": "d2221",
                "d2222": "d2222",
                "d2223": "d2223",
              }
            }
          },
          "path": [
            "aaaa2"
          ],
          "size": 300
        },
        {
          "data": {
            "bbb11": {
              "cc111": {
                "d1111": "d1111",
                "d1112": "d1112",
                "d1113": "d1113",
              },
              "cc112": {
                "d1121": "d1121",
                "d1122": "d1122",
                "d1123": "d1123",
              }
            },
            "bbb12": {
              "cc121": {
                "d1211": "d1211",
                "d1212": "d1212",
                "d1213": "d1213",
              },
              "cc122": {
                "d1221": "d1221",
                "d1222": "d1222",
                "d1223": "d1223",
              }
            }
          },
          "path": [
            "aaaa1"
          ],
          "size": 300
        }
      ]);

      assert.deepEqual(ObjectUtil.toChunks(JSON.parse(JSON.stringify(obj2)), 10000), [
        {
          "data": {
            "aaaa1": {
              "bbb11": {
                "cc111": {
                  "d1111": "d1111",
                  "d1112": "d1112",
                  "d1113": "d1113",
                },
                "cc112": {
                  "d1121": "d1121",
                  "d1122": "d1122",
                  "d1123": "d1123",
                }
              },
              "bbb12": {
                "cc121": {
                  "d1211": "d1211",
                  "d1212": "d1212",
                  "d1213": "d1213",
                },
                "cc122": {
                  "d1221": "d1221",
                  "d1222": "d1222",
                  "d1223": "d1223",
                }
              }
            },
            "aaaa2": {
              "bbb21": {
                "cc211": {
                  "d2111": "d2111",
                  "d2112": "d2112",
                  "d2113": "d2113",
                },
                "cc212": {
                  "d2121": "d2121",
                  "d2122": "d2122",
                  "d2123": "d2123",
                }
              },
              "bbb22": {
                "cc221": {
                  "d2211": "d2211",
                  "d2212": "d2212",
                  "d2213": "d2213",
                },
                "cc222": {
                  "d2221": "d2221",
                  "d2222": "d2222",
                  "d2223": "d2223",
                }
              }
            }
          },
          "path": [],
          "size": 620,
        }
      ]);
    })
  })

  describe("fromChunks", () => {
    it("when non-object input", () => {
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(true, 100)), true);
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(false, 100)), false);
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(0, 100)), 0);
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(10, 100)), 10);
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(null, 100)), null);
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks('', 100)), '');
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks('abc', 100)), 'abc');
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks('0', 100)), '0');
    })

    it("when object input: siingle chunk", () => {
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks({}, 100)), {});
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks({
        a: 'aaaa',
      }, 100)), {
        a: 'aaaa',
      });
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks({
        aaaa: 'a',
      }, 100)), {
        aaaa: 'a',
      });
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks({
        a: 'aaaa',
        b: 'bbbb',
      }, 100)), {
        a: 'aaaa',
        b: 'bbbb',
      });
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks({
        ccccc: {
          a: 'aaaa',
          b: 'bbbb',
        }
      }, 100)), {
        ccccc: {
          a: 'aaaa',
          b: 'bbbb',
        }
      });
    });

    it("when object input: chunkSize", () => {
      const obj1 = {
        aa1: {
          b11: 'b11',
          b12: 'b12',
        },
        aa2: {
          b21: 'b21',
          b22: 'b22',
        },
      };

      const obj2 = {
        aaaa1: {
          bbb11: {
            cc111: {
              d1111: 'd1111',
              d1112: 'd1112',
              d1113: 'd1113',
            },
            cc112: {
              d1121: 'd1121',
              d1122: 'd1122',
              d1123: 'd1123',
            },
          },
          bbb12: {
            cc121: {
              d1211: 'd1211',
              d1212: 'd1212',
              d1213: 'd1213',
            },
            cc122: {
              d1221: 'd1221',
              d1222: 'd1222',
              d1223: 'd1223',
            },
          }
        },
        aaaa2: {
          bbb21: {
            cc211: {
              d2111: 'd2111',
              d2112: 'd2112',
              d2113: 'd2113',
            },
            cc212: {
              d2121: 'd2121',
              d2122: 'd2122',
              d2123: 'd2123',
            },
          },
          bbb22: {
            cc221: {
              d2211: 'd2211',
              d2212: 'd2212',
              d2213: 'd2213',
            },
            cc222: {
              d2221: 'd2221',
              d2222: 'd2222',
              d2223: 'd2223',
            },
          }
        },
      };

      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(
          JSON.parse(JSON.stringify(obj1)), 0)), obj1);
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(
          JSON.parse(JSON.stringify(obj1)), 10)), obj1);

      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(
          JSON.parse(JSON.stringify(obj2)), 0)), obj2);
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(
          JSON.parse(JSON.stringify(obj2)), 100)), obj2);
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(
          JSON.parse(JSON.stringify(obj2)), 200)), obj2);
      assert.deepEqual(ObjectUtil.fromChunks(ObjectUtil.toChunks(
          JSON.parse(JSON.stringify(obj2)), 10000)), obj2);
    })
  })
})