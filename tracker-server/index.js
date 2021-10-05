/* eslint no-unused-vars: "off" */
const WebSocketServer = require('ws').Server;
const geoip = require('geoip-lite');
const express = require('express');
const jayson = require('jayson');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const disk = require('diskusage');
const os = require('os');
const v8 = require('v8');

const { getGraphData } = require('./network-topology');
const { abbrAddr } = require('./util');
const {
  TrackerMessageTypes,
  CURRENT_PROTOCOL_VERSION
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const logger = require('../logger')('TRACKER_SERVER');

const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';
const P2P_PORT = process.env.P2P_PORT || 5000;
const PORT = process.env.PORT || 8080;

const peerNodes = {};
const wsList = {};

const app = express();
const jsonRpcMethods = require('./json-rpc')(peerNodes);
app.use(express.json());
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.post('/json-rpc', jayson.server(jsonRpcMethods).middleware());

app.get('/', (req, res, next) => {
  res.status(200)
      .set('Content-Type', 'text/plain')
      .send('Welcome to AIN Blockchain Tracker')
      .end();
});

app.get('/status', (req, res, next) => {
  const result = getStatus();
  res.status(200)
      .set('Content-Type', 'application/json')
      .send(result)
      .end();
});

// Exports metrics for Prometheus.
app.get('/metrics', (req, res, next) => {
  const status = getStatus();
  const result = CommonUtil.objToMetrics(status);
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(result)
    .end();
});

app.get('/network_status', (req, res, next) => {
  const result = getNetworkStatus();
  res.status(200)
      .set('Content-Type', 'application/json')
      .send(result)
      .end();
});

app.get('/network_topology', (req, res) => {
  res.render(__dirname + '/index.html', {}, async (err, html) => {
    const networkStatus = getNetworkStatus();
    const graphData = await getGraphData(networkStatus);
    html = html.replace(/{ \/\* replace this \*\/ };/g, JSON.stringify(graphData));
    res.send(html);
  });
});

const trackerServer = app.listen(PORT, () => {
  logger.info(`App listening on port ${PORT}`);
  logger.info('Press Ctrl+C to quit.');
});

trackerServer.keepAliveTimeout = 620 * 1000; // 620 seconds
trackerServer.headersTimeout = 630 * 1000; // 630 seconds

// NOTE(platfowner): This is very useful when the server dies without any logs.
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
// TODO(minsulee2): Sign messages to nodes.
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
  // TODO(minsulee2): Verify clients.
  // verifyClient: function() {}
});

