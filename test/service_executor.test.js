const DB = require('../db')
const TransactionPool = require("../db/transaction-pool")
const Blockchain = require('../blockchain')
const serviceExecutor = require("../service_executor")
const chai = require('chai');
const expect = chai.expect;
const assert = chai.assert;
const {RULES_FILE_PATH} = require('../config')

describe("Service Executor", () => {
    let db, bc, tp

    beforeEach(() => {
        tp = new TransactionPool()
        bc = new Blockchain("db-test")
        db = DB.getDatabase(bc, tp)
        se = new serviceExecutor(db, bc, tp)
    })

    it("loads services from services folder", () => {
        expect("test" in se.services).to.equal(true)
        expect("ai" in se.services["test"]).to.equal(true)
        
    })

    it("returns valid transactions when triggered", () => {
        const trans1 = db.createTransaction({type: "SET", ref: "/test/comcom/", value: 5}, tp)
        db.set(trans1.output.ref, trans1.output.value)
        const trans2 = se.executeTransactionFunction(trans1)
        expect(trans2.output.ref).to.equal("/test/ai")
    })

    it("returns valid transactions when triggered", () => {
        const trans1 = db.createTransaction({type: "SET", ref: "/test/comcom/", value: 5}, tp)
        db.set(trans1.output.ref, trans1.output.value)
        const trans2 = se.executeTransactionFunction(trans1)
        expect(trans2.output.ref).to.equal("/test/ai")
        expect(trans2.output.value).to.equal(10)
    })

    it("returns valid transaction when /test/comcom/ >= 5 ", () => {
        const trans1 = db.createTransaction({type: "SET", ref: "/test/comcom/", value: 5}, tp)
        db.set(trans1.output.ref, trans1.output.value)
        const trans2 = se.executeTransactionFunction(trans1)
        db.set(trans2.output.ref, trans2.output.value)
        const trans3 = se.executeTransactionFunction(trans2)
        expect(trans3.output.value).to.equal("HelloWorld")
    })

    it("returns null  when /test/comcom/ < 5 ", () => {
        const trans1 = db.createTransaction({type: "SET", ref: "/test/comcom/", value: 4}, tp)
        db.set(trans1.output.ref, trans1.output.value)
        const trans2 = se.executeTransactionFunction(trans1)
        db.set(trans2.output.ref, trans2.output.value)
        const trans3 = se.executeTransactionFunction(trans2)
        expect(trans3).to.equal(null)
    })


})

   