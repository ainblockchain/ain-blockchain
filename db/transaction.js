const ChainUtil = require('../chain-util')

class Transaction {

    constructor(){
        this.id = ChainUtil.id()
        this.input = null
        this.output = null
    }

    static newTransaction(db, data) {
        const transaction = new this()
        transaction.output = data
        Transaction.signTransaction(transaction, db)
        return transaction
    } 

    static  signTransaction(transaction, db){
        transaction.input = {
            timestamp: Date.now(),
            address:  db.publicKey,
            signature: db.sign(ChainUtil.hash(transaction.output))
        }
    }
    
    static verifyTransaction(transaction) {
        return ChainUtil.verifySignature(
            transaction.input.address, transaction.input.signature, ChainUtil.hash(transaction.output)
        )
    }
}

module.exports = Transaction