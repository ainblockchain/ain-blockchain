const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const trackerWebSocket = new Websocket("ws://localhost:3001")
const HOST = process.env.HOST || "ws://localhost"
const {ForgedBlock} = require("../blockchain/block")
const SERVER = HOST + ":" + P2P_PORT
const {MESSAGE_TYPES} = require("../config")
const BlockGenRound = require("./block-gen-round.js")



class P2pServer {

    constructor(db, bc, tp, val){
        this.db = db
        this.blockchain = bc
        this.transactionPool = tp
        this.sockets = []
        this.votingRound = BlockGenRound.getGenesisRound()
        this.intervals = []
        this.val = val
    }

    connectTracker(){
 
        trackerWebSocket.on('message', message => {
            const peers = JSON.parse(message);
            this.connectToPeers(peers)
        });

        trackerWebSocket.send(JSON.stringify(SERVER))
    }
     
    listen(){
        const server = new Websocket.Server({port: P2P_PORT});
        server.on('connection', socket => this.connectSocket(socket));
        trackerWebSocket.on('open', () => this.connectTracker());
        console.log(`Listening for peer-to-peer connections on: ${P2P_PORT}`)
    }

    connectToPeers(peers) {
        peers.forEach(peer => {
            console.log(`Connecting to peer ${peer}`)
            const socket = new Websocket(peer);
            socket.on('open', () => this.connectSocket(socket));
        });
    }

    connectSocket(socket) {
        this.sockets.push(socket);
        this.messageHandler(socket);
        this.sendChain(socket)
    }

    messageHandler(socket){
        socket.on('message', (message) => {
            try{
                const data = JSON.parse(message);
                switch(data.type){
                        case MESSAGE_TYPES.chain:
                            if (this.blockchain.replaceChain(data.chain)){
                                this.db.createDatabase(this.blockchain)
                            }
                            break
                        case MESSAGE_TYPES.transaction:
                            if(data.transaction.output.type === "SET"){
                                this.db.set(data.transaction.output.ref, data.transaction.output.value, data.transaction.address)
                            } else if (data.transaction.output.type === "INCREASE"){
                                this.db.increase(data.transaction.output.diff, data.transaction.address)
                            }
                            this.transactionPool.addTransaction(data.transaction)
                            break
                        case MESSAGE_TYPES.clear_transactions:
                            // TODO: Add only transactions on blockchain cleared functionality
                            this.transactionPool.clear()
                            break
                        case MESSAGE_TYPES.proposed_block:
                            if (this.votingRound.height != this.blockchain.chain.length){
                                console.log(`Unprepared proposal height votingRoundHeight=${this.votingRound.height}, blockchainHeight=${this.blockchain.chain.length}`)
                            }
                            if (this.votingRound.newBlock === null){
                                var preVote = this.votingRound.validateAndAddBlock(data.block, this.blockchain)
                                this.votingRound.registerPreVote(this.db.publicKey, preVote)
                                this.broadcastPreVote(preVote)
                            }
                            break
                        case MESSAGE_TYPES.pre_vote:
                            this.votingRound.registerPreVote(data.address, data.preVote)
                            if (this.votingRound.havePreVotesBeenReceived()){
                                this.votingRound.registerPreCommit(this.db.publicKey, true)
                                this.broadcastPreCommit(true)
                            }
                            break
                        case MESSAGE_TYPES.pre_commit:
                            if (this.votingRound.status == "INCOMPLETE"){
                                this.votingRound.registerPreCommit(data.address, data.preCommit)
                                if (this.votingRound.havePreCommitsBeenReceived() && this.votingRound.newBlock != null){
                                    this.blockchain.addForgedBlock(this.votingRound)
                                    this.transactionPool.removeCommitedTransactions(this.votingRound.newBlock)
                                    this.votingRound.status = "SUCCESS"
                                    this.db.createDatabase(this.blockchain)
                                
                                }
                            }
                            break
                }
            } catch (error){
                console.log(error.stack)
            }
        })

        socket.on('close', () => {
            this.sockets.splice(this.sockets.indexOf(socket), 1)
        })
    }

    startNextIteration(){
        try {
            this.votingRound.startNextIteration()
            if (this.votingRound.status === "FAILURE"){
                this.intervals.forEach((interval) => {
                    clearInterval(interval)
                })
            } else {
                this.checkIfForger()
            }
        } catch (err){
            console.log(err.stack)
        }

    }

    sendChain(socket){
        socket.send(JSON.stringify({type: MESSAGE_TYPES.chain,  chain: this.blockchain.chain}));
    }

    syncChains() {
        this.sockets.forEach(socket => this.sendChain(socket));
    }

    broadcastTransaction(transaction){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.transaction, transaction})))
    }

    broadcastClearTransactions() {
        this.sockets.forEach(socket => socket.send(JSON.stringify({
            type: MESSAGE_TYPES.clear_transactions
        })))
    }

    startNewRound(){
        this.intervals.forEach((interval) => {
            clearInterval(interval)
        })
        this.intervals = []
        this.votingRound = this.votingRound.getNextRound(this.val)
        this.checkIfForger()
        while(Date.now() % 1000){}
        var iterationInterval = setInterval(() => {
            this.startNextIteration()
        }, 3000)
        this.intervals.push(iterationInterval)
        
    }

    checkIfForger(){
        console.log(`Designated forger is ${this.votingRound.validators[this.votingRound.iteration]}`)
        if (this.votingRound.status != "SUCCESS" && this.votingRound.validators[this.votingRound.iteration] === this.db.publicKey){
            console.log("Selected as designated forger")
            const block = ForgedBlock.forgeBlock(this.votingRound, this.transactionPool.validTransactions(), this.db)
            this.votingRound.validateAndAddBlock(block)
            this.votingRound.registerPreVote(this.publicKey, true)
            this.broadcastBlock(block)
        }
        
    }

    broadcastPreVote(preVote){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.pre_vote, address: this.db.publicKey, preVote})))
    }

    broadcastPreCommit(preCommit){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.pre_commit, address: this.db.publicKey, preCommit})))
    }

    broadcastBlock(block){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.proposed_block, block: block,  address: this.db.publicKey})))
    }
    
}

module.exports = P2pServer;