const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const ip = require("ip")
const trackerWebSocketAddr =  process.env.TRACKER_IP || "ws://localhost:3001"
const trackerWebSocket = new Websocket(trackerWebSocketAddr)
const HOST = "ws://" + ip.address()
const {ForgedBlock} = require("../blockchain/block")
const SERVER = HOST + ":" + P2P_PORT
const {MESSAGE_TYPES} = require("../config")
const {
    checkPreVotes,
    preVote,
    preCommit,
    checkPreCommits,
    startNewRound,
    instantiate,
    checkIfFirstNode,
    registerForNextRound
} =  require('./blockchain-voting-interface')
const WAIT_TIME_FOR_STAKING = 20000



class P2pServer {

    constructor(db, bc, tp){
        this.db = db
        this.blockchain = bc
        this.transactionPool = tp
        this.sockets = []
        this.stake = null
        this.votingInterval = null
        this.votingHelper = new VotingHelper()
        this.reconstruct = false
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

                if ("transaction" in data){
                    this.executeTransaction(data.transaction)
                }
                switch(data.type){
                    case MESSAGE_TYPES.chain:
                        if (this.blockchain.replaceChain(data.chain)){
                            this.db.reconstruct(this.blockchain, this.transactionPool)
                        }
                        break
                    case MESSAGE_TYPES.clear_transactions:
                        // TODO: Add only transactions on blockchain cleared functionality
                        this.transactionPool.clear()
                        break
                    case MESSAGE_TYPES.new_voting:
                        if ([VOTING_STAGE.COMMITTED, VOTING_STAGE.NEW].indexOf(this.votingHelper.votingStage) < 0){
                            this.requestSync()
                        }
                        this.votingHelper = new VotingHelper()
                        if (this.stake){
                            // Need to implement this method 
                            this.broadcastTransaction(registerForNextRound(this.blockchain.height() + 1, this.db, this.transactionPool))
                            this.checkIfForger()
                        }
                        break
                    case MESSAGE_TYPES.proposed_block:
                        if (!this.validateBlock(data.block) || !(this.votingHelper.votingStage === VOTING_STAGE.WAITING_FOR_BLOCK)){
                            break
                        }
                        this.votingHelper.votingStage = VOTING_STAGE.BLOCK_RECEIVED
                        this.votingHelper.votingBlock = data.block
                        if(this.db.get(`_voting/validators/${this.db.publicKey}`)){
                            this.votingHelper.votingStage = VOTING_STAGE.PRE_VOTE
                            this.broadcastPreVote(preVote(this.db, this.transactionPool, this.votingHelper))
                        }
                    case MESSAGE_TYPES.pre_vote:
                        if (!checkPreVotes(this.db)){
                            break
                        } 
                        if (this.votingHelper.votingStage === VOTING_STAGE.PRE_VOTE){
                            this.votingHelper.votingStage = VOTING_STAGE.PRE_COMMIT
                            this.broadcastPreCommit(preCommit(this.db, this.transactionPool))
                        }

                    case MESSAGE_TYPES.pre_commit:
                        if (checkPreCommits(this.db) && (!(this.votingHelper.votingStage === VOTING_STAGE.COMMITTED))){
                            this.addBlockToChain()
                            this.votingHelper.votingStage = VOTING_STAGE.COMMITTED                            
                            this.cleanupAfterVotingRound()
                        }                       
                        break
                    case MESSAGE_TYPES.request_block:
                        if (this.db.get("_voting/forger") === this.db.publicKey){
                            this.sendRequestedBlock()
                        }
                        break
                    case MESSAGE_TYPES.requested_block:
                        if ((this.votingHelper.votingStage === VOTING_STAGE.WAITING_FOR_BLOCK) || (this.votingHelper.votingStage === VOTING_STAGE.NEW)){
                            this.votingHelper.votingBlock = data.block
                            this.addBlockToChain()
                            this.votingHelper.votingStage = VOTING_STAGE.COMMITTED                            
                            this.cleanupAfterVotingRound()
                        }
                        break
                    case MESSAGE_TYPES.request_sync:
                        console.log("Syncing request received")
                        this.syncChains()
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

    validateBlock(block){
        var validity = block.height == (this.blockchain.height() + 1)
        console.log(`Validity of block is ${validity}`)
        return validity
    }

    executeTransaction(transaction){
        this.db.execute(transaction.output, transaction.address)
        this.transactionPool.addTransaction(transaction)
    }

    forgeBlock(){
        var data = this.transactionPool.validTransactions()
        var blockHeight = this.blockchain.height() + 1
        this.votingHelper = new VotingHelper()
        this.votingHelper.votingBlock =  ForgedBlock._forgeBlock(data, this.db, blockHeight, this.blockchain.chain[this.blockchain.height()])
        var ref = "_voting/blockHash"
        var value = this.votingHelper.votingBlock.hash
        console.log(`Forged block with hash ${this.votingHelper.votingBlock.hash} at height ${blockHeight}`)
        this.db.set(ref, value)
        this.broadcastTransaction(this.db.createTransaction({type: "SET", ref, value}, this.transactionPool))
        this.broadcastBlock()
        if (!Object.keys(this.db.get("_voting/validators")).length){
            console.log("No validators registered for this round")
            this.addBlockToChain()
            this.votingHelper.votingStage == VOTING_STAGE.COMMITTED                            
            this.cleanupAfterVotingRound()
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
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.clear_transactions})))
    }

    requestBlock(){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.request_block, address: this.db.publicKey})))
    }

    broadcastPreVote(transaction){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.pre_vote, address: this.db.publicKey, transaction,  height: this.blockchain.height() + 1})))
    }

    broadcastPreCommit(transaction){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.pre_commit, address: this.db.publicKey, transaction, height: this.blockchain.height() + 1})))
    }

    broadcastNewRound(transaction){
        console.log(`Starting new round ${this.db.publicKey}`)
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.new_voting, address: this.db.publicKey, transaction})))
    }

    broadcastBlock(){
        console.log(`Broadcasting new block ${this.votingHelper.votingBlock.hash}`)
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.proposed_block, block: this.votingHelper.votingBlock,  address: this.db.publicKey})))
    }


    sendRequestedBlock(){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.requested_block,  block: this.votingHelper.votingBlock, address: this.db.publicKey})))
    }

    requestSync(){
        console.log("Requesting sync")
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.request_sync})))
    }

    registerStakeWithNetwork(stake){
        if (checkIfFirstNode(this.db)){
            this.stakeAmount(stake)
            instantiate(this.db, this.blockchain.chain[0], this.transactionPool)
            this.forgeBlock()
        } else{
            this.votingHelper = new VotingHelper()
            this.votingHelper.votingStage = VOTING_STAGE.NEW
            setTimeout(() => {
                console.log("Now setting stake")
                this.stakeAmount(stake)
            }, WAIT_TIME_FOR_STAKING)
        }
    }

    
    addBlockToChain(){
        this.blockchain.addNewBlock(this.votingHelper.votingBlock)
        this.transactionPool.removeCommitedTransactions(this.votingHelper.votingBlock)
        this.db.reconstruct(this.blockchain, this.transactionPool)
    }

    cleanupAfterVotingRound(){
        if (this.votingInterval){
            console.log("Clearing interval after successful voting round")
            clearInterval(this.votingInterval)
            this.votingInterval = null
        }
        if (this.db.db._voting.forger === this.db.publicKey){
            console.log("Setting interval now for future")
                // this.broadcastNewRound(startNewRound(this.db, this.transactionPool))
                // this.broadcastTransaction(this.registerForNextRound(this.blockchain.height(), this.db, this.transactionPool))
            this.votingInterval = setInterval(()=> {
                this.broadcastNewRound(startNewRound(this.db, this.transactionPool, this.blockchain))  
                this.votingHelper = new VotingHelper()
                this.broadcastTransaction(registerForNextRound(this.blockchain.height() + 1, this.db, this.transactionPool))
                this.checkIfForger()

                }, 10000)
        }
        console.log(`New blockchain height is ${this.blockchain.height() + 1}`)

    }

    
    checkIfForger(){
        if (this.db.get("_voting/forger") === this.db.publicKey){
            this.forgeBlock()
        }
    }

    async stakeAmount(stakeAmount){
        stakeAmount = Number(stakeAmount)
        this.stake = stakeAmount
        var result = this.db.stake(stakeAmount)
        console.log(`Successfully staked ${stakeAmount}`)
        let transaction = this.db.createTransaction({type: "SET", ref: ["stakes", this.db.publicKey].join("/"), value: stakeAmount}, this.transactionPool)
        this.broadcastTransaction(transaction)
        return result
      }
}


const VOTING_STAGE = {
    WAITING_FOR_BLOCK: "wait_for_block",
    BLOCK_RECEIVED: "block_received",
    PRE_VOTE: "pre_vote",
    PRE_COMMIT: "pre_commit",
    COMMITTED: "committed",
    NEW: "new"
}

class VotingHelper{

    constructor(){
        this.votingBlock = null
        this.votingStage = VOTING_STAGE.WAITING_FOR_BLOCK
    }
}

module.exports = P2pServer;