const WebSocketServer = require('ws').Server;
const geoip = require('geoip-lite');
const webSocketServer = new WebSocketServer({port: 3001});
const express = require('express');
const jayson = require('jayson');

const MAX_NUM_PEERS = 2;
const NODES = {};
const REGION = 'region';
const COUNTRY = 'country';
const CITY = 'city';
const TIMEZONE = 'timezone';
const MASK = 'xxx';
const PORT = 5000;

function numNodes() {
  return Object.keys(NODES).length;
}

function getLiveNodes() {
  return Object.values(NODES).filter((node) => {
    return node.isLive;
  });
}

function isLiveNode(address) {
  return NODES[address] && NODES[address].isLive;
}

function numLiveNodes() {
  return getLiveNodes().length;
}

function numLivePeers(address) {
  return Math.max(0, numLiveNodes() - (isLiveNode(address) ? 1 : 0));
}

function getRandomLivePeer() {
  return getLiveNodes()[Math.floor(Math.random() * numLiveNodes())];
}

function assignRandomLivePeers(node) {
  const expectedNumPeers = Math.min(numLivePeers(), MAX_NUM_PEERS);
  while (node.getPeerList().length < expectedNumPeers) {
    node.addPeer(getRandomLivePeer());
  }
}

function printNodesInfo() {
  console.log(`Number of nodes: ${numLiveNodes()} / ${numNodes()}`);
  const nodeList = Object.values(NODES);
  for (let i = 0; i < nodeList.length; i++) {
    const node = nodeList[i];
    console.log(`  Node[${i}]: ${node.getNodeSummary()}`);
    const peerList = node.getPeerList();
    for (let j = 0; j < peerList.length; j++) {
      const connected = peerList[j];
      console.log(`    Peer[${j}]: ${connected.getNodeSummary()}`);
    }
  }
}

// A util function for testing/debugging.
function setTimer(ws) {
  setTimeout(() => {
    ws.close();
  }, 15000);
}

webSocketServer.on('connection', (ws) => {
  /*
  setTimer(ws);
  */
  let node = null;
  ws.on('message', (message) => {
    try {
      nodeInfo = JSON.parse(message);
      node = new Node(ws, nodeInfo);
      assignRandomLivePeers(node);
      NODES[node.address] = node;
      ws.send(JSON.stringify(node.getPeerInfoList()));
      console.log(`=> Connected to new node ${node.getNodeSummary()}, ` +
          `which is connected to peers: ${node.getPeersSummary()}`);
      printNodesInfo();
    } catch (err) {
      console.log(err.stack);
    }
  });

  ws.on('close', (code) => {
    try {
      console.log(`=> Disconnected to node ${node.getNodeSummary()}) with code: ${code}`);
      NODES[node.address].isLive = false;
      printNodesInfo();
    } catch (err) {
      console.log(err.stack);
    }
  });
});

class Node {
  constructor(ws, nodeInfo) {
    this.isLive = true;
    this.protocol = nodeInfo.PROTOCOL;
    this.ip = nodeInfo.HOST;
    this.port = nodeInfo.P2P_PORT;
    this.address = nodeInfo.ADDRESS;
    this.url = Node.getNodeUrl(this.protocol, this.ip, this.port);
    this.ws = ws;
    this.connectedPeers = {};
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
      connectedPeers: Object.keys(this.connectedPeers).map((addr) => {
        const peer = NODES[addr];
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
        `${this.address.substring(this.address.length - 4)}(${this.url})` +
            ` == ${this.isLive ? 'LLLL' : 'DDDD'}`;
  }

  getPeersSummary() {
    const list = Object.keys(this.connectedPeers).map((addr) => {
      const peer = NODES[addr];
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

  addPeer(peer) {
    if (peer && peer.address !== this.address && !this.connectedPeers[peer.address]) {
      this.connectedPeers[peer.address] = true;
    }
  }

  removePeer(peer) {
    if (peer && peer.address !== this.address && this.connectedPeers[peer.address]) {
      delete this.connectedPeers[peer.address];
    }
  }

  getPeerList() {
    return Object.keys(this.connectedPeers).map((addr) => {
      return NODES[addr];
    });
  }

  getPeerInfoList() {
    return Object.keys(this.connectedPeers).map((addr) => {
      const peer = NODES[addr];
      return { address: peer.address, url: peer.url };
    });
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
