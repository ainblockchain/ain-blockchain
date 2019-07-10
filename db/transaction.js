const ChainUtil = require('../chain-util')

class Transaction {

    constructor(timestamp, data, address, signature, nonce){
        this.id = ChainUtil.id()
        this.timestamp = timestamp
        this.output = data
        this.address = address
        this.signature = signature
        this.nonce = nonce
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
        var transaction =  new this(Date.now(), data, db.publicKey, db.sign(ChainUtil.hash(data)), db.nonce)
        db.nonce++
        return transaction
    } 
    
    static verifyTransaction(transaction) {
        if ((["SET", "INCREASE", "UPDATE", "BATCH"].indexOf(transaction.output.type) < 0)){
            console.log(`Invalid transaction type ${transaction.output.type}.`)
            return false 
        } 
        return ChainUtil.verifySignature(
            transaction.address, transaction.signature, ChainUtil.hash(transaction.output)
        )
    }
}

module.exports = Transaction