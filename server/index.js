const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const ip = require("ip")
const trackerWebSocketAddr =  process.env.TRACKER_IP || "ws://localhost:3001"
const trackerWebSocket =  new Websocket(trackerWebSocketAddr) 
const HOST = "ws://" + ip.address()
const SERVER = HOST + ":" + P2P_PORT
const {MESSAGE_TYPES, START_UP_STATUS, VOTING_ACTION_TYPES} = require("../config")
const InvalidPermissionsError = require("../errors")
const {ForgedBlock} = require('../blockchain/block')
const VotingUtil = require("../voting-util")



class P2pServer {

    constructor(db, blockchain, transactionPool){
        this.db = db
        this.blockchain = blockchain
        this.transactionPool = transactionPool
        this.sockets = []
        this.votingUtil = new VotingUtil(db, blockchain)

    }

    connectTracker(){
 
        trackerWebSocket.on('message', message => {
            const peers = JSON.parse(message);
            this.connectToPeers(peers)
            if (peers.length === 0){
                this.blockchain.status = START_UP_STATUS.started
                this.votingUtil.initiate(this)
                

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
                        this.executeAndBroadcastVotingTransaction(data.transaction) 
                        break                    
                    case MESSAGE_TYPES.transaction:
                        this.executeAndBroadcastTransaction(data.transaction, false)
                        break
                    case MESSAGE_TYPES.proposed_block:
                        this.proposeBlock(data.block)
                        break
                    case MESSAGE_TYPES.chain_subsection:
                        if(this.blockchain.merge(data.chainSubsection)){
                            if (data.height === this.blockchain.height()){

                                data.transactions.forEach((trans) => {
                                    if(this.transactionPool.isAlreadyAdded(trans)){
                                        this.transactionPool.addTransaction(trans)
                                    }
                                })

                                if( this.blockchain.status === START_UP_STATUS.start_up){
                                    setTimeout(() => {
                                        try{
                                            this.db.reconstruct(this.blockchain, this.transactionPool)
                                            this.blockchain.status = START_UP_STATUS.started
                                        }catch(error){
                                            console.log("Error in starting")
                                            console.log(error)
                                        }
                                    }, 10000)

                                }
                            }

                            for(var i=0; i<data.chainSubsection.length; i++){
                                this.transactionPool.removeCommitedTransactions(data.chainSubsection[i])
                            }
                            this.db.reconstruct(this.blockchain, this.transactionPool)
                            this.requestChainSubsection(this.blockchain.lastBlock())

                        }

                        break
                    case MESSAGE_TYPES.chain_subsection_request:
                        if(this.blockchain.chain.length === 0){
                            return
                        }
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
        var transactions = []
        if (chainSubsection.length < 10){
            transactions = this.transactionPool.validTransactions()
        }
        socket.send(JSON.stringify({type: MESSAGE_TYPES.chain_subsection, chainSubsection, height, transactions}))
    }

    requestChainSubsection(lastBlock){
        this.sockets.forEach(socket => socket.send(JSON.stringify({type: MESSAGE_TYPES.chain_subsection_request, lastBlock})))
    }

    broadcastChainSubsection(chainSubsection){
        this.sockets.forEach(socket => this.sendChainSubsection(socket, chainSubsection))
    }

    broadcastTransaction(transaction,vote){
        const type = vote ? MESSAGE_TYPES.voting: MESSAGE_TYPES.transaction
        this.sockets.forEach(socket => {socket.send(JSON.stringify({type, transaction}))})
    }

    broadcastBlock(){
        console.log(`Broadcasting new block ${this.blockchain._proposedBlock.hash}`)
        this.sockets.forEach(socket => {
                socket.send(JSON.stringify({type: MESSAGE_TYPES.proposed_block, block: this.blockchain._proposedBlock}))
        })
    }


    // Function for gRPC
    proposeBlock(block=null){
        if (block !== null && this.blockchain.getProposedBlock(block.hash) !== null){
            return
        }
      
        if (block == null){
            block = this.blockchain.forgeBlock(this.db, this.transactionPool)
        }
        else if (!(block instanceof ForgedBlock)){
            block =  ForgedBlock.parse(block)
        }

        if(this.blockchain.status === START_UP_STATUS.start_up){
            block.data.forEach(transaction =>{
                this.executeAndBroadcastTransaction(transaction)
            })
        }

        this.blockchain.addProposedBlock(block)
        this.broadcastBlock()
        return block
    }

    // Function for gRPC
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
            result = this.db.execute(transaction.output, transaction.address, transaction.timestamp)
        } catch (error){
            if(error instanceof InvalidPermissionsError){
                console.log("Invalid permissions")
                return null
            }else {
                throw error
            }
        }

        this.transactionPool.addTransaction(transaction)
        return result
    }

    executeAndBroadcastTransaction(transaction, isVote){
        console.log(transaction)
        const response = this.executeTransaction(transaction)
        if (response !== null){
            this.broadcastTransaction(transaction, isVote)
        }
        return response
    }

    executeAndBroadcastVotingTransaction(transaction){
        if ( this.executeAndBroadcastTransaction(transaction, true)== null ){
            return
        }
        this.triggerVotingAction(transaction)
    }

    triggerVotingAction(transaction){
  
        const votingAction = this.votingUtil.execute(transaction)

        if (votingAction === null) return
        switch(votingAction.type){
            case VOTING_ACTION_TYPES.transaction:
                this.executeAndBroadcastVotingTransaction(votingAction.transaction)
                break
            case VOTING_ACTION_TYPES.delayed_transaction:
                setTimeout(() =>{
                    this.executeAndBroadcastVotingTransaction(votingAction.transactionFunction(this.blockchain, this.db))
                }, votingAction.delay)
                break
            case VOTING_ACTION_TYPES.propose_block:
                const block = this.proposeBlock()
                this.executeAndBroadcastVotingTransaction(this.db.createTransaction({type: "SET", ref: "_voting/blockHash", value: block.hash}))
                break
            case VOTING_ACTION_TYPES.add_block:
                this.blockchain.addNewBlock(this.blockchain._proposedBlock, votingAction.validatingTransactions)
                this.transactionPool.removeCommitedTransactions(this.blockchain._proposedBlock)
                if (votingAction.transaction !== null){
                    this.executeAndBroadcastVotingTransaction(votingAction.transaction)
                }
                break
            case VOTING_ACTION_TYPES.request_chain_subsection:
                this.requestChainSubsection(this.blockchain.lastBlock())
                break
        }
    }
}

module.exports = P2pServer;
