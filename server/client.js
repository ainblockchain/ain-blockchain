/* eslint no-mixed-operators: "off" */
const url = require('url');
const Websocket = require('ws');
const ip = require('ip');
const publicIp = require('public-ip');
const axios = require('axios');
const semver = require('semver');
const disk = require('diskusage');
const os = require('os');
const v8 = require('v8');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('P2P_SERVER');
const Consensus = require('../consensus');
const {ConsensusStatus} = require('../consensus/constants');
const {Block} = require('../blockchain/block');
const Transaction = require('../tx-pool/transaction');
const {
  PORT,
  P2P_PORT,
  TRACKER_WS_ADDR,
  HOSTING_ENV,
  COMCOM_HOST_EXTERNAL_IP,
  COMCOM_HOST_INTERNAL_IP_MAP,
  MessageTypes,
  BlockchainNodeStatus,
  PredefinedDbPaths,
  WriteDbOperations,
  GenesisSharding,
  GenesisAccounts,
  AccountProperties,
  OwnerProperties,
  RuleProperties,
  ShardingProperties,
  FunctionProperties,
  FunctionTypes,
  NativeFunctionIds,
  buildOwnerPermissions,
  LIGHTWEIGHT
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const {sendTxAndWaitForFinalization} = require('./util');

const GCP_EXTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance' +
    '/network-interfaces/0/access-configs/0/external-ip';
const GCP_INTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance' +
    '/network-interfaces/0/ip';
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;
const RECONNECT_INTERVAL_MS = 10000;
const UPDATE_TO_TRACKER_INTERVAL_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 1000;
const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';

class P2pClient {
  constructor (node, consensus, connectionInfo) {
    this.node = node;
    this.consensus = consensus;
    this.managedPeersInfo = {};
    this.connectionInfo = connectionInfo;
  }

  setIntervalForTrackerConnection() {
    this.connectToTracker();
    this.intervalConnection = setInterval(() => {
      this.connectToTracker();
    }, RECONNECT_INTERVAL_MS)
  }

  connectToTracker() {
    logger.info(`Reconnecting to tracker (${TRACKER_WS_ADDR})`);
    this.trackerWebSocket = new Websocket(TRACKER_WS_ADDR);
    this.trackerWebSocket.on('open', () => {
      logger.info(`Connected to tracker (${TRACKER_WS_ADDR})`);
      this.clearIntervalForTrackerConnection();
      this.setTrackerEventHandlers();
      this.setIntervalForTrackerUpdate();
    });
    this.trackerWebSocket.on('error', (error) => {
      logger.error(`Error in communication with tracker (${TRACKER_WS_ADDR}): ` +
                    `${JSON.stringify(error, null, 2)}`);
    });
  }

  clearIntervalForTrackerConnection() {
    clearInterval(this.intervalConnection);
    this.intervalConnection = null;
  }

  async setTrackerEventHandlers() {
    this.trackerWebSocket.on('message', async (message) => {
      try {
        const parsedMsg = JSON.parse(message);
        logger.info(`\n << Message from [TRACKER]: ${JSON.stringify(parsedMsg, null, 2)}`);
        if (this.connectToPeers(parsedMsg.newManagedPeerInfoList)) {
          logger.debug(`Updated MANAGED peers info: ` +
              `${JSON.stringify(this.managedPeersInfo, null, 2)}`);
        }
        if (this.connectToPeers(parsedMsg.newUnmanagedPeerInfoList)) {
          logger.debug(`Updated UNMANAGED peers info: ` +
              `${JSON.stringify(this.managedPeersInfo, null, 2)}`);
        }
        if (this.node.status === BlockchainNodeStatus.STARTING) {
          this.node.status = BlockchainNodeStatus.SYNCING;
          if (parsedMsg.numLivePeers === 0) {
            const lastBlockWithoutProposal = this.node.init(true);
            await this.tryInitializeShard();
            this.node.status = BlockchainNodeStatus.SERVING;
            this.consensus.init(lastBlockWithoutProposal, true);
          } else {
            // Consensus will be initialized after syncing with peers
            this.node.init(false);
          }
        }
      } catch (error) {
        logger.error(error.stack);
      }
    });

    this.trackerWebSocket.on('close', (code) => {
      logger.info(`\n Disconnected from [TRACKER] ${TRACKER_WS_ADDR} with code: ${code}`);
      this.clearIntervalForTrackerUpdate();
      this.setIntervalForTrackerConnection();
    });
  }

  connectToPeers(newPeerInfoList) {
    let updated = false;
    newPeerInfoList.forEach((peerInfo) => {
      if (this.managedPeersInfo[peerInfo.address]) {
        logger.info(`Node ${peerInfo.address} is already a managed peer. Something went wrong.`);
      } else {
        logger.info(`Connecting to peer ${JSON.stringify(peerInfo, null, 2)}`);
        this.managedPeersInfo[peerInfo.address] = peerInfo;
        updated = true;
        const socket = new Websocket(peerInfo.url);
        socket.on('open', () => {
          logger.info(`Connected to peer ${peerInfo.address} (${peerInfo.url}).`);
          this.setSocket(socket, peerInfo.address);
        });
      }
    });

    return updated;
  }

  getNodeStatus() {
    return {
      address: this.node.account.address,
      status: this.node.status,
      nonce: this.node.nonce,
      last_block_number: this.node.bc.lastBlockNumber(),
      db: {
        tree_size: this.node.db.getTreeSize('/'),
        proof: this.node.db.getProof('/'),
      },
      state_versions: this.getStateVersions(),
    };
  }

  getStateVersions() {
    return {
      num_versions: this.node.stateManager.numVersions(),
      version_list: this.node.stateManager.getVersionList(),
      final_version: this.node.stateManager.getFinalVersion(),
    };
  }

  getDiskUsage() {
    try {
      return disk.checkSync(DISK_USAGE_PATH);
    } catch (err) {
      logger.error(err);
      return {};
    }
  }

  getMemoryUsage() {
    const free = os.freemem();
    const total = os.totalmem();
    const usage = total - free;
    return {
      os: {
        free,
        usage,
        total,
      },
      heap: process.memoryUsage(),
      heapStats: v8.getHeapStatistics(),
    };
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
        // version: os.version(),
        uptime: os.uptime(),
      },
      env: {
        NUM_VALIDATORS: process.env.NUM_VALIDATORS,
        ACCOUNT_INDEX: process.env.ACCOUNT_INDEX,
        HOSTING_ENV: process.env.HOSTING_ENV,
        DEBUG: process.env.DEBUG,
      },
    };
  }

  // TODO(seo): Add sharding status.
  updateNodeStatusToTracker() {
    const updateToTracker = {
      address: this.node.account.address,
      updatedAt: Date.now(),
      url: url.format({
        protocol: 'ws',
        hostname: this.node.ipAddrExternal,
        port: P2P_PORT
      }),
      ip: this.node.ipAddrExternal,
      port: P2P_PORT,
      lastBlock: {
        number: this.node.bc.lastBlockNumber(),
        epoch: this.node.bc.lastBlockEpoch(),
        timestamp: this.node.bc.lastBlockTimestamp(),
      },
      consensusStatus: Object.assign(
        {},
        this.consensus.getState(),
        {
          longestNotarizedChainTipsSize: this.consensus.blockPool ?
            this.consensus.blockPool.longestNotarizedChainTips.length : 0
        }
      ),
      nodeStatus: this.getNodeStatus(),
      shardingStatus: this.node.getSharding(),
      txStatus: {
        txPoolSize: this.node.tp.getPoolSize(),
        txTrackerSize: Object.keys(this.node.tp.transactionTracker).length,
        committedNonceTrackerSize: Object.keys(this.node.tp.committedNonceTracker).length,
        pendingNonceTrackerSize: Object.keys(this.node.tp.pendingNonceTracker).length,
      },
      memoryStatus: this.getMemoryUsage(),
      diskStatus: this.getDiskUsage(),
      runtimeInfo: this.getRuntimeInfo(),
      managedPeersInfo: this.managedPeersInfo,
      connectionInfo: this.connectionInfo
    };
    logger.debug(`\n >> Update to [TRACKER] ${TRACKER_WS_ADDR}: ` +
      `${JSON.stringify(updateToTracker, null, 2)}`);
      console.log(updateToTracker)
    this.trackerWebSocket.send(JSON.stringify(updateToTracker));
  }

  setIntervalForTrackerUpdate() {
    this.updateNodeStatusToTracker();
    this.intervalUpdate = setInterval(() => {
      this.updateNodeStatusToTracker();
    }, UPDATE_TO_TRACKER_INTERVAL_MS)
  }

  clearIntervalForTrackerUpdate() {
    clearInterval(this.intervalUpdate);
    this.intervalUpdate = null;
  }

  disconnectFromTracker() {
    this.trackerWebSocket.close();
  }
}

module.exports = P2pClient;
