#! /usr/bin/node
const WebSocketServer = require('ws').Server;
const geoip = require('geoip-lite');
const webSocketServer = new WebSocketServer({port: 3001});
const express = require('express');
const jayson = require('jayson');

const MAX_PER_SERVER = 2;
const PEERS = [];
const REGION = 'region';
const COUNTRY = 'country';
const CITY = 'city';
const TIMEZONE = 'timezone';
const MASK = 'xxx';
const PORT = 5000;

webSocketServer.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      peerUrlInfo = JSON.parse(message);
      const peer = Peer.getPeer(ws, peerUrlInfo);
      ws.send(JSON.stringify(peer.getPeerList()));
      console.log(`Added peer node ${peer.url}`);
      console.log(`New peer node is connected to  ${peer.getPeerList()}`);
      PEERS.push(peer);
      console.log(`Number of peers is ${PEERS.length}`);
    } catch (err) {
      console.log(err.stack);
    }
  });

  ws.on('close', (code) => {
    console.log(`Connection closed with code: ` + code);
    try {
      const peer = PEERS.find((p) => p.ws === ws);
      const peerIndex = PEERS.indexOf(peer);
      PEERS.splice(peerIndex, 1);
      const effectedPeers = PEERS.filter((p)=> {
        if (p.getPeerList().indexOf(peer.url) !== -1) {
          return true;
        }
        return false;
      });
      let lastPeer = effectedPeers.pop();
      for (let i = effectedPeers.length - 1; i >= 0; i--) {
        console.log(`Connecting peer ${lastPeer.url} to peer ${effectedPeers[i].url}`);
        lastPeer.connect(effectedPeers[i]);
        lastPeer = effectedPeers.pop();
      }
    } catch (err) {
      console.log(err.stack);
    }
  });
});

class Peer {
  constructor(ws, peerUrlInfo) {
    this.protocol = peerUrlInfo.PROTOCOL;
    this.ip = peerUrlInfo.HOST;
    this.port = peerUrlInfo.P2P_PORT;
    this.publicKey = peerUrlInfo.PUBLIC_KEY;
    this.url = Peer.getPeerUrl(this.protocol, this.ip, this.port);
    this.ws = ws;
    this.connectedPeers = [];
    const locationDict = Peer.getPeerLocation(this.ip);
    this.country = locationDict == null || locationDict[COUNTRY].length === 0 ? null : locationDict[COUNTRY];
    this.region = locationDict == null ||locationDict[REGION].length === 0 ? null : locationDict[REGION];
    this.city = locationDict == null ||locationDict[CITY].length === 0 ? null : locationDict[CITY];
    this.timezone = locationDict == null ||locationDict[TIMEZONE].length === 0 ? null : locationDict[TIMEZONE];
  }

  getPeerInfo() {
    return {
      ip: Peer.maskIp(this.ip),
      port: this.port,
      url: Peer.getPeerUrl(this.protocol, Peer.maskIp(this.ip), this.port),
      publicKey: this.publicKey,
      connectedPeers: this.connectedPeers.map((peer) => {
        return Peer.getPeerUrl(peer.protocol, Peer.maskIp(peer.ip), peer.port);
      }),
      country: this.country,
      region: this.region,
      city: this.city,
      timezone: this.timezone,
    };
  }

  static maskIp(ip) {
    const ipList = ip.split('.');
    ipList[0] = MASK;
    ipList[1] = MASK;
    return ipList.join('.');
  }

  static getPeerLocation(ip) {
    const geoLocationDict = geoip.lookup(ip);
    if (geoLocationDict === null || (geoLocationDict[COUNTRY].length === 0 && geoLocationDict[REGION].length === 0 && geoLocationDict[CITY].length === 0 && geoLocationDict[TIMEZONE].length === 0)) {
      return null;
    }
    return {[COUNTRY]: geoLocationDict[COUNTRY], [REGION]: geoLocationDict[REGION], [CITY]: geoLocationDict[CITY], [TIMEZONE]: geoLocationDict[TIMEZONE]};
  }

  static getPeerUrl(protocol, host, port) {
    return protocol + '://' + host + ':' + port;
  }

  static getPeer(ws, peerInfo) {
    const peer = new Peer(ws, peerInfo);
    if (PEERS.length == 1) {
      peer.addPeer(PEERS[0]);
    } else if (PEERS.length > 1) {
      while (peer.getPeerList().length < MAX_PER_SERVER) {
        peer.addPeer(PEERS[Math.floor(Math.random() * PEERS.length)]);
      }
    }

    return peer;
  }

  length() {
    return this.connectedPeers.length;
  }

  addPeer(peer) {
    if (this.connectedPeers.indexOf(peer) > -1) {
      return;
    }
    this.connectedPeers.push(peer);
    peer.addPeer(this);
  }

  removePeer(peer) {
    if (this.connectedPeers.indexOf(peer) < 0) {
      return;
    }
    this.connectedPeers = this.connectedPeers.filter((p) => {
      if (p.url !== peer.url) {
        return p;
      }
    });
    peer.removePeer(this);
  }

  getPeerList() {
    const peerUrls = this.connectedPeers.map((peer) => {
      return peer.url;
    });
    return peerUrls;
  }

  connect(peer) {
    this.ws.send(JSON.stringify([peer.url]));
    this.addPeer(peer);
  }
}

const app = express();
app.use(express.json()); // support json encoded bodies
const jsonRpcMethods = require('./json-rpc')(PEERS);
app.post('/json-rpc', jayson.server(jsonRpcMethods).middleware());
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
