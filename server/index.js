const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const ip = require("ip")
const trackerWebSocketAddr =  process.env.TRACKER_IP || "ws://localhost:3001"
const trackerWebSocket =  new Websocket(trackerWebSocketAddr) 
const HOST = "ws://" + ip.address()
const SERVER = HOST + ":" + P2P_PORT
const {MESSAGE_TYPES, START_UP_STATUS, VOTING_STATUS, VOTING_ACTION_TYPES, STAKE, CONSENSUS_DB_KEYS} = require("../constants")
const InvalidPermissionsError = require("../errors")
const {ForgedBlock} = require('../blockchain/block')
const VotingUtil = require("./voting-util")
const BLOCK_CREATION_INTERVAL = 6000



class P2pServer {

    constructor(db, blockchain, transactionPool){
        this.db = db
        this.blockchain = blockchain
        this.transactionPool = transactionPool
        this.sockets = []
        this.votingUtil = new VotingUtil(db)
        this.votingInterval = null
        this.waitInBlocks = 4
    }

    connectTracker(){
 
        trackerWebSocket.on('message', message => {
            const peers = JSON.parse(message);
            this.connectToPeers(peers)
            if (peers.length === 0){
                this.blockchain.status = START_UP_STATUS.started
                this.initiateChain()
            }
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
        this.requestChainSubsection(this.blockchain.lastBlock())
    }

    messageHandler(socket){
        socket.on('message', (message) => {
            try{
                const data = JSON.parse(message);

                switch(data.type){
                    case MESSAGE_TYPES.voting:
                        this.executeVotingAction(data.votingAction) 
                        break                    
                    case MESSAGE_TYPES.transaction:
                        this.executeAndBroadcastTransaction(data.transaction)
                        break
                    case MESSAGE_TYPES.chain_subsection:
                        // Check if chain subsection is valid and can be merged ontop of your local blockchain
                        if(this.blockchain.merge(data.chainSubsection)){
                            if (data.height === this.blockchain.height()){
                                // If peeer is new to network and has successfully reached the consensus nlockchain height
                                // wait the duration of one more voting round before processing transactions.
                                if( this.blockchain.status === START_UP_STATUS.start_up){
                                    setTimeout(() => {
                                        try{
                                            this.db.reconstruct(this.blockchain, this.transactionPool)
                                            this.blockchain.status = START_UP_STATUS.started
                                        }catch(error){
                                            console.log(`Error in starting:${error.stack}`)
                                        }
                                    }, BLOCK_CREATION_INTERVAL)
                                }
                            }
                            for(var i=0; i<data.chainSubsection.length; i++){
                                this.transactionPool.removeCommitedTransactions(data.chainSubsection[i])
                            }
                            this.db.reconstruct(this.blockchain, this.transactionPool)
                            // Continuously request the blockchain in subsections until your local blockchain matches the height of the consensus blockchain.
                            this.requestChainSubsection(this.blockchain.lastBlock())
                        }
                        break
                    case MESSAGE_TYPES.chain_subsection_request:
                        if(this.blockchain.chain.length === 0){
                            return
                        }
                        // Send a chunk of 20 blocks from  your blockchain to the requester. Requester will continue to request blockchain chunks until their blockchain height matches
                        // the consensus blockchain height
                        const chainSubsection = this.blockchain.requestBlockchainSection(data.lastBlock)
                        if(chainSubsection){
                            this.sendChainSubsection(socket, chainSubsection, this.blockchain.height())
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

    sendChainSubsection(socket, chainSubsection, height){
        socket.send(JSON.stringify({type: MESSAGE_TYPES.chain_subsection, chainSubsection, height}))
    }

    requestChainSubsection(lastBlock){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.chain_subsection_request, lastBlock})))
    }

    broadcastChainSubsection(chainSubsection){
        this.sockets.forEach(socket => this.sendChainSubsection(socket, chainSubsection))
    }

    broadcastTransaction(transaction){
        this.sockets.forEach(socket => {socket.send(JSON.stringify({type:  MESSAGE_TYPES.transaction, transaction}))})
    }

    broadcastBlock(blockHashTransaction){
        console.log(`Broadcasting new block ${this.votingUtil.block}`)
        this.sockets.forEach(socket => {
                socket.send(JSON.stringify({type: MESSAGE_TYPES.voting, votingAction: {actionType: VOTING_ACTION_TYPES.proposed_block, block: this.votingUtil.block, transaction: blockHashTransaction}}))
        })
    }

    broadcastVotingAction(votingAction){
        this.sockets.forEach(socket => {
            socket.send(JSON.stringify({type: MESSAGE_TYPES.voting, votingAction}))
        })
    }

    executeTransaction(transaction){
        if(this.transactionPool.isAlreadyAdded(transaction)){
            console.log("Transaction already received")
            return null
        }

        if (this.blockchain.status === START_UP_STATUS.start_up){
            this.transactionPool.addTransaction(transaction)
            return []
        }

        let result
        try{
            result = this.db.execute(transaction.output, transaction.address, transaction.timestamp, false)
        } catch (error){
            if(error instanceof InvalidPermissionsError){
                return null
            }else {
                throw error
            }
        }

        this.transactionPool.addTransaction(transaction)
        return result
    }

    executeAndBroadcastTransaction(transaction){
        const response = this.executeTransaction(transaction)
        if (response !== null) {
            this.broadcastTransaction(transaction)
        }
        return response
    }

    executeAndBroadcastVotingAction(votingAction){

        const response = this.executeTransaction(votingAction.transaction)
        if (response !== null) {
            if ([VOTING_ACTION_TYPES.pre_vote, VOTING_ACTION_TYPES.pre_commit].indexOf(votingAction.actionType) > -1){
                this.votingUtil.registerValidatingTransaction(votingAction.transaction)
            } 
            this.broadcastVotingAction(votingAction)
        }
        return response
    }


    executeVotingAction(votingAction) {
  
        const response = this.executeAndBroadcastVotingAction(votingAction)
        if (response === null){
            return
        }
        switch (votingAction.actionType) {
            case VOTING_ACTION_TYPES.new_voting:
                if (!this.votingUtil.isSyncedWithNetwork(this.blockchain)){
                    this.requestChainSubsection(this.blockchain.lastBlock())
                }
                if (this.votingUtil.isStaked()){
                    this.executeAndBroadcastTransaction(this.votingUtil.registerForNextRound(this.blockchain.height() + 1))
                }
    
                this.checkIfForger()
                break
            case VOTING_ACTION_TYPES.proposed_block:
                var invalidTransactions = false
                for (var i = 0; i < votingAction.block.data.length; i++){
                    if (this.executeTransaction(votingAction.block.data[i]) && !this.transactionPool.isAlreadyAdded(votingAction.block.data[i])) {
                        invalidTransactions = true
                    }
                }
                if (invalidTransactions || !ForgedBlock.validateBlock(votingAction.block, this.blockchain) || votingAction.block === this.votingUtil.block || !(this.votingUtil.status === VOTING_STATUS.wait_for_block || this.votingUtil.status === VOTING_STATUS.syncing)){
                    break
                }
                this.votingUtil.setBlock(votingAction.block)
                if(this.votingUtil.isValidator()){
                    this.executeAndBroadcastVotingAction({transaction: this.votingUtil.preVote(), actionType: VOTING_ACTION_TYPES.pre_vote})
                }
            case VOTING_ACTION_TYPES.pre_vote:
                if (!this.votingUtil.checkPreVotes()){
                    break
                } 
                var preCommitTransaction =  this.votingUtil.preCommit()
                if (preCommitTransaction !== null){
                    this.executeAndBroadcastVotingAction({transaction: preCommitTransaction, actionType: VOTING_ACTION_TYPES.pre_commit})
                }
            case VOTING_ACTION_TYPES.pre_commit:
                if (this.votingUtil.isCommit()){
                    this.votingUtil.addValidatorTransactionsToBlock()
                    this.addBlockToChain()
                    this.cleanupAfterVotingRound()
                }                       
                break
        }
    }

    forgeBlock(){
        var data = this.transactionPool.validTransactions()
        var blockHeight = this.blockchain.height() + 1
        this.votingUtil.setBlock(ForgedBlock.forgeBlock(data, this.db, blockHeight, this.blockchain.lastBlock(), this.db.publicKey, Object.keys(this.db.get(CONSENSUS_DB_KEYS.voting_round_validators_path)), this.db.get(CONSENSUS_DB_KEYS.voting_round_threshold_path)))
        var ref = CONSENSUS_DB_KEYS.voting_round_block_hash_path
        var value = this.votingUtil.block.hash
        console.log(`Forged block with hash ${this.votingUtil.block.hash} at height ${blockHeight}`)
        const blockHashTransaction = this.db.createTransaction({type: "SET", ref, value})
        this.executeTransaction(blockHashTransaction)
        this.broadcastBlock(blockHashTransaction)
        if (!Object.keys(this.db.get(CONSENSUS_DB_KEYS.voting_round_validators_path)).length){
            console.log("No validators registered for this round")
            this.addBlockToChain()  
            this.cleanupAfterVotingRound()
        }
    }

    initiateChain(){
        this.votingUtil.status === VOTING_STATUS.wait_for_block
        this.stakeAmount()
        this.executeAndBroadcastTransaction(this.votingUtil.instantiate(this.blockchain))
        this.forgeBlock()
    }

    addBlockToChain(){
        this.blockchain.addNewBlock(this.votingUtil.block)
        this.transactionPool.removeCommitedTransactions(this.votingUtil.block)
        this.votingUtil.reset()
        this.db.reconstruct(this.blockchain, this.transactionPool)
        if (this.waitInBlocks > 0){
            this.waitInBlocks = this.waitInBlocks - 1
            if (this.waitInBlocks === 0){
                this.stakeAmount()
            }
        }
    }

    cleanupAfterVotingRound(){
        if (this.votingInterval){
            console.log("Clearing interval after successful voting round")
            clearInterval(this.votingInterval)
            this.votingInterval = null
        }
        if (this.db.get(CONSENSUS_DB_KEYS.voting_round_forger_path) === this.db.publicKey){
            console.log(`Peer ${this.db.publicKey} will start next round at height ${this.blockchain.height() + 1} in ${BLOCK_CREATION_INTERVAL}ms`)
            this.executeAndBroadcastTransaction(this.votingUtil.writeSuccessfulForge())
            
        }

        if (this.db.get(CONSENSUS_DB_KEYS.recent_forgers_path).indexOf(this.db.publicKey) >= 0){
            this.votingInterval = setInterval(()=> {
                const newRoundTrans = this.votingUtil.startNewRound(this.blockchain)
                if (newRoundTrans === null){
                    console.log(`${this.db.publicKey} is not the starter for the current round`)
                    return
                }
                console.log(`User ${this.db.publicKey} is starting round ${this.blockchain.height() + 1}`)
                this.executeAndBroadcastVotingAction({transaction: newRoundTrans, actionType: VOTING_ACTION_TYPES.new_voting}) 
                this.executeAndBroadcastTransaction(this.votingUtil.registerForNextRound(this.blockchain.height() + 1))
                this.checkIfForger()

            }, BLOCK_CREATION_INTERVAL)
        }
        console.log(`New blockchain height is ${this.blockchain.height() + 1}`)
    }
    
    checkIfForger(){
        if (this.votingUtil.isForger()){
            this.forgeBlock()
        }
    }

    stakeAmount(){
        if (this.stake !== null){
            console.log(`Staking amount ${STAKE}`)
            var transaction = this.votingUtil.stake(STAKE)
            this.executeAndBroadcastTransaction(transaction)
        }
    }
}

module.exports = P2pServer;
