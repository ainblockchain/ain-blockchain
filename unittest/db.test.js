const BlockchainNode = require('../node')
const rimraf = require('rimraf');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const {
  BLOCKCHAINS_DIR,
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

describe("DB initialization", () => {
  let node;

  beforeEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node, 0, true);
  })

  afterEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);
  });

  describe("sharding path", () => {
    it("getShardingPath", () => {
      expect(node.db.getShardingPath()).to.equal(GenesisSharding.sharding_path);
    })

    it("isRootBlockchain", () => {
      expect(node.db.isRootBlockchain).to.equal(GenesisSharding.sharding_protocol === 'NONE');
    })
  })

  describe("token", () => {
    it("loading token properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/token`), GenesisToken);
    })
  })

  describe("balances", () => {
    it("loading balances properly on initialization", () => {
      const expected =
          GenesisToken.total_supply - GenesisAccounts.others.length * GenesisAccounts.shares;
      const dbPath = `/accounts/${GenesisAccounts.owner.address}/balance`;
      expect(node.db.getValue(dbPath)).to.equal(expected);
    })
  })

  describe("sharding", () => {
    it("loading sharding properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/sharding/config`), GenesisSharding);
    })
  })

  describe("whitelist", () => {
    it("loading whitelist properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/consensus/whitelist`), GENESIS_WHITELIST);
    })
  })

  describe("functions", () => {
    it("loading functions properly on initialization", () => {
      assert.deepEqual(node.db.getFunction('/'), GenesisFunctions);
    })
  })

  describe("rules", () => {
    it("loading rules properly on initialization", () => {
      assert.deepEqual(node.db.getRule("/"), GenesisRules);
    })
  })

  describe("owners", () => {
    it("loading owners properly on initialization", () => {
      assert.deepEqual(node.db.getOwner('/'), GenesisOwners);
    })
  })
})

