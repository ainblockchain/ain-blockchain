const DB = require('../db')
const TransactionPool = require("../db/transaction-pool")
const ChainUtil = require('../chain-util')
const Blockchain = require('../blockchain')
const chai = require('chai');
const fs = require("fs")
const expect = chai.expect;
const assert = chai.assert;
const {RULES_FILE_PATH} = require('../constants')

describe("DB values", () => {
    let db, test_db, bc, tp;

    beforeEach(() => {
        tp = new TransactionPool();
        bc = new Blockchain("db-test");
        db = DB.getDatabase(bc, tp);
        test_db = {
            "ai": {
                "comcom": 123,
                "foo": "bar"
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
        db.setValue("test", test_db);
    })

    describe("get operations", () => {
        it("when retrieving high value near top of database", () => {
            assert.deepEqual(db.get("test"), test_db)
        })

        it("when retrieving shallow nested value", () => {
            assert.deepEqual(db.get("test/ai/comcom"), test_db["ai"]["comcom"])
        })

        it("when retrieving deeply nested value", () => {
            assert.deepEqual(db.get("test/nested/far/down"), test_db["nested"]["far"]["down"])
        })

        it("by failing when value is not present", () => {
            expect(db.get("test/nested/far/down/to/nowhere")).to.equal(null)
        })
    })

    describe("setValue operations", () => {
        it("when overwriting nested value", () => {
            var new_val = {"new": 12345}
            expect(db.setValue("nested/far/down", new_val)).to.equal(true)
            assert.deepEqual(db.get("nested/far/down"), new_val)
        })

        it("when creating new path in database", () => {
            var new_val = 12345
            db.setValue("new/unchartered/nested/path", new_val)
            expect(db.get("new/unchartered/nested/path")).to.equal(new_val)
        })
    })

    describe("incValue operations", () => {
        it("when increasing value successfully", () => {
            expect(db.incValue("test/increment/value", 10)).to.equal(true)
            expect(db.get("test/increment/value")).to.equal(30)
        })

        it("returning error code and leaving value unchanged if path is not numerical", () => {
            expect(db.incValue("test/ai/foo", 10).code).to.equal(1)
            expect(db.get("test/ai/foo")).to.equal("bar")
        })

        it("creating and increasing given path from 0 if not currently in database", () => {
            db.incValue("test/completely/new/path/test", 100); 
            expect(db.get("test/completely/new/path/test")).to.equal(100)
        })
    })

    describe("decValue operations", () => {
        it("when decreasing value successfully", () => {
            expect(db.decValue("test/decrement/value", 10)).to.equal(true)
            expect(db.get("test/decrement/value")).to.equal(10)
        })

        it("returning error code and leaving value unchanged if path is not numerical", () => {
            expect(db.decValue("test/ai/foo", 10).code).to.equal(1)
            expect(db.get("test/ai/foo")).to.equal("bar")
        })

        it("creating and decreasing given path from 0 if not currently in database", () => {
            db.decValue("test/completely/new/path/test", 100); 
            expect(db.get("test/completely/new/path/test")).to.equal(-100)
        })
    })

    describe("updates operations", () => {
        it("when updates applied successfully", () => {
            expect(db.updates([
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
            ])).to.equal(true)
            assert.deepEqual(db.get("nested/far/down"), { "new": 12345 })
            expect(db.get("test/increment/value")).to.equal(30)
            expect(db.get("test/decrement/value")).to.equal(10)
        })

        it("returning error code and leaving value unchanged if incValue path is not numerical", () => {
            expect(db.updates([
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
            expect(db.get("test/ai/foo")).to.equal("bar")
        })

        it("returning error code and leaving value unchanged if decValue path is not numerical", () => {
            expect(db.updates([
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
            expect(db.get("test/ai/foo")).to.equal("bar")
        })
    })

    describe("rules", () => {

        it("loading properly on initatiion", () => {
            assert.deepEqual(db.get("rules"), JSON.parse(fs.readFileSync(RULES_FILE_PATH))["rules"])

        })

    })

})

describe("DB rules", () => {
    let db1, db2, test_db, bc, tp;

    beforeEach(() => {
        tp = new TransactionPool();
        bc = new Blockchain("db-test");
        bc2 = new Blockchain("db-test");
        db1 = DB.getDatabase(bc, tp);
        db2 = DB.getDatabase(bc2, tp);
        test_db = {
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
        test_db["users"][db1.publicKey] = {};
        test_db["users"][db2.publicKey] = {};
        test_db["users"][db1.publicKey]["balance"] = 100;
        test_db["users"][db2.publicKey]["balance"] = 50;
        test_db["users"][db1.publicKey]["info"] = 8474;
        test_db["billing_keys"]["update_billing"][db2.publicKey] = "'not null'";


        test_db["users"][db1.publicKey]["next_counter"] = 10;


        test_db["second_users"][db1.publicKey] = {};
        test_db["second_users"][db2.publicKey] = {};
        test_db["second_users"][db2.publicKey][db2.publicKey] = "i can write";
        test_db["second_users"][db1.publicKey]["something_else"] = "i can write";

        db1.setValue("test", test_db);
        db2.setValue("test", test_db);
        
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
            assert.deepEqual(DB.substituteWildCards("!$aaa !== 'bbb' && !db.get($aaa)", { '$aaa': 'AAA', '$bbb': 'BBB'}), "!AAA !== 'bbb' && !db.get(AAA)");
        })
    })
})
