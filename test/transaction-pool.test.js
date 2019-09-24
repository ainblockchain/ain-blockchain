const TransactionPool = require('../db/transaction-pool')
const Transaction = require('../db/transaction')
const Blockchain = require('../blockchain/');
const {ForgedBlock} = require('../blockchain/block')
const DB = require('../db')
const chai = require('chai')
const expect = chai.expect
const assert = chai.assert
const shuffleSeed = require('shuffle-seed')

describe('TransactionPool', () => {
    let tp, db, bc, transaction;

    beforeEach(() => {
        tp = new TransactionPool();
        bc = new Blockchain('test-blockchain');
        db = new DB(bc);
        transaction = Transaction.newTransaction(db, {type: "SET_VALUE", ref: "REF", value:"VALUE"})
        tp.addTransaction(transaction)
    });

    it('adds a transaction to the pool', () => {
        expect(tp.transactions[db.publicKey].find(t => t.hash === transaction.hash)).to.equal(transaction)
    });


    describe('sorting transactions by nonces', () => {
        let db2, db3, db4;


        beforeEach(() => {
            
            for(let i=0; i<10; i++){
                t = Transaction.newTransaction(db, {
                    type: "SET_VALUE",
                    ref: "REF",
                    value:"VALUE"
                });
                tp.addTransaction(t);
            }
            tp.transactions[db.publicKey] = shuffleSeed.shuffle(tp.transactions[db.publicKey]) 

            db2 = new DB(bc);
            db3 = new DB(bc);
            db4 = new DB(bc);
            var dbs = [db2, db3, db4]
            for(var j=0; j < dbs.length; j++){
                for(let i=0; i<11; i++){
                    t = Transaction.newTransaction(dbs[j], {
                        type: "SET_VALUE",
                        ref: "REF",
                        value:"VALUE"
                    }, true);
                    tp.addTransaction(t);
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
                newTransactions[db.publicKey].push(Transaction.newTransaction(db, {
                    type: "SET_VALUE",
                    ref: "REF",
                    value:"VALUE"
                }));
                tp.addTransaction(newTransactions[db.publicKey][i]);
            }
            tp.removeCommitedTransactions(block);
            assert.deepEqual(newTransactions, tp.transactions);
        })
    })
});
