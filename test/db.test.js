const fs = require("fs")
const rimraf = require('rimraf');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const Node = require('../node')
const {
  GenesisToken,
  GenesisAccounts,
  GENESIS_OWNERS,
  GENESIS_RULES,
  GENESIS_FUNCTIONS,
  PredefinedDbPaths,
} = require('../constants')
const {
  setDbForTesting,
  addConsensusOwners,
  addConsensusRules,
} = require('./test-util');

describe("DB initialization", () => {
  let node;

  beforeEach(() => {
    node = new Node();
    setDbForTesting(node, 0, true);
  })

  afterEach(() => {
    rimraf.sync(node.bc._blockchainDir());
  });

  describe("token", () => {
    it("loading token properly on initialization", () => {
      assert.deepEqual(node.db.getValue(`/${PredefinedDbPaths.TOKEN}`), GenesisToken);
    })
  })

  describe("balances", () => {
    it("loading balances properly on initialization", () => {
      const expected =
          GenesisToken.total_supply - GenesisAccounts.others.length * GenesisAccounts.shares;
      const dbPath =
          `/${PredefinedDbPaths.ACCOUNTS}/${GenesisAccounts.owner.address}/` +
          `${PredefinedDbPaths.BALANCE}`;
      expect(node.db.getValue(dbPath)).to.equal(expected);
    })
  })

  describe("owners", () => {
    it("loading owners properly on initialization", () => {
      const owners = JSON.parse(fs.readFileSync(GENESIS_OWNERS));
      addConsensusOwners(owners);
      assert.deepEqual(node.db.getOwner("/"), owners);
    })
  })

  describe("rules", () => {
    it("loading rules properly on initialization", () => {
      const rules = JSON.parse(fs.readFileSync(GENESIS_RULES));
      addConsensusRules(rules);
      assert.deepEqual(node.db.getRule("/"), rules);
    })
  })

  describe("functions", () => {
    it("loading functions properly on initialization", () => {
      const rules = JSON.parse(fs.readFileSync(GENESIS_FUNCTIONS));
      assert.deepEqual(node.db.getFunction("/"), rules);
    })
  })
})

