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
const { BlockchainConfigs } = require('../common/constants');

const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';

class Tracker {
  constructor() {
    this.blockchainNodes = {};
  }

  setBlockchainNode(peerInfo) {
    peerInfo.location = this.getNodeLocation(peerInfo.networkStatus.ip);
    this.blockchainNodes[peerInfo.address] = peerInfo;
    logger.info(`Update from node [${abbrAddr(peerInfo.address)}]`);
    logger.debug(`: ${JSON.stringify(peerInfo, null, 2)}`);
  }

  getNumNodesAlive() {
    return Object.values(this.blockchainNodes).filter(nodeInfo => isNodeAlive(nodeInfo)).length;
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

  getProtocolInfo() {
    return {
      currentVersion: BlockchainConfigs.CURRENT_PROTOCOL_VERSION,
    };
  }
}

module.exports = Tracker;