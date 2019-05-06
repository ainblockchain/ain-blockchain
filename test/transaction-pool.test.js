const TransactionPool = require('../db/transaction-pool')
const {ForgedBlock} = require('../blockchain/block')
const DB = require('../db')
const chai = require('chai')
const expect = chai.expect
const assert = chai.assert
const shuffleSeed = require('shuffle-seed')

describe('TransactionPool', () => {
    let tp, db, transaction;

    beforeEach(() => {
        tp = new TransactionPool()
        db = new DB("test-db")
        transaction = db.createTransaction({type: "SET", ref: "REF", value:"VALUE"}, tp)
    });

    it('adds a transaction to the pool', () => {
        expect(tp.transactions[db.publicKey].find(t => t.id === transaction.id)).to.equal(transaction)
    });


    it('clears transactions', () => {
        tp.clear()
        assert.deepEqual(tp.transactions, {})
    })


    describe('sorting transactions by nonces', () => {
        let db2, db3, db4


        beforeEach(() => {
            
            for(let i=0; i<10; i++){
                db.createTransaction({type: "SET", ref: "REF", value:"VALUE"}, tp)
            }
            tp.transactions[db.publicKey] = shuffleSeed.shuffle(tp.transactions[db.publicKey]) 

            db2 = new DB("test-db2")
            db3 = new DB("test-db3")
            db4 = new DB("test-db4")
            var dbs = [db2, db3, db4]
            for(var j=0; j < dbs.length; j++){
                for(let i=0; i<11; i++){
                    dbs[j].createTransaction({type: "SET", ref: "REF", value:"VALUE"}, tp)
                }
                tp.transactions[dbs[j].publicKey] = shuffleSeed.shuffle(tp.transactions[dbs[j].publicKey]) 
            }

            // Shuffle transactions and see if the transaction-pool can re-sort them according to them according to their proper ordering
            
        })


        it('transactions are correctly numbered', () => {
            var sortedNonces1 = tp.validTransactions().filter(transaction => {if (transaction.address === db.publicKey) return transaction}).map(transaction => {return transaction.nonce})
            var sortedNonces2 = tp.validTransactions().filter(transaction => {if (transaction.address === db2.publicKey) return transaction}).map(transaction => {return transaction.nonce})
            var sortedNonces3 = tp.validTransactions().filter(transaction => {if (transaction.address === db3.publicKey) return transaction}).map(transaction => {return transaction.nonce})
            var sortedNonces4 = tp.validTransactions().filter(transaction => {if (transaction.address === db4.publicKey) return transaction}).map(transaction => {return transaction.nonce})
            assert.deepEqual(sortedNonces1, [...Array(11).keys()])
            assert.deepEqual(sortedNonces2, [...Array(11).keys()])
            assert.deepEqual(sortedNonces3, [...Array(11).keys()])
            assert.deepEqual(sortedNonces4, [...Array(11).keys()])

        })



        it('removes transactions included in block', () => {
            var height = 1
            var block = ForgedBlock.forgeBlock(tp.validTransactions(), db, height, ForgedBlock.genesis())
            var newTransactions = {}
            newTransactions[db.publicKey] = []
            for(let i=0; i<10; i++){
                newTransactions[db.publicKey].push(db.createTransaction({type: "SET", ref: "REF", value:"VALUE"}, tp))
            }
            tp.removeCommitedTransactions(block)
            assert.deepEqual(newTransactions, tp.transactions)
        })
    })
});
