#! /usr/bin/node
const WebSocketServer = require('ws').Server;
const geoip = require('geoip-lite');
const webSocketServer = new WebSocketServer({port: 3001});
const express = require('express');
const jayson = require('jayson');

const MAX_PER_SERVER = 2;
const NODES = [];
const REGION = 'region';
const COUNTRY = 'country';
const CITY = 'city';
const TIMEZONE = 'timezone';
const MASK = 'xxx';
const PORT = 5000;

function printPeers() {
  console.log(`=> Number of peers: ${NODES.length}`);
  for (let i = 0; i < NODES.length; i++) {
    const peer = NODES[i];
    console.log(`  Peer[${i}]: ${peer.getNodeSummary()})`);
    for (let j = 0; j < peer.connectedPeers.length; j++) {
      const connected = peer.connectedPeers[j];
      console.log(`    Connected[${j}]: ${connected.getNodeSummary()})`);
    }
  }
}

// A util function for testing/debugging.
function setTimer(ws) {
  setTimeout(() => {
    ws.close();
  }, 60000);
}

webSocketServer.on('connection', (ws) => {
  /*
  setTimer(ws);
  */
  ws.on('message', (message) => {
    try {
      peerUrlInfo = JSON.parse(message);
      const peer = Node.getPeer(ws, peerUrlInfo);
      ws.send(JSON.stringify(peer.getPeerList()));
      console.log(`Added new peer node ${peer.getNodeSummary()})`);
      console.log(`New peer node is connected to ${peer.getPeerSummary()}`);
      NODES.push(peer);
      printPeers();
    } catch (err) {
      console.log(err.stack);
    }
  });

  ws.on('close', (code) => {
    try {
      const peer = NODES.find((p) => p.ws === ws);
      console.log(`Peer node ${peer.getNodeSummary()}) disconnected with code: ${code}`);
      const peerIndex = NODES.indexOf(peer);
      NODES.splice(peerIndex, 1);
      const effectedPeers = NODES.filter((p) => {
        if (p.getPeerList().indexOf(peer.url) !== -1) {
          return true;
        }
        return false;
      });
      for (let i = 0; i < effectedPeers.length; i++) {
        const effected = effectedPeers[i];
        effected.removePeer(peer);
        if (i + 1 < effectedPeers.length) {
          effected.connect(effectedPeers[i + 1]);
        }
      }
      printPeers();
    } catch (err) {
      console.log(err.stack);
    }
  });
});

class Node {
  constructor(ws, peerUrlInfo) {
    this.protocol = peerUrlInfo.PROTOCOL;
    this.ip = peerUrlInfo.HOST;
    this.port = peerUrlInfo.P2P_PORT;
    this.publicKey = peerUrlInfo.PUBLIC_KEY;
    this.url = Node.getPeerUrl(this.protocol, this.ip, this.port);
    this.ws = ws;
    this.connectedPeers = [];
    const locationDict = Node.getPeerLocation(this.ip);
    this.country = (locationDict === null || locationDict[COUNTRY].length === 0) ?
        null : locationDict[COUNTRY];
    this.region = (locationDict === null ||locationDict[REGION].length === 0) ?
        null : locationDict[REGION];
    this.city = (locationDict === null ||locationDict[CITY].length === 0) ?
        null : locationDict[CITY];
    this.timezone = (locationDict === null ||locationDict[TIMEZONE].length === 0) ?
        null : locationDict[TIMEZONE];
  }

  getPeerInfo() {
    return {
      ip: Node.maskIp(this.ip),
      port: this.port,
      url: Node.getPeerUrl(this.protocol, Node.maskIp(this.ip), this.port),
      publicKey: this.publicKey,
      connectedPeers: this.connectedPeers.map((peer) => {
        return Node.getPeerUrl(peer.protocol, Node.maskIp(peer.ip), peer.port);
      }),
      country: this.country,
      region: this.region,
      city: this.city,
      timezone: this.timezone,
    };
  }

  getNodeSummary() {
    return `${this.publicKey.substring(0, 6)} (${this.url})`;
  }

  getPeerSummary() {
    const list = this.connectedPeers.map((peer) => {
      return peer.getNodeSummary();
    });
    return list.join(', ');
  }

  static maskIp(ip) {
    const ipList = ip.split('.');
    ipList[0] = MASK;
    ipList[1] = MASK;
    return ipList.join('.');
  }

  static getPeerLocation(ip) {
    const geoLocationDict = geoip.lookup(ip);
    if (geoLocationDict === null || (geoLocationDict[COUNTRY].length === 0 &&
        geoLocationDict[REGION].length === 0 && geoLocationDict[CITY].length === 0 &&
        geoLocationDict[TIMEZONE].length === 0)) {
      return null;
    }
    return {
      [COUNTRY]: geoLocationDict[COUNTRY],
      [REGION]: geoLocationDict[REGION],
      [CITY]: geoLocationDict[CITY],
      [TIMEZONE]: geoLocationDict[TIMEZONE]
    };
  }

  static getPeerUrl(protocol, host, port) {
    return protocol + '://' + host + ':' + port;
  }

  static getPeer(ws, peerInfo) {
    const peer = new Node(ws, peerInfo);
    if (NODES.length === 1) {
      peer.addPeer(NODES[0]);
    } else if (NODES.length > 1) {
      while (peer.getPeerList().length < MAX_PER_SERVER) {
        peer.addPeer(NODES[Math.floor(Math.random() * NODES.length)]);
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
    if (peer) {
      peer.removePeer(this);
    }
  }

  getPeerList() {
    const peerUrls = this.connectedPeers.map((peer) => {
      return peer.url;
    });
    return peerUrls;
  }

  connect(peer) {
    console.log(`Connecting ${this.getNodeSummary()}) to ${peer.getNodeSummary()})`);
    this.ws.send(JSON.stringify([peer.url]));
    this.addPeer(peer);
  }
}

const app = express();
app.use(express.json()); // support json encoded bodies
const jsonRpcMethods = require('./json-rpc')(NODES);
app.post('/json-rpc', jayson.server(jsonRpcMethods).middleware());
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
