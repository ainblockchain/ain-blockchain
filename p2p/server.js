/* eslint no-mixed-operators: "off" */
const logger = new (require('../logger'))('P2P_SERVER');

const Websocket = require('ws');
const ip = require('ip');
const extIp = require('ext-ip')();
const axios = require('axios');
const disk = require('diskusage');
const os = require('os');
const v8 = require('v8');
const _ = require('lodash');
const semver = require('semver');
const ainUtil = require('@ainblockchain/ain-util');
const sizeof = require('object-sizeof');
const Consensus = require('../consensus');
const Transaction = require('../tx-pool/transaction');
const VersionUtil = require('../common/version-util');
const {
  MAX_NUM_INBOUND_CONNECTION,
  CURRENT_PROTOCOL_VERSION,
  DATA_PROTOCOL_VERSION,
  PORT,
  P2P_PORT,
  HOSTING_ENV,
  LIGHTWEIGHT,
  NETWORK_ID,
  MAX_SHARD_REPORT,
  TX_BYTES_LIMIT,
  FeatureFlags,
  MessageTypes,
  BlockchainNodeStates,
  PredefinedDbPaths,
  WriteDbOperations,
  ReadDbOperations,
  GenesisSharding,
  GenesisAccounts,
  AccountProperties,
  GENESIS_TIMESTAMP,
  RuleProperties,
  ShardingProperties,
  FunctionProperties,
  FunctionTypes,
  NativeFunctionIds,
  TrafficEventTypes,
  trafficStatsManager,
  EPOCH_MS,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const {
  sendGetRequest,
  signAndSendTx,
  sendTxAndWaitForFinalization,
} = require('../common/network-util');
const {
  getAddressFromSocket,
  removeSocketConnectionIfExists,
  signMessage,
  getAddressFromMessage,
  verifySignedMessage,
  checkTimestamp,
  closeSocketSafe,
  encapsulateMessage,
  isValidNetworkId
} = require('./util');
const PathUtil = require('../common/path-util');

const GCP_EXTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance' +
    '/network-interfaces/0/access-configs/0/external-ip';
const GCP_INTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance' +
    '/network-interfaces/0/ip';
const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';
const parentChainEndpoint = GenesisSharding[ShardingProperties.PARENT_CHAIN_POC] + '/json-rpc';
const shardingPath = GenesisSharding[ShardingProperties.SHARDING_PATH];
const reportingPeriod = GenesisSharding[ShardingProperties.REPORTING_PERIOD];
const txSizeThreshold = TX_BYTES_LIMIT * 0.9;

// A peer-to-peer network server that broadcasts changes in the database.
// TODO(minsulee2): Sign messages to tracker or peer.
class P2pServer {
  constructor (p2pClient, node, minProtocolVersion, maxProtocolVersion) {
    this.wsServer = null;
    this.client = p2pClient;
    this.node = node;
    this.consensus = new Consensus(this, node);
    this.minProtocolVersion = minProtocolVersion;
    this.maxProtocolVersion = maxProtocolVersion;
    this.dataProtocolVersion = DATA_PROTOCOL_VERSION;
    this.majorDataProtocolVersion = VersionUtil.toMajorVersion(DATA_PROTOCOL_VERSION);
    this.inbound = {};
    this.isReportingShardProofHash = false;
    this.lastReportedBlockNumberSent = -1;
  }

  async listen() {
    this.wsServer = new Websocket.Server({
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
        threshold: 1024 // Size (in bytes) below which messages should not be compressed.
      }
    });
    // Set the number of maximum clients.
    this.wsServer.setMaxListeners(MAX_NUM_INBOUND_CONNECTION);
    this.wsServer.on('connection', (socket) => {
      this.setServerSidePeerEventHandlers(socket);
    });
    logger.info(`Listening to peer-to-peer connections on: ${P2P_PORT}\n`);
    await this.setUpIpAddresses();
    this.urls = this.initUrls();
  }

  getNodeAddress() {
    return this.node.account ? this.node.account.address : null;
  }

  getNodePrivateKey() {
    return this.node.account ? this.node.account.private_key : null;
  }

  getInternalIp() {
    return this.node.ipAddrInternal;
  }

  getExternalIp() {
    return this.node.ipAddrExternal;
  }

  getProtocolInfo() {
    return {
      CURRENT_PROTOCOL_VERSION: CURRENT_PROTOCOL_VERSION,
      COMPATIBLE_MIN_PROTOCOL_VERSION: this.minProtocolVersion,
      COMPATIBLE_MAX_PROTOCOL_VERSION: this.maxProtocolVersion,
      DATA_PROTOCOL_VERSION: this.dataProtocolVersion,
      CONSENSUS_PROTOCOL_VERSION: this.consensus.consensusProtocolVersion,
    };
  }

  getStateVersionStatus() {
    return {
      numVersions: this.node.stateManager.numVersions(),
      versionList: this.node.stateManager.getVersionList(),
      finalVersion: this.node.stateManager.getFinalVersion(),
    };
  }

  getConsensusStatus() {
    return Object.assign(
      {},
      this.consensus.getStatus(),
      {
        longestNotarizedChainTipsSize: this.node.bp.longestNotarizedChainTips.length
      }
    );
  }

  getBlockStatus() {
    const timestamp = this.node.bc.lastBlockTimestamp();
    const elapsedTimeMs = (timestamp === GENESIS_TIMESTAMP) ? 0 : Date.now() - timestamp;
    return {
      number: this.node.bc.lastBlockNumber(),
      epoch: this.node.bc.lastBlockEpoch(),
      timestamp,
      elapsedTimeMs,
    };
  }

  getNodeStatus() {
    return {
      address: this.getNodeAddress(),
      state: this.node.state,
      stateNumeric: Object.keys(BlockchainNodeStates).indexOf(this.node.state),
      nonce: this.node.getNonce(),
      dbStatus: {
        stateInfo: this.node.db.getStateInfo('/'),
        stateProof: this.node.db.getStateProof('/'),
      },
      stateVersionStatus: this.getStateVersionStatus(),
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

  getTxStatus() {
    return {
      txPoolSize: this.node.tp.getPoolSize(),
      txTrackerSize: Object.keys(this.node.tp.transactionTracker).length,
    };
  }

  getShardingStatus() {
    return this.node.getSharding();
  }

  stop() {
    if (this.consensus) {
      logger.info(`Stop consensus interval.`);
      this.consensus.stop();
    }
    logger.info(`Disconnect from connected peers.`);
    this.disconnectFromPeers();
    if (this.wsServer) {
      logger.info(`Close server.`);
      this.wsServer.close();
    }
  }

  getIpAddress(internal = false) {
    return Promise.resolve()
    .then(() => {
      if (HOSTING_ENV === 'gcp') {
        return axios.get(internal ? GCP_INTERNAL_IP_URL : GCP_EXTERNAL_IP_URL, {
          headers: {'Metadata-Flavor': 'Google'},
          timeout: 3000
        })
        .then((res) => {
          return res.data;
        })
        .catch((err) => {
          CommonUtil.finishWithStackTrace(
              logger, `Failed to get ip address: ${JSON.stringify(err, null, 2)}`);
        });
      } else {
        if (internal) {
          return ip.address();
        } else {
          return extIp.get();
        }
      }
    }).then((ipAddr) => {
      return ipAddr;
    });
  }

  async setUpIpAddresses() {
    const ipAddrInternal = await this.getIpAddress(true);
    const ipAddrExternal = await this.getIpAddress(false);
    this.node.setIpAddresses(ipAddrInternal, ipAddrExternal);
    return true;
  }

  buildUrls(ip) {
    const p2pUrl = new URL(`ws://${ip}:${P2P_PORT}`);
    const stringP2pUrl = p2pUrl.toString();
    p2pUrl.protocol = 'http:';
    p2pUrl.port = PORT;
    const clientApiUrl = p2pUrl.toString();
    p2pUrl.pathname = 'json-rpc';
    const jsonRpcUrl = p2pUrl.toString();
    return {
      p2pUrl: stringP2pUrl,
      clientApiUrl: clientApiUrl,
      jsonRpcUrl: jsonRpcUrl
    };
  }

  initUrls() {
    // NOTE(liayoo, minsulee2): As discussed offline, only the 'local' HOSTING_ENV setting assumes
    // that multiple blockchain nodes are on the same machine.
    const intIp = this.getInternalIp();
    const extIp = this.getExternalIp();
    let urls;
    switch (HOSTING_ENV) {
      case 'local':
        urls = this.buildUrls(intIp);
        break;
      case 'comcom':
      case 'gcp':
        urls = this.buildUrls(extIp);
        break;
    }

    return {
      ip: extIp,
      p2p: {
        url: urls.p2pUrl,
        port: P2P_PORT,
      },
      clientApi: {
        url: urls.clientApiUrl,
        port: PORT,
      },
      jsonRpc: {
        url: urls.jsonRpcUrl,
        port: PORT,
      }
    };
  }

  getNetworkStatus() {
    return {
      urls: this.urls,
      connectionStatus: this.client.getConnectionStatus()
    };
  }

  disconnectFromPeers() {
    Object.values(this.inbound).forEach(node => {
      node.socket.close();
    });
  }

  checkDataProtoVer(messageVersion, msgType) {
    const messageMajorVersion = VersionUtil.toMajorVersion(messageVersion);
    const isLower = semver.lt(messageMajorVersion, this.majorDataProtocolVersion);
    if (isLower) {
      if (FeatureFlags.enableRichP2pCommunicationLogging) {
        logger.error(`The given ${msgType} message has unsupported DATA_PROTOCOL_VERSION: ` +
            `theirs(${messageVersion}) < ours(${this.majorDataProtocolVersion})`);
      }
      return -1;
    }
    const isGreater = semver.gt(messageMajorVersion, this.majorDataProtocolVersion);
    if (isGreater) {
      if (FeatureFlags.enableRichP2pCommunicationLogging) {
        logger.error('I may be running of the old DATA_PROTOCOL_VERSION ' +
            `theirs(${messageVersion}) > ours(${this.majorDataProtocolVersion}). ` +
            'Please check the new release via visiting the URL below:\n' +
            'https://github.com/ainblockchain/ain-blockchain');
      }
      return 1;
    }
    return 0;
  }

  setServerSidePeerEventHandlers(socket) {
    const LOG_HEADER = 'setServerSidePeerEventHandlers';
    socket.on('message', (message) => {
      trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_SERVER);
      try {
        const parsedMessage = JSON.parse(message);
        const networkId = _.get(parsedMessage, 'networkId');
        const address = getAddressFromSocket(this.inbound, socket);
        if (!isValidNetworkId(networkId)) {
          logger.error(`The given network ID(${networkId}) of the node(${address}) is MISSING or ` +
            `DIFFERENT from mine(${NETWORK_ID}). Disconnect the connection.`);
          closeSocketSafe(this.inbound, socket);
          return;
        }
        const dataProtoVer = _.get(parsedMessage, 'dataProtoVer');
        if (!VersionUtil.isValidProtocolVersion(dataProtoVer)) {
          logger.error(`The data protocol version of the node(${address}) is MISSING or ` +
              `INAPPROPRIATE. Disconnect the connection.`);
          closeSocketSafe(this.inbound, socket);
          return;
        }
        if (!checkTimestamp(_.get(parsedMessage, 'timestamp'))) {
          logger.error(`The message from the node(${address}) is stale. Discard the message.`);
          logger.debug(`The detail is as follows: ${parsedMessage}`);
          return;
        }

        switch (_.get(parsedMessage, 'type')) {
          case MessageTypes.ADDRESS_REQUEST:
            const dataVersionCheckForAddress =
                this.checkDataProtoVer(dataProtoVer, MessageTypes.ADDRESS_REQUEST);
            if (dataVersionCheckForAddress < 0) {
              // TODO(minsulee2): need to convert message when updating ADDRESS_REQUEST necessary.
              // this.convertAddressMessage();
            }
            const address = _.get(parsedMessage, 'data.body.address');
            const peerInfo = _.get(parsedMessage, 'data.body.peerInfo');
            if (!address) {
              logger.error(`Providing an address is compulsary when initiating p2p communication.`);
              closeSocketSafe(this.inbound, socket);
              return;
            } else if (!peerInfo) {
              logger.error(`Providing peerInfo is compulsary when initiating p2p communication.`);
              closeSocketSafe(this.inbound, socket);
              return;
            } else if (!_.get(parsedMessage, 'data.signature')) {
              logger.error(`A sinature of the peer(${address}) is missing during p2p ` +
                  `communication. Cannot proceed the further communication.`);
              // NOTE(minsulee2): Strictly close socket necessary??
              closeSocketSafe(this.inbound, socket);
              return;
            } else {
              const addressFromSig = getAddressFromMessage(parsedMessage);
              if (addressFromSig !== address) {
                logger.error(`The addresses(${addressFromSig} and ${address}) are not the same!!`);
                closeSocketSafe(this.inbound, socket);
                return;
              }
              if (!verifySignedMessage(parsedMessage, addressFromSig)) {
                logger.error('The message is not correctly signed. Discard the message!!');
                return;
              }
              logger.info(`A new websocket(${address}) is established.`);
              this.inbound[address] = {
                socket,
                peerInfo,
                version: dataProtoVer
              };
              const body = {
                address: this.getNodeAddress(),
                peerInfo: this.client.getStatus(),
                timestamp: Date.now(),
              };
              const signature = signMessage(body, this.getNodePrivateKey());
              if (!signature) {
                logger.error('The signaure is not correctly generated. Discard the message!');
                return;
              }
              const payload = encapsulateMessage(MessageTypes.ADDRESS_RESPONSE,
                  { body: body, signature: signature });
              if (!payload) {
                logger.error('The address cannot be sent because of msg encapsulation failure.');
                return;
              }
              socket.send(JSON.stringify(payload));
              if (!this.client.outbound[address]) {
                // TODO(minsulee2): if the url is invalid, then should it disconnect??
                const p2pUrl = _.get(peerInfo, 'networkStatus.urls.p2p.url');
                this.client.connectToPeer(p2pUrl);
              }
            }
            break;
          case MessageTypes.CONSENSUS:
            const dataVersionCheckForConsensus =
                this.checkDataProtoVer(dataProtoVer, MessageTypes.CONSENSUS);
            if (dataVersionCheckForConsensus !== 0) {
              logger.error(`[${LOG_HEADER}] The message DATA_PROTOCOL_VERSION(${dataProtoVer}) ` +
                  'is not compatible. CANNOT proceed the CONSENSUS message.');
              return;
            }
            const consensusMessage = _.get(parsedMessage, 'data.message');
            logger.debug(`[${LOG_HEADER}] Receiving a consensus message: ` +
                `${JSON.stringify(consensusMessage)}`);
            if (this.node.state === BlockchainNodeStates.SERVING) {
              this.consensus.handleConsensusMessage(consensusMessage);
            } else {
              logger.info(`\n [${LOG_HEADER}] Needs syncing...\n`);
              Object.values(this.client.outbound).forEach((node) => {
                setTimeout(() => {
                  this.client.requestChainSegment(node.socket, this.node.bc.lastBlockNumber());
                }, EPOCH_MS);
              });
            }
            break;
          case MessageTypes.TRANSACTION:
            const dataVersionCheckForTransaction =
                this.checkDataProtoVer(dataProtoVer, MessageTypes.TRANSACTION);
            if (dataVersionCheckForTransaction > 0) {
              logger.error(`[${LOG_HEADER}] CANNOT deal with higher data protocol ` +
                  `version(${dataProtoVer}). Discard the TRANSACTION message.`);
              return;
            } else if (dataVersionCheckForTransaction < 0) {
              // TODO(minsulee2): need to convert msg when updating TRANSACTION message necessary.
              // this.convertTransactionMessage();
            }
            const tx = _.get(parsedMessage, 'data.transaction');
            logger.debug(`[${LOG_HEADER}] Receiving a transaction: ${JSON.stringify(tx)}`);
            if (this.node.tp.transactionTracker[tx.hash]) {
              logger.debug(`[${LOG_HEADER}] Already have the transaction in my tx tracker`);
              return;
            }
            if (this.node.state !== BlockchainNodeStates.SERVING) {
              logger.debug(`[${LOG_HEADER}] Not ready to process transactions.\n` +
                  `My node status is now ${this.node.state}.`);
              return;
            }
            if (Transaction.isBatchTransaction(tx)) {
              const newTxList = [];
              for (const subTx of tx.tx_list) {
                const createdTx = Transaction.create(subTx.tx_body, subTx.signature);
                if (!createdTx) {
                  logger.info(`[${LOG_HEADER}] Failed to create a transaction for subTx: ` +
                    `${JSON.stringify(subTx, null, 2)}`);
                  continue;
                }
                newTxList.push(createdTx);
              }
              if (newTxList.length > 0) {
                this.executeAndBroadcastTransaction({ tx_list: newTxList });
              }
            } else {
              const createdTx = Transaction.create(tx.tx_body, tx.signature);
              if (!createdTx) {
                logger.info(`[${LOG_HEADER}] Failed to create a transaction for tx: ` +
                  `${JSON.stringify(tx, null, 2)}`);
              } else {
                this.executeAndBroadcastTransaction(createdTx);
              }
            }
            break;
          case MessageTypes.CHAIN_SEGMENT_REQUEST:
            const lastBlockNumber = _.get(parsedMessage, 'data.lastBlockNumber');
            logger.debug(`[${LOG_HEADER}] Receiving a chain segment request: ${lastBlockNumber}`);
            if (this.node.bc.chain.length === 0) {
              return;
            }
            if (this.node.state !== BlockchainNodeStates.SERVING) {
              logger.debug(`[${LOG_HEADER}] Not ready to accept chain segment request.\n` +
                  `My node status is now ${this.node.state}.`);
              return;
            }
            // Send a chunk of 20 blocks from your blockchain to the requester.
            // Requester will continue to request blockchain chunks
            // until their blockchain height matches the consensus blockchain height
            const chainSegment = this.node.bc.getBlockList(lastBlockNumber + 1);
            if (chainSegment) {
              const catchUpInfo = this.consensus.getCatchUpInfo();
              logger.debug(
                  `[${LOG_HEADER}] Sending a chain segment ` +
                  `${JSON.stringify(chainSegment, null, 2)}` +
                  `along with catchUpInfo ${JSON.stringify(catchUpInfo, null, 2)}`);
              this.sendChainSegment(
                  socket,
                  chainSegment,
                  this.node.bc.lastBlockNumber(),
                  catchUpInfo
              );
            } else {
              logger.info(`[${LOG_HEADER}] No chain segment to send`);
              this.sendChainSegment(
                  socket,
                  null,
                  this.node.bc.lastBlockNumber(),
                  null
              );
            }
            break;
          case MessageTypes.PEER_INFO_UPDATE:
            const updatePeerInfo = parsedMessage.data;
            const addressFromSocket = getAddressFromSocket(this.inbound, socket);
            // Keep updating both inbound and outbound.
            this.inbound[addressFromSocket].peerInfo = updatePeerInfo;
            this.client.outbound[addressFromSocket].networkStatus = updatePeerInfo.networkStatus;
            break;
          default:
            logger.error(`[${LOG_HEADER}] Unknown message type(${parsedMessage.type}) has been ` +
                'specified. Ignore the message.');
            break;
        }
      } catch (err) {
        logger.error(`Error: ${err} ${err.stack}`);
      }
    });

    socket.on('close', () => {
      const address = getAddressFromSocket(this.inbound, socket);
      removeSocketConnectionIfExists(this.inbound, address);
      logger.info(`Disconnected from a peer: ${address || 'unknown'}`);
    });

    socket.on('error', (error) => {
      logger.error(`Error in communication with peer ${address}: ` +
          `${JSON.stringify(error, null, 2)}`);
    });
  }

  sendChainSegment(socket, chainSegment, number, catchUpInfo) {
    const payload = encapsulateMessage(MessageTypes.CHAIN_SEGMENT_RESPONSE,
        { chainSegment: chainSegment, number: number, catchUpInfo: catchUpInfo });
    if (!payload) {
      logger.error('The cahin segment cannot be sent because of msg encapsulation failure.');
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  executeAndBroadcastTransaction(tx) {
    if (!tx) {
      return {
        tx_hash: null,
        result: false
      };
    }
    if (Transaction.isBatchTransaction(tx)) {
      const resultList = [];
      const txListSucceeded = [];
      for (const subTx of tx.tx_list) {
        if (!subTx) {
          resultList.push({
            tx_hash: null,
            result: false
          });

          continue;
        }
        const result = this.node.executeTransactionAndAddToPool(subTx);
        resultList.push({
          tx_hash: subTx.hash,
          result
        });
        if (!CommonUtil.isFailedTx(result)) {
          txListSucceeded.push(subTx);
        }
      }
      logger.debug(`\n BATCH TX RESULT: ` + JSON.stringify(resultList));
      if (txListSucceeded.length > 0) {
        this.client.broadcastTransaction({ tx_list: txListSucceeded });
      }

      return resultList;
    } else {
      const result = this.node.executeTransactionAndAddToPool(tx);
      logger.debug(`\n TX RESULT: ` + JSON.stringify(result));
      if (!CommonUtil.isFailedTx(result)) {
        this.client.broadcastTransaction(tx);
      }

      return {
        tx_hash: tx.hash,
        result
      };
    }
  }

  async tryInitializeShard() {
    if (this.node.isShardReporter && this.node.bc.lastBlockNumber() === 0) {
      logger.info(`Setting up sharding..`);
      await this.setUpDbForSharding();
      return true;
    }
    return false;
  }

  // TODO(platfowner): Set .shard config for functions, rules, and owners as well.
  async setUpDbForSharding() {
    const LOG_HEADER = 'setUpDbForSharding';
    const parentChainEndpoint = GenesisSharding[ShardingProperties.PARENT_CHAIN_POC] + '/json-rpc';
    const ownerPrivateKey = CommonUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);
    const shardOwner = GenesisSharding[ShardingProperties.SHARD_OWNER];
    const shardingPath = GenesisSharding[ShardingProperties.SHARDING_PATH];
    const appName = _.get(CommonUtil.parsePath(shardingPath), 1, null);
    if (!appName) {
      throw Error(`Invalid appName given for a shard (${shardingPath})`);
    }
    const shardingAppConfig = await P2pServer.getShardingAppConfig(parentChainEndpoint, appName);
    if (shardingAppConfig !== null && _.get(shardingAppConfig, `admin.${shardOwner}`) !== true) {
      throw Error(`Shard owner (${shardOwner}) doesn't have the permission to create a shard (${appName})`);
    }
    if (shardingAppConfig === null) {
      // Create app first.
      const shardAppCreateTxBody = P2pServer.buildShardAppCreateTxBody(appName);
      await sendTxAndWaitForFinalization(parentChainEndpoint, shardAppCreateTxBody, ownerPrivateKey);
    }
    logger.info(`[${LOG_HEADER}] shard app created`);
    const shardInitTxBody = P2pServer.buildShardingSetupTxBody();
    await sendTxAndWaitForFinalization(parentChainEndpoint, shardInitTxBody, ownerPrivateKey);
    logger.info(`[${LOG_HEADER}] shard set up success`);
  }

  async reportShardProofHashes() {
    const lastFinalizedBlock = this.node.bc.lastBlock();
    const lastFinalizedBlockNumber = lastFinalizedBlock ? lastFinalizedBlock.number : -1;
    if (lastFinalizedBlockNumber < this.lastReportedBlockNumberSent + reportingPeriod) {
      // Too early.
      return;
    }
    const lastReportedBlockNumberConfirmed = await P2pServer.getLastReportedBlockNumber();
    if (lastReportedBlockNumberConfirmed === null) {
      // Try next time.
      return;
    }
    if (this.isReportingShardProofHash) {
      return;
    }
    this.isReportingShardProofHash = true;
    try {
      let blockNumberToReport = lastReportedBlockNumberConfirmed + 1;
      const opList = [];
      while (blockNumberToReport <= lastFinalizedBlockNumber) {
        if (sizeof(opList) >= txSizeThreshold) {
          break;
        }
        const block = blockNumberToReport === lastFinalizedBlockNumber ?
            lastFinalizedBlock : this.node.bc.getBlockByNumber(blockNumberToReport);
        if (!block) {
          logger.error(`Failed to fetch block of number ${blockNumberToReport} while reporting`);
          break;
        }
        opList.push({
          type: WriteDbOperations.SET_VALUE,
          ref: `${shardingPath}/${PredefinedDbPaths.DOT_SHARD}/` +
              `${ShardingProperties.PROOF_HASH_MAP}/${blockNumberToReport}/` +
              `${ShardingProperties.PROOF_HASH}`,
          value: block.state_proof_hash
        });
        this.lastReportedBlockNumberSent = blockNumberToReport;
        blockNumberToReport++;
      }
      logger.debug(`Reporting op_list: ${JSON.stringify(opList, null, 2)}`);
      if (opList.length > 0) {
        const tx = {
          operation: {
            type: WriteDbOperations.SET,
            op_list: opList,
          },
          timestamp: Date.now(),
          nonce: -1,
          gas_price: 0,  // NOTE(platfowner): A temporary solution.
        };
        // TODO(liayoo): save the blockNumber - txHash mapping at /sharding/reports of
        // the child state.
        await signAndSendTx(parentChainEndpoint, tx, this.node.account.private_key);
      }
    } catch (err) {
      logger.error(`Failed to report state proof hashes: ${err} ${err.stack}`);
    }
    this.isReportingShardProofHash = false;
  }

  static async getLastReportedBlockNumber() {
    const resp = await sendGetRequest(
        parentChainEndpoint,
        'ain_get',
        {
          type: ReadDbOperations.GET_VALUE,
          ref: `${shardingPath}/${PredefinedDbPaths.DOT_SHARD}/${ShardingProperties.LATEST_BLOCK_NUMBER}`
        }
    );
    return _.get(resp, 'data.result.result', null);
  }

  static async getShardingAppConfig(parentChainEndpoint, appName) {
    const resp = await sendGetRequest(parentChainEndpoint, 'ain_get', {
      type: ReadDbOperations.GET_VALUE,
      ref: PathUtil.getManageAppConfigPath(appName)
    });
    return _.get(resp, 'data.result.result');
  }

  static buildShardAppCreateTxBody(appName) {
    const shardOwner = GenesisSharding[ShardingProperties.SHARD_OWNER];
    const shardReporter = GenesisSharding[ShardingProperties.SHARD_REPORTER];
    const timestamp = Date.now();
    return {
      operation: {
        type: WriteDbOperations.SET_VALUE,
        ref: PathUtil.getCreateAppRecordPath(appName, timestamp),
        value: {
          [PredefinedDbPaths.MANAGE_APP_CONFIG_ADMIN]: {
            [shardOwner]: true,
            [shardReporter]: true,
          }
        }
      },
      timestamp,
      nonce: -1,
      gas_price: 0,  // NOTE(platfowner): A temporary solution.
    }
  }

  static buildShardingSetupTxBody() {
    const shardReporter = GenesisSharding[ShardingProperties.SHARD_REPORTER];
    const shardingPath = GenesisSharding[ShardingProperties.SHARDING_PATH];
    const proofHashRulesLight = `auth.addr === '${shardReporter}'`;
    const latestBlockNumber = `(getValue('${shardingPath}/${PredefinedDbPaths.DOT_SHARD}/` +
        `${ShardingProperties.LATEST_BLOCK_NUMBER}') || 0)`;
    const reportedProofHash = `getValue('${shardingPath}/${PredefinedDbPaths.DOT_SHARD}/` +
        `${ShardingProperties.PROOF_HASH_MAP}/' + $block_number + '/${ShardingProperties.PROOF_HASH}')`;
    const proofHashRules = `auth.addr === '${shardReporter}' && newData !== null && ` +
        `($block_number === String(${latestBlockNumber} + 1) || newData === ${reportedProofHash})`;

    const latestBlockNumberRules = `auth.fid === '${NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT}'`;
    return {
      operation: {
        type: WriteDbOperations.SET,
        op_list: [
          {
            type: WriteDbOperations.SET_RULE,
            ref: CommonUtil.appendPath(
                shardingPath,
                PredefinedDbPaths.DOT_SHARD,
                ShardingProperties.PROOF_HASH_MAP,
                '$block_number'),
            value: {
              [PredefinedDbPaths.DOT_RULE]: {
                [RuleProperties.STATE]: {
                  [RuleProperties.GC_MAX_SIBLINGS]: MAX_SHARD_REPORT
                }
              }
            }
          },
          {
            type: WriteDbOperations.SET_RULE,
            ref: CommonUtil.appendPath(
                shardingPath,
                PredefinedDbPaths.DOT_SHARD,
                ShardingProperties.PROOF_HASH_MAP,
                '$block_number',
                ShardingProperties.PROOF_HASH),
            value: {
              [PredefinedDbPaths.DOT_RULE]: {
                [RuleProperties.WRITE]: LIGHTWEIGHT ? proofHashRulesLight : proofHashRules
              }
            }
          },
          {
            type: WriteDbOperations.SET_RULE,
            ref: CommonUtil.appendPath(
                shardingPath,
                PredefinedDbPaths.DOT_SHARD,
                ShardingProperties.LATEST_BLOCK_NUMBER),
            value: {
              [PredefinedDbPaths.DOT_RULE]: {
                [RuleProperties.WRITE]: latestBlockNumberRules
              }
            }
          },
          {
            type: WriteDbOperations.SET_FUNCTION,
            ref: CommonUtil.appendPath(
                shardingPath,
                PredefinedDbPaths.DOT_SHARD,
                ShardingProperties.PROOF_HASH_MAP,
                '$block_number',
                ShardingProperties.PROOF_HASH),
            value: {
              [PredefinedDbPaths.DOT_FUNCTION]: {
                [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: {
                  [FunctionProperties.FUNCTION_TYPE]: FunctionTypes.NATIVE,
                  [FunctionProperties.FUNCTION_ID]: NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT
                }
              }
            }
          },
          {
            type: WriteDbOperations.SET_VALUE,
            ref: shardingPath,
            value: {
              [PredefinedDbPaths.DOT_SHARD]: {
                [ShardingProperties.SHARDING_ENABLED]: true,
                [ShardingProperties.LATEST_BLOCK_NUMBER]: -1
              }
            }
          },
          {
            type: WriteDbOperations.SET_VALUE,
            ref: CommonUtil.formatPath([
              PredefinedDbPaths.SHARDING,
              PredefinedDbPaths.SHARDING_SHARD,
              ainUtil.encode(shardingPath)
            ]),
            value: GenesisSharding
          }
        ]
      },
      timestamp: Date.now(),
      nonce: -1,
      gas_price: 0,  // NOTE(platfowner): A temporary solution.
    };
  }
}

module.exports = P2pServer;
