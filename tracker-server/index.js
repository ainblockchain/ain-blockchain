/* eslint no-unused-vars: "off" */
const WebSocketServer = require('ws').Server;
const geoip = require('geoip-lite');
const express = require('express');
const jayson = require('jayson');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger')('TRACKER_SERVER');

const P2P_PORT = process.env.P2P_PORT || 5000;
const PORT = process.env.PORT || 8080;
const peerNodes = {};
const wsList = {};

const app = express();
const jsonRpcMethods = require('./json-rpc')(peerNodes);
app.use(express.json());
app.post('/json-rpc', jayson.server(jsonRpcMethods).middleware());

app.get('/', (req, res, next) => {
  res.status(200)
      .set('Content-Type', 'text/plain')
      .send('Welcome to AIN Blockchain Tracker')
      .end();
});

app.get('/network_status', (req, res, next) => {
  res.status(200)
      .set('Content-Type', 'application/json')
      .send({ network_info: getNetworkInfo() })
      .end();
});

const trackerServer = app.listen(PORT, () => {
  logger.info(`App listening on port ${PORT}`);
  logger.info('Press Ctrl+C to quit.');
});

trackerServer.keepAliveTimeout = 620 * 1000; // 620 seconds
trackerServer.headersTimeout = 630 * 1000; // 630 seconds

// NOTE(seo): This is very useful when the server dies without any logs.
process.on('uncaughtException', function(err) {
  logger.error(err);
});

process.on('SIGINT', () => {
  logger.info('Stopping tracking server....');
  logger.info('Gracefully close websokets....');
  logger.info('Gracefully close websoket server....');
  server.close(() => {
    process.exit(1);
  });
});

// A tracker server that tracks the peer-to-peer network status of the blockchain nodes.
// TODO(minsu): Sign messages to nodes.
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
  },
  // TODO(minsu): verify clients
  // verifyClient: function() {}
});

server.on('connection', (ws) => {
  ws.uuid = uuidv4();
  wsList[ws.uuid] = null;
  ws.on('message', (message) => {
    const nodeInfo = Object.assign({ isAlive: true }, JSON.parse(message));
    wsList[ws.uuid] = nodeInfo.address;
    nodeInfo.location = getNodeLocation(nodeInfo.networkStatus.ip);
    // TODO(minsu): It will be managed via peers when heartbeat updates.
    peerNodes[nodeInfo.address] = nodeInfo;
    logger.info(`\n<< Update from node [${abbrAddr(nodeInfo.address)}]`);
    logger.debug(`: ${JSON.stringify(nodeInfo, null, 2)}`);

    let newManagedPeerInfoList = [];
    if (Object.keys(nodeInfo.networkStatus.managedPeersInfo.outbound).length <
        nodeInfo.networkStatus.connectionInfo.maxOutbound) {
      newManagedPeerInfoList = assignRandomPeers(getPeerCandidates(nodeInfo.address));
    }
    const msgToNode = {
      newManagedPeerInfoList,
      numLivePeers: numAliveNodes() - 1   // except for me.
    };
    logger.info(`>> Message to node [${abbrAddr(nodeInfo.address)}]: ` +
        `${JSON.stringify(msgToNode, null, 2)}`);
    ws.send(JSON.stringify(msgToNode));
    printNodesInfo();
  });

  // TODO(minsu): code should be setup ex) code === 1006: SIGINT
  ws.on('close', (code) => {
    const address = wsList[ws.uuid];
    logger.info(`\nDisconnected from node [${address ? abbrAddr(address) : 'unknown'}] ` +
        `with code: ${code}`);
    delete wsList[ws.uuid];
    peerNodes[address].isAlive = false;
    printNodesInfo();
  });

  ws.on('error', (error) => {
    const address = wsList[ws.uuid];
    logger.error(`Error in communication with node [${abbrAddr(address)}]: ` +
        `${JSON.stringify(error, null, 2)}`);
  });
});

function abbrAddr(address) {
  return `${address.substring(0, 6)}..${address.substring(address.length - 4)}`;
}

function numAliveNodes() {
  return Object.values(peerNodes).reduce((acc, cur) => acc + (cur.isAlive ? 1 : 0), 0);
}

function numNodes() {
  return Object.keys(peerNodes).length;
}

function assignRandomPeers(candidates) {
  if (_.isEmpty(candidates)) {
    return [];
  }

  const shuffled = _.shuffle(candidates);
  if (shuffled.length > 1) {
    return [shuffled.pop(), shuffled.pop()];
  } else {
    return shuffled;
  }
}

function getPeerCandidates(myself) {
  const candidates = [];
  Object.values(peerNodes).forEach(nodeInfo => {
    if (nodeInfo.address !== myself &&
        nodeInfo.isAlive === true &&
        !(myself in nodeInfo.networkStatus.managedPeersInfo.inbound) &&
        Object.keys(nodeInfo.networkStatus.managedPeersInfo.inbound).length <
            nodeInfo.networkStatus.connectionInfo.maxInbound) {
      candidates.push({
        address: nodeInfo.address,
        url: nodeInfo.networkStatus.p2p.url
      });
    }
  });
  return candidates;
}

function printNodesInfo() {
  logger.info(`Updated [peerNodes]: Number of nodes: (${numAliveNodes()}/${numNodes()})`);
  const nodeInfoList = Object.values(peerNodes).sort((x, y) => {
    return x.address > y.address ? 1 : (x.address === y.address ? 0 : -1);
  });
  nodeInfoList.forEach((nodeInfo) => {
    const diskAvailableMb = Math.floor(_.get(nodeInfo, 'diskStatus.available') / 1000 / 1000);
    const memoryFreeMb =
        Math.round(_.get(nodeInfo, 'memoryStatus.heapStats.total_available_size') / 1000 / 1000);
    logger.info(`NodeSummary: ${getNodeSummary(nodeInfo)}\n` +
        `isAlive: ${nodeInfo.isAlive},\n` +
        `Disk: ${diskAvailableMb}MB,\n` +
        `Memory: ${memoryFreeMb}MB,\n` +
        `Peers:\n` +
        `  outbound(${Object.keys(nodeInfo.networkStatus.managedPeersInfo.outbound)}),\n` +
        `  inbound(${Object.keys(nodeInfo.networkStatus.managedPeersInfo.inbound)}),\n` +
        `UpdatedAt: ${nodeInfo.updatedAt}`);
  });
}

function getNodeSummary(nodeInfo) {
  return `[${abbrAddr(nodeInfo.address)}]: ${JSON.stringify(nodeInfo.nodeStatus, null, 2)}`;
}

function getNodeLocation(ip) {
  const geoLocationDict = geoip.lookup(ip);
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

function getNetworkInfo() {
  return {
    numAliveNodes: numAliveNodes() ,
    peerNodes
  };
}