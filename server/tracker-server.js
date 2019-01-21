#! /usr/bin/node
const WebSocketServer = require("ws").Server
const Blockchain = require("../blockchain")
const webSocketServer = new WebSocketServer({port: 3001})
var PEERS = []
var ADDRESSES = []
const {METHOD, MESSAGE_TYPES, FORGE_RATE} = require("../config")
const blockchain = new Blockchain("tracker")

webSocketServer.on('connection', (ws) => {
    var peers = PEERS.map((peer) => peer[1])
    ws.send(JSON.stringify({type: "PEERS", peers}))
    
    ws.on('message', (message) => {
        const data = JSON.parse(message)
        switch(data.type){
            case MESSAGE_TYPES.server_register:
                console.log(`Added peer node ${data.url}`)
                PEERS.push([ws, data.url])
                ADDRESSES.push(data.address)
                if (blockchain.replaceChain(data.chain)){
                    console.log(`Replaced chain with chain from ${data.url}`)
                }
                break
            case MESSAGE_TYPES.chain: 
                if (!blockchain.replaceChain(data.chain)){
                    console.log(`Invalid chain from ${data.url}`)
                    var wsList = PEERS.map((peer) => peer[0])
                    PEERS.splice(wsList.indexOf(ws), 1)
                    ADDRESSES.splice(wsList.indexOf(ws), 1)
                } 
                break
        }
    })

    ws.on('close', () => {
        var wsList = PEERS.map((peer) => peer[0])
        PEERS.splice(wsList.indexOf(ws), 1)
        ADDRESSES.splice(wsList.indexOf(ws), 1)
    })
})


function designateForgers() {
    var transactionInfo =  calculateTransactionsPerDb()
    let forger
    if(transactionInfo[1] == 0){
        forger = ADDRESSES[0]
    } else{
        forger = selectFrodger(transactionInfo[0], transactionInfo[1])
    }

    var forgerWebsocket = PEERS[ADDRESSES.indexOf(forger)][0]
    forgerWebsocket.send(JSON.stringify({type: MESSAGE_TYPES.forge}))
 }

 if (METHOD == "POS"){
    setInterval(designateForgers, FORGE_RATE*1000);
 }

 function calculateTransactionsPerDb() {
    var stakeHolders = {}
    var numOperations = 0
    blockchain.chain.forEach(block => {
        block.data.forEach(output => {
            // First output from genesis block will have no address
            if (output.address){
                if (!(Object.keys(stakeHolders).indexOf(output.address) > -1)){
                    stakeHolders[output.address] = 1
                } else{
                    stakeHolders[output.address]++
                }
                numOperations++
            } 
        })
    })
    return [stakeHolders, numOperations]

}

function selectFrodger(stakeHolders, totalTransactions){
    var stakeHolderAddresses = Object.keys(stakeHolders)
    var stakeHolderWeights = [0]
    for(var i=1; i<stakeHolderAddresses.length; i++){
        stakeHolderWeights[i] = stakeHolderWeights[i-1] + 
                (stakeHolders[stakeHolderAddresses[i-1]] / totalTransactions)
    }
    console.log(`Weights for addresses ${stakeHolderWeights}`)
    var randomNum = Math.random()
    for(var j=stakeHolderWeights.length - 1; j>=0; j--){
        if (randomNum > stakeHolderWeights[j]){
            return stakeHolderAddresses[j]
        }
    }
}