server.on('connection', (ws) => {
  ws.uuid = uuidv4();
  wsList[ws.uuid] = null;
  ws.on('message', (message) => {
    const parsedMessage = JSON.parse(message);
    switch(_.get(parsedMessage, 'type')) {
      case TrackerMessageTypes.NEW_PEERS_REQUEST:
        const connectionNodeInfo = Object.assign({ isAlive: true }, parsedMessage.data);
        setPeerNodes(ws, connectionNodeInfo);
        const newManagedPeerInfoList = assignRandomPeers(connectionNodeInfo);
        const connectionMessage = {
          type: TrackerMessageTypes.NEW_PEERS_RESPONSE,
          data: {
            newManagedPeerInfoList,
            numLivePeers: getNumNodesAlive() - 1   // except for me.
          }
        };
        logger.info(`>> Message to node [${abbrAddr(connectionNodeInfo.address)}]: ` +
            `${JSON.stringify(connectionMessage, null, 2)}`);
        ws.send(JSON.stringify(connectionMessage));
        printNodesInfo();
        break;
      case TrackerMessageTypes.PEER_INFO_UPDATE:
        const updateNodeInfo = Object.assign({ isAlive: true }, parsedMessage.data);
        setPeerNodes(ws, updateNodeInfo);
        printNodesInfo();
        break;
      default:
        logger.error(`Unknown message type(${parsedMessage.type}) has been ` +
            'specified. Ignore the message.');
        break;
    }
  });

  // TODO(minsulee2): Code should be setup ex) code === 1006: SIGINT .
  ws.on('close', (code) => {
    const address = wsList[ws.uuid];
    logger.info(`Disconnected from node [${address ? abbrAddr(address) : 'unknown'}] ` +
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

function setPeerNodes(ws, nodeInfo) {
  wsList[ws.uuid] = nodeInfo.address;
  nodeInfo.location = getNodeLocation(nodeInfo.networkStatus.ip);
  peerNodes[nodeInfo.address] = nodeInfo;
  logger.info(`\n<< Update from node [${abbrAddr(nodeInfo.address)}]`);
  logger.debug(`: ${JSON.stringify(nodeInfo, null, 2)}`);
}

function getNumNodesAlive() {
  return Object.values(peerNodes).reduce((acc, cur) => acc + (cur.isAlive ? 1 : 0), 0);
}

function getNumNodes() {
  return Object.keys(peerNodes).length;
}

function getMaxNumberOfNewPeers(nodeInfo) {
  const numOfCandidates = nodeInfo.networkStatus.connectionStatus.targetOutBound -
      nodeInfo.networkStatus.connectionStatus.outgoingPeers.length;
  if (numOfCandidates > 0) {
    return numOfCandidates;
  } else {
    return 0;
  }
}

function assignRandomPeers(nodeInfo) {
  const maxNumberOfNewPeers = getMaxNumberOfNewPeers(nodeInfo);
  if (maxNumberOfNewPeers) {
    const candidates = Object.values(peerNodes)
      .filter(peer =>
        peer.address !== nodeInfo.address &&
        peer.isAlive === true &&
        !peer.networkStatus.connectionStatus.incomingPeers.includes(nodeInfo.address) &&
        peer.networkStatus.connectionStatus.incomingPeers.length <
            peer.networkStatus.connectionStatus.maxInbound)
      .sort((a, b) =>
        a.networkStatus.connectionStatus.incomingPeers -
            b.networkStatus.connectionStatus.incomingPeers)
      .slice(0, maxNumberOfNewPeers);
    return candidates;
  } else {
    return [];
  }
}

function printNodesInfo() {
  logger.info(`Updated [peerNodes]: Number of nodes: (${getNumNodesAlive()}/${getNumNodes()})`);
  const nodeInfoList = Object.values(peerNodes).sort((x, y) => {
    return x.address > y.address ? 1 : (x.address === y.address ? 0 : -1);
  });
  nodeInfoList.forEach((nodeInfo) => {
    logger.info(`NodeSummary: ${getNodeSummary(nodeInfo)}`)
  });
}

function getNodeSummary(nodeInfo) {
  const ip = _.get(nodeInfo, 'networkStatus.ip', '');
  const diskAvailableMb = Math.floor(_.get(nodeInfo, 'diskStatus.available') / 1000 / 1000);
  const memoryFreeMb =
      Math.round(_.get(nodeInfo, 'memoryStatus.heapStats.total_available_size') / 1000 / 1000);
  return `[${abbrAddr(nodeInfo.address)} (${ip})]:\n` +
    `  isAlive: ${nodeInfo.isAlive},\n` +
    `  state: ${_.get(nodeInfo, 'nodeStatus.state')},\n` +
    `  disk: ${diskAvailableMb}MB,\n` +
    `  memory: ${memoryFreeMb}MB,\n` +
    `  peers:\n` +
    `    outbound (${_.get(nodeInfo, 'networkStatus.connectionStatus.outgoingPeers')}),\n` +
    `    inbound (${_.get(nodeInfo, 'networkStatus.connectionStatus.incomingPeers')}),\n` +
    `  updatedAt: ${nodeInfo.updatedAt}`;
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

function getNetworkStatus() {
  return {
    numNodesAlive: getNumNodesAlive(),
    peerNodes
  };
}

function getStatus() {
  return {
    networkStatus: {
      numNodesAlive: getNumNodesAlive(),
    },
    cpuStatus: getCpuUsage(),
    memoryStatus: getMemoryUsage(),
    diskStatus: getDiskUsage(),
    runtimeInfo: getRuntimeInfo(),
    protocolInfo: getProtocolInfo(),
  };
}

function getCpuUsage() {
  const cores = os.cpus();
  let free = 0;
  let total = 0;
  for (const core of cores) {
    const cpuInfo = _.get(core, 'times');
    const idle = _.get(cpuInfo, 'idle');
    const allTimes = Object.values(cpuInfo).reduce((acc, cur) => { return acc + cur }, 0);
    free += idle;
    total += allTimes;
  }
  const usage = total - free;
  const usagePercent = total ? usage / total * 100 : 0;
  return {
    free,
    usage,
    usagePercent,
    total
  };
}

function getMemoryUsage() {
  const free = os.freemem();
  const total = os.totalmem();
  const usage = total - free;
  const usagePercent = total ? usage / total * 100 : 0;
  return {
    os: {
      free,
      usage,
      usagePercent,
      total,
    },
    heap: process.memoryUsage(),
    heapStats: v8.getHeapStatistics(),
  };
}

function getDiskUsage() {
  try {
    const diskUsage = disk.checkSync(DISK_USAGE_PATH);
    const free =  _.get(diskUsage, 'free', 0);
    const total = _.get(diskUsage, 'total', 0);
    const usage = total - free;
    const usagePercent = total ? usage / total * 100 : 0;
    return Object.assign({}, diskUsage, { usage, usagePercent });
  } catch (err) {
    logger.error(`Error: ${err} ${err.stack}`);
    return {};
  }
}

function getRuntimeInfo() {
  return {
    process: {
      version: process.version,
      platform: process.platform,
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      v8Version: process.versions.v8,
    },
    os: {
      hostname: os.hostname(),
      type: os.type(),
      release: os.release(),
      // See: https://github.com/ainblockchain/ain-blockchain/issues/181
      // version: os.version(),
      uptime: os.uptime(),
    },
    env: {
      NETWORK_OPTIMIZATION: process.env.NETWORK_OPTIMIZATION,
      GENESIS_CONFIGS_DIR: process.env.GENESIS_CONFIGS_DIR,
      MIN_NUM_VALIDATORS: process.env.MIN_NUM_VALIDATORS,
      MAX_NUM_VALIDATORS: process.env.MAX_NUM_VALIDATORS,
      ACCOUNT_INDEX: process.env.ACCOUNT_INDEX,
      P2P_PORT: process.env.P2P_PORT,
      PORT: process.env.PORT,
      HOSTING_ENV: process.env.HOSTING_ENV,
      DEBUG: process.env.DEBUG,
    },
  };
}

function getProtocolInfo() {
  return {
    currentVersion: CURRENT_PROTOCOL_VERSION,
  };
}