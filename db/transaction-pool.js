const Transaction = require("./transaction")

class TransactionPool {
    constructor() {

        // MUST IMPLEMENT WAY TO RESET NONCE WHEN TRANSACTION IS LOST IN
        // NETWORK  
        this.transactions = {}
        this.nonceTracker = {}
    }

    addTransaction(transaction, verify=true) {
        // Quick verification of transaction on entry
        if(this.isAlreadyAdded(transaction)){
            //console.log("Transaction already received")
            return false
        }

        if ( verify && (!Transaction.verifyTransaction(transaction))){
            console.log("Invalid transaction")
            return false
        }
        if (!(transaction.address in this.transactions)){
            this.transactions[transaction.address] = []
        } 
        this.transactions[transaction.address].push(transaction)

        return true
    }

    clear() {
        this.transactions = {}
    }
    
    isAlreadyAdded(transaction){
        return Boolean((transaction.address in this.transactions) && this.transactions[transaction.address].find(trans => trans.id === transaction.id)) || Boolean(transaction.nonce <= this.nonceTracker[transaction.address])
    }

    validTransactions(){
        // Transactions are first ordered by nonce in their individual lists by publicKey
        const unvalidatedTransactions =  JSON.parse(JSON.stringify(this.transactions))
        for (var address in unvalidatedTransactions){
            unvalidatedTransactions[address].sort((a,b) => (a.nonce > b.nonce) ? 1 : ((b.nonce > a.nonce) ? -1 : 0))
        }
        // Secondly transaction are combined and ordered by timestamp, while still remaining ordered noncing from the initial sort by nonce
        let orderedUnvalidatedTransactions = Object.values(unvalidatedTransactions)
        while (orderedUnvalidatedTransactions.length > 1){
            var tempNonceTracker = JSON.parse(JSON.stringify(this.nonceTracker))
            var list1 = orderedUnvalidatedTransactions.shift()
            var list2 = orderedUnvalidatedTransactions.shift()
            var newList = []
            let listToTakeValue
            while (list1.length + list2.length > 0){
                if ((list2.length == 0 || (list1.length > 0 && list1[0].timestamp <= list2[0].timestamp))){
                    listToTakeValue = list1
                } else{
                    listToTakeValue = list2
                }
                if (listToTakeValue[0].nonce === tempNonceTracker[listToTakeValue[0].address] + 1){
                    tempNonceTracker[listToTakeValue[0].address] = listToTakeValue[0].nonce
                    newList.push(listToTakeValue.shift())
                } else if (!(listToTakeValue[0].address in tempNonceTracker) && listToTakeValue[0].nonce === 0){
                    tempNonceTracker[listToTakeValue[0].address] = 0
                    newList.push(listToTakeValue.shift())
                } else {
                    listToTakeValue.length = 0
                }
            }

            orderedUnvalidatedTransactions.push(newList)
        }
        return orderedUnvalidatedTransactions.length > 0 ?  orderedUnvalidatedTransactions[0]: []
         
    }

    removeCommitedTransactions(block){
        // Remove transactions of newly added block to blockchain from the current transaction pool 
        var transactionIds = block.data.map(transaction => {

            // Update nonceTracker while extracting transactionIds
            this.nonceTracker[transaction.address] = transaction.nonce
            return transaction.id
        })

        for (var address in this.transactions){
            this.transactions[address] =  this.transactions[address].filter(transaction => {
                if (transactionIds.indexOf(transaction.id) < 0){
                    return transaction
                } 
            })

           if (this.transactions[address].length === 0){
               delete this.transactions[address] 
           }
        }
    }
}

module.exports = TransactionPool