describe("DB operations", () => {
  let node, dbValues, dbRules, dbOwners;

  beforeEach(() => {
    let result;

    node = new Node();
    setDbForTesting(node);

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
      }
    };
    result = node.db.setValue("test", dbValues);
    console.log(`Result of setValue(): ${JSON.stringify(result, null, 2)}`);

    dbFuncs = {
      "some": {
        "$var_path": {
          ".function": "some function config with var path"
        },
        "path": {
          ".function": "some function config",
          "deeper": {
            "path": {
              ".function": "some function config deeper"
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
          ".write": "auth !== 'abcd'"
        },
        "path": {
          ".write": "auth === 'abcd'",
          "deeper": {
            "path": {
              ".write": "auth === 'ijkl'"
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
    rimraf.sync(node.bc._blockchainDir());
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
        ".function": "some function config",
        "deeper": {
          "path": {
            ".function": "some function config deeper"
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
        ".write": "auth === 'abcd'",
        "deeper": {
          "path": {
            ".write": "auth === 'ijkl'"
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
          "config": "some function config with var path",
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
          "config": "some function config",
          "path": "/test/test_function/some/path"
        },
        "subtree_configs": [
          {
            "config": "some function config deeper",
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
          "config": "some function config deeper",
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
            "config": "some function config deeper",
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
          "config": "auth !== 'abcd'",
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
          "config": "auth === 'abcd'",
          "path": "/test/test_rule/some/path"
        },
        "subtree_configs": [
          {
            "config": "auth === 'ijkl'",
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
          "config": "auth === 'ijkl'",
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
          "config": "auth === 'abcd'",
          "path": "/test/test_rule/some/path"
        },
        "subtree_configs": [
          {
            "config": "auth === 'ijkl'",
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
      expect(node.db.evalRule("/test/test_rule/some/var_path", 'value', 'abcd', Date.now()))
        .to.equal(false);
      expect(node.db.evalRule("/test/test_rule/some/var_path", 'value', 'other', Date.now()))
        .to.equal(true);
    })

    it("when evaluating existing non-variable path rule", () => {
      expect(node.db.evalRule("/test/test_rule/some/path", 'value', 'abcd', Date.now()))
        .to.equal(true);
      expect(node.db.evalRule("/test/test_rule/some/path", 'value', 'other', Date.now()))
        .to.equal(false);
      expect(node.db.evalRule(
          "/test/test_rule/some/path/deeper/path", 'value', 'ijkl', Date.now()))
        .to.equal(true);
      expect(node.db.evalRule("/test/test_rule/some/path/deeper/path", 'value', 'other', Date.now()))
        .to.equal(false);
    })

    it("when evaluating existing closest rule", () => {
      expect(node.db.evalRule("/test/test_rule/some/path/deeper", 'value', 'abcd', Date.now()))
        .to.equal(true);
      expect(node.db.evalRule("/test/test_rule/some/path/deeper", 'value', 'other', Date.now()))
        .to.equal(false);
    })
  })

  describe("evalOwner operations", () => {
    it("when evaluating existing owner with matching address", () => {
      expect(node.db.evalOwner("/test/test_owner/some/path", 'write_owner', 'abcd'))
        .to.equal(true);
      expect(node.db.evalOwner("/test/test_owner/some/path", 'write_rule', 'abcd'))
        .to.equal(false);
      expect(node.db.evalOwner("/test/test_owner/some/path/deeper/path", 'write_owner', 'ijkl'))
        .to.equal(true);
      expect(node.db.evalOwner("/test/test_owner/some/path/deeper/path", 'write_rule', 'ijkl'))
        .to.equal(false);
    })

    it("when evaluating existing owner without matching address", () => {
      expect(node.db.evalOwner("/test/test_owner/some/path", 'write_owner', 'other'))
        .to.equal(false);
      expect(node.db.evalOwner("/test/test_owner/some/path", 'write_rule', 'other'))
        .to.equal(true);
      expect(node.db.evalOwner("/test/test_owner/some/path/deeper/path", 'write_owner', 'other'))
        .to.equal(false);
      expect(node.db.evalOwner("/test/test_owner/some/path/deeper/path", 'write_rule', 'other'))
        .to.equal(true);
    })

    it("when evaluating closest owner", () => {
      expect(node.db.evalOwner("/test/test_owner/some/path/deeper", 'write_owner', 'abcd'))
        .to.equal(true);
      expect(node.db.evalOwner("/test/test_owner/some/path/deeper", 'write_rule', 'abcd'))
        .to.equal(false);
      expect(node.db.evalOwner("/test/test_owner/some/path/deeper", 'write_owner', 'other'))
        .to.equal(false);
      expect(node.db.evalOwner("/test/test_owner/some/path/deeper", 'write_rule', 'other'))
        .to.equal(true);
    })
  })

  describe("get operations", () => {
    it("when retrieving non-existing value or rule or owner", () => {
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
              "config": "some function config deeper",
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
            "config": "auth === 'abcd'",
            "path": "/test/test_rule/some/path"
          },
          "subtree_configs": [
            {
              "config": "auth === 'ijkl'",
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

    it("when retrieving existing value or rule or owner", () => {
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
          ".write": "auth === 'abcd'",
          "deeper": {
            "path": {
              ".write": "auth === 'ijkl'"
            }
          }
        },
        {
          ".function": "some function config",
          "deeper": {
            "path": {
              ".function": "some function config deeper"
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
            "config": "some function config",
            "path": "/test/test_function/some/path"
          },
          "subtree_configs": [
            {
              "config": "some function config deeper",
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
            "config": "auth === 'abcd'",
            "path": "/test/test_rule/some/path"
          },
          "subtree_configs": [
            {
              "config": "auth === 'ijkl'",
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
        "code": 6,
        "error_message": "Invalid object for states: /array"
      });
      expect(node.db.getValue("test/unchartered/nested/path2")).to.equal(null)
    })

    it("when writing with invalid path", () => {
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/.", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/."
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/*", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/*"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/$", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/$"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/#", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/#"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/{", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/{"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/}", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/}"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/[", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/["
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/]", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/]"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/\x00", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/\x00"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/\x1F", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/\x1F"
      });
      assert.deepEqual(node.db.setValue("test/new/unchartered/nested/\x7F", 12345), {
        "code": 7,
        "error_message": "Invalid path: /test/new/unchartered/nested/\x7F"
      });
    })
  })

  describe("incValue operations", () => {
    it("when increasing value successfully", () => {
      expect(node.db.incValue("test/increment/value", 10)).to.equal(true)
      expect(node.db.getValue("test/increment/value")).to.equal(30)
    })

    it("returning error code and leaving value unchanged if delta is not numerical", () => {
      expect(node.db.incValue("test/increment/value", '10').code).to.equal(1)
      expect(node.db.getValue("test/increment/value")).to.equal(20)
    })

    it("returning error code and leaving value unchanged if path is not numerical", () => {
      expect(node.db.incValue("test/ai/foo", 10).code).to.equal(1)
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("creating and increasing given path from 0 if not currently in database", () => {
      node.db.incValue("test/completely/new/path/test", 100);
      expect(node.db.getValue("test/completely/new/path/test")).to.equal(100)
    })
  })

  describe("decValue operations", () => {
    it("when decreasing value successfully", () => {
      expect(node.db.decValue("test/decrement/value", 10)).to.equal(true)
      expect(node.db.getValue("test/decrement/value")).to.equal(10)
    })

    it("returning error code and leaving value unchanged if delta is not numerical", () => {
      expect(node.db.decValue("test/decrement/value", '10').code).to.equal(1)
      expect(node.db.getValue("test/decrement/value")).to.equal(20)
    })

    it("returning error code and leaving value unchanged if path is not numerical", () => {
      expect(node.db.decValue("test/ai/foo", 10).code).to.equal(1)
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("creating and decreasing given path from 0 if not currently in database", () => {
      node.db.decValue("test/completely/new/path/test", 100);
      expect(node.db.getValue("test/completely/new/path/test")).to.equal(-100)
    })
  })

  describe("setFunction operations", () => {
    it("when overwriting existing function config", () => {
      const functionConfig = {".function": "other function config"};
      expect(node.db.setFunction("/test/test_function/some/path", functionConfig)).to.equal(true)
      assert.deepEqual(node.db.getFunction("/test/test_function/some/path"), functionConfig)
    })

    it("when writing invalid object", () => {
      assert.deepEqual(node.db.setFunction("/test/test_function/some/path2", {array: []}), {
        "code": 6,
        "error_message": "Invalid object for states: /array"
      });
      expect(node.db.getFunction("test/new2/unchartered/nested/path2")).to.equal(null)
    })

    it("when writing with invalid path", () => {
      assert.deepEqual(node.db.setRule("/test/test_function/some/path/.", "some function config"), {
        "code": 7,
        "error_message": "Invalid path: /test/test_function/some/path/."
      });
    })
  })

  describe("setRule operations", () => {
    it("when overwriting existing rule config", () => {
      const ruleConfig = {".write": "other rule config"};
      expect(node.db.setRule("/test/test_rule/some/path", ruleConfig)).to.equal(true)
      assert.deepEqual(node.db.getRule("/test/test_rule/some/path"), ruleConfig)
    })

    it("when writing invalid object", () => {
      assert.deepEqual(node.db.setRule("/test/test_rule/some/path2", {array: []}), {
        "code": 6,
        "error_message": "Invalid object for states: /array"
      });
      expect(node.db.getRule("/test/test_rule/some/path2")).to.equal(null)
    })

    it("when writing with invalid path", () => {
      assert.deepEqual(node.db.setRule("/test/test_rule/some/path/.", "some rule config"), {
        "code": 7,
        "error_message": "Invalid path: /test/test_rule/some/path/."
      });
    })
  })

  describe("setOwner operations", () => {
    it("when overwriting existing owner config", () => {
      const ownerConfig = {".owner": "other owner config"};
      expect(node.db.setOwner("/test/test_owner/some/path", ownerConfig, 'abcd')).to.equal(true)
      assert.deepEqual(node.db.getOwner("/test/test_owner/some/path"), ownerConfig)
    })

    it("when writing invalid object", () => {
      assert.deepEqual(node.db.setOwner("/test/test_owner/some/path2", {array: []}), {
        "code": 6,
        "error_message": "Invalid object for states: /array"
      });
      expect(node.db.getOwner("/test/test_owner/some/path2")).to.equal(null)
    })

    it("when writing with invalid path", () => {
      assert.deepEqual(node.db.setRule("/test/test_owner/some/path/.", "some owner config"), {
        "code": 7,
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
            ".function": "other function config"
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
      ], 'abcd')).to.equal(true)
      assert.deepEqual(node.db.getValue("test/nested/far/down"), { "new": 12345 })
      expect(node.db.getValue("test/increment/value")).to.equal(30)
      expect(node.db.getValue("test/decrement/value")).to.equal(10)
      assert.deepEqual(node.db.getFunction("/test/test_function/some/path"),
                       {".function": "other function config"});
      assert.deepEqual(node.db.getRule("/test/test_rule/some/path"),
                       {".write": "other rule config"});
      assert.deepEqual(node.db.getOwner("/test/test_owner/some/path"),
                       {".owner": "other owner config"});
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
      ]).code).to.equal(1)
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
      ]).code).to.equal(1)
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })
  })

  describe("batch operations", () => {
    it("when batch applied successfully", () => {
      assert.deepEqual(node.db.batch([
        {
          operation: {
            // Default type: SET_VALUE
            ref: "test/nested/far/down",
            value: {
              "new": 12345
            }
          }
        },
        {
          operation: {
            type: "INC_VALUE",
            ref: "test/increment/value",
            value: 10
          }
        },
        {
          operation: {
            type: "DEC_VALUE",
            ref: "test/decrement/value",
            value: 10
          }
        },
        {
          operation: {
            type: "SET_FUNCTION",
            ref: "/test/test_function/some/path",
            value: {
              ".function": "other function config"
            }
          }
        },
        {
          operation: {
            type: "SET_RULE",
            ref: "/test/test_rule/some/path",
            value: {
              ".write": "other rule config"
            }
          }
        },
        {
          operation: {
            type: "SET_OWNER",
            ref: "/test/test_owner/some/path",
            value: {
              ".owner": "other owner config"
            }
          },
          address: 'abcd'
        }
      ]), [ true, true, true, true, true, true ])
      assert.deepEqual(node.db.getValue("test/nested/far/down"), { "new": 12345 })
      expect(node.db.getValue("test/increment/value")).to.equal(30)
      expect(node.db.getValue("test/decrement/value")).to.equal(10)
      assert.deepEqual(node.db.getFunction("/test/test_function/some/path"),
                       {".function": "other function config"});
      assert.deepEqual(node.db.getRule("/test/test_rule/some/path"),
                       {".write": "other rule config"});
      assert.deepEqual(node.db.getOwner("/test/test_owner/some/path"),
                       {".owner": "other owner config"});
    })

    it("returning error code and leaving value unchanged if no operation is given", () => {
      assert.deepEqual(node.db.batch([
        {
          operation: {
            type: "SET_VALUE",
            ref: "test/nested/far/down",
            value: {
              "new": 12345
            }
          }
        },
        {},
        {
          operation: {
            type: "DEC_VALUE",
            ref: "test/decrement/value",
            value: 10
          }
        }
      ]), [
        true,
        {
          "code": 1,
          "error_message": "No operation"
        },
        true])
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if invalid operation type is given",
        () => {
      assert.deepEqual(node.db.batch([
        {
          operation: {
            type: "SET_VALUE",
            ref: "test/nested/far/down",
            value: {
              "new": 12345
            }
          }
        },
        {
          operation: {
            type: "GET_VALUE",
            ref: "test/ai/foo",
            value: 10
          }
        },
        {
          operation: {
            type: "DEC_VALUE",
            ref: "test/decrement/value",
            value: 10
          }
        }
      ]), [
        true,
        {
          "code": 2,
          "error_message": "Invalid operation type: GET_VALUE"
        },
        true])
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if incValue path is not numerical", () => {
      assert.deepEqual(node.db.batch([
        {
          operation: {
            type: "SET_VALUE",
            ref: "test/nested/far/down",
            value: {
              "new": 12345
            }
          }
        },
        {
          operation: {
            type: "INC_VALUE",
            ref: "test/ai/foo",
            value: 10
          }
        },
        {
          operation: {
            type: "DEC_VALUE",
            ref: "test/decrement/value",
            value: 10
          }
        }
      ]), [
        true,
        {
          "code": 1,
          "error_message": "Not a number type: bar or 10"
        },
        true])
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if decValue path is not numerical", () => {
      assert.deepEqual(node.db.batch([
        {
          operation: {
            type: "SET_VALUE",
            ref: "test/nested/far/down",
            value: {
              "new": 12345
            }
          }
        },
        {
          operation: {
            type: "DEC_VALUE",
            ref: "test/ai/foo",
            value: 10
          }
        },
        {
          operation: {
            type: "INC_VALUE",
            ref: "test/increment/value",
            value: 10
          }
        }
      ]), [
        true,
        {
          "code": 1,
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
    node1 = new Node();
    setDbForTesting(node1, 0);
    node2 = new Node();
    setDbForTesting(node2, 1);
    dbValues = {
      "comcom": "unreadable value",
      "unspecified": {
        "test/nested": "readable"
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

    node1.db.setValue("test", dbValues);
    node2.db.setValue("test", dbValues);
  })

  afterEach(() => {
    rimraf.sync(node1.bc._blockchainDir());
    rimraf.sync(node2.bc._blockchainDir());
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
    expect(node2.db.evalRule(`test/users/${node2.account.address}/info`, "something else", null,
        null)).to.equal(false)
    expect(node2.db.evalRule(
        `test/users/${node2.account.address}/new_info`, "something",
        node2.account.address, null))
      .to.equal(true)
  })

  it("apply the closest ancestor's rule config if not exists", () => {
    expect(node1.db.evalRule(`test/users/${node1.account.address}/child/grandson`, "something",
        node1.account.address, null)).to.equal(true)
    expect(node2.db.evalRule(`test/users/${node2.account.address}/child/grandson`, "something",
        node1.account.address, null))
      .to.equal(false)
  })

  it("only allows certain users to write certain info if data at other locations exists", () => {
    expect(node2.db.evalRule(`test/users/${node2.account.address}/balance_info`, "something", null,
        null)).to.equal(true)
    expect(node1.db.evalRule(`test/users/${node1.account.address}/balance_info`, "something", null,
        null))
      .to.equal(false)
  })

  it("validates old data and new data together", () => {
    expect(node1.db.evalRule(`test/users/${node1.account.address}/next_counter`, 11, null,  null))
      .to.equal(true)
    expect(node1.db.evalRule(`test/users/${node1.account.address}/next_counter`, 12, null, null))
      .to.equal(false)
  })

  it("can handle nested path variables", () => {
    expect(node2.db.evalRule(`test/second_users/${node2.account.address}/${node2.account.address}`,
        "some value", null, null)).to.equal(true)
    expect(node1.db.evalRule(`test/second_users/${node1.account.address}/next_counter`,
        "some other value", null, null)).to.equal(false)
  })

  it("duplicated path variables", () => {
    expect(node1.db.evalRule('test/no_dup_key/aaa/bbb', "some value", null, null)).to.equal(true)
    expect(node1.db.evalRule('test/dup_key/aaa/bbb', "some value", null, null)).to.equal(true)
  })
})

describe("DB owner config", () => {
  let node;

  beforeEach(() => {
    node = new Node();
    setDbForTesting(node, 0);
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
    rimraf.sync(node.bc._blockchainDir());
  });

  // Known user
  it("branch_owner permission for known user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true/branch', 'branch_owner',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true/branch', 'branch_owner',
        'known_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true/branch', 'branch_owner',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false/branch', 'branch_owner',
        'known_user')).to.equal(true)
  })

  it("write_owner permission for known user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true', 'write_owner', 'known_user'))
      .to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true', 'write_owner', 'known_user'))
      .to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true', 'write_owner', 'known_user'))
      .to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false', 'write_owner', 'known_user'))
      .to.equal(true)
  })

  it("write_rule permission for known user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true', 'write_rule', 'known_user'))
      .to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true', 'write_rule', 'known_user'))
      .to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true', 'write_rule', 'known_user'))
      .to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false', 'write_rule', 'known_user'))
      .to.equal(false)
  })

  it("write_rule permission on deeper path for known user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true/deeper_path', 'write_rule',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true/deeper_path', 'write_rule',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true/deeper_path', 'write_rule',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false/deeper_path', 'write_rule',
        'known_user')).to.equal(false)
  })

  it("write_function permission for known user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true', 'write_function',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true', 'write_function',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true', 'write_function',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false', 'write_function',
        'known_user')).to.equal(false)
  })

  it("write_Function permission on deeper path for known user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true/deeper_path', 'write_function',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true/deeper_path', 'write_function',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true/deeper_path', 'write_function',
        'known_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false/deeper_path', 'write_function',
        'known_user')).to.equal(false)
  })

  // Unknown user
  it("branch_owner permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true/branch', 'branch_owner',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true/branch', 'branch_owner',
        'unknown_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true/branch', 'branch_owner',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false/branch', 'branch_owner',
        'unknown_user')).to.equal(false)
  })

  it("write_owner permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true', 'write_owner',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true', 'write_owner',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true', 'write_owner',
        'unknown_user')).to.equal(true)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false', 'write_owner',
        'unknown_user')).to.equal(false)
  })

  it("write_rule permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true', 'write_rule',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true', 'write_rule',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true', 'write_rule',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false', 'write_rule',
        'unknown_user')).to.equal(true)
  })

  it("write_rule permission on deeper path for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true/deeper_path', 'write_rule',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true/deeper_path', 'write_rule',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true/deeper_path', 'write_rule',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false/deeper_path', 'write_rule',
        'unknown_user')).to.equal(true)
  })

  it("write_function permission for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true', 'write_function',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true', 'write_function',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true', 'write_function',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false', 'write_function',
        'unknown_user')).to.equal(true)
  })

  it("write_function permission on deeper path for unknown user with mixed config", () => {
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/true/deeper_path', 'write_function',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/false/true/true/deeper_path', 'write_function',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/false/true/deeper_path', 'write_function',
        'unknown_user')).to.equal(false)
    expect(node.db.evalOwner('/test/test_owner/mixed/true/true/false/deeper_path', 'write_function',
        'unknown_user')).to.equal(true)
  })
})
