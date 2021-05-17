const BlockchainNode = require('../node')
const rimraf = require('rimraf');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const {
  CHAINS_DIR,
  GenesisToken,
  GenesisAccounts,
  GenesisSharding,
  GENESIS_WHITELIST,
  GenesisFunctions,
  GenesisRules,
  GenesisOwners,
  ProofProperties,
} = require('../common/constants')
const {
  setNodeForTesting,
} = require('./test-util');
const DB = require('../db');
const Transaction = require('../tx-pool/transaction');
const ChainUtil = require('../common/chain-util');

describe("DB initialization", () => {
  let node;

  beforeEach(() => {
    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node, 0, true);
  })

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("Sharding path", () => {
    it("getShardingPath", () => {
      expect(node.db.getShardingPath()).to.equal(GenesisSharding.sharding_path);
    })

    it("isRootBlockchain", () => {
      expect(node.db.isRootBlockchain).to.equal(GenesisSharding.sharding_protocol === 'NONE');
    })
  })

  describe("Token", () => {
    it("loading token properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/token`), GenesisToken);
    })
  })

  describe("Balances", () => {
    it("loading balances properly on initialization", () => {
      const expected =
          GenesisToken.total_supply - GenesisAccounts.others.length * GenesisAccounts.shares;
      const dbPath = `/accounts/${GenesisAccounts.owner.address}/balance`;
      expect(node.db.getValue(dbPath)).to.equal(expected);
    })
  })

  describe("Sharding", () => {
    it("loading sharding properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/sharding/config`), GenesisSharding);
    })
  })

  describe("Whitelist", () => {
    it("loading whitelist properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/consensus/whitelist`), GENESIS_WHITELIST);
    })
  })

  describe("Functions", () => {
    it("loading functions properly on initialization", () => {
      assert.deepEqual(node.db.getFunction('/'), GenesisFunctions);
    })
  })

  describe("Rules", () => {
    it("loading rules properly on initialization", () => {
      assert.deepEqual(node.db.getRule("/"), GenesisRules);
    })
  })

  describe("Owners", () => {
    it("loading owners properly on initialization", () => {
      assert.deepEqual(node.db.getOwner('/'), GenesisOwners);
    })
  })
})

