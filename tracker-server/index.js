/* eslint no-unused-vars: "off" */
const WebSocketServer = require('ws').Server;
const geoip = require('geoip-lite');
const express = require('express');
const jayson = require('jayson');
const _ = require('lodash');
const logger = require('../logger')('TRACKER');

const P2P_PORT = process.env.P2P_PORT || 5000;
const PORT = process.env.PORT || 8080;
const MAX_NUM_PEERS = 2;
const PEER_NODES = {};
const WS_LIST = [];
const MASK = 'xxx';

// NOTE(seo): This is very useful when the server dies without any logs.
process.on('uncaughtException', function(err) {
  logger.error(err);
});

process.on('SIGINT', (_) => {
  logger.info('Stopping tracking server....');
  logger.info('Gracefully close websokets....');
  for (const ws of WS_LIST) {
    ws.close();
  }
  logger.info('Gracefully close websoket server....');
  server.close((_) => {
    process.exit(0);
  });
});

function abbrAddr(address) {
  return `${address.substring(0, 6)}..${address.substring(address.length - 4)}`;
}

function numNodes() {
  return Object.keys(PEER_NODES).length;
}

function numLiveNodes() {
  const liveNodes = Object.values(PEER_NODES).filter((node) => {
    return node.isLive;
  });
  return liveNodes.length;
}

function numLivePeers(address) {
  const livePeers = Object.values(PEER_NODES).filter((node) => {
    return node.isLive && node.address !== address;
  });
  return livePeers.length;
}

function printNodesInfo() {
  logger.info(`Updated [PEER_NODES]: (Number of nodes: ${numLiveNodes()}/${numNodes()}` +
      `at ${Date.now()})`);
  const nodeList = Object.values(PEER_NODES).sort((x, y) => {
    return x.address > y.address ? 1 : (x.address === y.address ? 0 : -1);
  });
  for (let i = 0; i < nodeList.length; i++) {
    const node = nodeList[i];
    const diskAvailableMb = Math.floor(node.diskUsage.available / 1000 / 1000);
    const memoryFreeMb = Math.round(node.memoryUsage.free / 1000 / 1000);
    logger.info(`    Node[${i}]: ${node.getNodeSummary()} ` +
      `LastBlock: ${node.lastBlock.number}, ` +
      `Disk: ${diskAvailableMb}MB, ` +
      `Memory: ${memoryFreeMb}MB, ` +
      `Peers: ${node.numPeers()} (${node.numManagedPeers()}/${node.numUnmanagedPeers()}), ` +
      `UpdatedAt: ${node.updatedAt}`);
    Object.keys(node.managedPeers).forEach((addr) => {
      const peerSummary = PEER_NODES[addr]
        ? PEER_NODES[addr].getNodeSummary() : PeerNode.getUnknownNodeSummary(addr);
      logger.info(`      Managed peer: ${peerSummary}`);
    });
  }
}

// XXX(minsu): need to be inverstigated. This is not using it now.
// A util function for testing/debugging.
function setTimer(ws, timeSec) {
  setTimeout(() => {
    ws.close();
  }, timeSec * 1000);
}

