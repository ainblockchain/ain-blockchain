const DB = require('../db/index')
const Blockchain = require('../blockchain/index')
const Validator = require('../server/validator')
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const {RULES_FILE_PATH} = require('../config')

describe("Validator", () => {
    let db, val, bc

    beforeEach(() => {
        bc = new Blockchain("db-test")
        db = DB.getDatabase(bc)
        // Put in stake manually
        db.db["stakes"] = {"a": 1000, "b": 500, "c": 100, "d":250}
        val = new Validator(db)
    })

    it("puts the weight with highest stake as first validator in most cases", () => {
        answers = {"a": 0, "b": 0, "c":0, "d":0}
        for(var i = 0; i<1700; i++){
            //let i represent a fake block here
            answers[val.getRankedValidators(i)[0]] += 1
        }
        assert.isAbove(answers["a"], answers["b"])
        assert.isAbove(answers["b"], answers["d"])
        assert.isAbove(answers["d"], answers["c"])
    })

    it("returns same lists when given same data accross multiple validators", () => {
        val2 = new Validator(db)
        val3 = new Validator(db)
        for(var i = 0; i<2000; i++){
            //let i represent a fake block here
            assert.deepEqual(val.getRankedValidators(i), val2.getRankedValidators(i))
            assert.deepEqual(val3.getRankedValidators(i), val2.getRankedValidators(i))

        }
    })
})

