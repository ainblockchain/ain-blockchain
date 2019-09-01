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

    it('assigns nonces correctly', () => { 
        let t;
        for(var currentNonce = db.nonce -1; currentNonce < 50; currentNonce++){
            t = Transaction.newTransaction(db, data)
        }
        expect(t.nonce).to.equal(currentNonce)
    })
    

    it('validates a valid transaction', () => {
        expect(Transaction.verifyTransaction(transaction)).to.equal(true)
    })

    it('invalidate an invalid transaction', () => {
        transaction.operation.ref = "DIFFERENT_KEY"
        expect(Transaction.verifyTransaction(transaction)).to.equal(false)
    });

});


