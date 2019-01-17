const Transaction = require('../db/transaction')
const DB = require('../db/')
const chai = require('chai')
const expect = chai.expect
const assert = chai.assert




describe('Transaction', () => {
    let transaction, data, db

    beforeEach(() => {
        db = new DB("test-db")
        data = {type: "SET", ref: "KEY", value: "val"}
        transaction = Transaction.newTransaction(db, data)
    });

    it('validates a valid transaction', () => {
        expect(Transaction.verifyTransaction(transaction)).to.equal(true)
    })

    it('invalidate an invalid transaction', () => {
        transaction.output.ref = "DIFFERENT_KEY"
        expect(Transaction.verifyTransaction(transaction)).to.equal(false)
    });

});


