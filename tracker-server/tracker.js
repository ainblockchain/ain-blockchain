const logger = new (require('../logger'))('TRACKER_SERVER');
const geoip = require('geoip-lite');
const _ = require('lodash');
const disk = require('diskusage');
const os = require('os');
const v8 = require('v8');
const {
  abbrAddr,
  isNodeAlive
} = require('./util');
const { BlockchainConsts } = require('../common/constants');

const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';

const NODE_INFO_REPORT_INTERVAL_MS = 60 * 1000;

class Tracker {
  constructor() {
    this.blockchainNodes = {};
    this.setIntervalForNodeInfoRecord();
  }

  setIntervalForNodeInfoRecord() {
    setInterval(() => {
      // NOTE(minsulee2): This will be turned into logger.debug();
      logger.info(`${JSON.stringify(this.blockchainNodes, null, 2)}`);
    }, NODE_INFO_REPORT_INTERVAL_MS);
  }

  setBlockchainNode(peerInfo) {
    peerInfo.location = this.getNodeLocation(peerInfo.networkStatus.urls.ip);
    this.blockchainNodes[peerInfo.address] = peerInfo;
    logger.info(`Update from node [${abbrAddr(peerInfo.address)}]\n` +
    `  - p2pState: ${peerInfo.networkStatus.connectionStatus.p2pState}\n` +
    `    - incomingPeers: ${JSON.stringify(peerInfo.networkStatus.connectionStatus.incomingPeers)}\n` +
    `    - outgoingPeers: ${JSON.stringify(peerInfo.networkStatus.connectionStatus.outgoingPeers)}\n` +
    `  - consensusState: ${peerInfo.consensusStatus.state}\n` +
    `  - nodeState: ${peerInfo.nodeStatus.state}`);
  }

  // Updates the aliveness status of the nodes and returns the number of alive nodes.
  getNumNodesAlive() {
    let numAliveNodes = 0;
    for (const [address, nodeInfo] of Object.entries(this.blockchainNodes)) {
      if (isNodeAlive(nodeInfo)) {
        this.blockchainNodes[address] = Object.assign({ isAlive: true }, this.blockchainNodes[address]);
        numAliveNodes++;
      } else {
        this.blockchainNodes[address] = Object.assign({ isAlive: false }, this.blockchainNodes[address]);
      }
    }
    return numAliveNodes;
  }

  getNodeLocation(ip) {
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

  getNetworkStatus() {
    return {
      numNodesAlive: this.getNumNodesAlive(),
      blockchainNodes: this.blockchainNodes
    };
  }

  getStatus() {
    return {
      networkStatus: {
        numNodesAlive: this.getNumNodesAlive(),
      },
      cpuStatus: this.getCpuUsage(),
      memoryStatus: this.getMemoryUsage(),
      diskStatus: this.getDiskUsage(),
      runtimeInfo: this.getRuntimeInfo(),
      protocolInfo: this.getProtocolInfo(),
    };
  }

  getCpuUsage() {
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

  getMemoryUsage() {
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

  getDiskUsage() {
    try {
      const diskUsage = disk.checkSync(DISK_USAGE_PATH);
      const free = _.get(diskUsage, 'free', 0);
      const total = _.get(diskUsage, 'total', 0);
      const usage = total - free;
      const usagePercent = total ? usage / total * 100 : 0;
      return Object.assign({}, diskUsage, { usage, usagePercent });
    } catch (err) {
      logger.error(`Error: ${err} ${err.stack}`);
      return {};
    }
  }

  getRuntimeInfo() {
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
        BLOCKCHAIN_CONFIGS_DIR: process.env.BLOCKCHAIN_CONFIGS_DIR,
        ACCOUNT_INDEX: process.env.ACCOUNT_INDEX,
        P2P_PORT: process.env.P2P_PORT,
        PORT: process.env.PORT,
        HOSTING_ENV: process.env.HOSTING_ENV,
        DEBUG: process.env.DEBUG,
      },
    };
  }

  getProtocolInfo() {
    return {
      currentVersion: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
    };
  }
}

module.exports = Tracker;