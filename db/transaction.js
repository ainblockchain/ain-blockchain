const ChainUtil = require('../chain-util')
const TRANSACTION_INSERT_COMMAND = 'INSERT INTO transactions(index, input, nonce, s, block_hash, block_height, created_on) VALUES($1, $2, $3, $4, $5, $6, $7)'

class Transaction {

    constructor(timestamp, data, address, signature, nonce, stringTimestamp){
        this.id = ChainUtil.id()
        this.timestamp = timestamp
        this.output = data
        this.address = address
        this.signature = signature
        this.nonce = nonce
        this.stringTimestamp = stringTimestamp
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
        var transaction =  new this(Date.now(), data, db.publicKey, db.sign(ChainUtil.hash(data)), db.nonce, new Date())
        db.nonce++
        return transaction
    } 
    
    static writeToPostgres(client, data, index, blockHash, blockHeight){
        const values = [index, Buffer.from(JSON.stringify(data.output), 'utf8').toString('hex'), data.nonce, data.address, blockHash, blockHeight, data.stringTimestamp]
        client.query(TRANSACTION_INSERT_COMMAND, values, (err, res) => {
            if (err) {
              console.log(err.stack)
            } 
        })
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