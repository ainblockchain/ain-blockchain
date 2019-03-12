const Blockchain = require('../blockchain/index')
const DB = require('../db/index')
const {ForgedBlock} = require('../blockchain/block')
const {getForger} = require('../server/validator')
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const {RULES_FILE_PATH} = require('../config')

describe("Validator", () => {
    let stakeHolders, bc, db

    beforeEach(() => {
       
        bc = new Blockchain("db-test")
        db = DB.getDatabase(bc)
        stakeHolders = {"a": 1000, "b": 500, "c": 100, "d":250}
         
    })

    it("puts the weight with highest stake as first validator in most cases", () => {
        answers = {"a": 0, "b": 0, "c":0, "d":0}
        for(var i = 0; i<1700; i++){
            //let i represent a fake block here
            bc.addNewBlock(ForgedBlock._forgeBlock([i],db, bc.height(), bc.chain[bc.height()-1]))
            answers[getForger(stakeHolders, bc)] += 1
        }
        assert.isAbove(answers["a"], answers["b"])
        assert.isAbove(answers["b"], answers["d"])
        assert.isAbove(answers["d"], answers["c"])
    })

    it("returns same lists when given same data across multiple validators", () => {

        for(var i = 0; i<2000; i++){
            //let i represent a fake block here
            bc.addNewBlock(ForgedBlock._forgeBlock([i],db, bc.height(), bc.chain[bc.height()-1]))
            assert.deepEqual(getForger(stakeHolders, bc), getForger(stakeHolders, bc))
        }
    })
})

