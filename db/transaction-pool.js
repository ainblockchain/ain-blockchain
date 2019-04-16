const Transaction = require("./transaction")

class TransactionPool {
    constructor() {
        this.transactions = []
        this.lastTimestamp = 0
        this.nonceTracker = {}
    }

    addTransaction(transaction, verify=true) {
        // Quick verification of transaction on entry
        if (verify && !Transaction.verifyTransaction(transaction)){
            console.log("Invalid transaction")
            return
        }
        this.transactions.push(transaction)
        // Sort by timestamps
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
        // Method now removes invalid transactions before returning valid ones. 
        const tempNonceTracker = Object.assign({}, this.nonceTracker)
        const validatedTransactions = []
        const unvalidatedTransactions = JSON.parse(JSON.stringify(this.transactions))

        let lastValidatedNumber = validatedTransactions.length

        // Code here reiterates over transactions until they are processed in such a way that they are ordered by nonce, 
        // TODO: Make this much more efficient !!!!
        do{
            lastValidatedNumber = validatedTransactions.length
            unvalidatedTransactions.filter((transaction) => {
                if (!(transaction.address in tempNonceTracker)){
                    tempNonceTracker[transaction.address] = -1
                }
                if (tempNonceTracker[transaction.address] === (transaction.nonce - 1)){
                    validatedTransactions.push(transaction)
                    tempNonceTracker[transaction.address] = transaction.nonce
                } else{
                    return transaction
                }
                   
            })

        } while(lastValidatedNumber !== validatedTransactions.length)

        return validatedTransactions
    }

    removeCommitedTransactions(block){
        // Remove transactions of newly added block to blockchain from the current transaction pool 
        var transactionIds = block.data.map(transaction => {

            // Update nonceTracker while extracting transactionIds
            this.nonceTracker[transaction.address] = transaction.nonce
            return transaction.id
        })

        this.transactions = this.transactions.filter(transaction => {
            if (transactionIds.indexOf(transaction.id) < 0){
                return transaction
            }
        })
    }
}

module.exports = TransactionPool