describe("DB operations", () => {
  let node, dbValues, dbRules, dbOwners;

  beforeEach(() => {
    let result;

    rimraf.sync(BLOCKCHAINS_DIR);

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
    console.log(`Result of setValue(): ${JSON.stringify(result, null, 2)}`);

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
    console.log(`Result of setFunction(): ${JSON.stringify(result, null, 2)}`);

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
    console.log(`Result of setRule(): ${JSON.stringify(result, null, 2)}`);

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
    console.log(`Result of setOwner(): ${JSON.stringify(result, null, 2)}`);
  });

  afterEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);
  });

  describe("getValue operations", () => {
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

  describe("getFunction operations", () => {
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

  describe("getRule operations", () => {
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

  describe("getOwner operations", () => {
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

  describe("matchFunction operations", () => {
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

  describe("matchRule operations", () => {
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

  describe("matchOwner operations", () => {
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

  describe("evalRule operations", () => {
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

  describe("evalOwner operations", () => {
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

  describe("get operations", () => {
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

  describe("setValue operations", () => {
    it("when overwriting nested value", () => {
      const newValue = {"new": 12345}
      expect(node.db.setValue("test/nested/far/down", newValue)).to.equal(true)
      assert.deepEqual(node.db.getValue("test/nested/far/down"), newValue)
    })

    it("when creating new path in database", () => {
      const newValue = 12345
      expect(node.db.setValue("test/new/unchartered/nested/path", newValue)).to.equal(true)
      expect(node.db.getValue("test/new/unchartered/nested/path")).to.equal(newValue)
    })

    it("when writing invalid object", () => {
      assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {array: []}), {
        "code": 101,
        "error_message": "Invalid object for states: /array"
      });
      expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)

      assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {'.': 'x'}), {
        "code": 101,
        "error_message": "Invalid object for states: /."
      });
      expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)

      assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {'$': 'x'}), {
        "code": 101,
        "error_message": "Invalid object for states: /$"
      });
      expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)

      assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {'*a': 'x'}), {
        "code": 101,
        "error_message": "Invalid object for states: /*a"
      });
      expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)

      assert.deepEqual(node.db.setValue("test/unchartered/nested/path2", {'a*': 'x'}), {
        "code": 101,
        "error_message": "Invalid object for states: /a*"
      });
      expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)
    })

    it("when writing with invalid path", () => {
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/.", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/."
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/$", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/$"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/a*", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/a*"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/*a", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/*a"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/#", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/#"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/{", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/{"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/}", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/}"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/[", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/["
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/]", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/]"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/\x00", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/\x00"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/\x1F", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/\x1F"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/\x7F", 12345), {
        "code": 102,
        "error_message": "Invalid path: /test/new/unchartered/nested/\x7F"
      });
    })

    it("when writing with non-writable path with sharding", () => {
      assert.deepEqual(node.db.setValue("test/shards/enabled_shard", 20), {
        "code": 104,
        "error_message": "Non-writable path with shard config: /values/test/shards/enabled_shard"
      });
      assert.deepEqual(node.db.setValue("test/shards/enabled_shard/path", 20), {
        "code": 104,
        "error_message": "Non-writable path with shard config: /values/test/shards/enabled_shard"
      });
    })

    it("when writing with writable path with sharding", () => {
      expect(node.db.setValue("test/shards/disabled_shard", 20)).to.equal(true);
      expect(node.db.getValue("test/shards/disabled_shard")).to.equal(20)
      expect(node.db.setValue("test/shards/disabled_shard/path", 20)).to.equal(true);
      expect(node.db.getValue("test/shards/disabled_shard/path")).to.equal(20)
    })
  })

  describe("incValue operations", () => {
    it("when increasing value successfully", () => {
      expect(node.db.incValue("test/increment/value", 10)).to.equal(true)
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
        "error_message": "Non-writable path with shard config: /values/test/shards/enabled_shard"
      });
    })

    it("when increasing with writable path with sharding", () => {
      expect(node.db.incValue("test/shards/disabled_shard/path", 5)).to.equal(true);
      expect(node.db.getValue("test/shards/disabled_shard/path")).to.equal(15)
    })
  })

  describe("decValue operations", () => {
    it("when decreasing value successfully", () => {
      expect(node.db.decValue("test/decrement/value", 10)).to.equal(true)
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
        "error_message": "Non-writable path with shard config: /values/test/shards/enabled_shard"
      });
    })

    it("when increasing with writable path with sharding", () => {
      expect(node.db.decValue("test/shards/disabled_shard/path", 5)).to.equal(true);
      expect(node.db.getValue("test/shards/disabled_shard/path")).to.equal(5)
    })
  })

  describe("setFunction operations", () => {
    it("when overwriting existing function config with simple path", () => {
      const functionConfig = {
        ".function": {
          "fid": "other function config"
        }
      };
      expect(node.db.setFunction("/test/test_function/some/path", functionConfig)).to.equal(true)
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
      expect(node.db.setFunction("/test/test_function/some/$variable/path", functionConfig))
          .to.equal(true)
      assert.deepEqual(
          node.db.getFunction("/test/test_function/some/$variable/path"), functionConfig)
    })

    it("when writing invalid object", () => {
      assert.deepEqual(node.db.setFunction("/test/test_function/some/path2", {array: []}), {
        "code": 401,
        "error_message": "Invalid object for states: /array"
      });
      expect(node.db.getFunction("test/new2/unchartered/nested/path2")).to.equal(null)

      assert.deepEqual(node.db.setFunction("/test/test_function/some/path2", {'.': 'x'}), {
        "code": 401,
        "error_message": "Invalid object for states: /."
      });
      expect(node.db.getFunction("test/new2/unchartered/nested/path2")).to.equal(null)
    })

    it("when writing with invalid path", () => {
      assert.deepEqual(node.db.setFunction(
          "/test/test_function/some/path/.", "some function config"), {
        "code": 402,
        "error_message": "Invalid path: /test/test_function/some/path/."
      });
    })
  })

  describe("setRule operations", () => {
    it("when overwriting existing rule config with simple path", () => {
      const ruleConfig = {".write": "other rule config"};
      expect(node.db.setRule("/test/test_rule/some/path", ruleConfig)).to.equal(true)
      assert.deepEqual(node.db.getRule("/test/test_rule/some/path"), ruleConfig)
    })

    it("when writing with variable path", () => {
      const ruleConfig = {".write": "other rule config"};
      expect(node.db.setRule("/test/test_rule/some/$variable/path", ruleConfig)).to.equal(true)
      assert.deepEqual(node.db.getRule("/test/test_rule/some/$variable/path"), ruleConfig)
    })

    it("when writing invalid object", () => {
      assert.deepEqual(node.db.setRule("/test/test_rule/some/path2", {array: []}), {
        "code": 501,
        "error_message": "Invalid object for states: /array"
      });
      expect(node.db.getRule("/test/test_rule/some/path2")).to.equal(null)

      assert.deepEqual(node.db.setRule("/test/test_rule/some/path2", {'.': 'x'}), {
        "code": 501,
        "error_message": "Invalid object for states: /."
      });
      expect(node.db.getRule("/test/test_rule/some/path2")).to.equal(null)
    })

    it("when writing with invalid path", () => {
      assert.deepEqual(node.db.setRule("/test/test_rule/some/path/.", "some rule config"), {
        "code": 502,
        "error_message": "Invalid path: /test/test_rule/some/path/."
      });
    })
  })

  describe("setOwner operations", () => {
    it("when overwriting existing owner config", () => {
      const ownerConfig = {".owner": "other owner config"};
      expect(node.db.setOwner("/test/test_owner/some/path", ownerConfig, { addr: 'abcd' }))
        .to.equal(true)
      assert.deepEqual(node.db.getOwner("/test/test_owner/some/path"), ownerConfig)
    })

    it("when writing invalid object", () => {
      assert.deepEqual(node.db.setOwner("/test/test_owner/some/path2", {array: []}), {
        "code": 601,
        "error_message": "Invalid object for states: /array"
      });
      expect(node.db.getOwner("/test/test_owner/some/path2")).to.equal(null)

      assert.deepEqual(node.db.setOwner("/test/test_owner/some/path2", {'.': 'x'}), {
        "code": 601,
        "error_message": "Invalid object for states: /."
      });
      expect(node.db.getOwner("/test/test_owner/some/path2")).to.equal(null)
    })

    it("when writing with invalid path", () => {
      assert.deepEqual(node.db.setOwner("/test/test_owner/some/path/.", "some owner config"), {
        "code": 602,
        "error_message": "Invalid path: /test/test_owner/some/path/."
      });
    })
  })

  describe("set operations", () => {
    it("when set applied successfully", () => {
      expect(node.db.set([
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
      ], { addr: 'abcd' })).to.equal(true)
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

    it("returning error code and leaving value unchanged if incValue path is not numerical", () => {
      expect(node.db.set([
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
      ]).code).to.equal(201)
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if decValue path is not numerical", () => {
      expect(node.db.set([
        {
          type: "SET_VALUE",
          ref: "test/nested/far/down",
          value: {
            "new": 12345
          }
        },
        {
          type: "DEC_VALUE",
          ref: "test/ai/foo",
          value: 10
        },
        {
          type: "INC_VALUE",
          ref: "test/increment/value",
          value: 10
        }
      ]).code).to.equal(301)
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })
  })

  describe("batch operations", () => {
    it("when batch applied successfully", () => {
      let now = Date.now();
      const address = node.account.address;
      let nonce = node.db.getValue(`/accounts/${address}/nonce`);
      if (nonce === null) nonce = 0;
      assert.deepEqual(node.db.batch([
        {
          tx_body: {
            operation: {
              // Default type: SET_VALUE
              ref: "test/nested/far/down",
              value: {
                "new": 12345
              }
            },
            nonce: nonce++,
            timestamp: now++
          },
          address
        },
        {
          tx_body: {
            operation: {
              type: "INC_VALUE",
              ref: "test/increment/value",
              value: 10
            },
            nonce: nonce++,
            timestamp: now++
          },
          address
        },
        {
          tx_body: {
            operation: {
              type: "DEC_VALUE",
              ref: "test/decrement/value",
              value: 10
            },
            nonce: nonce++,
            timestamp: now++
          },
          address
        },
        {
          tx_body: {
            operation: {
              type: "SET_FUNCTION",
              ref: "/test/test_function/some/path",
              value: {
                ".function": {
                  "fid": "other function config"
                }
              }
            },
            nonce: nonce++,
            timestamp: now++
          },
          address
        },
        {
          tx_body: {
            operation: {
              type: "SET_RULE",
              ref: "/test/test_rule/some/path",
              value: {
                ".write": "other rule config"
              }
            },
            nonce: nonce++,
            timestamp: now++
          },
          address
        },
        {
          tx_body: {
            operation: {
              type: "SET_OWNER",
              ref: "/test/test_owner/some/path",
              value: {
                ".owner": "other owner config"
              }
            },
            nonce: -1,
            timestamp: now++
          },
          address: 'abcd'
        }
      ]), [ true, true, true, true, true, true ])
      assert.deepEqual(node.db.getValue("test/nested/far/down"), { "new": 12345 })
      expect(node.db.getValue("test/increment/value")).to.equal(30)
      expect(node.db.getValue("test/decrement/value")).to.equal(10)
      assert.deepEqual(
          node.db.getFunction("/test/test_function/some/path"),
          {
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
          });
      assert.deepEqual(
          node.db.getRule("/test/test_rule/some/path"), { ".write": "other rule config" });
      assert.deepEqual(
          node.db.getOwner("/test/test_owner/some/path"), { ".owner": "other owner config" });
    })

    it("returning error code and leaving value unchanged if no operation is given", () => {
      assert.deepEqual(node.db.batch([
        {
          tx_body: {
            operation: {
              type: "SET_VALUE",
              ref: "test/nested/far/down",
              value: {
                "new": 12345
              }
            }
          }
        },
        {},
        {
          tx_body: {}
        }
      ]), [
        true,
        {
          "code": 801,
          "error_message": "No tx_body"
        },
        {
          "code": 802,
          "error_message": "No operation"
        }
      ])
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if invalid operation type is given",
        () => {
      assert.deepEqual(node.db.batch([
        {
          tx_body: {
            operation: {
              type: "SET_VALUE",
              ref: "test/nested/far/down",
              value: {
                "new": 12345
              }
            }
          }
        },
        {
          tx_body: {
            operation: {
              type: "GET_VALUE",
              ref: "test/ai/foo",
              value: 10
            }
          }
        },
        {
          tx_body: {
            operation: {
              type: "DEC_VALUE",
              ref: "test/decrement/value",
              value: 10
            }
          }
        }
      ]), [
        true,
        {
          "code": 803,
          "error_message": "Invalid operation type: GET_VALUE"
        },
        true])
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if incValue path is not numerical", () => {
      assert.deepEqual(node.db.batch([
        {
          tx_body: {
            operation: {
              type: "SET_VALUE",
              ref: "test/nested/far/down",
              value: {
                "new": 12345
              }
            }
          }
        },
        {
          tx_body: {
            operation: {
              type: "INC_VALUE",
              ref: "test/ai/foo",
              value: 10
            }
          }
        },
        {
          tx_body: {
            operation: {
              type: "DEC_VALUE",
              ref: "test/decrement/value",
              value: 10
            }
          }
        }
      ]), [
        true,
        {
          "code": 201,
          "error_message": "Not a number type: bar or 10"
        },
        true])
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if decValue path is not numerical", () => {
      assert.deepEqual(node.db.batch([
        {
          tx_body: {
            operation: {
              type: "SET_VALUE",
              ref: "test/nested/far/down",
              value: {
                "new": 12345
              }
            }
          }
        },
        {
          tx_body: {
            operation: {
              type: "DEC_VALUE",
              ref: "test/ai/foo",
              value: 10
            }
          }
        },
        {
          tx_body: {
            operation: {
              type: "INC_VALUE",
              ref: "test/increment/value",
              value: 10
            }
          }
        }
      ]), [
        true,
        {
          "code": 301,
          "error_message": "Not a number type: bar or 10"
        },
        true])
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })
  })

  describe("remove empty terminals (garbage collection)", () => {
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
      console.log(`Result of setValue(): ${JSON.stringify(valueResult, null, 2)}`);

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
      console.log(`Result of setRule(): ${JSON.stringify(ruleResult, null, 2)}`);

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
      console.log(`Result of setOwner(): ${JSON.stringify(ownerResult, null, 2)}`);
    });

    afterEach(() => {
      const valueResult = node.db.setValue("/test/empty_values/node_0", null);
      console.log(`Result of setValue(): ${JSON.stringify(valueResult, null, 2)}`);

      const ruleResult = node.db.setRule("/test/empty_rules/node_0", null);
      console.log(`Result of setRule(): ${JSON.stringify(ruleResult, null, 2)}`);

      const ownerResult = node.db.setRule("/test/empty_owners/node_0", null);
      console.log(`Result of setOwner(): ${JSON.stringify(ownerResult, null, 2)}`);
    });

    it("when setValue() with non-empty value", () => {
      expect(node.db.setValue(
          "/test/empty_values/node_0/node_1a/node_2/node_3", "another value")).to.equal(true)
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
          "/test/empty_values/node_0/node_1a/node_2/node_3", null)).to.equal(true)
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
          })).to.equal(true)
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
          "/test/empty_rules/node_0/node_1a/node_2/node_3", null)).to.equal(true)
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
          })).to.equal(true)
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
          "/test/empty_owners/node_0/node_1a/node_2/node_3", null)).to.equal(true)
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

    rimraf.sync(BLOCKCHAINS_DIR);

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
    console.log(`Result of setValue(): ${JSON.stringify(result, null, 2)}`);
    result = node2.db.setValue("test", dbValues);
    console.log(`Result of setValue(): ${JSON.stringify(result, null, 2)}`);
  })

  afterEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);
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
    expect(node1.db.evalRule(
        `test/users/${node1.account.address}/info`, "something", null, null))
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
    expect(node1.db.evalRule(
        `test/users/${node1.account.address}/next_counter`, 11, null,  null))
      .to.equal(true)
    expect(node1.db.evalRule(
        `test/users/${node1.account.address}/next_counter`, 12, null, null))
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
    rimraf.sync(BLOCKCHAINS_DIR);

    node = new BlockchainNode();
    setNodeForTesting(node);
    node.db.setOwner("test/test_owner/mixed/true/true/true",
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
    );
    node.db.setOwner("test/test_owner/mixed/false/true/true",
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
    );
    node.db.setOwner("test/test_owner/mixed/true/false/true",
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
    );
    node.db.setOwner("test/test_owner/mixed/true/true/false",
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
    );
  })

  afterEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);
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

    rimraf.sync(BLOCKCHAINS_DIR);

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
    console.log(`Result of setValue(): ${JSON.stringify(result, null, 2)}`);

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
    console.log(`Result of setFunction(): ${JSON.stringify(result, null, 2)}`);

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
    console.log(`Result of setRule(): ${JSON.stringify(result, null, 2)}`);

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
    console.log(`Result of setOwner(): ${JSON.stringify(result, null, 2)}`);
  })

  afterEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);
  });

  describe("sharding path", () => {
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

  describe("value operations", () => {
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
          "test/test_sharding/some/path/to/value", newValue, { addr: 'known_user' }))
        .to.equal(true);
      expect(node.db.getValue("test/test_sharding/some/path/to/value")).to.equal(newValue);
    })

    it("setValue with isGlobal = true", () => {
      expect(node.db.setValue(
          "apps/afan/test/test_sharding/some/path/to/value", newValue, { addr: 'known_user' },
          null, null, true))
        .to.equal(true);
      expect(node.db.getValue("test/test_sharding/some/path/to/value")).to.equal(newValue);
    })

    it("setValue with isGlobal = true and non-existing path", () => {
      expect(node.db.setValue(
          "some/non-existing/path", newValue, { addr: 'known_user' }, null, null, true))
        .to.equal(true);
    })

    it("setValue with isGlobal = false and non-writable path with sharding", () => {
      assert.deepEqual(node.db.setValue("test/test_sharding/shards/enabled_shard/path", 20), {
        "code": 104,
        "error_message":
            "Non-writable path with shard config: /values/test/test_sharding/shards/enabled_shard"
      });
    })

    it("setValue with isGlobal = true and non-writable path with sharding", () => {
      expect(node.db.setValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", 20, 'known_user', null, null,
          true))
        .to.equal(true);
      expect(node.db.getValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", true))
        .to.equal(10);  // value unchanged
    })

    it("setValue with isGlobal = false and writable path with sharding", () => {
      expect(node.db.setValue("test/test_sharding/shards/disabled_shard/path", 20)).to.equal(true);
      expect(node.db.getValue("test/test_sharding/shards/disabled_shard/path")).to.equal(20);
    })

    it("setValue with isGlobal = true and writable path with sharding", () => {
      expect(node.db.setValue(
          "apps/afan/test/test_sharding/shards/disabled_shard/path", 20, { addr: 'known_user' },
          null, null, true))
        .to.equal(true);
      expect(node.db.getValue("apps/afan/test/test_sharding/shards/disabled_shard/path", true))
        .to.equal(20);  // value changed
    })

    it("incValue with isGlobal = false", () => {
      expect(node.db.incValue(
          "test/test_sharding/some/path/to/number", incDelta, { addr: 'known_user' }))
        .to.equal(true);
      expect(node.db.getValue("test/test_sharding/some/path/to/number")).to.equal(10 + incDelta);
    })

    it("incValue with isGlobal = true", () => {
      expect(node.db.incValue(
          "apps/afan/test/test_sharding/some/path/to/number", incDelta, { addr: 'known_user' },
          null, null, true))
        .to.equal(true);
      expect(node.db.getValue("test/test_sharding/some/path/to/number")).to.equal(10 + incDelta);
    })

    it("incValue with isGlobal = true and non-existing path", () => {
      expect(node.db.incValue(
          "some/non-existing/path", incDelta, { addr: 'known_user' }, null, null, true))
        .to.equal(true);
    })

    it("setValue with isGlobal = false and non-writable path with sharding", () => {
      assert.deepEqual(node.db.incValue("test/test_sharding/shards/enabled_shard/path", 5), {
        "code": 104,
        "error_message":
            "Non-writable path with shard config: /values/test/test_sharding/shards/enabled_shard"
      });
    })

    it("setValue with isGlobal = true and non-writable path with sharding", () => {
      expect(node.db.incValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", 5, { addr: 'known_user' },
          null, null, true))
        .to.equal(true);
      expect(node.db.getValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", true))
        .to.equal(10);  // value unchanged
    })

    it("setValue with isGlobal = false and writable path with sharding", () => {
      expect(node.db.incValue("test/test_sharding/shards/disabled_shard/path", 5)).to.equal(true);
      expect(node.db.getValue("test/test_sharding/shards/disabled_shard/path"))
        .to.equal(15);  // value changed
    })

    it("setValue with isGlobal = true and writable path with sharding", () => {
      expect(node.db.incValue(
          "apps/afan/test/test_sharding/shards/disabled_shard/path", 5, { addr: 'known_user' },
          null, null, true))
        .to.equal(true);
      expect(node.db.getValue("apps/afan/test/test_sharding/shards/disabled_shard/path", true))
        .to.equal(15);  // value changed
    })

    it("decValue with isGlobal = false", () => {
      expect(node.db.decValue(
          "test/test_sharding/some/path/to/number", decDelta, { addr: 'known_user' }))
        .to.equal(true);
      expect(node.db.getValue("test/test_sharding/some/path/to/number")).to.equal(10 - decDelta);
    })

    it("decValue with isGlobal = true", () => {
      expect(node.db.decValue(
          "apps/afan/test/test_sharding/some/path/to/number", decDelta, { addr: 'known_user' },
          null, null, true))
        .to.equal(true);
      expect(node.db.getValue("test/test_sharding/some/path/to/number")).to.equal(10 - decDelta);
    })

    it("decValue with isGlobal = true and non-existing path", () => {
      expect(node.db.decValue(
          "some/non-existing/path", decDelta, { addr: 'known_user' }, null, null, true))
        .to.equal(true);
    })

    it("setValue with isGlobal = false and non-writable path with sharding", () => {
      assert.deepEqual(node.db.decValue("test/test_sharding/shards/enabled_shard/path", 5), {
        "code": 104,
        "error_message":
            "Non-writable path with shard config: /values/test/test_sharding/shards/enabled_shard"
      });
    })

    it("setValue with isGlobal = true and non-writable path with sharding", () => {
      expect(node.db.decValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", 5, { addr: 'known_user' },
          null, null, true))
        .to.equal(true);
      expect(node.db.getValue(
          "apps/afan/test/test_sharding/shards/enabled_shard/path", true))
        .to.equal(10);  // value unchanged
    })

    it("setValue with isGlobal = false and writable path with sharding", () => {
      expect(node.db.decValue("test/test_sharding/shards/disabled_shard/path", 5)).to.equal(true);
      expect(node.db.getValue("test/test_sharding/shards/disabled_shard/path"))
        .to.equal(5);  // value changed
    })

    it("setValue with isGlobal = true and writable path with sharding", () => {
      expect(node.db.decValue(
          "apps/afan/test/test_sharding/shards/disabled_shard/path", 5, { addr: 'known_user' },
          null, null, true))
        .to.equal(true);
      expect(node.db.getValue("apps/afan/test/test_sharding/shards/disabled_shard/path", true))
        .to.equal(5);  // value changed
    })

  })

  describe("function operations", () => {
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
          "test/test_sharding/some/path/to", funcChange, { addr: 'known_user' }))
        .to.equal(true);
      assert.deepEqual(node.db.getFunction("test/test_sharding/some/path/to"), newFunc);
    })

    it("setFunction with isGlobal = true", () => {
      expect(node.db.setFunction(
          "apps/afan/test/test_sharding/some/path/to", funcChange, { addr: 'known_user' }, true))
        .to.equal(true);
      assert.deepEqual(
          node.db.getFunction("apps/afan/test/test_sharding/some/path/to", true), newFunc);
    })

    it("setFunction with isGlobal = true and non-existing path", () => {
      expect(node.db.setFunction(
          "some/non-existing/path", funcChange, { addr: 'known_user' }, true))
        .to.equal(true);
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

  describe("rule operations", () => {
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
          "test/test_sharding/some/path/to", newRule, { addr: 'known_user' }))
        .to.equal(true);
      assert.deepEqual(node.db.getRule("test/test_sharding/some/path/to"), newRule);
    })

    it("setRule with isGlobal = true", () => {
      expect(node.db.setRule(
          "apps/afan/test/test_sharding/some/path/to", newRule, { addr: 'known_user' }, true))
        .to.equal(true);
      assert.deepEqual(
          node.db.getRule("apps/afan/test/test_sharding/some/path/to", true), newRule);
    })

    it("setRule with isGlobal = true and non-existing path", () => {
      expect(node.db.setRule("some/non-existing/path", newRule, { addr: 'known_user' }, true))
        .to.equal(true);
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

  describe("owner operations", () => {
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
          "test/test_sharding/some/path/to", newOwner, { addr: 'known_user' }))
        .to.equal(true);
      assert.deepEqual(node.db.getOwner("test/test_sharding/some/path/to"), newOwner);
    })

    it("setOwner with isGlobal = true", () => {
      expect(node.db.setOwner(
          "apps/afan/test/test_sharding/some/path/to", newOwner, { addr: 'known_user' }, true))
        .to.equal(true);
      assert.deepEqual(
          node.db.getOwner("apps/afan/test/test_sharding/some/path/to", true), newOwner);
    })

    it("setOwner with isGlobal = true and non-existing path", () => {
      expect(node.db.setOwner("some/non-existing/path", newOwner, { addr: 'known_user' }, true))
        .to.equal(true);
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

describe("Test proof with database", () => {
  let node, valuesObject;

  beforeEach(() => {
    let result;

    rimraf.sync(BLOCKCHAINS_DIR);

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
    console.log(`Result of setValue(): ${JSON.stringify(result, null, 2)}`);
  });

  afterEach(() => {
    rimraf.sync(BLOCKCHAINS_DIR);
  });

  describe("Check proof for setValue(), setOwner(), setRule(), and setFunction()", () => {
    it("checks proof hash of under $root_path/test", () => {
      const valuesNode = DB.getRefForReading(node.db.stateRoot, ['values', 'test']);
      const ownersNode = DB.getRefForReading(node.db.stateRoot, ['owners', 'test']);
      const rulesNode = DB.getRefForReading(node.db.stateRoot, ['rules', 'test']);
      const functionNode = DB.getRefForReading(node.db.stateRoot, ['functions', 'test']);
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
      const valuesNode = DB.getRefForReading(node.db.stateRoot, ['values', 'test']);
      const ownersNode = DB.getRefForReading(node.db.stateRoot, ['owners', 'test']);
      const rulesNode = DB.getRefForReading(node.db.stateRoot, ['rules', 'test']);
      const functionNode = DB.getRefForReading(node.db.stateRoot, ['functions', 'test']);
      expect(valuesNode.getProofHash()).to.equal(valuesNode.buildProofHash());
      expect(ownersNode.getProofHash()).to.equal(ownersNode.buildProofHash());
      expect(rulesNode.getProofHash()).to.equal(rulesNode.buildProofHash());
      expect(functionNode.getProofHash()).to.equal(functionNode.buildProofHash());
    });
  });

  describe("getProof", () => {
    it("tests proof with a null case", () => {
      const rootNode = node.db.stateRoot;
      assert.deepEqual(null, node.db.getProof('/test/test'));
    });

    it("tests proof with owners, rules, values and functions", () => {
      const rootNode = node.db.stateRoot;
      const ownersNode = DB.getRefForReading(node.db.stateRoot, ['owners']);
      const rulesNode = DB.getRefForReading(node.db.stateRoot, ['rules']);
      const valuesNode = DB.getRefForReading(node.db.stateRoot, ['values']);
      const functionNode = DB.getRefForReading(node.db.stateRoot, ['functions']);
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
      assert.deepEqual(rootProof, node.db.getProof('/'));
      assert.deepEqual(ownersProof, node.db.getProof('/owners/test'));
      assert.deepEqual(rulesProof, node.db.getProof('/rules/test'));
      assert.deepEqual(valuesProof, node.db.getProof('/values/test'));
      assert.deepEqual(functionsProof, node.db.getProof('/functions/test'));
    });
  });
});