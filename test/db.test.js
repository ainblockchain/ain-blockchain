const DB = require('../db/index')
const Blockchain = require('../blockchain/index')
const chai = require('chai');
const fs = require("fs")
const expect = chai.expect;
const assert = chai.assert;
const {RULES_FILE_PATH} = require('../config')

describe("DB", () => {
    let db, test_db, bc

    beforeEach(() => {
        bc = new Blockchain()
        db = DB.getDabase(bc)
        test_db = {"ai": {"comcom": 123, "foo": "bar"}, "increase": 
                    {"value": 10, "nested": {"value": 20}}, "blockchain": [1,2,3,4], "nested": {"far": {"down": 456}}}
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
            db.set("/", new_db)
            assert.deepEqual(db.get("/"), new_db)
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
                                         {code: 0, result: {"test/increase/value": 20}})
            expect(db.get("test/increase/value")).to.equal(20)
        })

        it("decrementing one value succesfully", () => {
            assert.deepEqual(db.increase({"test/increase/value": -9}), 
                                         {code: 0, result: {"test/increase/value": 1}})
            expect(db.get("test/increase/value")).to.equal(1)
        })

        it("returning error code and leaving value unchanged if path is not numerical", () => {
            expect(db.increase({"test/ai/foo": 10}).code).to.equal(-1)
            expect(db.get("test/ai/foo")).to.equal("bar")
        })

        it("creating and increasing given path from 0 if not currently in database", () => {
            assert.deepEqual(db.increase({"test/completely/new/path/test": 100}), 
                                         {code: 0, result: {"test/completely/new/path/test": 100}})
            expect(db.get("test/completely/new/path/test")).to.equal(100)
        })

        it("incrementing multiple paths if provided in initial diff dict", () => {
            assert.deepEqual(db.increase({"test/completely/new/path/test": 100, "test/increase/value": 10, "test/increase/nested/value": 10}), 
                {code: 0, result: {"test/completely/new/path/test": 100, "test/increase/value": 20, "test/increase/nested/value": 30}})
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
    let db1, db2, test_db, bc

    beforeEach(() => {
        bc = new Blockchain()
        db1 = DB.getDabase(bc)
        db2 = DB.getDabase(bc)
        test_db = {
            "comcom": "unreadable value",
            "unspecified": {"nested": "readable"},
            "ai" : "readable",
            "billing_keys": {"other": "unreadable", "update_billing": "readable"},
            "users": {}
        }
        test_db["users"][db1.publicKey] = "some info for user 1"
        test_db["users"][db2.publicKey] = "some info for user 2"
        db1.set("test", test_db)
        db2.set("test", test_db)
    })

    it("makes readable values readable", () => {
        expect(db1.canRead('test/unspecified/nested')).to.equal(true)
        expect(db1.canRead('test/ai')).to.equal(true)
        expect(db1.canRead('test/blling_keys/update_billing')).to.equal(true)
    })

    it("makes unreadable values unreadable", () => {
        expect(db1.canRead(`test/users/`)).to.equal(false)
        expect(db1.canRead('test/billing_keys/other')).to.equal(false)
    })


    it("only allows certain users to read certain info", () => {
        expect(db2.canRead(`test/users/${db1.publicKey}`)).to.equal(false)
        expect(db1.canRead(`test/users/${db1.publicKey}`)).to.equal(true)
        expect(db1.canRead(`test/users/${db2.publicKey}`)).to.equal(false)
        expect(db2.canRead(`test/users/${db2.publicKey}`)).to.equal(true)
    })
    
})