describe("DB operations", () => {
  let node, dbValues, dbRules, dbOwners;

  beforeEach(() => {
    let result;

    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    dbValues = {
      "ai": {
        "comcom": 123,
        "foo": "bar",
        "baz": "qux"
      },
      "increment": {
        "value": 20,
      },
      "decrement": {
        "value": 20,
      },
      "nested": {
        "far": {
          "down": 456
        }
      },
      "shards": {
        "enabled_shard": {
          ".shard": {
            "sharding_enabled": true
          },
          "path": 10,
        },
        "disabled_shard": {
          ".shard": {
            "sharding_enabled": false
          },
          "path": 10,
        }
      }
    };
    result = node.db.setValue("test", dbValues);
    assert.deepEqual(result.code, 0);

    dbFuncs = {
      "some": {
        "$var_path": {
          ".function": {
            "fid_var": "some function config with var path"
          }
        },
        "path": {
          ".function": {
            "fid": "some function config"
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": "some function config deeper"
              }
            }
          }
        },
      }
    };
    result = node.db.setFunction("test/test_function", dbFuncs);
    assert.deepEqual(result.code, 0);

    dbRules = {
      "some": {
        "$var_path": {
          ".write": "auth.addr !== 'abcd'"
        },
        "path": {
          ".write": "auth.addr === 'abcd'",
          "deeper": {
            "path": {
              ".write": "auth.addr === 'ijkl'"
            }
          }
        }
      }
    };
    result = node.db.setRule("test/test_rule", dbRules);
    assert.deepEqual(result.code, 0);

    dbOwners = {
      "some": {
        "path": {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": true,
                "write_owner": false,
                "write_rule": true,
              },
              "abcd": {
                "branch_owner": true,
                "write_function": false,
                "write_owner": true,
                "write_rule": false,
              }
            }
          },
          "deeper": {
            "path": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": true,
                    "write_owner": false,
                    "write_rule": true,
                  },
                  "ijkl": {
                    "branch_owner": true,
                    "write_function": false,
                    "write_owner": true,
                    "write_rule": false,
                  }
                }
              }
            }
          }
        }
      }
    };
    result = node.db.setOwner("test/test_owner", dbOwners);
    assert.deepEqual(result.code, 0);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("Read operations", () => {
    describe("getValue()", () => {
      it("when retrieving high value near top of database", () => {
        assert.deepEqual(node.db.getValue("test"), dbValues)
      })

      it("when retrieving shallow nested value", () => {
        assert.deepEqual(node.db.getValue("test/ai/comcom"), dbValues["ai"]["comcom"])
      })

      it("when retrieving deeply nested value", () => {
        assert.deepEqual(node.db.getValue("test/nested/far/down"), dbValues["nested"]["far"]["down"])
      })

      it("by failing when value is not present", () => {
        expect(node.db.getValue("test/nested/far/down/to/nowhere")).to.equal(null)
      })
    })

    describe("getFunction()", () => {
      it("when retrieving non-existing function config", () => {
        expect(node.db.getFunction("/test/test_function/other/function/path")).to.equal(null);
        expect(node.db.getFunction("/test/test_function/some/other_path")).to.equal(null);
      })

      it("when retrieving existing function config", () => {
        assert.deepEqual(node.db.getFunction("/test/test_function/some/path"), {
          ".function": {
            "fid": "some function config"
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": "some function config deeper"
              }
            }
          }
        });
      })
    })

    describe("getRule()", () => {
      it("when retrieving non-existing rule config", () => {
        expect(node.db.getRule("/test/test_rule/other/rule/path")).to.equal(null);
        expect(node.db.getRule("/test/test_rule/some/other_path")).to.equal(null);
      })

      it("when retrieving existing rule config", () => {
        assert.deepEqual(node.db.getRule("/test/test_rule/some/path"), {
          ".write": "auth.addr === 'abcd'",
          "deeper": {
            "path": {
              ".write": "auth.addr === 'ijkl'"
            }
          }
        });
      })
    })

    describe("getOwner()", () => {
      it("when retrieving non-existing owner config", () => {
        expect(node.db.getOwner("/test/test_owner/other/owner/path")).to.equal(null)
      })

      it("when retrieving existing owner config", () => {
        assert.deepEqual(node.db.getOwner("/test/test_owner/some/path"), {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": true,
                "write_owner": false,
                "write_rule": true,
              },
              "abcd": {
                "branch_owner": true,
                "write_function": false,
                "write_owner": true,
                "write_rule": false,
              }
            }
          },
          "deeper": {
            "path": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": true,
                    "write_owner": false,
                    "write_rule": true,
                  },
                  "ijkl": {
                    "branch_owner": true,
                    "write_function": false,
                    "write_owner": true,
                    "write_rule": false,
                  }
                }
              }
            }
          }
        });
      })
    })

    describe("matchFunction()", () => {
      it("when matching existing variable path function", () => {
        assert.deepEqual(node.db.matchFunction("/test/test_function/some/var_path"), {
          "matched_path": {
            "target_path": "/test/test_function/some/$var_path",
            "ref_path": "/test/test_function/some/var_path",
            "path_vars": {
              "$var_path": "var_path"
            },
          },
          "matched_config": {
            "config": {
              "fid_var": "some function config with var path"
            },
            "path": "/test/test_function/some/$var_path"
          },
          "subtree_configs": []
        });
      })

      it("when matching existing non-variable path function", () => {
        assert.deepEqual(node.db.matchFunction("/test/test_function/some/path"), {
          "matched_path": {
            "target_path": "/test/test_function/some/path",
            "ref_path": "/test/test_function/some/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "fid": "some function config"
            },
            "path": "/test/test_function/some/path"
          },
          "subtree_configs": [
            {
              "config": {
                "fid_deeper": "some function config deeper"
              },
              "path": "/deeper/path"
            }
          ]
        });
        assert.deepEqual(node.db.matchFunction("/test/test_function/some/path/deeper/path"), {
          "matched_path": {
            "target_path": "/test/test_function/some/path/deeper/path",
            "ref_path": "/test/test_function/some/path/deeper/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": {
              "fid_deeper": "some function config deeper"
            },
            "path": "/test/test_function/some/path/deeper/path"
          },
          "subtree_configs": []
        });
      })

      it("when NOT matching existing closest non-variable path function", () => {
        assert.deepEqual(node.db.matchFunction("/test/test_function/some/path/deeper"), {
          "matched_path": {
            "target_path": "/test/test_function/some/path/deeper",
            "ref_path": "/test/test_function/some/path/deeper",
            "path_vars": {},
          },
          "matched_config": {
            "config": null,
            "path": "/test/test_function/some/path/deeper"
          },
          "subtree_configs": [
            {
              "config": {
                "fid_deeper": "some function config deeper"
              },
              "path": "/path"
            }
          ]
        });
      })
    })

    describe("matchRule()", () => {
      it("when matching existing variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/test/test_rule/some/var_path"), {
          "matched_path": {
            "target_path": "/test/test_rule/some/$var_path",
            "ref_path": "/test/test_rule/some/var_path",
            "path_vars": {
              "$var_path": "var_path"
            },
          },
          "matched_config": {
            "config": "auth.addr !== 'abcd'",
            "path": "/test/test_rule/some/$var_path"
          },
          "subtree_configs": []
        });
      })

      it("when matching existing non-variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/test/test_rule/some/path"), {
          "matched_path": {
            "target_path": "/test/test_rule/some/path",
            "ref_path": "/test/test_rule/some/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": "auth.addr === 'abcd'",
            "path": "/test/test_rule/some/path"
          },
          "subtree_configs": [
            {
              "config": "auth.addr === 'ijkl'",
              "path": "/deeper/path"
            }
          ]
        });
        assert.deepEqual(node.db.matchRule("/test/test_rule/some/path/deeper/path"), {
          "matched_path": {
            "target_path": "/test/test_rule/some/path/deeper/path",
            "ref_path": "/test/test_rule/some/path/deeper/path",
            "path_vars": {},
          },
          "matched_config": {
            "config": "auth.addr === 'ijkl'",
            "path": "/test/test_rule/some/path/deeper/path"
          },
          "subtree_configs": []
        });
      })

      it("when matching existing closest non-variable path rule", () => {
        assert.deepEqual(node.db.matchRule("/test/test_rule/some/path/deeper"), {
          "matched_path": {
            "target_path": "/test/test_rule/some/path/deeper",
            "ref_path": "/test/test_rule/some/path/deeper",
            "path_vars": {},
          },
          "matched_config": {
            "config": "auth.addr === 'abcd'",
            "path": "/test/test_rule/some/path"
          },
          "subtree_configs": [
            {
              "config": "auth.addr === 'ijkl'",
              "path": "/path"
            }
          ]
        });
      })
    })

    describe("matchOwner()", () => {
      it("when matching existing owner with matching address", () => {
        assert.deepEqual(node.db.matchOwner("/test/test_owner/some/path", 'write_owner', 'abcd'), {
          "matched_path": {
            "target_path": "/test/test_owner/some/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "abcd": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/test/test_owner/some/path"
          }
        });
        assert.deepEqual(node.db.matchOwner("/test/test_owner/some/path/deeper/path", 'write_owner', 'ijkl'), {
          "matched_path": {
            "target_path": "/test/test_owner/some/path/deeper/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "ijkl": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/test/test_owner/some/path/deeper/path"
          }
        });
      })

      it("when matching existing owner without matching address", () => {
        assert.deepEqual(node.db.matchOwner("/test/test_owner/some/path", 'write_owner', 'other'), {
          "matched_path": {
            "target_path": "/test/test_owner/some/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "abcd": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/test/test_owner/some/path"
          }
        });
        assert.deepEqual(node.db.matchOwner("/test/test_owner/some/path/deeper/path", 'write_owner', 'other'), {
          "matched_path": {
            "target_path": "/test/test_owner/some/path/deeper/path"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "ijkl": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/test/test_owner/some/path/deeper/path"
          }
        });
      })

      it("when matching closest owner", () => {
        assert.deepEqual(node.db.matchOwner("/test/test_owner/some/path/deeper", 'write_owner', 'abcd'), {
          "matched_path": {
            "target_path": "/test/test_owner/some/path/deeper"
          },
          "matched_config": {
            "config": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true
                },
                "abcd": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false
                }
              }
            },
            "path": "/test/test_owner/some/path"
          }
        });
      })
    })

    describe("evalRule()", () => {
      it("when evaluating existing variable path rule", () => {
        expect(node.db.evalRule(
            "/test/test_rule/some/var_path", 'value', { addr: 'abcd' }, Date.now()))
                .to.equal(false);
        expect(node.db.evalRule(
            "/test/test_rule/some/var_path", 'value', { addr: 'other' }, Date.now()))
                .to.equal(true);
      })

      it("when evaluating existing non-variable path rule", () => {
        expect(node.db.evalRule("/test/test_rule/some/path", 'value', { addr: 'abcd' }, Date.now()))
            .to.equal(true);
        expect(node.db.evalRule("/test/test_rule/some/path", 'value', { addr: 'other' }, Date.now()))
            .to.equal(false);
        expect(node.db.evalRule(
            "/test/test_rule/some/path/deeper/path", 'value', { addr: 'ijkl' }, Date.now()))
                .to.equal(true);
        expect(node.db.evalRule(
            "/test/test_rule/some/path/deeper/path", 'value', { addr: 'other' }, Date.now()))
                .to.equal(false);
      })

      it("when evaluating existing closest rule", () => {
        expect(node.db.evalRule(
            "/test/test_rule/some/path/deeper", 'value', { addr: 'abcd' }, Date.now()))
                .to.equal(true);
        expect(node.db.evalRule(
            "/test/test_rule/some/path/deeper", 'value', { addr: 'other' }, Date.now()))
                .to.equal(false);
      })
    })

    describe("evalOwner()", () => {
      it("when evaluating existing owner with matching address", () => {
        expect(node.db.evalOwner("/test/test_owner/some/path", 'write_owner', { addr: 'abcd' }))
            .to.equal(true);
        expect(node.db.evalOwner("/test/test_owner/some/path", 'write_rule', { addr: 'abcd' }))
            .to.equal(false);
        expect(node.db.evalOwner(
            "/test/test_owner/some/path/deeper/path", 'write_owner', { addr: 'ijkl' }))
                .to.equal(true);
        expect(node.db.evalOwner(
            "/test/test_owner/some/path/deeper/path", 'write_rule', { addr: 'ijkl' }))
                .to.equal(false);
      })

      it("when evaluating existing owner without matching address", () => {
        expect(node.db.evalOwner("/test/test_owner/some/path", 'write_owner', { addr: 'other' }))
            .to.equal(false);
        expect(node.db.evalOwner("/test/test_owner/some/path", 'write_rule', { addr: 'other' }))
            .to.equal(true);
        expect(node.db.evalOwner(
            "/test/test_owner/some/path/deeper/path", 'write_owner', { addr: 'other' }))
                .to.equal(false);
        expect(node.db.evalOwner(
            "/test/test_owner/some/path/deeper/path", 'write_rule', { addr: 'other' }))
                .to.equal(true);
      })

      it("when evaluating closest owner", () => {
        expect(node.db.evalOwner(
            "/test/test_owner/some/path/deeper", 'write_owner', { addr: 'abcd' }))
                .to.equal(true);
        expect(node.db.evalOwner(
            "/test/test_owner/some/path/deeper", 'write_rule', { addr: 'abcd' }))
                .to.equal(false);
        expect(node.db.evalOwner(
            "/test/test_owner/some/path/deeper", 'write_owner', { addr: 'other' }))
                .to.equal(false);
        expect(node.db.evalOwner(
            "/test/test_owner/some/path/deeper", 'write_rule', { addr: 'other' }))
                .to.equal(true);
      })
    })

    describe("get()", () => {
      it("when retrieving non-existing value or function or rule or owner", () => {
        assert.deepEqual(node.db.get([
          {
            // Default type: GET_VALUE
            ref: "/value/other/path",
          },
          {
            type: "GET_RULE",
            ref: "/rule/other/path",
          },
          {
            type: "GET_FUNCTION",
            ref: "/function/other/path",
          },
          {
            type: "GET_OWNER",
            ref: "/owner/other/path",
          },
          {
            type: "MATCH_FUNCTION",
            ref: "/test/test_function/some/path/deeper",
          },
          {
            type: "MATCH_RULE",
            ref: "/test/test_rule/some/path/deeper",
          },
          {
            type: "MATCH_OWNER",
            ref: "/test/test_owner/some/path/deeper",
          },
          {
            type: "EVAL_RULE",
            ref: "/rule/other/path",
            value: "value",
            address: "abcd",
            timestamp: Date.now(),
          },
          {
            type: "EVAL_OWNER",
            ref: "/owner/other/path",
            permission: "write_rule",
            address: "abcd",
            timestamp: Date.now(),
          },
        ]), [
          null,
          null,
          null,
          null,
          {
            "matched_path": {
              "target_path": "/test/test_function/some/path/deeper",
              "ref_path": "/test/test_function/some/path/deeper",
              "path_vars": {},
            },
            "matched_config": {
              "config": null,
              "path": "/test/test_function/some/path/deeper"
            },
            "subtree_configs": [
              {
                "config": {
                  "fid_deeper": "some function config deeper"
                },
                "path": "/path"
              }
            ]
          },
          {
            "matched_path": {
              "target_path": "/test/test_rule/some/path/deeper",
              "ref_path": "/test/test_rule/some/path/deeper",
              "path_vars": {},
            },
            "matched_config": {
              "config": "auth.addr === 'abcd'",
              "path": "/test/test_rule/some/path"
            },
            "subtree_configs": [
              {
                "config": "auth.addr === 'ijkl'",
                "path": "/path"
              }
            ]
          },
          {
            "matched_path": {
              "target_path": "/test/test_owner/some/path/deeper"
            },
            "matched_config": {
              "config": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": true,
                    "write_owner": false,
                    "write_rule": true
                  },
                  "abcd": {
                    "branch_owner": true,
                    "write_function": false,
                    "write_owner": true,
                    "write_rule": false
                  }
                }
              },
              "path": "/test/test_owner/some/path"
            }
          },
          false,
          false
        ]);
      })

      it("when retrieving existing value or function or rule or owner", () => {
        assert.deepEqual(node.db.get([
          {
            // Default type: GET_VALUE
            ref: "/test/nested/far/down",
          },
          {
            type: "GET_RULE",
            ref: "/test/test_rule/some/path",
          },
          {
            type: "GET_FUNCTION",
            ref: "/test/test_function/some/path",
          },
          {
            type: "GET_OWNER",
            ref: "/test/test_owner/some/path",
          },
          {
            type: "MATCH_FUNCTION",
            ref: "/test/test_function/some/path",
          },
          {
            type: "MATCH_RULE",
            ref: "/test/test_rule/some/path",
          },
          {
            type: "MATCH_OWNER",
            ref: "/test/test_owner/some/path",
          },
          {
            type: "EVAL_RULE",
            ref: "/test/test_rule/some/path",
            value: "value",
            address: "abcd",
            timestamp: Date.now(),
          },
          {
            type: "EVAL_OWNER",
            ref: "/test/test_owner/some/path",
            permission: "write_owner",
            address: "abcd",
            timestamp: Date.now(),
          },
        ]), [
          456,
          {
            ".write": "auth.addr === 'abcd'",
            "deeper": {
              "path": {
                ".write": "auth.addr === 'ijkl'"
              }
            }
          },
          {
            ".function": {
              "fid": "some function config"
            },
            "deeper": {
              "path": {
                ".function": {
                  "fid_deeper": "some function config deeper"
                }
              }
            }
          },
          {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": true,
                  "write_owner": false,
                  "write_rule": true,
                },
                "abcd": {
                  "branch_owner": true,
                  "write_function": false,
                  "write_owner": true,
                  "write_rule": false,
                }
              }
            },
            "deeper": {
              "path": {
                ".owner": {
                  "owners": {
                    "*": {
                      "branch_owner": false,
                      "write_function": true,
                      "write_owner": false,
                      "write_rule": true,
                    },
                    "ijkl": {
                      "branch_owner": true,
                      "write_function": false,
                      "write_owner": true,
                      "write_rule": false,
                    }
                  }
                }
              }
            }
          },
          {
            "matched_path": {
              "target_path": "/test/test_function/some/path",
              "ref_path": "/test/test_function/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": {
                "fid": "some function config"
              },
              "path": "/test/test_function/some/path"
            },
            "subtree_configs": [
              {
                "config": {
                  "fid_deeper": "some function config deeper"
                },
                "path": "/deeper/path"
              }
            ]
          },
          {
            "matched_path": {
              "target_path": "/test/test_rule/some/path",
              "ref_path": "/test/test_rule/some/path",
              "path_vars": {},
            },
            "matched_config": {
              "config": "auth.addr === 'abcd'",
              "path": "/test/test_rule/some/path"
            },
            "subtree_configs": [
              {
                "config": "auth.addr === 'ijkl'",
                "path": "/deeper/path"
              }
            ]
          },
          {
            "matched_path": {
              "target_path": "/test/test_owner/some/path"
            },
            "matched_config": {
              "config": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_function": true,
                    "write_owner": false,
                    "write_rule": true
                  },
                  "abcd": {
                    "branch_owner": true,
                    "write_function": false,
                    "write_owner": true,
                    "write_rule": false
                  }
                }
              },
              "path": "/test/test_owner/some/path"
            }
          },
          true,
          true,
        ]);
      })
    })
  })

  describe("Write operations", () => {
    describe("setValue()", () => {
      it("when overwriting nested value", () => {
        const newValue = {"new": 12345}
        expect(node.db.setValue("test/nested/far/down", newValue).code).to.equal(0)
        assert.deepEqual(node.db.getValue("test/nested/far/down"), newValue)
      })

      it("when creating new path in database", () => {
        const newValue = 12345
        expect(node.db.setValue("test/new/unchartered/nested/path", newValue).code).to.equal(0)
        expect(node.db.getValue("test/new/unchartered/nested/path")).to.equal(newValue)
      })

      it("when writing invalid object", () => {
        assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {array: []}), {
          "code": 101,
          "error_message": "Invalid object for states: /array",
          "gas_amount": 0
        });
        expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {'.': 'x'}), {
          "code": 101,
          "error_message": "Invalid object for states: /.",
          "gas_amount": 0
        });
        expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {'$': 'x'}), {
          "code": 101,
          "error_message": "Invalid object for states: /$",
          "gas_amount": 0
        });
        expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {'*a': 'x'}), {
          "code": 101,
          "error_message": "Invalid object for states: /*a",
          "gas_amount": 0
        });
        expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {'a*': 'x'}), {
          "code": 101,
          "error_message": "Invalid object for states: /a*",
          "gas_amount": 0
        });
        expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)
      })

      it("when writing with invalid path", () => {
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/.", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/.",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/$", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/$",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/a*", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/a*",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/*a", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/*a",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/#", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/#",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/{", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/{",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/}", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/}",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/[", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/[",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/]", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/]",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/\x00", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/\x00",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/\x1F", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/\x1F",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/new/unchartered/nested/\x7F", 12345), {
          "code": 102,
          "error_message": "Invalid path: /test/new/unchartered/nested/\x7F",
          "gas_amount": 0
        });
      })

      it("when writing with non-writable path with sharding", () => {
        assert.deepEqual(node.db.setValue("test/shards/enabled_shard", 20), {
          "code": 104,
          "error_message": "Non-writable path with shard config: /values/test/shards/enabled_shard",
          "gas_amount": 0
        });
        assert.deepEqual(node.db.setValue("test/shards/enabled_shard/path", 20), {
          "code": 104,
          "error_message": "Non-writable path with shard config: /values/test/shards/enabled_shard",
          "gas_amount": 0
        });
      })

      it("when writing with writable path with sharding", () => {
        expect(node.db.setValue("test/shards/disabled_shard", 20).code).to.equal(0);
        expect(node.db.getValue("test/shards/disabled_shard")).to.equal(20)
        expect(node.db.setValue("test/shards/disabled_shard/path", 20).code).to.equal(0);
        expect(node.db.getValue("test/shards/disabled_shard/path")).to.equal(20)
      })
    })

    describe("incValue()", () => {
      it("when increasing value successfully", () => {
        expect(node.db.incValue("test/increment/value", 10).code).to.equal(0)
        expect(node.db.getValue("test/increment/value")).to.equal(30)
      })

      it("returning error code and leaving value unchanged if delta is not numerical", () => {
        expect(node.db.incValue("test/increment/value", '10').code).to.equal(201)
        expect(node.db.getValue("test/increment/value")).to.equal(20)
      })

      it("returning error code and leaving value unchanged if path is not numerical", () => {
        expect(node.db.incValue("test/ai/foo", 10).code).to.equal(201)
        expect(node.db.getValue("test/ai/foo")).to.equal("bar")
      })

      it("creating and increasing given path from 0 if not currently in database", () => {
        node.db.incValue("test/completely/new/path/test", 100);
        expect(node.db.getValue("test/completely/new/path/test")).to.equal(100)
      })

      it("returning error code with non-writable path with sharding", () => {
        assert.deepEqual(node.db.incValue("test/shards/enabled_shard/path", 5), {
          "code": 104,
          "error_message": "Non-writable path with shard config: /values/test/shards/enabled_shard",
          "gas_amount": 0
        });
      })

      it("when increasing with writable path with sharding", () => {
        expect(node.db.incValue("test/shards/disabled_shard/path", 5).code).to.equal(0);
        expect(node.db.getValue("test/shards/disabled_shard/path")).to.equal(15)
      })
    })

    describe("decValue()", () => {
      it("when decreasing value successfully", () => {
        expect(node.db.decValue("test/decrement/value", 10).code).to.equal(0)
        expect(node.db.getValue("test/decrement/value")).to.equal(10)
      })

      it("returning error code and leaving value unchanged if delta is not numerical", () => {
        expect(node.db.decValue("test/decrement/value", '10').code).to.equal(301)
        expect(node.db.getValue("test/decrement/value")).to.equal(20)
      })

      it("returning error code and leaving value unchanged if path is not numerical", () => {
        expect(node.db.decValue("test/ai/foo", 10).code).to.equal(301)
        expect(node.db.getValue("test/ai/foo")).to.equal("bar")
      })

      it("creating and decreasing given path from 0 if not currently in database", () => {
        node.db.decValue("test/completely/new/path/test", 100);
        expect(node.db.getValue("test/completely/new/path/test")).to.equal(-100)
      })

      it("returning error code with non-writable path with sharding", () => {
        assert.deepEqual(node.db.decValue("test/shards/enabled_shard/path", 5), {
          "code": 104,
          "error_message": "Non-writable path with shard config: /values/test/shards/enabled_shard",
          "gas_amount": 0
        });
      })

      it("when increasing with writable path with sharding", () => {
        expect(node.db.decValue("test/shards/disabled_shard/path", 5).code).to.equal(0);
        expect(node.db.getValue("test/shards/disabled_shard/path")).to.equal(5)
      })
    })

    describe("setFunction()", () => {
      it("when overwriting existing function config with simple path", () => {
        const functionConfig = {
          ".function": {
            "fid": "other function config"
          }
        };
        expect(node.db.setFunction("/test/test_function/some/path", functionConfig).code)
            .to.equal(0);
        assert.deepEqual(node.db.getFunction("/test/test_function/some/path"), {
          ".function": {
            "fid": "other function config"  // modified
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": "some function config deeper"
              }
            }
          }
        })
      })

      it("when writing with variable path", () => {
        const functionConfig = {
          ".function": {
            "fid_other": "other function config"
          }
        };
        expect(node.db.setFunction("/test/test_function/some/$variable/path", functionConfig).code)
            .to.equal(0);
        assert.deepEqual(
            node.db.getFunction("/test/test_function/some/$variable/path"), functionConfig)
      })

      it("when writing invalid object", () => {
        assert.deepEqual(node.db.setFunction("/test/test_function/some/path2", {array: []}), {
          "code": 401,
          "error_message": "Invalid object for states: /array",
          "gas_amount": 0
        });
        expect(node.db.getFunction("test/new2/unchartered/nested/path2")).to.equal(null)

        assert.deepEqual(node.db.setFunction("/test/test_function/some/path2", {'.': 'x'}), {
          "code": 401,
          "error_message": "Invalid object for states: /.",
          "gas_amount": 0
        });
        expect(node.db.getFunction("test/new2/unchartered/nested/path2")).to.equal(null)
      })

      it("when writing with invalid path", () => {
        assert.deepEqual(node.db.setFunction(
            "/test/test_function/some/path/.", "some function config"), {
          "code": 402,
          "error_message": "Invalid path: /test/test_function/some/path/.",
          "gas_amount": 0
        });
      })
    })

    describe("setRule()", () => {
      it("when overwriting existing rule config with simple path", () => {
        const ruleConfig = {".write": "other rule config"};
        expect(node.db.setRule("/test/test_rule/some/path", ruleConfig).code).to.equal(0);
        assert.deepEqual(node.db.getRule("/test/test_rule/some/path"), ruleConfig)
      })

      it("when writing with variable path", () => {
        const ruleConfig = {".write": "other rule config"};
        expect(node.db.setRule("/test/test_rule/some/$variable/path", ruleConfig).code)
            .to.equal(0)
        assert.deepEqual(node.db.getRule("/test/test_rule/some/$variable/path"), ruleConfig)
      })

      it("when writing invalid object", () => {
        assert.deepEqual(node.db.setRule("/test/test_rule/some/path2", {array: []}), {
          "code": 501,
          "error_message": "Invalid object for states: /array",
          "gas_amount": 0
        });
        expect(node.db.getRule("/test/test_rule/some/path2")).to.equal(null)

        assert.deepEqual(node.db.setRule("/test/test_rule/some/path2", {'.': 'x'}), {
          "code": 501,
          "error_message": "Invalid object for states: /.",
          "gas_amount": 0
        });
        expect(node.db.getRule("/test/test_rule/some/path2")).to.equal(null)
      })

      it("when writing with invalid path", () => {
        assert.deepEqual(node.db.setRule("/test/test_rule/some/path/.", "some rule config"), {
          "code": 502,
          "error_message": "Invalid path: /test/test_rule/some/path/.",
          "gas_amount": 0
        });
      })
    })

    describe("setOwner()", () => {
      it("when overwriting existing owner config", () => {
        const ownerConfig = {".owner": "other owner config"};
        expect(node.db.setOwner("/test/test_owner/some/path", ownerConfig, { addr: 'abcd' }).code)
            .to.equal(0)
        assert.deepEqual(node.db.getOwner("/test/test_owner/some/path"), ownerConfig)
      })

      it("when writing invalid object", () => {
        assert.deepEqual(node.db.setOwner("/test/test_owner/some/path2", {array: []}), {
          "code": 601,
          "error_message": "Invalid object for states: /array",
          "gas_amount": 0
        });
        expect(node.db.getOwner("/test/test_owner/some/path2")).to.equal(null)

        assert.deepEqual(node.db.setOwner("/test/test_owner/some/path2", {'.': 'x'}), {
          "code": 601,
          "error_message": "Invalid object for states: /.",
          "gas_amount": 0
        });
        expect(node.db.getOwner("/test/test_owner/some/path2")).to.equal(null)
      })

      it("when writing with invalid path", () => {
        assert.deepEqual(node.db.setOwner("/test/test_owner/some/path/.", "some owner config"), {
          "code": 602,
          "error_message": "Invalid path: /test/test_owner/some/path/.",
          "gas_amount": 0
        });
      })
    })

    describe("executeSingleSetOperation()", () => {
      it("when successful", () => {
        assert.deepEqual(node.db.executeSingleSetOperation({
          // Default type: SET_VALUE
          ref: "test/nested/far/down",
          value: {
            "new": 12345
          }
        }, { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }}), {
          "code": 0,
          "gas_amount": 1
        });
        assert.deepEqual(node.db.getValue("test/nested/far/down"), { "new": 12345 })
      })

      it("returning error code and leaving value unchanged when it fails", () => {
        assert.deepEqual(node.db.executeSingleSetOperation({
          type: "INC_VALUE",
          ref: "test/ai/foo",
          value: 10
        }), {
          "code": 201,
          "error_message": "Not a number type: bar or 10",
          "gas_amount": 0
        })
        expect(node.db.getValue("test/ai/foo")).to.equal("bar")
      })

      it("when successful with function triggering", () => {
        const valuePath = '/test/test_function_triggering/allowed_path/value';
        const functionResultPath = '/test/test_function_triggering/allowed_path/.last_tx/value';
        const value = 'some value';
        const timestamp = 1234567890000;

        const result = node.db.executeMultiSetOperation([
          {
            type: 'SET_FUNCTION',
            ref: valuePath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: valuePath,
            value: {
              ".write": true,
            }
          },
          {
            type: 'SET_RULE',
            ref: functionResultPath,
            value: {
              ".write": true,  // Allow all.
            }
          },
          {
            type: 'SET_FUNCTION',
            ref: functionResultPath,
            value: {
              ".function": {
                "_eraseValue": {
                  "function_type": "NATIVE",
                  "function_id": "_eraseValue"
                }
              }
            }
          },
        ], { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }});
        expect(ChainUtil.isFailedTx(result)).to.equal(false);

        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: valuePath,
            value,
          },
          gas_price: 1,
          nonce: -1,
          timestamp,
          address: 'abcd',
        };
        const tx = Transaction.fromTxBody(txBody, null);
        expect(tx).to.not.equal(null);

        assert.deepEqual(node.db.executeSingleSetOperation(txBody.operation, { addr: 'abcd' },
            timestamp, tx), {
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
                              "gas_amount": 1,
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
              "gas_amount": 0
            }
          },
          "code": 0,
          "gas_amount": 1
        });
        assert.deepEqual(node.db.getValue(valuePath), value)
      })

      it("when failed with function triggering", () => {
        const valuePath = '/test/test_function_triggering/allowed_path/value';
        const functionResultPath = '/test/test_function_triggering/allowed_path/.last_tx/value';
        const value = 'some value';
        const timestamp = 1234567890000;

        const result = node.db.executeMultiSetOperation([
          {
            type: 'SET_FUNCTION',
            ref: valuePath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: valuePath,
            value: {
              ".write": true,
            }
          },
          {
            type: 'SET_RULE',
            ref: functionResultPath,
            value: {
              ".write": "auth.fid !== '_eraseValue'",  // Do NOT allow writes by the last function.
            }
          },
          {
            type: 'SET_FUNCTION',
            ref: functionResultPath,
            value: {
              ".function": {
                "_eraseValue": {
                  "function_type": "NATIVE",
                  "function_id": "_eraseValue"
                }
              }
            }
          },
        ], { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }});
        expect(ChainUtil.isFailedTx(result)).to.equal(false);

        const txBody = {
          operation: {
            type: 'SET_VALUE',
            ref: valuePath,
            value,
          },
          gas_price: 1,
          nonce: -1,
          timestamp,
          address: 'abcd',
        };
        const tx = Transaction.fromTxBody(txBody, null);
        expect(tx).to.not.equal(null);

        assert.deepEqual(node.db.executeSingleSetOperation(txBody.operation, { addr: 'abcd' },
            timestamp, tx), {
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
                              "code": 103,
                              "error_message": "No .write permission on: /test/test_function_triggering/allowed_path/.last_tx/value",
                              "gas_amount": 0
                            }
                          }
                        ],
                        "code": "FAILURE",
                        "gas_amount": 0,
                      }
                    },
                    "code": 0,
                    "gas_amount": 1
                  }
                }
              ],
              "code": "FAILURE",
              "gas_amount": 0,
            }
          },
          "code": 0,
          "gas_amount": 1,
        });
        assert.deepEqual(node.db.getValue(valuePath), value)
      })
    })

    describe("executeMultiSetOperation()", () => {
      it("when all operations applied successfully", () => {
        assert.deepEqual(node.db.executeMultiSetOperation([
          {
            // Default type: SET_VALUE
            ref: "test/nested/far/down",
            value: {
              "new": 12345
            }
          },
          {
            type: "INC_VALUE",
            ref: "test/increment/value",
            value: 10
          },
          {
            type: "DEC_VALUE",
            ref: "test/decrement/value",
            value: 10
          },
          {
            type: "SET_FUNCTION",
            ref: "/test/test_function/some/path",
            value: {
              ".function": {
                "fid": "other function config"
              }
            }
          },
          {
            type: "SET_RULE",
            ref: "/test/test_rule/some/path",
            value: {
              ".write": "other rule config"
            }
          },
          {
            type: "SET_OWNER",
            ref: "/test/test_owner/some/path",
            value: {
              ".owner": "other owner config"
            }
          }
        ], { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }}), {
          "result_list": [
            {
              "code": 0,
              "gas_amount": 1,
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            }
          ]
        });
        assert.deepEqual(node.db.getValue("test/nested/far/down"), { "new": 12345 })
        expect(node.db.getValue("test/increment/value")).to.equal(30)
        expect(node.db.getValue("test/decrement/value")).to.equal(10)
        assert.deepEqual(node.db.getFunction("/test/test_function/some/path"), {
          ".function": {
            "fid": "other function config"  // modiied
          },
          "deeper": {
            "path": {
              ".function": {
                "fid_deeper": "some function config deeper"
              }
            }
          }
        });
        assert.deepEqual(
            node.db.getRule("/test/test_rule/some/path"), { ".write": "other rule config" });
        assert.deepEqual(
            node.db.getOwner("/test/test_owner/some/path"), { ".owner": "other owner config" });
      })

      it("returning error code and leaving value unchanged when an operation fails", () => {
        assert.deepEqual(node.db.executeMultiSetOperation([
          {
            type: "SET_VALUE",
            ref: "test/nested/far/down",
            value: {
              "new": 12345
            }
          },
          {
            type: "INC_VALUE",
            ref: "test/ai/foo",
            value: 10
          },
          {
            type: "DEC_VALUE",
            ref: "test/decrement/value",
            value: 10
          },
        ]), {
          result_list: [
            {
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 201,
              "error_message": "Not a number type: bar or 10",
              "gas_amount": 0
            }
          ]
        })
        expect(node.db.getValue("test/ai/foo")).to.equal("bar")
      })

      it("when successful with function triggering", () => {
        const valuePath = '/test/test_function_triggering/allowed_path/value';
        const functionResultPath = '/test/test_function_triggering/allowed_path/.last_tx/value';
        const value = 'some value';
        const timestamp = 1234567890000;

        const result = node.db.executeMultiSetOperation([
          {
            type: 'SET_FUNCTION',
            ref: valuePath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: valuePath,
            value: {
              ".write": true,
            }
          },
          {
            type: 'SET_RULE',
            ref: functionResultPath,
            value: {
              ".write": true,  // Allow all.
            }
          },
          {
            type: 'SET_FUNCTION',
            ref: functionResultPath,
            value: {
              ".function": {
                "_eraseValue": {
                  "function_type": "NATIVE",
                  "function_id": "_eraseValue"
                }
              }
            }
          },
        ], { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }});
        expect(ChainUtil.isFailedTx(result)).to.equal(false);

        const txBody = {
          operation: {
            type: "SET",
            op_list: [
              {
                type: 'SET_VALUE',
                ref: valuePath,
                value,
              },
              {
                // Default type: SET_VALUE
                ref: "test/nested/far/down",
                value: {
                  "new": 12345
                }
              },
            ],
          },
          gas_price: 1,
          nonce: -1,
          timestamp,
          address: 'abcd',
        };
        const tx = Transaction.fromTxBody(txBody, null);
        expect(tx).to.not.equal(null);

        assert.deepEqual(node.db.executeMultiSetOperation(txBody.operation.op_list,
            { addr: 'abcd' }, timestamp, tx), {
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
                            "gas_amount": 0
                          }
                        },
                        "code": 0,
                        "gas_amount": 1
                      }
                    }
                  ],
                  "code": "SUCCESS",
                  "gas_amount": 0
                }
              },
              "code": 0,
              "gas_amount": 1
            },
            {
              "code": 0,
              "gas_amount": 1
            },
          ],
        });
      })

      it("when failed with function triggering", () => {
        const valuePath = '/test/test_function_triggering/allowed_path/value';
        const functionResultPath = '/test/test_function_triggering/allowed_path/.last_tx/value';
        const value = 'some value';
        const timestamp = 1234567890000;

        const result = node.db.executeMultiSetOperation([
          {
            type: 'SET_FUNCTION',
            ref: valuePath,
            value: {
              ".function": {
                "_saveLastTx": {
                  "function_type": "NATIVE",
                  "function_id": "_saveLastTx"
                }
              }
            }
          },
          {
            type: 'SET_RULE',
            ref: valuePath,
            value: {
              ".write": true,
            }
          },
          {
            type: 'SET_RULE',
            ref: functionResultPath,
            value: {
              ".write": "auth.fid !== '_eraseValue'",  // Do NOT allow writes by the last function.
            }
          },
          {
            type: 'SET_FUNCTION',
            ref: functionResultPath,
            value: {
              ".function": {
                "_eraseValue": {
                  "function_type": "NATIVE",
                  "function_id": "_eraseValue"
                }
              }
            }
          },
        ], { addr: 'abcd' }, null, { extra: { executed_at: 1234567890000 }});
        expect(ChainUtil.isFailedTx(result)).to.equal(false);

        const txBody = {
          operation: {
            type: "SET",
            op_list: [
              {
                type: 'SET_VALUE',
                ref: valuePath,
                value,
              },
              {
                // Default type: SET_VALUE
                ref: "test/nested/far/down",
                value: {
                  "new": 12345
                }
              },
            ],
          },
          gas_price: 1,
          nonce: -1,
          timestamp,
          address: 'abcd',
        };
        const tx = Transaction.fromTxBody(txBody, null);
        expect(tx).to.not.equal(null);

        assert.deepEqual(node.db.executeMultiSetOperation(txBody.operation.op_list,
            { addr: 'abcd' }, timestamp, tx), {
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
                                  "code": 103,
                                  "error_message": "No .write permission on: /test/test_function_triggering/allowed_path/.last_tx/value",
                                  "gas_amount": 0,
                                }
                              }
                            ],
                            "code": "FAILURE",
                            "gas_amount": 0,
                          }
                        },
                        "code": 0,
                        "gas_amount": 1
                      }
                    }
                  ],
                  "code": "FAILURE",
                  "gas_amount": 0,
                }
              },
              "code": 0,
              "gas_amount": 1
            },
          ],
        });
      })
    })
  })

  describe("Transaction execution", () => {
    let node;
    let txBody;
    let executableTx;
    let objectTx;

    beforeEach(() => {
      rimraf.sync(CHAINS_DIR);

      node = new BlockchainNode();
      setNodeForTesting(node);

      txBody = {
        operation: {
          type: 'SET_VALUE',
          ref: '/test/some/path/for/tx',
          value: 'some value',
        },
        gas_price: 1000000,
        nonce: -1,
        timestamp: 1568798344000,
      };
      executableTx = Transaction.fromTxBody(txBody, node.account.private_key);
      objectTx = Transaction.toJsObject(executableTx);
    });

    afterEach(() => {
      rimraf.sync(CHAINS_DIR);
    });

    describe("executeTransaction()", () => {
      it("returns code 0 for executable transaction", () => {
        expect(executableTx.extra).to.not.equal(undefined);
        expect(executableTx.extra.executed_at).to.equal(null);
        assert.deepEqual(node.db.executeTransaction(executableTx, node.bc.lastBlockNumber() + 1), {
          code: 0,
          gas_amount: 1,
          gas_amount_total: {
            app: {},
            service: 1
          },
          gas_cost_total: 1,
        });
        // extra.executed_at is updated with a non-null value.
        expect(executableTx.extra.executed_at).to.not.equal(null);
      });

      it("returns error code for object transaction", () => {
        assert.deepEqual(node.db.executeTransaction(objectTx, node.bc.lastBlockNumber() + 1), {
          code: 21,
          error_message: "[executeTransaction] Not executable transaction: {\"tx_body\":{\"operation\":{\"type\":\"SET_VALUE\",\"ref\":\"/test/some/path/for/tx\",\"value\":\"some value\"},\"gas_price\":1000000,\"nonce\":-1,\"timestamp\":1568798344000},\"signature\":\"0xd0c7aee750ef0437ac8efe6c8c8b304d760f3271c36c4ea96d11f3446c9d772124a165aedc7bd6483dd4b318da7729867863f81714c250bf460ec39d0467624a26c47189b3e20eb5d2d698cf00bb11f729833b73282925b759df9e652f0a33dd1c\",\"hash\":\"0xd0c7aee750ef0437ac8efe6c8c8b304d760f3271c36c4ea96d11f3446c9d7721\",\"address\":\"0x00ADEc28B6a845a085e03591bE7550dd68673C1C\"}",
          gas_amount: 0
        });
        assert.deepEqual(objectTx.extra, undefined);
      });

      it("rejects over-height transaction", () => {
        const maxHeightTxBody = {
          operation: {
            type: 'SET_VALUE',
            ref: '/test/3/4/5/6/7/8/9/10/11/12/13/14/15/16/17/18/19/20',
            value: 'some value',
          },
          gas_price: 0,
          nonce: -1,
          timestamp: 1568798344000,
        };
        const maxHeightTx = Transaction.fromTxBody(maxHeightTxBody, node.account.private_key);
        assert.deepEqual(node.db.executeTransaction(maxHeightTx, node.bc.lastBlockNumber() + 1), {
          code: 0,
          gas_amount: 1,
          gas_amount_total: {
            app: {},
            service: 1
          },
          gas_cost_total: 0,
        });

        const overHeightTxBody = {
          operation: {
            type: 'SET_VALUE',
            ref: '/test/3/4/5/6/7/8/9/10/11/12/13/14/15/16/17/18/19/20/21',
            value: 'some value',
          },
          gas_price: 0,
          nonce: -1,
          timestamp: 1568798344000,
        };
        const overHeightTx = Transaction.fromTxBody(overHeightTxBody, node.account.private_key);
        assert.deepEqual(node.db.executeTransaction(overHeightTx, node.bc.lastBlockNumber() + 1), {
          code: 23,
          error_message: "Out of tree height limit (21 > 20)",
          gas_amount: 0,
        });
      })

      it("rejects over-size transaction", () => {
        const overSizeTree = {};
        for (let i = 0; i < 1000; i++) {
          overSizeTree[i] = {};
          for (let j = 0; j < 1000; j++) {
            overSizeTree[i][j] = 'a';
          }
        }
        const overSizeTxBody = {
          operation: {
            type: 'SET_VALUE',
            ref: '/test/tree',
            value: overSizeTree,
          },
          gas_price: 1,
          nonce: -1,
          timestamp: 1568798344000,
        };
        const overSizeTx = Transaction.fromTxBody(overSizeTxBody, node.account.private_key);
        assert.deepEqual(node.db.executeTransaction(overSizeTx, node.bc.lastBlockNumber() + 1), {
          code: 24,
          error_message: "Out of tree size limit (1001521 > 1000000)",
          gas_amount: 0,
        });
      })
    });
  });

  describe("Remove null terminals nodes (garbage collection)", () => {
    beforeEach(() => {
      emptyValues = {
        "terminal_1a": null,
        "terminal_1b": null,
        "terminal_1c": "",
        "node_1a": {
          "node_2": {
            "terminal_3": null,
            "node_3": "a value"
          }
        },
        "node_1b": {
          "terminal_2": null,
        }
      };
      const valueResult = node.db.setValue("/test/empty_values/node_0", emptyValues);
      assert.deepEqual(valueResult.code, 0);

      emptyRules = {
        "terminal_1a": null,
        "terminal_1b": null,
        "terminal_1c": "",
        "node_1a": {
          "node_2": {
            "terminal_3": null,
            "node_3": {
              ".write": "some rule"
            }
          }
        },
        "node_1b": {
          "terminal_2": null,
        }
      };
      const ruleResult = node.db.setRule("/test/empty_rules/node_0", emptyRules);
      assert.deepEqual(ruleResult.code, 0);

      emptyOwners = {
        "terminal_1a": null,
        "terminal_1b": null,
        "terminal_1c": "",
        "node_1a": {
          "node_2": {
            "terminal_3": null,
            "node_3": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": true,
                    "write_owner": true,
                    "write_rule": true,
                    "write_function": true
                  }
                }
              }
            }
          }
        },
        "node_1b": {
          "terminal_2": null,
        }
      };
      const ownerResult = node.db.setOwner("/test/empty_owners/node_0", emptyOwners);
      assert.deepEqual(ownerResult.code, 0);
    });

    afterEach(() => {
      const valueResult = node.db.setValue("/test/empty_values/node_0", null);
      assert.deepEqual(valueResult.code, 0);

      const ruleResult = node.db.setRule("/test/empty_rules/node_0", null);
      assert.deepEqual(ruleResult.code, 0);

      const ownerResult = node.db.setRule("/test/empty_owners/node_0", null);
      assert.deepEqual(ownerResult.code, 0);
    });

    it("when setValue() with non-empty value", () => {
      expect(node.db.setValue(
          "/test/empty_values/node_0/node_1a/node_2/node_3", "another value").code).to.equal(0);
      assert.deepEqual(node.db.getValue("/test/empty_values/node_0"), {
        "terminal_1a": null,
        "terminal_1b": null,
        "terminal_1c": "",
        "node_1a": {
          "node_2": {
            "terminal_3": null,
            "node_3": "another value"
          }
        },
        "node_1b": {
          "terminal_2": null,
        }
      })
    })

    it("when setValue() with 'null' value", () => {
      expect(node.db.setValue(
          "/test/empty_values/node_0/node_1a/node_2/node_3", null).code).to.equal(0);
      assert.deepEqual(node.db.getValue("/test/empty_values/node_0"), {
        "terminal_1c": "",
        "node_1b": {
          "terminal_2": null,
        }
      })
    })

    it("when setRule() with non-empty rule", () => {
      expect(node.db.setRule(
          "/test/empty_rules/node_0/node_1a/node_2/node_3", {
            ".write": "some other rule"
          }).code).to.equal(0)
      assert.deepEqual(node.db.getRule("/test/empty_rules/node_0"), {
        "terminal_1a": null,
        "terminal_1b": null,
        "terminal_1c": "",
        "node_1a": {
          "node_2": {
            "terminal_3": null,
            "node_3": {
              ".write": "some other rule"
            }
          }
        },
        "node_1b": {
          "terminal_2": null,
        }
      })
    })

    it("when setRule() with 'null' rule", () => {
      expect(node.db.setRule(
          "/test/empty_rules/node_0/node_1a/node_2/node_3", null).code).to.equal(0);
      assert.deepEqual(node.db.getRule("/test/empty_rules/node_0"), {
        "terminal_1c": "",
        "node_1b": {
          "terminal_2": null,
        }
      })
    })

    it("when setOwner() with non-empty owner", () => {
      expect(node.db.setOwner(
          "/test/empty_owners/node_0/node_1a/node_2/node_3", {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_owner": true,
                  "write_rule": false,
                  "write_function": false
                }
              }
            }
          }).code).to.equal(0)
      assert.deepEqual(node.db.getOwner("/test/empty_owners/node_0"), {
        "terminal_1a": null,
        "terminal_1b": null,
        "terminal_1c": "",
        "node_1a": {
          "node_2": {
            "terminal_3": null,
            "node_3": {
              ".owner": {
                "owners": {
                  "*": {
                    "branch_owner": false,
                    "write_owner": true,
                    "write_rule": false,
                    "write_function": false
                  }
                }
              }
            }
          }
        },
        "node_1b": {
          "terminal_2": null,
        }
      })
    })

    it("when setOwner() with 'null' owner", () => {
      expect(node.db.setOwner(
          "/test/empty_owners/node_0/node_1a/node_2/node_3", null).code).to.equal(0);
      assert.deepEqual(node.db.getOwner("/test/empty_owners/node_0"), {
        "terminal_1c": "",
        "node_1b": {
          "terminal_2": null,
        }
      })
    })
  })
})

describe("DB rule config", () => {
  let node1, node2, dbValues;

  beforeEach(() => {
    let result;

    rimraf.sync(CHAINS_DIR);

    node1 = new BlockchainNode();
    setNodeForTesting(node1, 0);
    node2 = new BlockchainNode();
    setNodeForTesting(node2, 1);
    dbValues = {
      "comcom": "unreadable value",
      "unspecified": {
        "test": {
          "nested": "readable"
        }
      },
      "ai" : "readable",
      "billing_keys": {
        "other": "unreadable",
        "update_billing": {}
      },
      "users": {},
      "second_users": {}
    };
    dbValues["users"][node1.account.address] = {};
    dbValues["users"][node2.account.address] = {};
    dbValues["users"][node1.account.address]["balance"] = 100;
    dbValues["users"][node2.account.address]["balance"] = 50;
    dbValues["users"][node1.account.address]["info"] = 8474;
    dbValues["users"][node1.account.address]["string_only"] = "some string";
    dbValues["users"][node2.account.address]["string_only"] = 101;
    dbValues["billing_keys"]["update_billing"][node2.account.address] = "'not null'";
    dbValues["users"][node1.account.address]["next_counter"] = 10;
    dbValues["second_users"][node1.account.address] = {};
    dbValues["second_users"][node2.account.address] = {};
    dbValues["second_users"][node2.account.address][node2.account.address] = "i can write";
    dbValues["second_users"][node1.account.address]["something_else"] = "i can write";

    result = node1.db.setValue("test", dbValues);
    assert.deepEqual(result.code, 0);
    result = node2.db.setValue("test", dbValues);
    assert.deepEqual(result.code, 0);
  })

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  it("only allows certain users to write certain info if balance is greater than 0", () => {
    expect(node2.db.evalRule(`test/users/${node2.account.address}/balance`, 0, null, null))
        .to.equal(true)
    expect(node2.db.evalRule(`test/users/${node2.account.address}/balance`, -1, null, null))
        .to.equal(false)
    expect(node1.db.evalRule(`test/users/${node1.account.address}/balance`, 1, null, null))
        .to.equal(true)
  })

  it("only allows certain users to write certain info if data exists", () => {
    expect(node1.db.evalRule(`test/users/${node1.account.address}/info`, "something", null, null))
        .to.equal(true)
    expect(node2.db.evalRule(
        `test/users/${node2.account.address}/info`, "something else", null, null))
            .to.equal(false)
    expect(node2.db.evalRule(
        `test/users/${node2.account.address}/new_info`, "something",
        { addr: node2.account.address }, null))
            .to.equal(true)
  })

  it("apply the closest ancestor's rule config if not exists", () => {
    expect(node1.db.evalRule(
        `test/users/${node1.account.address}/child/grandson`, "something",
        { addr: node1.account.address },
        null))
            .to.equal(true)
    expect(node2.db.evalRule(
        `test/users/${node2.account.address}/child/grandson`, "something",
        { addr: node1.account.address },
        null))
            .to.equal(false)
  })

  it("only allows certain users to write certain info if data at other locations exists", () => {
    expect(node2.db.evalRule(
        `test/users/${node2.account.address}/balance_info`, "something", null, null))
            .to.equal(true)
    expect(node1.db.evalRule(
        `test/users/${node1.account.address}/balance_info`, "something", null, null))
            .to.equal(false)
  })

  it("validates old data and new data together", () => {
    expect(node1.db.evalRule(`test/users/${node1.account.address}/next_counter`, 11, null,  null))
        .to.equal(true)
    expect(node1.db.evalRule(`test/users/${node1.account.address}/next_counter`, 12, null, null))
        .to.equal(false)
  })

  it("can handle nested path variables", () => {
    expect(node2.db.evalRule(
        `test/second_users/${node2.account.address}/${node2.account.address}`, "some value", null,
        null))
            .to.equal(true)
    expect(node1.db.evalRule(
        `test/second_users/${node1.account.address}/next_counter`, "some other value", null, null))
            .to.equal(false)
  })

  it("duplicated path variables", () => {
    expect(node1.db.evalRule('test/no_dup_key/aaa/bbb', "some value", null, null))
        .to.equal(true)
    expect(node1.db.evalRule('test/dup_key/aaa/bbb', "some value", null, null))
        .to.equal(true)
  })
})

describe("DB owner config", () => {
  let node;

  beforeEach(() => {
    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);
    assert.deepEqual(node.db.setOwner("test/test_owner/mixed/true/true/true",
      {
        ".owner": {
          "owners": {
            "*": {
              "branch_owner": false,
              "write_owner": false,
              "write_rule": false,
              "write_function": false
            },
            "aaaa": {
              "branch_owner": false,
              "write_owner": false,
              "write_rule": false,
              "write_function": false
            },
            "known_user": {
              "branch_owner": true,
              "write_owner": true,
              "write_rule": true,
              "write_function": true
            }
          }
        }
      }
    ).code, 0);
    assert.deepEqual(node.db.setOwner("test/test_owner/mixed/false/true/true",
      {
        ".owner": {
          "owners": {
            "*": {
              "branch_owner": true,
              "write_owner": false,
              "write_rule": false,
              "write_function": false
            },
            "aaaa": {
              "branch_owner": true,
              "write_owner": false,
              "write_rule": false,
              "write_function": false
            },
            "known_user": {
              "branch_owner": false,
              "write_owner": true,
              "write_rule": true,
              "write_function": true
            }
          }
        }
      }
    ).code, 0);
    assert.deepEqual(node.db.setOwner("test/test_owner/mixed/true/false/true",
      {
        ".owner": {
          "owners": {
            "*": {
              "branch_owner": false,
              "write_owner": true,
              "write_rule": false,
              "write_function": false
            },
            "aaaa": {
              "branch_owner": false,
              "write_owner": true,
              "write_rule": false,
              "write_function": false
            },
            "known_user": {
              "branch_owner": true,
              "write_owner": false,
              "write_rule": true,
              "write_function": true
            }
          }
        }
      }
    ).code, 0);
    assert.deepEqual(node.db.setOwner("test/test_owner/mixed/true/true/false",
      {
        ".owner": {
          "owners": {
            "*": {
              "branch_owner": false,
              "write_owner": false,
              "write_rule": true,
              "write_function": true
            },
            "aaaa": {
              "branch_owner": false,
              "write_owner": false,
              "write_rule": true,
              "write_function": true
            },
            "known_user": {
              "branch_owner": true,
              "write_owner": true,
              "write_rule": false,
              "write_function": false
            }
          }
        }
      }
    ).code, 0);
  })

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  // Known user
  it("branch_owner permission for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/true/branch', 'branch_owner', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/false/true/true/branch', 'branch_owner', { addr: 'known_user' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/false/true/branch', 'branch_owner', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/false/branch', 'branch_owner', { addr: 'known_user' }))
            .to.equal(true)
  })

  it("write_owner permission for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/true', 'write_owner', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/false/true/true', 'write_owner', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/false/true', 'write_owner', { addr: 'known_user' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/false', 'write_owner', { addr: 'known_user' }))
            .to.equal(true)
  })

  it("write_rule permission for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/true', 'write_rule', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/false/true/true', 'write_rule', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/false/true', 'write_rule', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/false', 'write_rule', { addr: 'known_user' }))
            .to.equal(false)
  })

  it("write_rule permission on deeper path for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/true/deeper_path', 'write_rule', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/false/true/true/deeper_path', 'write_rule', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/false/true/deeper_path', 'write_rule', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/false/deeper_path', 'write_rule', { addr: 'known_user' }))
            .to.equal(false)
  })

  it("write_function permission for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/true', 'write_function', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/false/true/true', 'write_function', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/false/true', 'write_function', { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/false', 'write_function', { addr: 'known_user' }))
            .to.equal(false)
  })

  it("write_Function permission on deeper path for known user with mixed config", () => {
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/true/deeper_path', 'write_function',
        { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/false/true/true/deeper_path', 'write_function',
        { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/false/true/deeper_path', 'write_function',
        { addr: 'known_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/false/deeper_path', 'write_function',
        { addr: 'known_user' }))
            .to.equal(false)
  })

  // Unknown user
  it("branch_owner permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/true/branch', 'branch_owner', { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/false/true/true/branch', 'branch_owner', { addr: 'unknown_user' }))
            .to.equal(true)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/false/true/branch', 'branch_owner', { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/false/branch', 'branch_owner', { addr: 'unknown_user' }))
            .to.equal(false)
  })

  it("write_owner permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true', 'write_owner',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true', 'write_owner',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true', 'write_owner',
        { addr: 'unknown_user' }))
            .to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false', 'write_owner',
        { addr: 'unknown_user' }))
            .to.equal(false)
  })

  it("write_rule permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true', 'write_rule',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true', 'write_rule',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true', 'write_rule',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false', 'write_rule',
        { addr: 'unknown_user' }))
            .to.equal(true)
  })

  it("write_rule permission on deeper path for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true/deeper_path', 'write_rule',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true/deeper_path', 'write_rule',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true/deeper_path', 'write_rule',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false/deeper_path', 'write_rule',
        { addr: 'unknown_user' }))
            .to.equal(true)
  })

  it("write_function permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true', 'write_function',
        { addr: 'unknown_user' })).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true', 'write_function',
        { addr: 'unknown_user' })).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true', 'write_function',
        { addr: 'unknown_user' })).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false', 'write_function',
        { addr: 'unknown_user' })).to.equal(true)
  })

  it("write_function permission on deeper path for unknown user with mixed config", () => {
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/true/deeper_path', 'write_function',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/false/true/true/deeper_path', 'write_function',
        { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/false/true/deeper_path', 'write_function',
         { addr: 'unknown_user' }))
            .to.equal(false)
    expect(node.db.evalOwner(
        '/test/test_owner/mixed/true/true/false/deeper_path', 'write_function',
        { addr: 'unknown_user' }))
            .to.equal(true)
  })
})


describe("DB sharding config", () => {
  let node;

  beforeEach(() => {
    let result;

    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node, 0, false, false);

    dbValues = {
      "some": {
        "path": {
          "to": {
            "value": "this",
            "number": 10,
          }
        }
      },
      "shards": {
        "enabled_shard": {
          ".shard": {
            "sharding_enabled": true,
          },
          "path": 10,
        },
        "disabled_shard": {
          ".shard": {
            "sharding_enabled": false,
          },
          "path": 10,
        }
      }
    };
    result = node.db.setValue("test/test_sharding", dbValues);
    assert.deepEqual(result.code, 0);

    dbFuncs = {
      "some": {
        "path": {
          "to": {
            ".function": {
              "fid": "some function config",
            },
            "deeper": {
              ".function": {
                "fid_deeper": "some deeper function config",
              }
            }
          }
        }
      }
    };
    result = node.db.setFunction("test/test_sharding", dbFuncs);
    assert.deepEqual(result.code, 0);

    dbRules = {
      "some": {
        "path": {
          ".write": "false",
          "to": {
            ".write": "auth.addr === 'known_user'",
            "deeper": {
              ".write": "some deeper rule config",
            }
          }
        }
      }
    };
    result = node.db.setRule("test/test_sharding", dbRules);
    assert.deepEqual(result.code, 0);

    dbOwners = {
      "some": {
        "path": {
          "to": {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_function": false,
                  "write_owner": false,
                  "write_rule": false,
                },
                "known_user": {
                  "branch_owner": true,
                  "write_function": true,
                  "write_owner": true,
                  "write_rule": true,
                }
              }
            }
          }
        }
      }
    };
    result = node.db.setOwner("test/test_sharding", dbOwners);
    assert.deepEqual(result.code, 0);
  })

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("Sharding path", () => {
    it("getShardingPath", () => {
      expect(node.db.getShardingPath()).to.equal("/apps/afan");
    })

    it("setShardingPath", () => {
      node.db.setShardingPath("/apps/another_app");
      expect(node.db.getShardingPath()).to.equal("/apps/another_app");
    })

    it("isRootBlockchain", () => {
      expect(node.db.isRootBlockchain).to.equal(false);
    })
  })

  describe("Value operations", () => {
    const value = "this";
    const newValue = "that";
    const incDelta = 5;
    const decDelta = 3;

    it("getValue with isGlobal = false", () => {
      expect(node.db.getValue("test/test_sharding/some/path/to/value")).to.equal(value);
      expect(node.db.getValue("apps/test_sharding/afan/test/some/path/to/value")).to.equal(null);
    })

    it("getValue with isGlobal = true", () => {
      expect(node.db.getValue("test/test_sharding/some/path/to/value", true)).to.equal(null);
      expect(node.db.getValue("apps/afan/test/test_sharding/some/path/to/value", true))
          .to.equal(value);
    })

    it("getValue with isGlobal = true and non-existing path", () => {
      expect(node.db.getValue("some/non-existing/path", true)).to.equal(null);
    })

    it("setValue with isGlobal = false", () => {
      expect(node.db.setValue(
          "test/test_sharding/some/path/to/value", newValue, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}).code)
              .to.equal(0);
      expect(node.db.getValue("test/test_sharding/some/path/to/value")).to.equal(newValue);
    })

    it("setValue with isGlobal = true", () => {
      expect(node.db.setValue(
          "apps/afan/test/test_sharding/some/path/to/value", newValue, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}, true).code)
              .to.equal(0);
      expect(node.db.getValue("test/test_sharding/some/path/to/value")).to.equal(newValue);
    })

    it("setValue with isGlobal = true and non-existing path", () => {
      expect(node.db.setValue(
          "some/non-existing/path", newValue, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}, true).code)
              .to.equal(0);
    })

    it("setValue with isGlobal = false and non-writable path with sharding", () => {
      assert.deepEqual(node.db.setValue("test/test_sharding/shards/enabled_shard/path", 20), {
        "code": 104,
        "error_message": "Non-writable path with shard config: /values/test/test_sharding/shards/enabled_shard",
        "gas_amount": 0
      });
    })

    it("setValue with isGlobal = true and non-writable path with sharding", () => {
      expect(node.db.setValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", 20, 'known_user', null, null,
          true).code)
              .to.equal(0);
      expect(node.db.getValue("apps/afan/test/test_sharding/shards/enabled_shard/path", true))
          .to.equal(10);  // value unchanged
    })

    it("setValue with isGlobal = false and writable path with sharding", () => {
      expect(node.db.setValue("test/test_sharding/shards/disabled_shard/path", 20).code)
          .to.equal(0);
      expect(node.db.getValue("test/test_sharding/shards/disabled_shard/path")).to.equal(20);
    })

    it("setValue with isGlobal = true and writable path with sharding", () => {
      expect(node.db.setValue(
          "apps/afan/test/test_sharding/shards/disabled_shard/path", 20, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}, true).code)
              .to.equal(0);
      expect(node.db.getValue("apps/afan/test/test_sharding/shards/disabled_shard/path", true))
          .to.equal(20);  // value changed
    })

    it("incValue with isGlobal = false", () => {
      expect(node.db.incValue(
          "test/test_sharding/some/path/to/number", incDelta, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}).code)
              .to.equal(0);
      expect(node.db.getValue("test/test_sharding/some/path/to/number")).to.equal(10 + incDelta);
    })

    it("incValue with isGlobal = true", () => {
      expect(node.db.incValue(
          "apps/afan/test/test_sharding/some/path/to/number", incDelta, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}, true).code)
              .to.equal(0);
      expect(node.db.getValue("test/test_sharding/some/path/to/number")).to.equal(10 + incDelta);
    })

    it("incValue with isGlobal = true and non-existing path", () => {
      expect(node.db.incValue(
          "some/non-existing/path", incDelta, { addr: 'known_user' }, null, null, true).code)
              .to.equal(0);
    })

    it("setValue with isGlobal = false and non-writable path with sharding", () => {
      assert.deepEqual(node.db.incValue("test/test_sharding/shards/enabled_shard/path", 5), {
        "code": 104,
        "error_message": "Non-writable path with shard config: /values/test/test_sharding/shards/enabled_shard",
        "gas_amount": 0
      });
    })

    it("setValue with isGlobal = true and non-writable path with sharding", () => {
      expect(node.db.incValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", 5, { addr: 'known_user' },
          null, null, true).code)
              .to.equal(0);
      expect(node.db.getValue("apps/afan/test/test_sharding/shards/enabled_shard/path", true))
          .to.equal(10);  // value unchanged
    })

    it("setValue with isGlobal = false and writable path with sharding", () => {
      expect(node.db.incValue("test/test_sharding/shards/disabled_shard/path", 5).code).to.equal(0);
      expect(node.db.getValue("test/test_sharding/shards/disabled_shard/path"))
          .to.equal(15);  // value changed
    })

    it("setValue with isGlobal = true and writable path with sharding", () => {
      expect(node.db.incValue(
          "apps/afan/test/test_sharding/shards/disabled_shard/path", 5, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}, true).code)
              .to.equal(0);
      expect(node.db.getValue("apps/afan/test/test_sharding/shards/disabled_shard/path", true))
          .to.equal(15);  // value changed
    })

    it("decValue with isGlobal = false", () => {
      expect(node.db.decValue(
          "test/test_sharding/some/path/to/number", decDelta, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}).code)
              .to.equal(0);
      expect(node.db.getValue("test/test_sharding/some/path/to/number")).to.equal(10 - decDelta);
    })

    it("decValue with isGlobal = true", () => {
      expect(node.db.decValue(
          "apps/afan/test/test_sharding/some/path/to/number", decDelta, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}, true).code)
              .to.equal(0);
      expect(node.db.getValue("test/test_sharding/some/path/to/number")).to.equal(10 - decDelta);
    })

    it("decValue with isGlobal = true and non-existing path", () => {
      expect(node.db.decValue(
          "some/non-existing/path", decDelta, { addr: 'known_user' }, null, null, true).code)
              .to.equal(0);
    })

    it("setValue with isGlobal = false and non-writable path with sharding", () => {
      assert.deepEqual(node.db.decValue("test/test_sharding/shards/enabled_shard/path", 5), {
        "code": 104,
        "error_message": "Non-writable path with shard config: /values/test/test_sharding/shards/enabled_shard",
        "gas_amount": 0
      });
    })

    it("setValue with isGlobal = true and non-writable path with sharding", () => {
      expect(node.db.decValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", 5, { addr: 'known_user' },
          null, null, true).code)
              .to.equal(0);
      expect(node.db.getValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", true))
              .to.equal(10);  // value unchanged
    })

    it("setValue with isGlobal = false and writable path with sharding", () => {
      expect(node.db.decValue("test/test_sharding/shards/disabled_shard/path", 5).code)
          .to.equal(0);
      expect(node.db.getValue("test/test_sharding/shards/disabled_shard/path"))
          .to.equal(5);  // value changed
    })

    it("setValue with isGlobal = true and writable path with sharding", () => {
      expect(node.db.decValue(
          "apps/afan/test/test_sharding/shards/disabled_shard/path", 5, { addr: 'known_user' },
          null, { extra: { executed_at: 1234567890000 }}, true).code)
              .to.equal(0);
      expect(node.db.getValue("apps/afan/test/test_sharding/shards/disabled_shard/path", true))
        .to.equal(5);  // value changed
    })

  })

  describe("Function operations", () => {
    const func = {
      ".function": {
        "fid": "some function config",
      },
      "deeper": {
        ".function": {
          "fid_deeper": "some deeper function config"
        }
      }
    };
    const funcChange = {
      ".function": {
        "fid": "another function config"
      }
    };
    const newFunc = {
      ".function": {
        "fid": "another function config"
      },
      "deeper": {
        ".function": {
          "fid_deeper": "some deeper function config"
        }
      }
    };

    it("getFunction with isGlobal = false", () => {
      assert.deepEqual(node.db.getFunction("test/test_sharding/some/path/to"), func);
      expect(node.db.getFunction("apps/afan/test/test_sharding/some/path/to")).to.equal(null);
    })

    it("getFunction with isGlobal = true", () => {
      expect(node.db.getFunction("test/test_sharding/some/path/to", true)).to.equal(null);
      assert.deepEqual(
          node.db.getFunction("apps/afan/test/test_sharding/some/path/to", true), func);
    })

    it("getFunction with isGlobal = true and non-existing path", () => {
      expect(node.db.getFunction("some/non-existing/path", true)).to.equal(null);
    })

    it("setFunction with isGlobal = false", () => {
      expect(node.db.setFunction(
          "test/test_sharding/some/path/to", funcChange, { addr: 'known_user' }).code)
              .to.equal(0);
      assert.deepEqual(node.db.getFunction("test/test_sharding/some/path/to"), newFunc);
    })

    it("setFunction with isGlobal = true", () => {
      expect(node.db.setFunction(
          "apps/afan/test/test_sharding/some/path/to", funcChange, { addr: 'known_user' },
          true).code)
              .to.equal(0);
      assert.deepEqual(
          node.db.getFunction("apps/afan/test/test_sharding/some/path/to", true), newFunc);
    })

    it("setFunction with isGlobal = true and non-existing path", () => {
      expect(node.db.setFunction(
          "some/non-existing/path", funcChange, { addr: 'known_user' }, true).code)
              .to.equal(0);
    })

    it("matchFunction with isGlobal = false", () => {
      assert.deepEqual(node.db.matchFunction("/test/test_sharding/some/path/to"), {
        "matched_path": {
          "target_path": "/test/test_sharding/some/path/to",
          "ref_path": "/test/test_sharding/some/path/to",
          "path_vars": {},
        },
        "matched_config": {
          "config": {
            "fid": "some function config"
          },
          "path": "/test/test_sharding/some/path/to"
        },
        "subtree_configs": [
          {
            "config": {
              "fid_deeper": "some deeper function config"
            },
            "path": "/deeper",
          }
        ]
      });
    })

    it("matchFunction with isGlobal = true", () => {
      assert.deepEqual(node.db.matchFunction("/apps/afan/test/test_sharding/some/path/to", true), {
        "matched_path": {
          "target_path": "/apps/afan/test/test_sharding/some/path/to",
          "ref_path": "/apps/afan/test/test_sharding/some/path/to",
          "path_vars": {},
        },
        "matched_config": {
          "config": {
            "fid": "some function config"
          },
          "path": "/apps/afan/test/test_sharding/some/path/to"
        },
        "subtree_configs": [
          {
            "config": {
              "fid_deeper": "some deeper function config"
            },
            "path": "/deeper",
          }
        ]
      });
    })

    it("matchFunction with isGlobal = true and non-existing path", () => {
      expect(node.db.matchFunction("some/non-existing/path", true)).to.equal(null);
    })
  })

  describe("Rule operations", () => {
    const rule = {
      ".write": "auth.addr === 'known_user'",
      "deeper": {
        ".write": "some deeper rule config"
      }
    };
    const newRule = { ".write": "another rule" };
    const newValue = "that";

    it("getRule with isGlobal = false", () => {
      assert.deepEqual(node.db.getRule("test/test_sharding/some/path/to"), rule);
      expect(node.db.getRule("apps/afan/test/test_sharding/some/path/to")).to.equal(null);
    })

    it("getRule with isGlobal = true", () => {
      expect(node.db.getRule("test/test_sharding/some/path/to", true)).to.equal(null);
      assert.deepEqual(
          node.db.getRule("apps/afan/test/test_sharding/some/path/to", true), rule);
    })

    it("getRule with isGlobal = true and non-existing path", () => {
      expect(node.db.getRule("some/non-existing/path", true)).to.equal(null);
    })

    it("setRule with isGlobal = false", () => {
      expect(node.db.setRule(
          "test/test_sharding/some/path/to", newRule, { addr: 'known_user' }).code)
              .to.equal(0);
      assert.deepEqual(node.db.getRule("test/test_sharding/some/path/to"), newRule);
    })

    it("setRule with isGlobal = true", () => {
      expect(node.db.setRule(
          "apps/afan/test/test_sharding/some/path/to", newRule, { addr: 'known_user' }, true).code)
              .to.equal(0);
      assert.deepEqual(
          node.db.getRule("apps/afan/test/test_sharding/some/path/to", true), newRule);
    })

    it("setRule with isGlobal = true and non-existing path", () => {
      expect(node.db.setRule("some/non-existing/path", newRule, { addr: 'known_user' }, true).code)
          .to.equal(0);
    })

    it("matchRule with isGlobal = false", () => {
      assert.deepEqual(node.db.matchRule("/test/test_sharding/some/path/to"), {
        "matched_path": {
          "target_path": "/test/test_sharding/some/path/to",
          "ref_path": "/test/test_sharding/some/path/to",
          "path_vars": {},
        },
        "matched_config": {
          "config": "auth.addr === 'known_user'",
          "path": "/test/test_sharding/some/path/to"
        },
        "subtree_configs": [
          {
            "config": "some deeper rule config",
            "path": "/deeper",
          }
        ]
      });
    })

    it("matchRule with isGlobal = true", () => {
      assert.deepEqual(node.db.matchRule("/apps/afan/test/test_sharding/some/path/to", true), {
        "matched_path": {
          "target_path": "/apps/afan/test/test_sharding/some/path/to",
          "ref_path": "/apps/afan/test/test_sharding/some/path/to",
          "path_vars": {},
        },
        "matched_config": {
          "config": "auth.addr === 'known_user'",
          "path": "/apps/afan/test/test_sharding/some/path/to"
        },
        "subtree_configs": [
          {
            "config": "some deeper rule config",
            "path": "/deeper",
          }
        ]
      });
    })

    it("matchRule with isGlobal = true and non-existing path", () => {
      expect(node.db.matchRule("some/non-existing/path", true)).to.equal(null);
    })

    it("evalRule with isGlobal = false", () => {
      expect(node.db.evalRule("/test/test_sharding/some/path/to", newValue, { addr: "known_user" }))
          .to.equal(true);
    })

    it("evalRule with isGlobal = true", () => {
      expect(node.db.evalRule(
          "/apps/afan/test/test_sharding/some/path/to", newValue, { addr: "known_user" },
          null, true))
              .to.equal(true);
    })

    it("evalRule with isGlobal = true and non-existing path", () => {
      expect(node.db.evalRule(
          "/some/non-existing/path", newValue, { addr: "known_user" }, null, true))
              .to.equal(null);
    })
  })

  describe("Owner operations", () => {
    const owner = {
      ".owner": {
        "owners": {
          "*": {
            "branch_owner": false,
            "write_function": false,
            "write_owner": false,
            "write_rule": false,
          },
          "known_user": {
            "branch_owner": true,
            "write_function": true,
            "write_owner": true,
            "write_rule": true,
          }
        }
      }
    };
    const newOwner = {
      ".owner": {
        "owners": {
          "*": {
            "branch_owner": false,
            "write_function": false,
            "write_owner": false,
            "write_rule": false,
          },
        }
      }
    };

    it("getOwner with isGlobal = false", () => {
      assert.deepEqual(node.db.getOwner("test/test_sharding/some/path/to"), owner);
      expect(node.db.getOwner("apps/afan/test/test_sharding/some/path/to")).to.equal(null);
    })

    it("getOwner with isGlobal = true", () => {
      expect(node.db.getOwner("test/test_sharding/some/path/to", true)).to.equal(null);
      assert.deepEqual(
          node.db.getOwner("apps/afan/test/test_sharding/some/path/to", true), owner);
    })

    it("getOwner with isGlobal = true and non-existing path", () => {
      expect(node.db.getOwner("some/non-existing/path", true)).to.equal(null);
    })

    it("setOwner with isGlobal = false", () => {
      expect(node.db.setOwner(
          "test/test_sharding/some/path/to", newOwner, { addr: 'known_user' }).code)
              .to.equal(0);
      assert.deepEqual(node.db.getOwner("test/test_sharding/some/path/to"), newOwner);
    })

    it("setOwner with isGlobal = true", () => {
      expect(node.db.setOwner(
          "apps/afan/test/test_sharding/some/path/to", newOwner, { addr: 'known_user' }, true).code)
              .to.equal(0);
      assert.deepEqual(
          node.db.getOwner("apps/afan/test/test_sharding/some/path/to", true), newOwner);
    })

    it("setOwner with isGlobal = true and non-existing path", () => {
      expect(node.db.setOwner("some/non-existing/path", newOwner, { addr: 'known_user' },
          true).code).to.equal(0);
    })

    it("matchOwner with isGlobal = false", () => {
      assert.deepEqual(node.db.matchOwner("/test/test_sharding/some/path/to"), {
        "matched_path": {
          "target_path": "/test/test_sharding/some/path/to",
        },
        "matched_config": {
          "config": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              "known_user": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          },
          "path": "/test/test_sharding/some/path/to"
        }
      });
    })

    it("matchOwner with isGlobal = true", () => {
      assert.deepEqual(node.db.matchOwner("/apps/afan/test/test_sharding/some/path/to", true), {
        "matched_path": {
          "target_path": "/apps/afan/test/test_sharding/some/path/to",
        },
        "matched_config": {
          "config": {
            "owners": {
              "*": {
                "branch_owner": false,
                "write_function": false,
                "write_owner": false,
                "write_rule": false,
              },
              "known_user": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              }
            }
          },
          "path": "/apps/afan/test/test_sharding/some/path/to"
        }
      });
    })

    it("matchOwner with isGlobal = true and non-existing path", () => {
      expect(node.db.matchOwner("some/non-existing/path", true)).to.equal(null);
    })

    it("evalOwner with isGlobal = false", () => {
      expect(node.db.evalOwner(
          "/test/test_sharding/some/path/to", "write_rule", { addr: "known_user" }))
        .to.equal(true);
    })

    it("evalOwner with isGlobal = true", () => {
      expect(node.db.evalOwner(
          "/apps/afan/test/test_sharding/some/path/to", "write_rule", { addr: "known_user" }, true))
        .to.equal(true);
    })

    it("evalOwner with isGlobal = true and non-existing path", () => {
      expect(node.db.evalOwner(
          "/some/non-existing/path", "write_rule", { addr: "known_user" }, true))
        .to.equal(null);
    })
  })
})

describe("Proof hash", () => {
  let node, valuesObject;

  beforeEach(() => {
    let result;

    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    valuesObject = {
      level0: {
        level1: {
          level2: {
            foo: 'bar',
            baz: 'caz'
          },
          level2_sibling: {
            data1: true,
            data2: -200
          }
        }
      },
      another_route: {
        child1: '',
        child2: 0,
        child3: false
      }
    };
    result = node.db.setValue("test", valuesObject);
    assert.deepEqual(result.code, 0);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("Check proof for setValue(), setOwner(), setRule(), and setFunction()", () => {
    it("checks proof hash of under $root_path/test", () => {
      const valuesNode = node.db.getRefForReading(['values', 'test']);
      const ownersNode = node.db.getRefForReading(['owners', 'test']);
      const rulesNode = node.db.getRefForReading(['rules', 'test']);
      const functionNode = node.db.getRefForReading(['functions', 'test']);
      expect(valuesNode.getProofHash()).to.equal(valuesNode.buildProofHash());
      expect(ownersNode.getProofHash()).to.equal(ownersNode.buildProofHash());
      expect(rulesNode.getProofHash()).to.equal(rulesNode.buildProofHash());
      expect(functionNode.getProofHash()).to.equal(functionNode.buildProofHash());
    });

    it("checks newly setup proof hash", () => {
      const nestedRules = {
        "nested": {
          "$var_path": {
            ".write": "auth.addr !== 'abcd'"
          },
          "path": {
            ".write": "auth.addr === 'abcd'",
            "deeper": {
              "path": {
                ".write": "auth.addr === 'ijkl'"
              }
            }
          }
        }
      };

      const dbFuncs = {
        "some": {
          "$var_path": {
            ".function": {
              "fid_var": "some function config with var path"
            }
          },
          "path": {
            ".function": {
              "fid": "some function config",
            },
            "deeper": {
              "path": {
                ".function": {
                  "fid_deeper": "some function config deeper"
                }
              }
            }
          },
        }
      };
      node.db.setValue("test/level0/level1/level2", { aaa: 'bbb' });
      node.db.setOwner("test/empty_owners/.owner/owners/*/write_function", false);
      node.db.setRule("test/test_rules", nestedRules);
      node.db.setFunction("test/test_functions", dbFuncs);
      const valuesNode = node.db.getRefForReading(['values', 'test']);
      const ownersNode = node.db.getRefForReading(['owners', 'test']);
      const rulesNode = node.db.getRefForReading(['rules', 'test']);
      const functionNode = node.db.getRefForReading(['functions', 'test']);
      expect(valuesNode.getProofHash()).to.equal(valuesNode.buildProofHash());
      expect(ownersNode.getProofHash()).to.equal(ownersNode.buildProofHash());
      expect(rulesNode.getProofHash()).to.equal(rulesNode.buildProofHash());
      expect(functionNode.getProofHash()).to.equal(functionNode.buildProofHash());
    });
  });

  describe("State proof (getStateProof)", () => {
    it("tests proof with a null case", () => {
      const rootNode = node.db.stateRoot;
      assert.deepEqual(null, node.db.getStateProof('/test/test'));
    });

    it("tests proof with owners, rules, values and functions", () => {
      const rootNode = node.db.stateRoot;
      const ownersNode = node.db.getRefForReading(['owners']);
      const rulesNode = node.db.getRefForReading(['rules']);
      const valuesNode = node.db.getRefForReading(['values']);
      const functionNode = node.db.getRefForReading(['functions']);
      const rootProof = { [ProofProperties.PROOF_HASH]: rootNode.getProofHash() };
      const secondLevelProof = JSON.parse(JSON.stringify(rootProof));
      rootNode.getChildLabels().forEach(label => {
        Object.assign(secondLevelProof,
          { [label]: { [ProofProperties.PROOF_HASH]: rootNode.getChild(label).getProofHash() } });
      });
      const ownersProof = JSON.parse(JSON.stringify(secondLevelProof));
      ownersNode.getChildLabels().forEach(label => {
        Object.assign(ownersProof.owners,
          { [label]: { [ProofProperties.PROOF_HASH]: ownersNode.getChild(label).getProofHash() } });
      });
      const rulesProof = JSON.parse(JSON.stringify(secondLevelProof));
      rulesNode.getChildLabels().forEach(label => {
        Object.assign(rulesProof.rules,
          { [label]: { [ProofProperties.PROOF_HASH]: rulesNode.getChild(label).getProofHash() } });
      });
      const valuesProof = JSON.parse(JSON.stringify(secondLevelProof));
      valuesNode.getChildLabels().forEach(label => {
        Object.assign(valuesProof.values,
          { [label]: { [ProofProperties.PROOF_HASH]: valuesNode.getChild(label).getProofHash() } });
      });
      const functionsProof = JSON.parse(JSON.stringify(secondLevelProof));
      functionNode.getChildLabels().forEach(label => {
        Object.assign(functionsProof.functions,
          { [label]: { [ProofProperties.PROOF_HASH]: functionNode.getChild(label).getProofHash() } });
      });
      assert.deepEqual(rootProof, node.db.getStateProof('/'));
      assert.deepEqual(ownersProof, node.db.getStateProof('/owners/test'));
      assert.deepEqual(rulesProof, node.db.getStateProof('/rules/test'));
      assert.deepEqual(valuesProof, node.db.getStateProof('/values/test'));
      assert.deepEqual(functionsProof, node.db.getStateProof('/functions/test'));
    });
  });
});

