const fs = require("fs")
const rimraf = require('rimraf');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const Node = require('../node')
const ChainUtil = require('../chain-util')
const {GenesisToken, GenesisAccounts, GENESIS_OWNERS, GENESIS_RULES, PredefinedDbPaths}
    = require('../constants')
const {setDbForTesting} = require('./test-util')

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
      assert.deepEqual(node.db.getOwner("/"), owners);
    })
  })

  describe("rules", () => {
    it("loading rules properly on initialization", () => {
      const rules = JSON.parse(fs.readFileSync(GENESIS_RULES));
      assert.deepEqual(node.db.getRule("/"), rules);
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
      "blockchain": [1,2,3,4],
      "nested": {
        "far": {
          "down": 456
        }
      }
    };
    result = node.db.setValue("test", dbValues);
    console.log(`Result of setValue(): ${JSON.stringify(result, null, 2)}`);

    dbRules = {
      "some": {
        "path": {
          ".write": "auth === 'abcd'"
        }
      }
    };
    result = node.db.setRule("test/test_rule", dbRules);
    console.log(`Result of setRule(): ${JSON.stringify(result, null, 2)}`);

    dbFuncs = {
      "some": {
        "path": {
          ".function": "some function config"
        },
      }
    };
    result = node.db.setFunc("test/test_function", dbFuncs);
    console.log(`Result of setFunc(): ${JSON.stringify(result, null, 2)}`);

    dbOwners = {
      "some": {
        "path": {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              },
              "abcd": {
                "branch_owner": false,
                "write_function": true,
                "write_owner": false,
                "write_rule": true,
              }
            }
          }
        }
      }
    };
    result = node.db.setOwner("test/test_owner", dbOwners);
    console.log(`Result of setOwner(): ${JSON.stringify(result, null, 2)}`);
  })

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

  describe("getRule operations", () => {
    it("when retrieving non-existing rule config", () => {
      expect(node.db.getRule("/test/test_rule/other/rule/path")).to.equal(null);
    })

    it("when retrieving existing rule config", () => {
      assert.deepEqual(node.db.getRule("/test/test_rule/some/path"),
                       { ".write": "auth === 'abcd'" });
    })
  })

  describe("getFunc operations", () => {
    it("when retrieving non-existing function config", () => {
      expect(node.db.getFunc("/test/test_function/other/function/path")).to.equal(null);
    })

    it("when retrieving existing function config", () => {
      assert.deepEqual(node.db.getFunc("/test/test_function/some/path"),
          { ".function": "some function config" });
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
              "branch_owner": true,
              "write_function": true,
              "write_owner": true,
              "write_rule": true,
            },
            "abcd": {
              "branch_owner": false,
              "write_function": true,
              "write_owner": false,
              "write_rule": true,
            }
          }
        }
      });
    })
  })

  describe("evalRule operations", () => {
    it("when evaluating non-existing rule config", () => {
      expect(node.db.evalRule("/test/test_rule/other/rule/path", 'value', 'abcd', Date.now()))
          .to.equal(true);  // Evaluation result of the closest ancestor's rule config.
    })

    it("when evaluating existing rule config returning true", () => {
      expect(node.db.evalRule("/test/test_rule/some/path", 'value', 'abcd', Date.now()))
          .to.equal(true);
    })

    it("when evaluating existing rule config returning false", () => {
      expect(node.db.evalRule("/test/test_rule/some/path", 'value', 'efgh', Date.now()))
          .to.equal(false);
    })
  })

  describe("evalOwner operations", () => {
    it("when evaluating non-existing owner config", () => {
      assert.deepEqual(node.db.evalOwner("/test/test_owner/other/owner/path", 'abcd'), {})
    })

    it("when evaluating existing owner config with matching address", () => {
      assert.deepEqual(node.db.evalOwner("/test/test_owner/some/path", 'abcd'), {
        "branch_owner": false,
        "write_function": true,
        "write_owner": false,
        "write_rule": true,
      });
    })

    it("when evaluating existing owner config without matching address", () => {
      assert.deepEqual(node.db.evalOwner("/test/test_owner/some/path", 'efgh'), {
        "branch_owner": true,
        "write_function": true,
        "write_owner": true,
        "write_rule": true,
      });
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
          type: "GET_FUNC",
          ref: "/function/other/path",
        },
        {
          type: "GET_OWNER",
          ref: "/owner/other/path",
        },
        {
          type: "EVAL_RULE",
          ref: "/rule/other/path",
          value: "value",
          address: "abcd"
        },
        {
          type: "EVAL_OWNER",
          ref: "/owner/other/path",
          address: "abcd"
        },
      ]), [null, null, null, null, false, {}]);
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
          type: "GET_FUNC",
          ref: "/test/test_function/some/path",
        },
        {
          type: "GET_OWNER",
          ref: "/test/test_owner/some/path",
        },
        {
          type: "EVAL_RULE",
          ref: "/test/test_rule/some/path",
          value: "value",
          address: "abcd",
        },
        {
          type: "EVAL_OWNER",
          ref: "/test/test_owner/some/path",
          address: "abcd"
        },
      ]), [
        456,
        {
          ".write": "auth === 'abcd'"
        },
        {
          ".function": "some function config"
        },
        {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": true,
                "write_function": true,
                "write_owner": true,
                "write_rule": true,
              },
              "abcd": {
                "branch_owner": false,
                "write_function": true,
                "write_owner": false,
                "write_rule": true,
              }
            }
          }
        },
        true,
        {
          "branch_owner": false,
          "write_function": true,
          "write_owner": false,
          "write_rule": true,
        }
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
      node.db.setValue("test/new/unchartered/nested/path", newValue)
      expect(node.db.getValue("test/new/unchartered/nested/path")).to.equal(newValue)
    })
  })

  describe("incValue operations", () => {
    it("when increasing value successfully", () => {
      expect(node.db.incValue("test/increment/value", 10)).to.equal(true)
      expect(node.db.getValue("test/increment/value")).to.equal(30)
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

    it("returning error code and leaving value unchanged if path is not numerical", () => {
      expect(node.db.decValue("test/ai/foo", 10).code).to.equal(1)
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("creating and decreasing given path from 0 if not currently in database", () => {
      node.db.decValue("test/completely/new/path/test", 100);
      expect(node.db.getValue("test/completely/new/path/test")).to.equal(-100)
    })
  })

  describe("setRule operations", () => {
    it("when overwriting existing rule config", () => {
      const ruleConfig = {".write": "other rule config"};
      expect(node.db.setRule("/test/test_rule/some/path", ruleConfig)).to.equal(true)
      assert.deepEqual(node.db.getRule("/test/test_rule/some/path"), ruleConfig)
    })
  })

  describe("setOwner operations", () => {
    it("when overwriting existing owner config", () => {
      const ownerConfig = {".owner": "other owner config"};
      expect(node.db.setOwner("/test/test_owner/some/path", ownerConfig)).to.equal(true)
      assert.deepEqual(node.db.getOwner("/test/test_owner/some/path"), ownerConfig)
    })
  })

  describe("setFunc operations", () => {
    it("when overwriting existing function config", () => {
      const functionConfig = {".function": "other function config"};
      expect(node.db.setFunc("/test/test_function/some/path", functionConfig)).to.equal(true)
      assert.deepEqual(node.db.getFunc("/test/test_function/some/path"), functionConfig)
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
      ])).to.equal(true)
      assert.deepEqual(node.db.getValue("test/nested/far/down"), { "new": 12345 })
      expect(node.db.getValue("test/increment/value")).to.equal(30)
      expect(node.db.getValue("test/decrement/value")).to.equal(10)
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
          }
        }
      ]), [ true, true, true, true, true ])
      assert.deepEqual(node.db.getValue("test/nested/far/down"), { "new": 12345 })
      expect(node.db.getValue("test/increment/value")).to.equal(30)
      expect(node.db.getValue("test/decrement/value")).to.equal(10)
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
          "error_message": "Not a number type: test/ai/foo"
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
          "error_message": "Not a number type: test/ai/foo"
        },
        true])
      expect(node.db.getValue("test/ai/foo")).to.equal("bar")
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
    expect(node2.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node2.account.address}/balance`), 0, null, null))
        .to.equal(true)
    expect(node2.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node2.account.address}/balance`), -1, null, null))
        .to.equal(false)
    expect(node1.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node1.account.address}/balance`), 1, null, null))
        .to.equal(true)

  })

  it("only allows certain users to write certain info if data exists", () => {
    expect(node1.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node1.account.address}/info`), "something", null, null))
        .to.equal(true)
    expect(node2.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node2.account.address}/info`), "something else", null,
        null)).to.equal(false)
    expect(node2.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node2.account.address}/new_info`), "something",
        node2.account.address, null)).to.equal(true)
  })

  it("apply the closest ancestor's rule config if not exists", () => {
    expect(node1.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node1.account.address}/child/grandson`), "something",
        node1.account.address, null)).to.equal(true)
    expect(node2.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node2.account.address}/child/grandson`), "something",
        node1.account.address, null)).to.equal(false)
  })

  it("only allows certain users to write certain info if data at other locations exists", () => {
    expect(node2.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node2.account.address}/balance_info`), "something", null,
        null)).to.equal(true)
    expect(node1.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node1.account.address}/balance_info`), "something", null,
        null)).to.equal(false)
  })

  it("validates old data and new data together", () => {
    expect(node1.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node1.account.address}/next_counter`), 11, null,  null))
        .to.equal(true)
    expect(node1.db.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${node1.account.address}/next_counter`), 12, null, null))
        .to.equal(false)
  })

  it("can handle nested path variables", () => {
    expect(node2.db.getPermissionForValue(
        ChainUtil.parsePath(`test/second_users/${node2.account.address}/${node2.account.address}`),
        "some value", null, null)).to.equal(true)
    expect(node1.db.getPermissionForValue(
        ChainUtil.parsePath(`test/second_users/${node1.account.address}/next_counter`),
        "some other value", null, null)).to.equal(false)
  })

  it("duplicated path variables", () => {
    expect(node1.db.getPermissionForValue(
        ChainUtil.parsePath('test/no_dup_key/aaa/bbb'), "some value", null, null)).to.equal(true)
    expect(node1.db.getPermissionForValue(
        ChainUtil.parsePath('test/dup_key/aaa/bbb'), "some value", null, null)).to.equal(false)
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
              "write_rule": false
            },
            "aaaa": {
              "branch_owner": false,
              "write_owner": false,
              "write_rule": false
            },
            "known_user": {
              "branch_owner": true,
              "write_owner": true,
              "write_rule": true
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
              "write_rule": false
            },
            "aaaa": {
              "branch_owner": true,
              "write_owner": false,
              "write_rule": false
            },
            "known_user": {
              "branch_owner": false,
              "write_owner": true,
              "write_rule": true
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
              "write_rule": false
            },
            "aaaa": {
              "branch_owner": false,
              "write_owner": true,
              "write_rule": false
            },
            "known_user": {
              "branch_owner": true,
              "write_owner": false,
              "write_rule": true
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
              "write_rule": true
            },
            "aaaa": {
              "branch_owner": false,
              "write_owner": false,
              "write_rule": true
            },
            "known_user": {
              "branch_owner": true,
              "write_owner": true,
              "write_rule": false
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
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true/branch'), 'known_user'))
        .to.equal(true)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true/branch'), 'known_user'))
        .to.equal(false)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true/branch'), 'known_user'))
        .to.equal(true)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false/branch'), 'known_user'))
        .to.equal(true)
  })

  it("write_owner permission for known user with mixed config", () => {
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true'), 'known_user')).to.equal(true)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true'), 'known_user')).to.equal(true)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true'), 'known_user')).to.equal(false)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false'), 'known_user')).to.equal(true)
  })

  it("write_rule permission for known user with mixed config", () => {
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true'), 'known_user')).to.equal(true)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true'), 'known_user')).to.equal(true)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true'), 'known_user')).to.equal(true)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false'), 'known_user')).to.equal(false)
  })

  it("write_rule permission on deeper path for known user with mixed config", () => {
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true/deeper_path'), 'known_user'))
        .to.equal(true)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true/deeper_path'), 'known_user'))
        .to.equal(true)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true/deeper_path'), 'known_user'))
        .to.equal(true)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false/deeper_path'), 'known_user'))
        .to.equal(false)
  })

  // Unknown user
  it("branch_owner permission for unknown user with mixed config", () => {
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true/branch'), 'unknown_user'))
        .to.equal(false)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true/branch'), 'unknown_user'))
        .to.equal(true)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true/branch'), 'unknown_user'))
        .to.equal(false)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false/branch'), 'unknown_user'))
        .to.equal(false)
  })

  it("write_owner permission for unknown user with mixed config", () => {
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true'),
        'unknown_user')).to.equal(false)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true'),
        'unknown_user')).to.equal(false)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true'),
        'unknown_user')).to.equal(true)
    expect(node.db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false'),
        'unknown_user')).to.equal(false)
  })

  it("write_rule permission for unknown user with mixed config", () => {
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true'),
        'unknown_user')).to.equal(false)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true'),
        'unknown_user')).to.equal(false)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true'),
        'unknown_user')).to.equal(false)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false'),
        'unknown_user')).to.equal(true)
  })

  it("write_rule permission on deeper path for unknown user with mixed config", () => {
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true/deeper_path'), 'unknown_user'))
        .to.equal(false)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true/deeper_path'), 'unknown_user'))
        .to.equal(false)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true/deeper_path'), 'unknown_user'))
        .to.equal(false)
    expect(node.db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false/deeper_path'), 'unknown_user'))
        .to.equal(true)
  })
})