// A tracker server that tracks the peer-to-peer network status of the blockchain nodes.
// TODO(seo): Sign messages to nodes.
const server = new WebSocketServer({
  port: P2P_PORT,
  // Enables server-side compression. For option details, see
  // https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed.
  }
});
server.on('connection', (ws) => {
  WS_LIST.push(ws);
  let node = null;
  ws.on('message', (message) => {
    try {
      const nodeInfo = JSON.parse(message);
      if (PEER_NODES[nodeInfo.address]) {
        node = PEER_NODES[nodeInfo.address].reconstruct(nodeInfo);
        node.assignRandomPeers();
        logger.info(`\n<< Update from node [${abbrAddr(nodeInfo.address)}]: ` +
          `${JSON.stringify(nodeInfo, null, 2)}`)
      } else {
        node = new PeerNode(nodeInfo);
        node.assignRandomPeers();
        PEER_NODES[nodeInfo.address] = node;
      }
      const newManagedPeerInfoList = node.getManagedPeerInfoList().filter((peerInfo) => {
        return !nodeInfo.managedPeersInfo[peerInfo.address];
      });
      const msgToNode = {
        newManagedPeerInfoList,
        numLivePeers: numLivePeers(node.address)
      };
      logger.info(`>> Message to node [${abbrAddr(node.address)}]: ` +
        `${JSON.stringify(msgToNode, null, 2)}`)
      ws.send(JSON.stringify(msgToNode));
      printNodesInfo();
    } catch (error) {
      logger.error(error.stack);
    }
  });

  ws.on('close', (code) => {
    logger.info(`\nDisconnected from node [${node ? abbrAddr(node.address) : 'unknown'}] ` +
      `with code: ${code}`);
    PEER_NODES[node.address].isLive = false;
    printNodesInfo();
  });

  ws.on('error', (error) => {
    logger.error(`Error in communication with node [${abbrAddr(node.address)}]: ` +
      `${JSON.stringify(error, null, 2)}`)
  });
});

class PeerNode {
  constructor(nodeInfo) {
    this.reconstruct(nodeInfo);
  }

  reconstruct(nodeInfo) {
    this.isLive = true;

    const infoToAdd = Object.assign({}, nodeInfo);
    delete infoToAdd.managedPeersInfo;
    Object.assign(this, infoToAdd);

    this.location = this.getNodeLocation();
    this.managedPeers = PeerNode.constructManagedPeers(nodeInfo);
    this.unmanagedPeers = PeerNode.constructUnmanagedPeers(nodeInfo.address);

    return this;
  }

  getNodeInfo() {
    return {
      ip: PeerNode.maskIp(this.ip),
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
    return `[${abbrAddr(this.address)}] (${this.url}) -> ${this.isLive ? '(O)' : '(X)'}`;
  }

  static getUnknownNodeSummary(address) {
    return `[${abbrAddr(address)}] (unknown) -> unknown`;
  }

  static maskIp(ip) {
    const ipList = ip.split('.');
    ipList[0] = MASK;
    ipList[1] = MASK;
    return ipList.join('.');
  }

  getNodeLocation() {
    const geoLocationDict = geoip.lookup(this.ip);
    if (geoLocationDict === null) {
      return {
        country: null,
        region: null,
        city: null,
        timezone: null,
      };
    }
    return {
      country: _.isEmpty(geoLocationDict.country) ? null : geoLocationDict.country,
      region: _.isEmpty(geoLocationDict.region) ? null : geoLocationDict.region,
      city: _.isEmpty(geoLocationDict.city) ? null : geoLocationDict.city,
      timezone: _.isEmpty(geoLocationDict.timezone) ? null : geoLocationDict.timezone,
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
    Object.values(PEER_NODES).forEach((node) => {
      if (node.address !== address && node.managedPeers[address]) {
        unmanagedPeers[node.address] = true;
      }
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

  getPeerCandidates() {
    return Object.values(PEER_NODES).filter((other) => {
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
      if (PEER_NODES[addr]) {
        peerInfoList.push({
          address: addr,
          url: PEER_NODES[addr].url
        });
      }
    });
    return peerInfoList;
  }
}

const app = express();
app.use(express.json()); // support json encoded bodies

const jsonRpcMethods = require('./json-rpc')(PEER_NODES);
app.post('/json-rpc', jayson.server(jsonRpcMethods).middleware());

app.get('/', (req, res, next) => {
  res.status(200)
      .set('Content-Type', 'text/plain')
      .send('Welcome to AIN Blockchain Tracker')
      .end();
});

app.get('/peer_nodes', (req, res, next) => {
  res.status(200)
      .set('Content-Type', 'application/json')
      .send({ result: PEER_NODES })
      .end();
});

const trackerServer = app.listen(PORT, () => {
  logger.info(`App listening on port ${PORT}`);
  logger.info('Press Ctrl+C to quit.');
});

trackerServer.keepAliveTimeout = 620 * 1000; // 620 seconds
trackerServer.headersTimeout = 630 * 1000; // 630 seconds