describe("State info (getStateInfo)", () => {
  let node, valuesObject;

  beforeEach(() => {
    let result;

    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    valuesObject = {
      label1: {
        label11: 'value11',
        label12: {
          label121: 'value121',
          label122: 'value122',
        }
      },
      label2: {
        label21: 'value11',
        label22: 'value12',
      }
    };
    result = node.db.setValue("test", valuesObject);
    assert.deepEqual(result.code, 0);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("No tree structure change", () => {
    it("replace node values", () => {
      result = node.db.setValue('test/label1/label12', {  // Only value updates
        label121: 'new_value121',
        label122: 'new_value122'
      });
      assert.deepEqual(result.code, 0);

      // Existing paths.
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label1'), { tree_height: 2, tree_size: 5 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label1/label11'), { tree_height: 0, tree_size: 1 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label1/label12'), { tree_height: 1, tree_size: 3 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label1/label12/label121'),
          { tree_height: 0, tree_size: 1 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label1/label12/label122'),
          { tree_height: 0, tree_size: 1 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label2'), { tree_height: 1, tree_size: 3 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label2/label21'), { tree_height: 0, tree_size: 1 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label2/label22'), { tree_height: 0, tree_size: 1 });

      // Non-existing paths.
      assert.deepEqual(node.db.getStateInfo('/values/test/non-existing/path'), null);
    });
  });

  describe("Tree reduction", () => {
    it("remove state nodes", () => {
      result = node.db.setValue("test/label1/label12", null);  // Reduce tree
      assert.deepEqual(result.code, 0);

      assert.deepEqual(
          node.db.getStateInfo('/values/test/label1'), { tree_height: 1, tree_size: 2 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label1/label11'), { tree_height: 0, tree_size: 1 });
      assert.deepEqual(node.db.getStateInfo('/values/test/label1/label12'), null);
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label2'), { tree_height: 1, tree_size: 3 });
    });
  });

  describe("Tree expansion", () => {
    it("add state nodes", () => {
      result = node.db.setValue('test/label2/label21', {  // Expand tree
        label211: 'value211',
        label212: 'value212'
      });
      assert.deepEqual(result.code, 0);

      assert.deepEqual(
          node.db.getStateInfo('/values/test/label1'), { tree_height: 2, tree_size: 5 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label2'), { tree_height: 2, tree_size: 5 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label2/label21'), { tree_height: 1, tree_size: 3 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label2/label21/label211'),
          { tree_height: 0, tree_size: 1 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label2/label21/label212'),
          { tree_height: 0, tree_size: 1 });
      assert.deepEqual(
          node.db.getStateInfo('/values/test/label2/label22'), { tree_height: 0, tree_size: 1 });
    });
  });
});

describe("State version handling", () => {
  let node;
  let dbValues;

  beforeEach(() => {
    rimraf.sync(CHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);

    dbValues = {
      "child_1": {
        "child_11": {
          "child_111": "value_111",
          "child_112": "value_112",
        },
        "child_12": {
          "child_121": "value_121",
          "child_122": "value_122",
        }
      },
      "child_2": {
        "child_21": {
          "child_211": "value_211",
          "child_212": "value_212",
        },
        "child_22": {
          "child_221": "value_221",
          "child_222": "value_222",
        }
      }
    };
    result = node.db.setValue("test", dbValues);
    assert.deepEqual(result.code, 0);
  });

  afterEach(() => {
    rimraf.sync(CHAINS_DIR);
  });

  describe("getRefForReading()", () => {
    it("the nodes on the path are not affected", () => {
      expect(node.db.deleteBackupStateVersion()).to.equal(true);
      const child2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');

      expect(node.db.getRefForReading(['values', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // The nodes on the path are not affected.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.equal(child2);  // Not cloned
      expect(newChild21).to.equal(child21);  // Not cloned
      expect(newChild212).to.equal(child212);  // Not cloned
    });
  });

  describe("getRefForWriting()", () => {
    it("the nodes of single access path are not cloned", () => {
      // First referencing to make the number of access paths = 1.
      expect(node.db.getRefForWriting(['values', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);
      const child2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');

      // Second referencing.
      expect(node.db.getRefForWriting(['values', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // The nodes on the path are not cloned.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.equal(child2);  // Not cloned
      expect(newChild21).to.equal(child21);  // Not cloned
      expect(newChild212).to.equal(child212);  // Not cloned
    });

    it("the nodes of multiple access paths are cloned - multiple roots", () => {
      // Make the number of roots = 2.
      const otherRoot = node.stateManager.cloneVersion(node.db.stateVersion, 'new version');
      expect(otherRoot).to.not.equal(null);
      const child2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');

      expect(node.db.getRefForWriting(['values', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // The nodes on the path are cloned.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.not.equal(child2);  // Cloned.
      expect(newChild21).to.not.equal(child21);  // Cloned.
      expect(newChild212).to.not.equal(child212);  // Cloned.
    });

    it("the nodes of multiple access paths are cloned - multiple parents case 1", () => {
      const child2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');
      // Make child21's number of parents = 2.
      const clonedChild2 = child2.clone('new version');

      expect(node.db.getRefForWriting(['values', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // Only the nodes of multiple paths are cloned.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.equal(child2);  // Not cloned.
      expect(newChild21).to.not.equal(child21);  // Cloned.
      expect(newChild212).to.not.equal(child212);  // Cloned.
    });

    it("the nodes of multiple access paths are cloned - multiple parents case 2", () => {
      const child2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const child21 = child2.getChild('child_21');
      const child212 = child21.getChild('child_212');
      // Make child212's number of parents = 2.
      const clonedChild21 = child21.clone('new version');

      expect(node.db.getRefForWriting(['values', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // Only the nodes of multiple paths are cloned.
      const newChild2 = node.db.stateRoot.getChild('values').getChild('test').getChild('child_2');
      const newChild21 = newChild2.getChild('child_21');
      const newChild212 = newChild21.getChild('child_212');
      expect(newChild2).to.equal(child2);  // Not cloned.
      expect(newChild21).to.equal(child21);  // Not cloned.
      expect(newChild212).to.not.equal(child212);  // Cloned.
    });

    it("the on other ref paths are not affected", () => {
      const otherRoot = node.stateManager.cloneVersion(node.db.stateVersion, 'new version');
      expect(otherRoot).to.not.equal(null);
      const beforeOtherChild2 = otherRoot.getChild('values').getChild('test').getChild('child_2');
      const beforeOtherChild21 = beforeOtherChild2.getChild('child_21');
      const beforeOtherChild212 = beforeOtherChild21.getChild('child_212');

      expect(node.db.getRefForWriting(['values', 'test', 'child_2', 'child_21', 'child_212']))
          .to.not.equal(null);

      // The nodes on the path from other roots are not affected.
      const afterOtherChild2 = otherRoot.getChild('values').getChild('test').getChild('child_2');
      const afterOtherChild21 = afterOtherChild2.getChild('child_21');
      const afterOtherChild212 = afterOtherChild21.getChild('child_212');
      expect(afterOtherChild2).to.equal(beforeOtherChild2);  // Not cloned
      expect(afterOtherChild21).to.equal(beforeOtherChild21);  // Not cloned
      expect(afterOtherChild212).to.equal(beforeOtherChild212);  // Not cloned

      // The state values of other roots are not affected.
      assert.deepEqual(otherRoot.getChild('values').getChild('test').toJsObject(), dbValues);
    });
  });

  describe("backupDb() / restoreDb()", () => {
    it("backuped states are restored", () => {
      assert.deepEqual(node.db.getValue('test'), dbValues);

      assert.deepEqual(node.db.backupDb(), true);
      expect(node.db.backupStateVersion).to.not.equal(null);
      expect(node.db.backupStateRoot).to.not.equal(null);
      assert.deepEqual(node.db.getValue('test'), dbValues);
      assert.deepEqual(
          node.db.setValue('/test/child_2/child_21', { 'new_child': 'new_value' }).code, 0);
      assert.deepEqual(node.db.getValue('/test/child_2/child_21'), { 'new_child': 'new_value' });

      assert.deepEqual(node.db.restoreDb(), true);
      expect(node.db.backupStateVersion).to.equal(null);
      expect(node.db.backupStateRoot).to.equal(null);
      assert.deepEqual(node.db.getValue('test'), dbValues);
    });
  });
});
