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
}

module.exports = TransactionPool