const TransactionPool = require('../db/transaction-pool')
const {ForgedBlock} = require('../blockchain/block')
const DB = require('../db')
const BlockGenRound = require('../server/block-gen-round')
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
            for(let i=0; i<100; i++){
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

        it('removes invalid transactions after grabbing valid transactions', () => {
            tp.validTransactions()
            assert.deepEqual(tp.transactions, validTransactions)
        })

        it('removes transactions included in block', () => {
            tp.validTransactions()
            var blockGenRound = new BlockGenRound(1 , BlockGenRound.getGenesisRound())
            var block = ForgedBlock.forgeBlock(blockGenRound, validTransactions.splice(20, validTransactions.length), db)
            tp.removeCommitedTransactions(block)
            assert.deepEqual(validTransactions, tp.transactions)
        })
    })
});
