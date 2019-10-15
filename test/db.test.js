const DB = require('../db')
const TransactionPool = require("../db/transaction-pool")
const ChainUtil = require('../chain-util')
const Blockchain = require('../blockchain')
const chai = require('chai');
const fs = require("fs")
const expect = chai.expect;
const assert = chai.assert;
const {RULES_FILE_PATH} = require('../constants')

describe("DB initialization", () => {
  let db, dbValues, dbRules, dbOwners, bc, tp;

  beforeEach(() => {
    tp = new TransactionPool();
    bc = new Blockchain("db-test");
    db = DB.getDatabase(bc, tp);
  })

  describe("rules", () => {

    it("loading properly on initatiion", () => {
      const rules = JSON.parse(fs.readFileSync(RULES_FILE_PATH))["rules"];
      assert.deepEqual(db.getRule("/"), JSON.parse(fs.readFileSync(RULES_FILE_PATH))["rules"])

    })
  })
})

describe("DB operations", () => {
  let db, dbValues, dbRules, dbOwners, bc, tp;

  beforeEach(() => {
    tp = new TransactionPool();
    bc = new Blockchain("db-test");
    db = DB.getDatabase(bc, tp);
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
    db.setValue("test", dbValues);
    dbRules = {
      "some": {
        "path": {
          ".write": "some rule config"
        }
      }
    };
    db.setRule("/rule", dbRules);
    dbOwners = {
      "some": {
        "path": {
          ".owner": "some owner config"
        }
      }
    };
    db.setOwner("/owner", dbOwners);
  })

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
      expect(db.getRule("/rule/other/rule/path")).to.equal(null);
    })

    it("when retrieving existing rule config", () => {
      assert.deepEqual(db.getRule("/rule/some/path"), {".write": "some rule config"});
    })
  })

  describe("getOwner operations", () => {
    it("when retrieving non-existing owner config", () => {
      expect(db.getOwner("/owner/other/owner/path")).to.equal(null)
    })

    it("when retrieving existing owner config", () => {
      assert.deepEqual(db.getOwner("/owner/some/path"), {".owner": "some owner config"});
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
          ref: "/rule/some/path",
        },
        {
          type: "GET_OWNER",
          ref: "/owner/some/path",
        },
      ]), [
        456,
        {
          ".write": "some rule config"
        },
        {
          ".owner": "some owner config"
        }
      ]);
    })
  })

  describe("setValue operations", () => {
    it("when overwriting nested value", () => {
      const newValue = {"new": 12345}
      expect(db.setValue("nested/far/down", newValue)).to.equal(true)
      assert.deepEqual(db.getValue("nested/far/down"), newValue)
    })

    it("when creating new path in database", () => {
      const newValue = 12345
      db.setValue("new/unchartered/nested/path", newValue)
      expect(db.getValue("new/unchartered/nested/path")).to.equal(newValue)
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
      const ownerConfig = {".write": "other rule config"};
      expect(db.setOwner("/rule/some/path", ownerConfig)).to.equal(true)
      assert.deepEqual(db.getOwner("/rule/some/path"), ownerConfig)
    })
  })

  describe("setOwner operations", () => {
    it("when retrieving existing owner config", () => {
      const ownerConfig = {".owner": "other owner config"};
      expect(db.setOwner("/owner/some/path", ownerConfig)).to.equal(true)
      assert.deepEqual(db.getOwner("/owner/some/path"), ownerConfig)
    })
  })

  describe("set operations", () => {
    it("when set applied successfully", () => {
      expect(db.set([
        {
          type: "SET_VALUE",
          ref: "nested/far/down",
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
          ref: "/rule/some/path",
          value: {
            ".write": "other rule config"
          }
        },
        {
          type: "SET_OWNER",
          ref: "/owner/some/path",
          value: {
            ".owner": "other owner config"
          }
        }
      ])).to.equal(true)
      assert.deepEqual(db.getValue("nested/far/down"), { "new": 12345 })
      expect(db.getValue("test/increment/value")).to.equal(30)
      expect(db.getValue("test/decrement/value")).to.equal(10)
      assert.deepEqual(db.getRule("/rule/some/path"), {".write": "other rule config"});
      assert.deepEqual(db.getOwner("/owner/some/path"), {".owner": "other owner config"});
    })

    it("returning error code and leaving value unchanged if incValue path is not numerical", () => {
      expect(db.set([
        {
          type: "SET_VALUE",
          ref: "nested/far/down",
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
          ref: "nested/far/down",
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
          ref: "test/ai/foo",
          value: 10
        },
      ]).code).to.equal(1)
      expect(db.getValue("test/ai/foo")).to.equal("bar")
    })
  })
})

