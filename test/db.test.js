const fs = require("fs")
const rimraf = require('rimraf');
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const DB = require('../db')
const TransactionPool = require("../db/transaction-pool")
const ChainUtil = require('../chain-util')
const Blockchain = require('../blockchain')
const {GenesisToken, GenesisAccounts, GENESIS_OWNERS, GENESIS_RULES, PredefinedDbPaths}
    = require('../constants')
const {setDbForTesting} = require('./test-util')

describe("DB initialization", () => {
  let db, bc, tp;

  beforeEach(() => {
    tp = new TransactionPool();
    bc = new Blockchain("test-blockchain");
    db = DB.getDatabase(bc, tp);
    setDbForTesting(bc, tp, db, 0, true);
  })

  afterEach(() => {
    rimraf.sync(bc._blockchainDir());
  });

  describe("token", () => {
    it("loading token properly on initialization", () => {
      assert.deepEqual(db.getValue(`/${PredefinedDbPaths.TOKEN}`), GenesisToken);

    })
  })

  describe("balances", () => {
    it("loading balances properly on initialization", () => {
      const expected =
          GenesisToken.total_supply - GenesisAccounts.others.length * GenesisAccounts.shares;
      const dbPath =
          `/${PredefinedDbPaths.ACCOUNTS}/${GenesisAccounts.owner.address}/` +
          `${PredefinedDbPaths.BALANCE}`;
      expect(db.getValue(dbPath)).to.equal(expected);
    })
  })

  describe("owners", () => {
    it("loading owners properly on initialization", () => {
      const owners = JSON.parse(fs.readFileSync(GENESIS_OWNERS));
      assert.deepEqual(db.getOwner("/"), owners);
    })
  })

  describe("rules", () => {
    it("loading rules properly on initialization", () => {
      const rules = JSON.parse(fs.readFileSync(GENESIS_RULES));
      assert.deepEqual(db.getRule("/"), rules);
    })
  })
})

