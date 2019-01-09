class Miner {
    constructor(blockchain, transactionPool, p2pServer) {
        this.blockchain = blockchain
        this.transactionPool = transactionPool
        this.p2pServer = p2pServer
    }

    mine() {
        const block = this.blockchain.addBlock(this.transactionPool.transactions)
        this.p2pServer.syncChains()
        this.transactionPool.clear()
        this.p2pServer.broadcastClearTransactions()
        return block
    }
}

module.exports = Miner
