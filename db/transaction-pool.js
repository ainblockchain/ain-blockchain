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
        // Method now removes invalid transactions befroe returning valid ones ! This is too 
        this.transactions = this.transactions.filter(transaction => {

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
        return this.transactions
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