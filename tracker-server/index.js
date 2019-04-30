#! /usr/bin/node
const WebSocketServer = require("ws").Server
const webSocketServer = new WebSocketServer({port: 3001})
const MAX_PER_SERVER = 2
var PEERS = []



webSocketServer.on('connection', (ws) => {
    ws.on('message', (message) => {
        url = JSON.parse(message)
        const peer = Peer.getPeer(ws, url)
        ws.send(JSON.stringify(peer.getPeerList()))
        console.log(`Added peer node ${url}`)
        console.log(Object.values(PEERS))
        PEERS.push(peer)
    })

    ws.on('close', () => {
        var peer = PEERS.find(peer => peer.ws === ws)
        var peerIndex = PEERS.indexOf(peer)
        PEERS.splice(peerIndex, 1)
        // TODO: Connect all nodes that the removed peer was acting as a bridge for in order
        // to ensure that network remains connected at all times
    })
})


class Peer {

    constructor(ws, url){
        this.url = url
        this.ws = ws
        this.connectedPeers = []
        
    }

    static getPeer(ws, url){
        const peer = new Peer(ws, url)
        if (PEERS.length == 1){
            peer.addPeer(PEERS[0])
        } else if (PEERS.length > 1){
            while (peer.getPeerList() < 2){
                peer.addPeer(PEERS[Math.floor(Math.random() * PEERS.length)])
            }
        }

        return peer

    }

    length(){
        return this.connectedPeers.length
    }

    addPeer(peer){
        if (this.connectedPeers.indexOf(peer) > -1){
            return
        }
        this.connectedPeers.push(peer)
        peer.addPeer(this)
    }

    removePeer(peer){
        if (this.connectedPeers.indexOf(peer) < 0){
            return
        }
        this.connectedPeers = this.connectedPeers.filter(p => {
            if (p.url !== peer.url){
                return p
            }
        })
        peer.removePeer(this)
    }

    getPeerList(){
        var peerUrls =  this.connectedPeers.map(peer => {return peer.url})
        return peerUrls
    }
}
