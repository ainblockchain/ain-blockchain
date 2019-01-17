const Transaction = require("./transaction")

class TransactionPool {
    constructor() {
        this.transactions = []
    }

    addTransaction(transaction) {
        this.transactions.push(transaction)
    }

    clear() {
        this.transactions = []
    }

    validTransactions(){
        return this.transactions.filter(transaction => {

            if (!(["SET", "INCREASE"].indexOf(transaction.output.type) > -1)){
                console.log(`Invalid transaction type ${transaction.output.type}.`)
                return
            }
            
            if (!Transaction.verifyTransaction(transaction)){
                console.log(`Invalid signature from ${transaction.address}.`)
                return
            }
            return transaction
        })
    }
}

module.exports = TransactionPool