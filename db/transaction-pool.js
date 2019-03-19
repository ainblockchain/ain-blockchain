const Transaction = require("./transaction")

class TransactionPool {
    constructor() {
        this.transactions = []
        this.lastTimestamp = 0
    }

    addTransaction(transaction) {
        this.transactions.push(transaction)
        if (transaction.timestamp >= this.lastTimestamp){
            this.lastTimestamp = transaction.timestamp
        } else {
            this.transactions = this.transactions.sort(function(a, b) {
                return a.timestamp - b.timestamp  
            })
        }
    }

    clear() {
        this.transactions = []
    }

    validTransactions(){
        // Method now removes invalid transactions befroe returning valid ones ! This is too 
        let lastTime = 0
        this.transactions = this.transactions.filter(transaction => {
            if (!(["SET", "INCREASE", "UPDATE", "BATCH"].indexOf(transaction.output.type) > -1)){
                console.log(`Invalid transaction type ${transaction.output.type}.`)
                return
            }
            
            if (!Transaction.verifyTransaction(transaction)){
                console.log(`Invalid signature from ${transaction.address}.`)
                return
            }
            if (transaction.timestamp < lastTime){
                throw Error("Transactions are not being ordered correctly")
            }
            lastTime = transaction.timestamp
            return transaction
        })

        return JSON.parse(JSON.stringify(this.transactions))
    }

    removeCommitedTransactions(block){
        // Remove transactions of newly added block to blockchain from the current transactin pool 
        var transactionIds = block.data.map(transaction => transaction.id)
        this.transactions = this.transactions.filter(transaction => {
            if (transactionIds.indexOf(transaction.id) > -1){
                return 
            }
            return transaction
        })
    }
}

module.exports = TransactionPool