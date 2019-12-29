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

// TODO(seo): Sign messages to nodes.

function abbrAddr(address) {
  return `${address.substring(0, 6)}..${address.substring(address.length - 4)}`;
}

function numNodes() {
  return Object.keys(NODES).length;
}

function numLiveNodes() {
  const liveNodes = Object.values(NODES).filter((node) => {
    return node.isLive;
  });
  return liveNodes.length;
}

function numLivePeers(address) {
  const livePeers = Object.values(NODES).filter((node) => {
    return node.isLive && node.address !== address;
  });
  return livePeers.length;
}

function printNodesInfo() {
  console.log(`Updated [NODES]: (Number of nodes: ${numLiveNodes()}/${numNodes()})`);
  const nodeList = Object.values(NODES).sort((x, y) => {
    return x.address > y.address ? 1 : (x.address === y.address ? 0 : -1);
  });
  for (let i = 0; i < nodeList.length; i++) {
    const node = nodeList[i];
    console.log(`    Node[${i}]: ${node.getNodeSummary()} Block: ${node.lastBlockNumber} ` +
        `Peers: ${node.numPeers()} (+${node.numManagedPeers()}/-${node.numUnmanagedPeers()})`);
    Object.keys(node.managedPeers).forEach((addr) => {
      const peerSummary =
          NODES[addr] ? NODES[addr].getNodeSummary() : Node.getUnknownNodeSummary(addr);
      console.log(`      Managed peer: ${peerSummary}`);
    });
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
      const nodeInfo = JSON.parse(message);
      console.log(`\n<< Update from node [${abbrAddr(nodeInfo.address)}]: ` +
          `${JSON.stringify(nodeInfo, null, 2)}`)
      if (NODES[nodeInfo.address]) {
        node = NODES[nodeInfo.address].reconstruct(nodeInfo);
        node.assignRandomPeers();
      } else {
        node = new Node(nodeInfo);
        node.assignRandomPeers();
        NODES[nodeInfo.address] = node;
      }
      const newManagedPeerInfoList = node.getManagedPeerInfoList().filter((peerInfo) => {
        return !nodeInfo.managedPeersInfo[peerInfo.address];
      });
      const msgToNode = {
        newManagedPeerInfoList,
        numLivePeers: numLivePeers(node.address)
      };
      console.log(`>> Message to node [${abbrAddr(node.address)}]: ` +
          `${JSON.stringify(msgToNode, null, 2)}`)
      ws.send(JSON.stringify(msgToNode));
      printNodesInfo();
    } catch (error) {
      console.log(error.stack);
    }
  });

  ws.on('close', (code) => {
    console.log(`\nDisconnected from node [${node ? abbrAddr(node.address) : 'unknown'}] ` +
        `with code: ${code}`);
    NODES[node.address].isLive = false;
    printNodesInfo();
  });

  ws.on('error', (error) => {
    console.log(`Error in communication with node [${abbrAddr(node.address)}]: ` +
        `${JSON.stringify(error, null, 2)}`)
  });
});

class Node {
  constructor(nodeInfo) {
    this.reconstruct(nodeInfo);
  }

  reconstruct(nodeInfo) {
    this.isLive = true;
    this.ip = nodeInfo.ip;
    this.address = nodeInfo.address;
    this.url = nodeInfo.url;
    this.lastBlockNumber = nodeInfo.lastBlockNumber;
    this.managedPeers = Node.constructManagedPeers(nodeInfo);
    this.unmanagedPeers = Node.constructUnmanagedPeers(nodeInfo.address);
    const locationDict = Node.getNodeLocation(this.ip);
    this.country = (locationDict === null || locationDict[COUNTRY].length === 0) ?
        null : locationDict[COUNTRY];
    this.region = (locationDict === null ||locationDict[REGION].length === 0) ?
        null : locationDict[REGION];
    this.city = (locationDict === null ||locationDict[CITY].length === 0) ?
        null : locationDict[CITY];
    this.timezone = (locationDict === null ||locationDict[TIMEZONE].length === 0) ?
        null : locationDict[TIMEZONE];

    return this;
  }

  getNodeInfo() {
    return {
      ip: Node.maskIp(this.ip),
      port: this.port,
      url: this.url,
      address: this.address,
      managedPeers: Object.keys(this.managedPeers).map((addr) => {
        return addr;
      }),
      unmanagedPeers: Object.keys(this.unmanagedPeers).map((addr) => {
        return addr;
      }),
      country: this.country,
      region: this.region,
      city: this.city,
      timezone: this.timezone,
    };
  }

  getNodeSummary() {
    return `[${abbrAddr(this.address)}] (${this.url}) -> ${this.isLive ? '(o)' : '(x)'}`;
  }

  static getUnknownNodeSummary(address) {
    return `[${abbrAddr(address)}] (unknown) -> unknown`;
  }

  getPeersSummary() {
    const list = Object.keys(this.managedPeers).map((addr) => {
      return NODES[addr] ? NODES[addr].getNodeSummary() : Node.getUnknownNodeSummary(addr);
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

  static constructManagedPeers(nodeInfo) {
    const managedPeers = {};
    Object.values(nodeInfo.managedPeersInfo).forEach((peerInfo) => {
      managedPeers[peerInfo.address] = true;
    });
    return managedPeers;
  }

  static constructUnmanagedPeers(address) {
    const unmanagedPeers = {};
    Object.values(NODES).forEach((node) => {
      if (node.address != address && node.managedPeers[address])
      unmanagedPeers[node.address] = true;
    });
    return unmanagedPeers;
  }

  numManagedPeers() {
    return Object.keys(this.managedPeers).length;
  }

  numUnmanagedPeers() {
    return Object.keys(this.unmanagedPeers).length;
  }

  numPeers() {
    return this.numManagedPeers() + this.numUnmanagedPeers();
  }

  addPeer(peer) {
    if (peer && peer.address !== this.address && !this.managedPeers[peer.address] &&
        !this.unmanagedPeers[peer.address]) {
      this.managedPeers[peer.address] = true;
      peer.unmanagedPeers[this.address] = true;
    }
  }

  removePeer(peer) {
    if (peer) {
      if (this.managedPeers[peer.address]) {
        delete this.managedPeers[peer.address];
      }
      if (peer.unmanagedPeers[this.address]) {
        delete peer.unmanagedPeers[this.address];
      }
    }
  }

  getPeerCandidates() {
    return Object.values(NODES).filter((other) => {
      return other.address !== this.address && other.isLive && !this.managedPeers[other.address] &&
          !this.unmanagedPeers[other.address];
    });
  }

  numPeerCandidates() {
    return this.getPeerCandidates().length;
  }

  getRandomPeer() {
    return this.getPeerCandidates()[Math.floor(Math.random() * this.numPeerCandidates())];
  }

  assignRandomPeers() {
    while (this.numPeerCandidates() > 0 && this.numManagedPeers() < MAX_NUM_PEERS) {
      this.addPeer(this.getRandomPeer());
    }
  }

  getManagedPeerInfoList() {
    const peerInfoList = [];
    Object.keys(this.managedPeers).forEach((addr) => {
      if (NODES[addr]) {
        peerInfoList.push({
          address: addr,
          url: NODES[addr].url
        });
      }
    });
    return peerInfoList;
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
