const DB = require('../db/index')
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;

describe("DB", () => {
    let db, test_db

    beforeEach(() => {
        db = new DB()
        test_db = {"ai": {"comcom": 123, "foo": "bar"}, "increase": 
                    {"value": 10, "nested": {"value": 20}}, "blockchain": [1,2,3,4], "nested": {"far": {"down": 456}}}
        db.set("/", test_db)
    })

    describe("get operations work successfully", () => {

        it("when retrieving entire database", () => {
            expect(db.get("/")).to.equal(test_db)
        })

        it("when retrieving high value near top of database", () => {
            expect(db.get("ai")).to.equal(test_db["ai"])
        })

        it("when retrieving shallow nested value", () => {
            expect(db.get("ai/comcom")).to.equal(test_db["ai"]["comcom"])
        })

        it("when retrieving deeply nested value", () => {
            expect(db.get("nested/far/down")).to.equal(test_db["nested"]["far"]["down"])
        })

        it("by failing when value is not present", () => {
            expect(db.get("nested/far/down/to/nowhere")).to.equal(null)
        })
    })

    describe("set operations work successfully", () => {
        
        it(" when setting root database", () => {
            var new_db = {"basic": {"new":"db"}}
            db.set("/", new_db)
            expect(db.get("/")).to.equal(new_db)
        })

        it(" when overwriting nested value", () => {
            var new_val = {"new": 12345}
            db.set("nested/far/down", new_val)
            expect(db.get("nested/far/down")).to.equal(new_val)
        })

        it(" when creating new path in database", () => {
            var new_val = 12345
            db.set("new/unchartered/nested/path", new_val)
            expect(db.get("new/unchartered/nested/path")).to.equal(new_val)
        })
    })

    describe("increase operations work succesfully", () => {

        it("increasing one value succesfully", () => {
            assert.deepEqual(db.increase({"increase/value": 10}), 
                                         {code: 0, result: {"increase/value": 20}})
            expect(db.get("increase/value")).to.equal(20)
        })

        it("decrementing one value succesfully", () => {
            assert.deepEqual(db.increase({"increase/value": -9}), 
                                         {code: 0, result: {"increase/value": 1}})
            expect(db.get("increase/value")).to.equal(1)
        })

        it("returning error code and leaving value unchanged if path is not numerical", () => {
            expect(db.increase({"ai/foo": 10}).code).to.equal(-1)
            expect(db.get("ai/foo")).to.equal("bar")
        })

        it("creating and increasing given path from 0 if not currently in database", () => {
            assert.deepEqual(db.increase({"completely/new/path/test": 100}), 
                                         {code: 0, result: {"completely/new/path/test": 100}})
            expect(db.get("completely/new/path/test")).to.equal(100)
        })

        it("incrementing multiple paths if provided in initial diff dict", () => {
            assert.deepEqual(db.increase({"completely/new/path/test": 100, "increase/value": 10, "increase/nested/value": 10}), 
                {code: 0, result: {"completely/new/path/test": 100, "increase/value": 20, "increase/nested/value": 30}})
                expect(db.get("completely/new/path/test")).to.equal(100)
                expect(db.get("increase/value")).to.equal(20)
                expect(db.get("increase/nested/value")).to.equal(30)
        })
    })

})