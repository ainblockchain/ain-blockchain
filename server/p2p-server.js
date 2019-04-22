const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const ip = require("ip")
const trackerWebSocketAddr =  process.env.TRACKER_IP || "ws://localhost:3001"
const trackerWebSocket = new Websocket(trackerWebSocketAddr)
const HOST = "ws://" + ip.address()
const {ForgedBlock} = require("../blockchain/block")
const SERVER = HOST + ":" + P2P_PORT
const {MESSAGE_TYPES, VOTING_STATUS} = require("../config")
const VotingUtil =  require('./voting-util')
const WAIT_TIME_FOR_STAKING = 20000



class P2pServer {

    constructor(db, bc, tp){
        this.db = db
        this.blockchain = bc
        this.transactionPool = tp
        this.sockets = []
        this.stake = null
        this.votingInterval = null
        this.votingUtil = new VotingUtil(db)
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
        this.requestChainSubsection(this.blockchain.lastBlock())
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
        const chainSubsection =  this.requestChainSubsection(this.blockchain.lastBlock())
        if(chainSubsection){
            this.sendChainSubsection(socket, chainSubsection)
        }
    }

    messageHandler(socket){
        socket.on('message', (message) => {
            try{
                const data = JSON.parse(message);

                if ("transaction" in data){
                    this.executeTransaction(data.transaction)
                }
                switch(data.type){
                    case MESSAGE_TYPES.new_voting:
                        if (!this.votingUtil.isSyncedWithNetwork(this.blockchain)){
                            this.requestChainSubsection(this.blockchain.lastBlock())
                        }
                        if (this.stake){
                            this.broadcastTransaction(this.votingUtil.registerForNextRound(this.blockchain.height() + 1, this.transactionPool))
                        }
                        this.checkIfForger()
                        break
                    case MESSAGE_TYPES.proposed_block:
                        if (!ForgedBlock.validateBlock(data.block, this.blockchain) || !(this.votingUtil.status === VOTING_STATUS.WAITING_FOR_BLOCK || this.votingUtil.status === VOTING_STATUS.SYNCING)){
                            break
                        }
                        this.votingUtil.setBlock(data.block)
                        if(this.votingUtil.isValidator()){
                            this.broadcastPreVote(this.votingUtil.preVote(this.transactionPool))
                        }
                    case MESSAGE_TYPES.pre_vote:
                        if (!this.votingUtil.checkPreVotes()){
                            break
                        } 
                        this.broadcastPreCommit(this.votingUtil.preCommit(this.transactionPool))
                    case MESSAGE_TYPES.pre_commit:
                        if (this.votingUtil.isCommit()){
                            this.addBlockToChain()
                            this.cleanupAfterVotingRound()
                        }                       
                        break
                    case MESSAGE_TYPES.chain_subsection:
                        if(this.blockchain.merge(data.chainSubsection)){
                            this.db.reconstruct(this.blockchain, this.transactionPool)
                            this.requestChainSubsection(this.blockchain.lastBlock())
                        }
                        break
                    case MESSAGE_TYPES.chain_subsection_request:
                        const chainSubsection = this.blockchain.requestBlockchainSection(data.lastBlock)
                        if(chainSubsection){
                            this.broadcastChainSubsection(chainSubsection)
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

    executeTransaction(transaction){
        this.db.execute(transaction.output, transaction.address)
        this.transactionPool.addTransaction(transaction)
    }

    forgeBlock(){
        var data = this.transactionPool.validTransactions()
        var blockHeight = this.blockchain.height() + 1
        this.votingUtil.setBlock(ForgedBlock.forgeBlock(data, this.db, blockHeight, this.blockchain.lastBlock()))
        var ref = "_voting/blockHash"
        var value = this.votingUtil.block.hash
        console.log(`Forged block with hash ${this.votingUtil.block.hash} at height ${blockHeight}`)
        this.db.set(ref, value)
        this.broadcastTransaction(this.db.createTransaction({type: "SET", ref, value}, this.transactionPool))
        this.broadcastBlock()
        if (!Object.keys(this.db.get("_voting/validators")).length){
            console.log("No validators registered for this round")
            this.addBlockToChain()                         
            this.cleanupAfterVotingRound()
        }
    }

    sendChainSubsection(socket, chainSubsection){
        socket.send(JSON.stringify({type: MESSAGE_TYPES.chain_subsection, chainSubsection}))
    }

    requestChainSubsection(lastBlock){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.chain_subsection_request, lastBlock})))
    }

    broadcastChainSubsection(chainSubsection){
        this.sockets.forEach(socket => this.sendChainSubsection(socket, chainSubsection))
    }

    broadcastTransaction(transaction){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.transaction, transaction})))
    }

    broadcastPreVote(transaction){
        if (transaction === null){
            return
        }
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.pre_vote, address: this.db.publicKey, transaction,  height: this.blockchain.height() + 1})))
    }

    broadcastPreCommit(transaction){
        if (transaction === null){
            return
        }
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.pre_commit, address: this.db.publicKey, transaction, height: this.blockchain.height() + 1})))
    }

    broadcastNewRound(transaction){
        console.log(`Starting new round ${this.db.publicKey}`)
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.new_voting, address: this.db.publicKey, transaction})))
    }

    broadcastBlock(){
        console.log(`Broadcasting new block ${this.votingUtil.block.hash}`)
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.proposed_block, block: this.votingUtil.block,  address: this.db.publicKey})))
    }

    sendRequestedBlock(){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.requested_block,  block: this.votingUtil.block, address: this.db.publicKey})))
    }

    registerStakeWithNetwork(stake){

        if (this.votingUtil.checkIfFirstNode()){
            this.stakeAmount(stake)
            this.votingUtil.instantiate(this.blockchain.chain[0], this.transactionPool)
            this.forgeBlock()
        } else{
            setTimeout(() => {
                console.log("Now setting stake")
                this.stakeAmount(stake)
            }, WAIT_TIME_FOR_STAKING)
        }
    }

    addBlockToChain(){
        this.blockchain.addNewBlock(this.votingUtil.block)
        this.transactionPool.removeCommitedTransactions(this.votingUtil.block)
        this.votingUtil.reset()
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
                this.broadcastNewRound(this.votingUtil.startNewRound(this.transactionPool, this.blockchain))  
                this.broadcastTransaction(this.votingUtil.registerForNextRound(this.blockchain.height() + 1, this.transactionPool))
                this.checkIfForger()

                }, 10000)
        }
        console.log(`New blockchain height is ${this.blockchain.height() + 1}`)

    }

    
    checkIfForger(){
        if (this.votingUtil.isForger()){
            this.forgeBlock()
        }
    }

    async stakeAmount(stakeAmount){
        this.stake = Number(stakeAmount)
        var transaction = this.votingUtil.stake(this.stake, this.transactionPool)
        this.broadcastTransaction(transaction)
      }
}

module.exports = P2pServer;