describe("DB rule config", () => {
  let db1, db2, dbValues, bc, tp;

  beforeEach(() => {
    tp = new TransactionPool();
    bc = new Blockchain("db-test");
    bc2 = new Blockchain("db-test");
    db1 = DB.getDatabase(bc, tp);
    db2 = DB.getDatabase(bc2, tp);
    dbValues = {
      "comcom": "unreadable value",
      "unspecified": {
        "nested": "readable"
      },
      "ai" : "readable",
      "billing_keys": {
        "other": "unreadable",
        "update_billing": {}
      },
      "users": {},
      "second_users": {}
    };
    dbValues["users"][db1.publicKey] = {};
    dbValues["users"][db2.publicKey] = {};
    dbValues["users"][db1.publicKey]["balance"] = 100;
    dbValues["users"][db2.publicKey]["balance"] = 50;
    dbValues["users"][db1.publicKey]["info"] = 8474;
    dbValues["billing_keys"]["update_billing"][db2.publicKey] = "'not null'";
    dbValues["users"][db1.publicKey]["next_counter"] = 10;
    dbValues["second_users"][db1.publicKey] = {};
    dbValues["second_users"][db2.publicKey] = {};
    dbValues["second_users"][db2.publicKey][db2.publicKey] = "i can write";
    dbValues["second_users"][db1.publicKey]["something_else"] = "i can write";

    db1.setValue("test", dbValues);
    db2.setValue("test", dbValues);
  })

  it("only allows certain users to write certain info if balance is greater than 0", () => {
    expect(db2.getPermissionForValue(ChainUtil.parsePath(`test/users/${db2.publicKey}/balance`), null, null, 0)).to.equal(true)  
    expect(db2.getPermissionForValue(ChainUtil.parsePath(`test/users/${db2.publicKey}/balance`), null, null, -1)).to.equal(false)     
    expect(db1.getPermissionForValue(ChainUtil.parsePath(`test/users/${db1.publicKey}/balance`), null, null, 1)).to.equal(true)
    
  })

  it("only allows certain users to write certain info if data exists", () => {
    expect(db1.getPermissionForValue(ChainUtil.parsePath(`test/users/${db1.publicKey}/info`), null, null, "something")).to.equal(true)   
    expect(db2.getPermissionForValue(ChainUtil.parsePath(`test/users/${db2.publicKey}/info`), null, null, "something else")).to.equal(false)
    expect(db2.getPermissionForValue(ChainUtil.parsePath(`test/users/${db2.publicKey}/new_info`), null, null, "something")).to.equal(true)
    
  })

  it("only allows certain users to write certain info if data at other locations exists", () => {
    expect(db2.getPermissionForValue(ChainUtil.parsePath(`test/users/${db2.publicKey}/balance_info`), null, null, "something")).to.equal(true)   
    expect(db1.getPermissionForValue(ChainUtil.parsePath(`test/users/${db1.publicKey}/balance_info`), null, null, "something")).to.equal(false)    
  })

  it("validates old data and new data together", () => {
    expect(db1.getPermissionForValue(ChainUtil.parsePath(`test/users/${db1.publicKey}/next_counter`), null,  null, 11)).to.equal(true)
    expect(db1.getPermissionForValue(ChainUtil.parsePath(`test/users/${db1.publicKey}/next_counter`), null, null, 12)).to.equal(false)    
  })

  it("can handle nested wildcards", () => {
    expect(db2.getPermissionForValue(ChainUtil.parsePath(`test/second_users/${db2.publicKey}/${db2.publicKey}`), null, null, "some value")).to.equal(true)
    expect(db1.getPermissionForValue(ChainUtil.parsePath(`test/second_users/${db1.publicKey}/next_counter`), null, null, "some other value")).to.equal(false)    
  })
  
  describe("substituteWildCards", () => {
    it("can handle multiple occurrences", () => {
      assert.deepEqual(DB.substituteWildCards("!$aaa !== 'bbb' && !db.getValue($aaa)", { '$aaa': 'AAA', '$bbb': 'BBB'}), "!AAA !== 'bbb' && !db.getValue(AAA)");
    })
  })
})
