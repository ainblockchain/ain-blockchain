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
  console.log(`Number of peers: ${NODES.length}`);
  for (let i = 0; i < NODES.length; i++) {
    const peer = NODES[i];
    console.log(`  Node[${i}]: ${peer.getNodeSummary()})`);
    for (let j = 0; j < peer.connectedPeers.length; j++) {
      const connected = peer.connectedPeers[j];
      console.log(`    Peer[${j}]: ${connected.getNodeSummary()})`);
    }
  }
}

// A util function for testing/debugging.
function setTimer(ws) {
  setTimeout(() => {
    ws.close();
  }, 30000);
}

webSocketServer.on('connection', (ws) => {
  /*
  setTimer(ws);
  */
  ws.on('message', (message) => {
    try {
      nodeInfo = JSON.parse(message);
      const node = Node.getNode(ws, nodeInfo);
      ws.send(JSON.stringify(node.getPeerList()));
      console.log(`=> Connected to new node ${node.getNodeSummary()}, ` +
          `which is connected to peers: ${node.getPeersSummary()}`);
      NODES.push(node);
      printPeers();
    } catch (err) {
      console.log(err.stack);
    }
  });

  ws.on('close', (code) => {
    try {
      const node = NODES.find((p) => p.ws === ws);
      console.log(`=> Disconnected to node ${node.getNodeSummary()}) with code: ${code}`);
      const nodeIndex = NODES.indexOf(node);
      NODES.splice(nodeIndex, 1);
      const affectedPeers = NODES.filter((p) => {
        if (p.getPeerList().indexOf(node.url) !== -1) {
          return true;
        }
        return false;
      });
      for (let i = 0; i < affectedPeers.length; i++) {
        const affected = affectedPeers[i];
        affected.removePeer(node);
        if (i + 1 < affectedPeers.length) {
          affected.connect(affectedPeers[i + 1]);
        }
      }
      printPeers();
    } catch (err) {
      console.log(err.stack);
    }
  });
});

class Node {
  constructor(ws, nodeInfo) {
    this.protocol = nodeInfo.PROTOCOL;
    this.ip = nodeInfo.HOST;
    this.port = nodeInfo.P2P_PORT;
    this.address = nodeInfo.ADDRESS;
    this.url = Node.getNodeUrl(this.protocol, this.ip, this.port);
    this.ws = ws;
    this.connectedPeers = [];
    const locationDict = Node.getNodeLocation(this.ip);
    this.country = (locationDict === null || locationDict[COUNTRY].length === 0) ?
        null : locationDict[COUNTRY];
    this.region = (locationDict === null ||locationDict[REGION].length === 0) ?
        null : locationDict[REGION];
    this.city = (locationDict === null ||locationDict[CITY].length === 0) ?
        null : locationDict[CITY];
    this.timezone = (locationDict === null ||locationDict[TIMEZONE].length === 0) ?
        null : locationDict[TIMEZONE];
  }

  getNodeInfo() {
    return {
      ip: Node.maskIp(this.ip),
      port: this.port,
      url: Node.getNodeUrl(this.protocol, Node.maskIp(this.ip), this.port),
      address: this.address,
      connectedPeers: this.connectedPeers.map((peer) => {
        return Node.getNodeUrl(peer.protocol, Node.maskIp(peer.ip), peer.port);
      }),
      country: this.country,
      region: this.region,
      city: this.city,
      timezone: this.timezone,
    };
  }

  getNodeSummary() {
    return `${this.address.substring(0, 6)}..` +
        `${this.address.substring(this.address.length - 4)} (${this.url})`;
  }

  getPeersSummary() {
    const list = this.connectedPeers.map((entry) => {
      return entry.getNodeSummary();
    });
    return list.join(', ');
  }

  static maskIp(ip) {
    const ipList = ip.split('.');
    ipList[0] = MASK;
    ipList[1] = MASK;
    return ipList.join('.');
  }

  static getNodeLocation(ip) {
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

  static getNodeUrl(protocol, host, port) {
    return protocol + '://' + host + ':' + port;
  }

  static getNode(ws, nodeInfo) {
    const node = new Node(ws, nodeInfo);
    if (NODES.length === 1) {
      node.addPeer(NODES[0]);
    } else if (NODES.length > 1) {
      while (node.getPeerList().length < MAX_PER_SERVER) {
        node.addPeer(NODES[Math.floor(Math.random() * NODES.length)]);
      }
    }

    return node;
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
    console.log(`  => Now connecting node ${this.getNodeSummary()}) with new peer: ` +
        `${peer.getNodeSummary()})`);
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
