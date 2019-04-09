const Blockchain = require('../blockchain/index')
const DB = require('../db/index')
const TransactionPool = require("../db/transaction-pool")
const {ForgedBlock} = require('../blockchain/block')
const {getForger} = require('../server/validator')
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const rimraf = require("rimraf")
const {BLOCKCHAINS_DIR} = require('../config') 



describe("Validator", () => {
    let stakeHolders, bc, db, tp

    beforeEach(() => {
       
        bc = new Blockchain("db-test")
        tp = new TransactionPool()
        db = DB.getDatabase(bc, tp)
        stakeHolders = {"a": 1000, "b": 500, "c": 100, "d":250}
         
    })

    after(() => {
        rimraf.sync(BLOCKCHAINS_DIR)
      });

    it("puts the weight with highest stake as first validator in most cases", () => {
        answers = {"a": 0, "b": 0, "c":0, "d":0}
        for(var i = 0; i<1700; i++){
            //let i represent a fake block here
            db.createTransaction({type: "SET", ref: "test/something", value: "val"}, tp)
            var block = ForgedBlock.forgeBlock(tp.validTransactions(), db, bc.height() + 1, bc.lastBlock())
            bc.addNewBlock(block)
            tp.removeCommitedTransactions(block)
            answers[getForger(stakeHolders, bc)] += 1
        }
        assert.isAbove(answers["a"], answers["b"])
        assert.isAbove(answers["b"], answers["d"])
        assert.isAbove(answers["d"], answers["c"])
    })

    it("returns same lists when given same data across multiple validators", () => {

        for(var i = 0; i<2000; i++){
            //let i represent a fake block here
            db.createTransaction({type: "SET", ref: "test/something", value: "val"}, tp)
            var block = ForgedBlock.forgeBlock(tp.validTransactions(), db, bc.height() + 1, bc.lastBlock())
            bc.addNewBlock(block)
            tp.removeCommitedTransactions(block)
            assert.deepEqual(getForger(stakeHolders, bc), getForger(stakeHolders, bc))
        }
    })
})

