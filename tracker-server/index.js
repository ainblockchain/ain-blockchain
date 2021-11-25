/* eslint no-unused-vars: "off" */
const logger = new (require('../logger'))('TRACKER_SERVER');

const geoip = require('geoip-lite');
const express = require('express');
const jayson = require('jayson');
const _ = require('lodash');
const disk = require('diskusage');
const os = require('os');
const v8 = require('v8');

const { getGraphData } = require('./network-topology');
const { abbrAddr } = require('./util');
const { BlockchainConfigs } = require('../common/constants');
const CommonUtil = require('../common/common-util');

const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';
const PORT = process.env.PORT || 8080;

const peerNodes = {};

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
  res.render(__dirname + '/index.html', {}, (err, html) => {
    const networkStatus = getNetworkStatus();
    const graphData = getGraphData(networkStatus);
    html = html.replace(/{ \/\* replace this \*\/ };/g, JSON.stringify(graphData));
    res.send(html);
  });
});

app.post('/update_peer_info', (req, res) => {
  const peerInfo = req.body.peerInfo;
  setPeerNodes(peerInfo);
  res.status(200)
      .set('Content-Type', 'application/json')
      .send({ result: 'updated' })
      .end();
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

function setPeerNodes(peerInfo) {
  peerInfo.location = getPeerLocation(peerInfo.networkStatus.ip);
  peerNodes[peerInfo.address] = peerInfo;
  logger.info(`Update from node [${abbrAddr(peerInfo.address)}]`);
  logger.debug(`: ${JSON.stringify(peerInfo, null, 2)}`);
}

// FIXME(minsulee2): isAlive no exists anymore
function getNumNodesAlive() {
  return Object.values(peerNodes).reduce((acc, cur) => acc + (cur.isAlive ? 1 : 0), 0);
}

function getNumNodes() {
  return Object.keys(peerNodes).length;
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

function getPeerLocation(ip) {
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
      BLOCKCHAIN_CONFIGS_DIR: process.env.BLOCKCHAIN_CONFIGS_DIR,
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
    currentVersion: BlockchainConfigs.CURRENT_PROTOCOL_VERSION,
  };
}
