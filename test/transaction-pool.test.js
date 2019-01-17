const TransactionPool = require('../db/transaction-pool')
const DB = require('../db')
const chai = require('chai')
const expect = chai.expect
const assert = chai.assert

describe('TransactionPool', () => {
    let tp, db, transaction;

    beforeEach(() => {
        tp = new TransactionPool()
        db = new DB("test-db")
        transaction = db.createTransaction({type: "SET", ref: "REF", value:"VALUE"}, tp)
    });

    it('adds a transaction to the pool', () => {
        expect(tp.transactions.find(t => t.id === transaction.id)).to.equal(transaction)
    });


    it('clears transactions', () => {
        tp.clear()
        assert.deepEqual(tp.transactions, [])
    })

    describe('mixing valid and corrupt transations', () => {
        let validTransactions

        beforeEach(() => {
            validTransactions = [...tp.transactions]
            for(let i=0; i<6; i++){
                db = new DB("test-db")
                transaction = db.createTransaction({type: "SET", ref: "REF", value:"VALUE"}, tp)
                if(i%2){
                    transaction.output.type = "SOMETHING_ELSE"
                } else {
                    validTransactions.push(transaction)
                }
            }
        
        })
        it('shows a difference between valid and corrupt transactions', () => {
            expect(JSON.stringify(tp.transactions)).not.to.equal(JSON.stringify(validTransactions))
        })

        it('grabs valid transactions', () => {
            assert.deepEqual(tp.validTransactions(), validTransactions)
        })
    })
});
