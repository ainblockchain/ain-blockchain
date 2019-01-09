#! /usr/bin/node
const WebSocketServer = require("ws").Server
const webSocketServer = new WebSocketServer({port: 3001})
var PEERS = []


webSocketServer.on('connection', (ws) => {
    var peerList = PEERS.map((peer) => peer[1])
    ws.send(JSON.stringify(peerList))
    ws.on('message', (message) => {
        url = JSON.parse(message)
        console.log(`Added peer node ${url}`)
        console.log(Object.values(PEERS))
        PEERS.push([ws, url])

    })

    ws.on('close', () => {
        var wsList = PEERS.map((peer) => peer[0])
        PEERS.splice(wsList.indexOf(ws), 1)
    })
})