describe("DB operations", () => {
  let db, dbValues, dbRules, dbOwners, bc, tp;

  beforeEach(() => {
    let result;

    tp = new TransactionPool();
    bc = new Blockchain("test-blockchain");
    db = DB.getDatabase(bc, tp);
    setDbForTesting(bc, tp, db);
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
    result = db.setValue("test", dbValues);
    console.log(`Result of setValue(): ${JSON.stringify(result, null, 2)}`);
    dbRules = {
      "some": {
        "path": {
          ".write": true
        }
      }
    };
    result = db.setRule("test/test_rule", dbRules);
    console.log(`Result of setRule(): ${JSON.stringify(result, null, 2)}`);
    dbOwners = {
      "some": {
        "path": {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": true,
                "write_owner": true,
                "write_rule": true,
                "write_function": true,
              }
            }
          }
        }
      }
    };
    result = db.setOwner("test/test_owner", dbOwners);
    console.log(`Result of setOwner(): ${JSON.stringify(result, null, 2)}`);
  })

  afterEach(() => {
    rimraf.sync(bc._blockchainDir());
  });

  describe("getValue operations", () => {
    it("when retrieving high value near top of database", () => {
      assert.deepEqual(db.getValue("test"), dbValues)
    })

    it("when retrieving shallow nested value", () => {
      assert.deepEqual(db.getValue("test/ai/comcom"), dbValues["ai"]["comcom"])
    })

    it("when retrieving deeply nested value", () => {
      assert.deepEqual(db.getValue("test/nested/far/down"), dbValues["nested"]["far"]["down"])
    })

    it("by failing when value is not present", () => {
      expect(db.getValue("test/nested/far/down/to/nowhere")).to.equal(null)
    })
  })

  describe("getRule operations", () => {
    it("when retrieving non-existing rule config", () => {
      expect(db.getRule("/test/test_rule/other/rule/path")).to.equal(null);
    })

    it("when retrieving existing rule config", () => {
      assert.deepEqual(db.getRule("/test/test_rule/some/path"), {".write": true});
    })
  })

  describe("getOwner operations", () => {
    it("when retrieving non-existing owner config", () => {
      expect(db.getOwner("/test/test_owner/other/owner/path")).to.equal(null)
    })

    it("when retrieving existing owner config", () => {
      assert.deepEqual(db.getOwner("/test/test_owner/some/path"), {
        ".owner": {
          "owners": {
            "*": {
              "branch_owner": true,
              "write_owner": true,
              "write_rule": true,
              "write_function": true,
            }
          }
        }
      });
    })
  })

  describe("get operations", () => {
    it("when retrieving non-existing value or rule or owner", () => {
      assert.deepEqual(db.get([
        {
          // Default type: GET_VALUE
          ref: "/value/other/path",
        },
        {
          type: "GET_RULE",
          ref: "/rule/other/path",
        },
        {
          type: "GET_OWNER",
          ref: "/owner/other/path",
        },
      ]), [null, null, null]);
    })

    it("when retrieving existing value or rule or owner", () => {
      assert.deepEqual(db.get([
        {
          // Default type: GET_VALUE
          ref: "/test/nested/far/down",
        },
        {
          type: "GET_RULE",
          ref: "/test/test_rule/some/path",
        },
        {
          type: "GET_OWNER",
          ref: "/test/test_owner/some/path",
        },
      ]), [
        456,
        {
          ".write": true
        },
        {
          ".owner": {
            "owners": {
              "*": {
                "branch_owner": true,
                "write_owner": true,
                "write_rule": true,
                "write_function": true,
              }
            }
          }
        }
      ]);
    })
  })

  describe("setValue operations", () => {
    it("when overwriting nested value", () => {
      const newValue = {"new": 12345}
      expect(db.setValue("test/nested/far/down", newValue)).to.equal(true)
      assert.deepEqual(db.getValue("test/nested/far/down"), newValue)
    })

    it("when creating new path in database", () => {
      const newValue = 12345
      db.setValue("test/new/unchartered/nested/path", newValue)
      expect(db.getValue("test/new/unchartered/nested/path")).to.equal(newValue)
    })
  })

  describe("incValue operations", () => {
    it("when increasing value successfully", () => {
      expect(db.incValue("test/increment/value", 10)).to.equal(true)
      expect(db.getValue("test/increment/value")).to.equal(30)
    })

    it("returning error code and leaving value unchanged if path is not numerical", () => {
      expect(db.incValue("test/ai/foo", 10).code).to.equal(1)
      expect(db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("creating and increasing given path from 0 if not currently in database", () => {
      db.incValue("test/completely/new/path/test", 100);
      expect(db.getValue("test/completely/new/path/test")).to.equal(100)
    })
  })

  describe("decValue operations", () => {
    it("when decreasing value successfully", () => {
      expect(db.decValue("test/decrement/value", 10)).to.equal(true)
      expect(db.getValue("test/decrement/value")).to.equal(10)
    })

    it("returning error code and leaving value unchanged if path is not numerical", () => {
      expect(db.decValue("test/ai/foo", 10).code).to.equal(1)
      expect(db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("creating and decreasing given path from 0 if not currently in database", () => {
      db.decValue("test/completely/new/path/test", 100);
      expect(db.getValue("test/completely/new/path/test")).to.equal(-100)
    })
  })

  describe("setRule operations", () => {
    it("when retrieving existing rule config", () => {
      const ruleConfig = {".write": "other rule config"};
      expect(db.setRule("/test/test_rule/some/path", ruleConfig)).to.equal(true)
      assert.deepEqual(db.getRule("/test/test_rule/some/path"), ruleConfig)
    })
  })

  describe("setOwner operations", () => {
    it("when retrieving existing owner config", () => {
      const ownerConfig = {".owner": "other owner config"};
      expect(db.setOwner("/test/test_owner/some/path", ownerConfig)).to.equal(true)
      assert.deepEqual(db.getOwner("/test/test_owner/some/path"), ownerConfig)
    })
  })

  describe("setFunction operations", () => {
    it("when retrieving existing function config", () => {
      const functionConfig = {"registry_service": "functions.ainetwork.ai",
                              "event_listener": "events.ainetwork.ai",
                              "function_hash": '0xFUNCTION_HASH'};
      expect(db.setFunction("/test/test_function/some/path", functionConfig)).to.equal(true)
      assert.deepEqual(db.getFunction("/test/test_function/some/path"), functionConfig)
    })
  })

  describe("set operations", () => {
    it("when set applied successfully", () => {
      expect(db.set([
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
      assert.deepEqual(db.getValue("test/nested/far/down"), { "new": 12345 })
      expect(db.getValue("test/increment/value")).to.equal(30)
      expect(db.getValue("test/decrement/value")).to.equal(10)
      assert.deepEqual(db.getRule("/test/test_rule/some/path"), {".write": "other rule config"});
      assert.deepEqual(db.getOwner("/test/test_owner/some/path"), {".owner": "other owner config"});
    })

    it("returning error code and leaving value unchanged if incValue path is not numerical", () => {
      expect(db.set([
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
      expect(db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if decValue path is not numerical", () => {
      expect(db.set([
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
      expect(db.getValue("test/ai/foo")).to.equal("bar")
    })
  })

  describe("batch operations", () => {
    it("when batch applied successfully", () => {
      assert.deepEqual(db.batch([
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
      assert.deepEqual(db.getValue("test/nested/far/down"), { "new": 12345 })
      expect(db.getValue("test/increment/value")).to.equal(30)
      expect(db.getValue("test/decrement/value")).to.equal(10)
      assert.deepEqual(db.getRule("/test/test_rule/some/path"), {".write": "other rule config"});
      assert.deepEqual(db.getOwner("/test/test_owner/some/path"), {".owner": "other owner config"});
    })

    it("returning error code and leaving value unchanged if no operation is given", () => {
      assert.deepEqual(db.batch([
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
      expect(db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if invalid operation type is given",
        () => {
      assert.deepEqual(db.batch([
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
      expect(db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if incValue path is not numerical", () => {
      assert.deepEqual(db.batch([
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
      expect(db.getValue("test/ai/foo")).to.equal("bar")
    })

    it("returning error code and leaving value unchanged if decValue path is not numerical", () => {
      assert.deepEqual(db.batch([
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
      expect(db.getValue("test/ai/foo")).to.equal("bar")
    })
  })
})

describe("DB rule config", () => {
  let db1, db2, dbValues, bc, tp;

  beforeEach(() => {
    tp = new TransactionPool();
    bc1 = new Blockchain("test-blockchain1");
    db1 = DB.getDatabase(bc1, tp);
    setDbForTesting(bc1, tp, db1, 0);
    bc2 = new Blockchain("test-blockchain2");
    db2 = DB.getDatabase(bc2, tp);
    setDbForTesting(bc2, tp, db2, 1);
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
    dbValues["users"][db1.account.address] = {};
    dbValues["users"][db2.account.address] = {};
    dbValues["users"][db1.account.address]["balance"] = 100;
    dbValues["users"][db2.account.address]["balance"] = 50;
    dbValues["users"][db1.account.address]["info"] = 8474;
    dbValues["users"][db1.account.address]["string_only"] = "some string";
    dbValues["users"][db2.account.address]["string_only"] = 101;
    dbValues["billing_keys"]["update_billing"][db2.account.address] = "'not null'";
    dbValues["users"][db1.account.address]["next_counter"] = 10;
    dbValues["second_users"][db1.account.address] = {};
    dbValues["second_users"][db2.account.address] = {};
    dbValues["second_users"][db2.account.address][db2.account.address] = "i can write";
    dbValues["second_users"][db1.account.address]["something_else"] = "i can write";

    db1.setValue("test", dbValues);
    db2.setValue("test", dbValues);
  })

  afterEach(() => {
    rimraf.sync(bc1._blockchainDir());
    rimraf.sync(bc2._blockchainDir());
  });

  it("only allows certain users to write certain info if balance is greater than 0", () => {
    expect(db2.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db2.account.address}/balance`), 0, null, null))
        .to.equal(true)
    expect(db2.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db2.account.address}/balance`), -1, null, null))
        .to.equal(false)
    expect(db1.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db1.account.address}/balance`), 1, null, null))
        .to.equal(true)

  })

  it("only allows certain users to write certain info if data exists", () => {
    expect(db1.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db1.account.address}/info`), "something", null, null))
        .to.equal(true)
    expect(db2.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db2.account.address}/info`), "something else", null,
        null)).to.equal(false)
    expect(db2.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db2.account.address}/new_info`), "something",
        db2.account.address, null)).to.equal(true)
  })

  it("apply the closest ancestor's rule config if not exists", () => {
    expect(db1.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db1.account.address}/child/grandson`), "something",
        db1.account.address, null)).to.equal(true)
    expect(db2.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db2.account.address}/child/grandson`), "something",
        db1.account.address, null)).to.equal(false)
  })

  it("only allows certain users to write certain info if data at other locations exists", () => {
    expect(db2.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db2.account.address}/balance_info`), "something", null,
        null)).to.equal(true)
    expect(db1.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db1.account.address}/balance_info`), "something", null,
        null)).to.equal(false)
  })

  it("validates old data and new data together", () => {
    expect(db1.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db1.account.address}/next_counter`), 11, null,  null))
        .to.equal(true)
    expect(db1.getPermissionForValue(
        ChainUtil.parsePath(`test/users/${db1.account.address}/next_counter`), 12, null, null))
        .to.equal(false)
  })

  it("can handle nested path variables", () => {
    expect(db2.getPermissionForValue(
        ChainUtil.parsePath(`test/second_users/${db2.account.address}/${db2.account.address}`),
        "some value", null, null)).to.equal(true)
    expect(db1.getPermissionForValue(
        ChainUtil.parsePath(`test/second_users/${db1.account.address}/next_counter`),
        "some other value", null, null)).to.equal(false)
  })

  it("duplicated path variables", () => {
    expect(db1.getPermissionForValue(
        ChainUtil.parsePath('test/no_dup_key/aaa/bbb'), "some value", null, null)).to.equal(true)
    expect(db1.getPermissionForValue(
        ChainUtil.parsePath('test/dup_key/aaa/bbb'), "some value", null, null)).to.equal(false)
  })
})

describe("DB owner config", () => {
  let db, bc, tp;

  beforeEach(() => {
    tp = new TransactionPool();
    bc = new Blockchain("test-blockchain");
    db = DB.getDatabase(bc, tp);
    setDbForTesting(bc, tp, db, 0);
    db.setOwner("test/test_owner/mixed/true/true/true",
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
    db.setOwner("test/test_owner/mixed/false/true/true",
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
    db.setOwner("test/test_owner/mixed/true/false/true",
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
    db.setOwner("test/test_owner/mixed/true/true/false",
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
    rimraf.sync(bc._blockchainDir());
  });

  // Known user
  it("branch_owner permission for known user with mixed config", () => {
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true/branch'), 'known_user'))
        .to.equal(true)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true/branch'), 'known_user'))
        .to.equal(false)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true/branch'), 'known_user'))
        .to.equal(true)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false/branch'), 'known_user'))
        .to.equal(true)
  })

  it("write_owner permission for known user with mixed config", () => {
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true'), 'known_user')).to.equal(true)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true'), 'known_user')).to.equal(true)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true'), 'known_user')).to.equal(false)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false'), 'known_user')).to.equal(true)
  })

  it("write_rule permission for known user with mixed config", () => {
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true'), 'known_user')).to.equal(true)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true'), 'known_user')).to.equal(true)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true'), 'known_user')).to.equal(true)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false'), 'known_user')).to.equal(false)
  })

  it("write_rule permission on deeper path for known user with mixed config", () => {
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true/deeper_path'), 'known_user'))
        .to.equal(true)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true/deeper_path'), 'known_user'))
        .to.equal(true)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true/deeper_path'), 'known_user'))
        .to.equal(true)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false/deeper_path'), 'known_user'))
        .to.equal(false)
  })

  // Unknown user
  it("branch_owner permission for unknown user with mixed config", () => {
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true/branch'), 'unknown_user'))
        .to.equal(false)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true/branch'), 'unknown_user'))
        .to.equal(true)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true/branch'), 'unknown_user'))
        .to.equal(false)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false/branch'), 'unknown_user'))
        .to.equal(false)
  })

  it("write_owner permission for unknown user with mixed config", () => {
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true'), 'unknown_user')).to.equal(false)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true'), 'unknown_user')).to.equal(false)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true'), 'unknown_user')).to.equal(true)
    expect(db.getPermissionForOwner(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false'), 'unknown_user')).to.equal(false)
  })

  it("write_rule permission for unknown user with mixed config", () => {
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true'), 'unknown_user')).to.equal(false)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true'), 'unknown_user')).to.equal(false)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true'), 'unknown_user')).to.equal(false)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false'), 'unknown_user')).to.equal(true)
  })

  it("write_rule permission on deeper path for unknown user with mixed config", () => {
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/true/deeper_path'), 'unknown_user'))
        .to.equal(false)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/false/true/true/deeper_path'), 'unknown_user'))
        .to.equal(false)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/false/true/deeper_path'), 'unknown_user'))
        .to.equal(false)
    expect(db.getPermissionForRule(
        ChainUtil.parsePath('/test/test_owner/mixed/true/true/false/deeper_path'), 'unknown_user'))
        .to.equal(true)
  })
})
