const DB = require('../db')
const TransactionPool = require("../db/transaction-pool")
const ChainUtil = require('../chain-util')
const Blockchain = require('../blockchain')
const chai = require('chai');
const fs = require("fs")
const expect = chai.expect;
const assert = chai.assert;
const {RULES_FILE_PATH} = require('../constants')

describe("DB", () => {
    let db, test_db, bc, tp

    beforeEach(() => {
        tp = new TransactionPool()
        bc = new Blockchain("db-test")
        db = DB.getDatabase(bc, tp)
        test_db = {"ai": {"comcom": 123, "foo": "bar"}, "increase": 
                    {"value": 10, "nested": {"value": 20}}, 
                    "blockchain": [1,2,3,4], "nested": {"far": {"down": 456}}}
        db.set("test", test_db)
    })

    describe("get operations work successfully", () => {

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

    describe("set operations work successfully", () => {
        
        it(" when setting root database", () => {
            var new_db = {"basic": {"new":"db"}}
            // Overwriting the default rules manually for this area
            db.db["rules"][".write"] = true
            db.set("/", new_db)
            assert.deepEqual(db.db, new_db)
        })

        it(" when overwriting nested value", () => {
            var new_val = {"new": 12345}
            db.set("nested/far/down", new_val)
            assert.deepEqual(db.get("nested/far/down"), new_val)
        })

        it(" when creating new path in database", () => {
            var new_val = 12345
            db.set("new/unchartered/nested/path", new_val)
            expect(db.get("new/unchartered/nested/path")).to.equal(new_val)
        })
    })

    describe("increase operations work succesfully", () => {

        it("increasing one value succesfully", () => {
            assert.deepEqual(db.increase({"test/increase/value": 10}), 
                                         {"test/increase/value": 20})
            expect(db.get("test/increase/value")).to.equal(20)
        })

        it("decrementing one value succesfully", () => {
            assert.deepEqual(db.increase({"test/increase/value": -9}), 
                                         {"test/increase/value": 1})
            expect(db.get("test/increase/value")).to.equal(1)
        })

        it("returning error code and leaving value unchanged if path is not numerical", () => {
            expect(db.increase({"test/ai/foo": 10}).code).to.equal(-1)
            expect(db.get("test/ai/foo")).to.equal("bar")
        })

        it("creating and increasing given path from 0 if not currently in database", () => {
            assert.deepEqual(db.increase({"test/completely/new/path/test": 100}), 
                                         {"test/completely/new/path/test": 100})
            expect(db.get("test/completely/new/path/test")).to.equal(100)
        })

        it("incrementing multiple paths if provided in initial diff dict", () => {
            assert.deepEqual(db.increase({"test/completely/new/path/test": 100, "test/increase/value": 10, "test/increase/nested/value": 10}), 
                {"test/completely/new/path/test": 100, "test/increase/value": 20, "test/increase/nested/value": 30})
                expect(db.get("test/completely/new/path/test")).to.equal(100)
                expect(db.get("test/increase/value")).to.equal(20)
                expect(db.get("test/increase/nested/value")).to.equal(30)
        })
    })

    describe("rules work correctly", () => {

        it("loading properly on initatiion", () => {
            assert.deepEqual(db.get("rules"), JSON.parse(fs.readFileSync(RULES_FILE_PATH))["rules"])

        })

    })

})

describe("DB rules", () => {
    let db1, db2, test_db, bc, tp

    beforeEach(() => {
        tp = new TransactionPool()
        bc = new Blockchain("db-test")
        bc2 = new Blockchain("db-test")
        db1 = DB.getDatabase(bc, tp)
        db2 = DB.getDatabase(bc2, tp)
        test_db = {
            "comcom": "unreadable value",
            "unspecified": {"nested": "readable"},
            "ai" : "readable",
            "billing_keys": {"other": "unreadable", "update_billing": {}},
            "users": {},
            "second_users": {}
        }
        test_db["users"][db1.publicKey] = {}
        test_db["users"][db2.publicKey] = {}
        test_db["users"][db1.publicKey]["balance"] = 100
        test_db["users"][db2.publicKey]["balance"] = 50
        test_db["users"][db1.publicKey]["info"] = 8474
        test_db["billing_keys"]["update_billing"][db2.publicKey] = "'not null'"


        test_db["users"][db1.publicKey]["next_counter"] = 10


        test_db["second_users"][db1.publicKey] = {}
        test_db["second_users"][db2.publicKey] = {}
        test_db["second_users"][db2.publicKey][db2.publicKey] = "i can write"
        test_db["second_users"][db1.publicKey]["something_else"] = "i can write"

        db1.set("test", test_db)
        db2.set("test", test_db)
        
    })

    it("only allows certain users to write certain info if balance is greater than 0", () => {
        expect(db2.getPermissions(ChainUtil.parsePath(`test/users/${db2.publicKey}/balance`), null, null, ".write", 0)).to.equal(true)  
        expect(db2.getPermissions(ChainUtil.parsePath(`test/users/${db2.publicKey}/balance`), null, null, ".write", -1)).to.equal(false)       
        expect(db1.getPermissions(ChainUtil.parsePath(`test/users/${db1.publicKey}/balance`), null, null, ".write", 1)).to.equal(true)
        
    })

    it("only allows certain users to write certain info if data exists", () => {
        expect(db1.getPermissions(ChainUtil.parsePath(`test/users/${db1.publicKey}/info`), null, null,  ".write", "something")).to.equal(true)     
        expect(db2.getPermissions(ChainUtil.parsePath(`test/users/${db2.publicKey}/info`), null, null,  ".write", "something else")).to.equal(false)
        expect(db2.getPermissions(ChainUtil.parsePath(`test/users/${db2.publicKey}/new_info`), null, null,  ".write", "something")).to.equal(true)
        
    })

    it("only allows certain users to write certain info if data at other locations exists", () => {
        expect(db2.getPermissions(ChainUtil.parsePath(`test/users/${db2.publicKey}/balance_info`), null, null,  ".write", "something")).to.equal(true)     
        expect(db1.getPermissions(ChainUtil.parsePath(`test/users/${db1.publicKey}/balance_info`), null, null,  ".write", "something")).to.equal(false)        
    })

    it("validates old data and new data together", () => {
        expect(db1.getPermissions(ChainUtil.parsePath(`test/users/${db1.publicKey}/next_counter`), null,  null,  ".write", 11)).to.equal(true)
        expect(db1.getPermissions(ChainUtil.parsePath(`test/users/${db1.publicKey}/next_counter`), null, null,  ".write", 12)).to.equal(false)        
    })

    it("can handle nested wildcards", () => {
        expect(db2.getPermissions(ChainUtil.parsePath(`test/second_users/${db2.publicKey}/${db2.publicKey}`), null, null, ".write", "some value")).to.equal(true)
        expect(db1.getPermissions(ChainUtil.parsePath(`test/second_users/${db1.publicKey}/next_counter`), null, null,  ".write", "some other value")).to.equal(false)        
    })
    
})
