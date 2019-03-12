const ChainUtil = require('../chain-util')

class Transaction {

    constructor(timestamp, data, address, signature){
        this.id = ChainUtil.id()
        this.timestamp = timestamp
        this.output = data
        this.address = address
        this.signature = signature
    }

    toString(){
        return `${this.id},
                ${this.timestamp},
                ${this.output},
                ${this.address},
                ${this.signature}
                `
    }

    static newTransaction(db, data) {
        return new this(Date.now(), data, db.publicKey, db.sign(ChainUtil.hash(data)))
    } 
    
    static verifyTransaction(transaction) {
        return ChainUtil.verifySignature(
            transaction.address, transaction.signature, ChainUtil.hash(transaction.output)
        )
    }
}

module.exports = Transaction