var ip = require("ip")
const Websocket = require('ws');
const P2P_PORT = process.env.P2P_PORT || 5001;
const trackerWebSocket = new Websocket("ws://localhost:3001")
const HOST = process.env.HOST || "ws://localhost"
const SERVER = HOST + ":" + P2P_PORT
const MESSAGE_TYPES = {
    chain: "CHAIN",
    transaction: "TRANSACTION",
    clear_transactions: "CLEAR_TRANSACTIONS"
}

class P2pServer {

    constructor(db, bc, tp){
        this.db = db
        this.blockchain = bc
        this.transactionPool = tp
        this.sockets = []
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
            const data = JSON.parse(message);
            switch(data.type){
                case MESSAGE_TYPES.chain:
                    if (this.blockchain.replaceChain(data.chain)){
                        this.db.createDatabase(this.blockchain)
                    }
                    break
                case MESSAGE_TYPES.transaction:
                    if(data.transaction.output.type === "SET"){
                        this.db.set(data.transaction.output.ref, data.transaction.output.value)
                    } else if (data.transaction.output.type === "INCREASE"){
                        this.db.increase(data.transaction.output.diff)
                    }
                    this.transactionPool.addTransaction(data.transaction)
                    break
                case MESSAGE_TYPES.clear_transactions:
                    this.transactionPool.clear()
                    break
            }
        })

        socket.on('close', () => {
            this.sockets.splice(this.sockets.indexOf(socket), 1)
        })
    }

    sendChain(socket){
        socket.send(JSON.stringify({type: MESSAGE_TYPES.chain, 
                                    chain: this.blockchain.chain}));
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


}

module.exports = P2pServer;