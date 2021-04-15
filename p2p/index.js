/* eslint no-mixed-operators: "off" */
const _ = require('lodash');
const P2pServer = require('./server');
const url = require('url');
const Websocket = require('ws');
const semver = require('semver');
const logger = require('../logger')('P2P_SERVER');
const { ConsensusStatus } = require('../consensus/constants');
const VersionUtil = require('../common/version-util');
const {
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP,
  DATA_PROTOCOL_VERSION,
  PORT,
  P2P_PORT,
  TRACKER_WS_ADDR,
  MessageTypes,
  BlockchainNodeStates,
  DEFAULT_MAX_OUTBOUND,
  DEFAULT_MAX_INBOUND,
  MAX_OUTBOUND_LIMIT,
  MAX_INBOUND_LIMIT
} = require('../common/constants');
const {
  getAddressFromSocket,
  removeSocketConnectionIfExists,
  signMessage,
  getAddressFromSignature,
  verifySignedMessage,
  checkProtoVer,
  safeCloseSocket
} = require('./util');

const RECONNECT_INTERVAL_MS = 5 * 1000;  // 5 seconds
const UPDATE_TO_TRACKER_INTERVAL_MS = 5 * 1000;  // 5 seconds
const HEARTBEAT_INTERVAL_MS = 60 * 1000;  // 1 minute

class P2pClient {
  constructor(node, minProtocolVersion, maxProtocolVersion) {
    this.initConnections();
    this.server = new P2pServer(
        this, node, minProtocolVersion, maxProtocolVersion, this.maxInbound);
    this.trackerWebSocket = null;
    this.outbound = {};
    this.startHeartbeat();
  }

  run() {
    this.server.listen();
    this.setIntervalForTrackerConnection();
  }

  // NOTE(minsu): the total number of connection is up to more than 5 without limit.
  // maxOutbound is for now limited equal or less than 2.
  // maxInbound is a rest of connection after maxOutbound is set.
  initConnections() {
    const numOutbound = process.env.MAX_OUTBOUND ?
        Number(process.env.MAX_OUTBOUND) : DEFAULT_MAX_OUTBOUND;
    const numInbound = process.env.MAX_INBOUND ?
        Number(process.env.MAX_INBOUND) : DEFAULT_MAX_INBOUND;
    this.maxOutbound = Math.min(numOutbound, MAX_OUTBOUND_LIMIT);
    this.maxInbound = Math.min(numInbound, MAX_INBOUND_LIMIT);
  }

  getConnectionStatus() {
    const incomingPeers = Object.keys(this.server.inbound);
    const outgoingPeers = Object.keys(this.outbound);
    return {
      maxInbound: this.maxInbound,
      maxOutbound: this.maxOutbound,
      numInbound: incomingPeers.length,
      numOutbound: outgoingPeers.length,
      incomingPeers: incomingPeers,
      outgoingPeers: outgoingPeers,
    };
  }

  setIntervalForTrackerConnection() {
    this.connectToTracker();
    this.intervalConnection = setInterval(() => {
      this.connectToTracker();
    }, RECONNECT_INTERVAL_MS);
  }

  clearIntervalForTrackerConnection() {
    clearInterval(this.intervalConnection);
    this.intervalConnection = null;
  }

  getNetworkStatus() {
    return {
      ip: this.server.getExternalIp(),
      p2p: {
        url: url.format({
          protocol: 'ws',
          hostname: this.server.getExternalIp(),
          port: P2P_PORT
        }),
        port: P2P_PORT,
      },
      clientApi: {
        url: url.format({
          protocol: 'http',
          hostname: this.server.getExternalIp(),
          port: PORT
        }),
        port: PORT,
      },
      jsonRpc: {
        url: url.format({
          protocol: 'http',
          hostname: this.server.getExternalIp(),
          port: PORT,
          pathname: '/json-rpc',
        }),
        port: PORT,
      },
      connectionStatus: this.getConnectionStatus()
    }
  }

  getStatus() {
    const blockStatus = this.server.getBlockStatus();
    return {
      address: this.server.getNodeAddress(),
      updatedAt: Date.now(),
      lastBlockNumber: blockStatus.number,
      networkStatus: this.getNetworkStatus(),
      blockStatus: blockStatus,
      txStatus: this.server.getTxStatus(),
      consensusStatus: this.server.getConsensusStatus(),
      nodeStatus: this.server.getNodeStatus(),
      shardingStatus: this.server.getShardingStatus(),
      memoryStatus: this.server.getMemoryUsage(),
      diskStatus: this.server.getDiskUsage(),
      runtimeInfo: this.server.getRuntimeInfo(),
      protocolInfo: this.server.getProtocolInfo(),
    };
  }

  updateNodeStatusToTracker() {
    const updateToTracker = this.getStatus();
    logger.debug(`\n >> Update to [TRACKER] ${TRACKER_WS_ADDR}: ` +
      `${JSON.stringify(updateToTracker, null, 2)}`);
    this.trackerWebSocket.send(JSON.stringify(updateToTracker));
  }

  setIntervalForTrackerUpdate() {
    this.updateNodeStatusToTracker();
    this.intervalUpdate = setInterval(() => {
      this.updateNodeStatusToTracker();
    }, UPDATE_TO_TRACKER_INTERVAL_MS)
  }

  async setTrackerEventHandlers() {
    const node = this.server.node;
    this.trackerWebSocket.on('message', async (message) => {
      try {
        const parsedMsg = JSON.parse(message);
        logger.info(`\n << Message from [TRACKER]: ${JSON.stringify(parsedMsg, null, 2)}`);
        if (this.connectToPeers(parsedMsg.newManagedPeerInfoList)) {
          logger.debug(`Updated MANAGED peers info: ` +
              `${JSON.stringify(this.server.managedPeersInfo, null, 2)}`);
        }
        if (node.state === BlockchainNodeStates.STARTING) {
          node.state = BlockchainNodeStates.SYNCING;
          if (parsedMsg.numLivePeers === 0) {
            const lastBlockWithoutProposal = node.init(true);
            await this.server.tryInitializeShard();
            node.state = BlockchainNodeStates.SERVING;
            this.server.consensus.init(lastBlockWithoutProposal);
          } else {
            // Consensus will be initialized after syncing with peers
            node.init(false);
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

  broadcastConsensusMessage(msg) {
    const payload = {
      type: MessageTypes.CONSENSUS,
      message: msg,
      protoVer: CURRENT_PROTOCOL_VERSION,
      dataProtoVer: DATA_PROTOCOL_VERSION
    };
    const stringPayload = JSON.stringify(payload);
    Object.values(this.outbound).forEach(socket => {
      socket.send(stringPayload);
    });
    logger.debug(`SENDING: ${JSON.stringify(msg)}`);
  }

  requestChainSegment(socket, lastBlock) {
    const payload = {
      type: MessageTypes.CHAIN_SEGMENT_REQUEST,
      lastBlock,
      protoVer: CURRENT_PROTOCOL_VERSION,
      dataProtoVer: DATA_PROTOCOL_VERSION
    };
    socket.send(JSON.stringify(payload));
  }

  broadcastTransaction(transaction) {
    const payload = {
      type: MessageTypes.TRANSACTION,
      transaction,
      protoVer: CURRENT_PROTOCOL_VERSION,
      dataProtoVer: DATA_PROTOCOL_VERSION
    };
    const stringPayload = JSON.stringify(payload);
    Object.values(this.outbound).forEach(socket => {
      socket.send(stringPayload);
    });
    logger.debug(`SENDING: ${JSON.stringify(transaction)}`);
  }

  sendAddress(socket) {
    const body = {
      address: this.server.getNodeAddress(),
      timestamp: Date.now(),
    };
    const signature = signMessage(body, this.server.getNodePrivateKey());
    const payload = {
      type: MessageTypes.ADDRESS_REQUEST,
      body,
      signature,
      protoVer: CURRENT_PROTOCOL_VERSION,
      dataProtoVer: DATA_PROTOCOL_VERSION
    };
    socket.send(JSON.stringify(payload));
  }

  checkDataProtoVer(socket, version) {
    if (!version || !semver.valid(version)) {
      safeCloseSocket(this.outbound, socket);
      return false;
    }
    const majorVersion = VersionUtil.toMajorVersion(version);
    if (semver.gt(VersionUtil.toMajorVersion(this.server.dataProtocolVersion), majorVersion)) {
      // TODO(minsu): may necessary auto disconnection based on timestamp??
      logger.error(`The node(${getAddressFromSocket(this.outbound, socket)}) is incompatible in ` +
          `the data protocol manner. You may be necessary to disconnect the connection with the ` +
          `node in order to keep harmonious communication in the network.`);
    }
    if (semver.lt(VersionUtil.toMajorVersion(this.server.dataProtocolVersion), majorVersion)) {
      logger.error('My data protocol version may be outdated. Please check the latest version at ' +
          'https://github.com/ainblockchain/ain-blockchain/releases');
    }
    return true;
  }

  // TODO(minsu): this check will be updated when data compatibility version up.
  checkDataProtoVerForAddressResponse(version) {
    const majorVersion = VersionUtil.toMajorVersion(version);
    if (semver.gt(VersionUtil.toMajorVersion(this.server.dataProtocolVersion), majorVersion)) {
      // TODO(minsu): compatible message
    }
    if (semver.lt(VersionUtil.toMajorVersion(this.server.dataProtocolVersion), majorVersion)) {
      // TODO(minsu): compatible message
    }
  }

  checkDataProtoVerForChainSegmentResponse(version) {
    const majorVersion = VersionUtil.toMajorVersion(version);
    if (semver.gt(VersionUtil.toMajorVersion(this.server.dataProtocolVersion), majorVersion)) {
      // TODO(minsu): compatible message
    }
    if (semver.lt(VersionUtil.toMajorVersion(this.server.dataProtocolVersion), majorVersion)) {
      logger.error('CANNOT deal with higher data protocol version. Discard the ' +
          'CHAIN_SEGMENT_RESPONSE message.');
      return false;
    }
    return true;
  }

  // TODO(minsu): Check timestamp all round.
  setPeerEventHandlers(socket) {
    const LOG_HEADER = 'setPeerEventHandlers';
    socket.on('message', (message) => {
      const data = JSON.parse(message);
      const dataProtoVer = data.dataProtoVer;
      if (!checkProtoVer(this.outbound, socket,
          this.server.minProtocolVersion, this.server.maxProtocolVersion, data.protoVer)) {
        return;
      }
      if (!this.checkDataProtoVer(socket, dataProtoVer)) {
        return;
      }

      switch (data.type) {
        case MessageTypes.ADDRESS_RESPONSE:
          // TODO(minsu): Add compatibility check here after data version up.
          // this.checkDataProtoVerForAddressResponse(dataProtoVer);
          const address = _.get(data, 'body.address');
          if (!address) {
            logger.error(`Providing an address is compulsary when initiating p2p communication.`);
            safeCloseSocket(this.outbound, socket);
            return;
          } else if (!data.signature) {
            logger.error(`A sinature of the peer(${address}) is missing during p2p ` +
                `communication. Cannot proceed the further communication.`);
            safeCloseSocket(this.outbound, socket);   // NOTE(minsu): strictly close socket necessary??
            return;
          } else {
            const addressFromSig = getAddressFromSignature(data);
            if (addressFromSig !== address) {
              logger.error(`The addresses(${addressFromSig} and ${address}) are not the same!!`);
              safeCloseSocket(this.outbound, socket);
              return;
            }
            if (!verifySignedMessage(data, addressFromSig)) {
              logger.error('The message is not correctly signed. Discard the message!!');
              return;
            }
            logger.info(`A new websocket(${address}) is established.`);
            this.outbound[address] = socket;
          }
          break;
        case MessageTypes.CHAIN_SEGMENT_RESPONSE:
          if (!this.checkDataProtoVerForChainSegmentResponse(dataProtoVer)) {
            return;
          }
          logger.debug(`[${LOG_HEADER}] Receiving a chain segment: ` +
              `${JSON.stringify(data.chainSegment, null, 2)}`);
          // Check catchup info is behind or equal to me
          if (data.number <= this.server.node.bc.lastBlockNumber()) {
            if (this.server.consensus.status === ConsensusStatus.STARTING) {
              if ((!data.chainSegment && !data.catchUpInfo) ||
                  data.number === this.server.node.bc.lastBlockNumber()) {
                // Regard this situation as if you're synced.
                // TODO(lia): ask the tracker server for another peer.
                // XXX(minsu): Need to more discussion about this.
                logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
                this.server.node.state = BlockchainNodeStates.SERVING;
                this.server.consensus.init();
                if (this.server.consensus.isRunning()) {
                  this.server.consensus.catchUp(data.catchUpInfo);
                }
              }
            }
            return;
          }
          // Check if chain segment is valid and can be merged ontop of your local blockchain
          if (this.server.node.mergeChainSegment(data.chainSegment)) {
            if (data.number === this.server.node.bc.lastBlockNumber()) {
              // All caught up with the peer
              if (this.server.node.state !== BlockchainNodeStates.SERVING) {
                // Regard this situation as if you're synced.
                // TODO(lia): ask the tracker server for another peer.
                logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
                this.server.node.state = BlockchainNodeStates.SERVING;
              }
              if (this.server.consensus.status === ConsensusStatus.STARTING) {
                this.server.consensus.init();
              }
            } else {
              // There's more blocks to receive
              logger.info(`[${LOG_HEADER}] Wait, there's more...`);
            }
            if (this.server.consensus.isRunning()) {
              // FIXME: add new last block to blockPool and updateLongestNotarizedChains?
              this.server.consensus.blockPool.addSeenBlock(this.server.node.bc.lastBlock());
              this.server.consensus.catchUp(data.catchUpInfo);
            }
            // Continuously request the blockchain segments until
            // your local blockchain matches the height of the consensus blockchain.
            if (data.number > this.server.node.bc.lastBlockNumber()) {
              setTimeout(() => {
                this.requestChainSegment(socket, this.server.node.bc.lastBlock());
              }, 1000);
            }
          } else {
            logger.info(`[${LOG_HEADER}] Failed to merge incoming chain segment.`);
            // FIXME: Could be that I'm on a wrong chain.
            if (data.number <= this.server.node.bc.lastBlockNumber()) {
              logger.info(`[${LOG_HEADER}] I am ahead ` +
                  `(${data.number} > ${this.server.node.bc.lastBlockNumber()}).`);
              if (this.server.consensus.status === ConsensusStatus.STARTING) {
                this.server.consensus.init();
                if (this.server.consensus.isRunning()) {
                  this.server.consensus.catchUp(data.catchUpInfo);
                }
              }
            } else {
              logger.info(`[${LOG_HEADER}] I am behind ` +
                  `(${data.number} < ${this.server.node.bc.lastBlockNumber()}).`);
              setTimeout(() => {
                this.requestChainSegment(socket, this.server.node.bc.lastBlock());
              }, 1000);
            }
          }
          break;
        default:
          logger.error(`Wrong message type(${data.type}) has been specified.`);
          logger.error('Ignore the message.');
          break;
      }
    });

    socket.on('pong', () => {
      const address = getAddressFromSocket(this.outbound, socket);
      logger.info(`The peer(${address}) is alive.`);
    });

    socket.on('close', () => {
      const address = getAddressFromSocket(this.outbound, socket);
      removeSocketConnectionIfExists(this.outbound, address);
      logger.info(`Disconnected from a peer: ${address || 'unknown'}`);
    });
  }

  connectToPeers(newPeerInfoList) {
    let updated = false;
    newPeerInfoList.forEach((peerInfo) => {
      if (peerInfo.address in this.outbound) {
        logger.info(`Node ${peerInfo.address} is already a managed peer. Something went wrong.`);
      } else {
        logger.info(`Connecting to peer ${JSON.stringify(peerInfo, null, 2)}`);
        updated = true;
        const socket = new Websocket(peerInfo.url);
        socket.on('open', () => {
          logger.info(`Connected to peer ${peerInfo.address} (${peerInfo.url}).`);
          this.setPeerEventHandlers(socket);
          this.sendAddress(socket);
          this.requestChainSegment(socket, this.server.node.bc.lastBlock());
          if (this.server.consensus.stakeTx) {
            this.broadcastTransaction(this.server.consensus.stakeTx);
            this.server.consensus.stakeTx = null;
          }
        });
      }
    });
    return updated;
  }

  clearIntervalForTrackerUpdate() {
    clearInterval(this.intervalUpdate);
    this.intervalUpdate = null;
  }

  disconnectFromPeers() {
    Object.values(this.outbound).forEach(socket => {
      socket.close();
    });
  }

  stop() {
    this.server.stop();
    // Note(minsu): The trackerWebsocket should be checked initialized in order not to get error
    // in case trackerWebsocket is not properly setup.
    if (this.trackerWebSocket) this.trackerWebSocket.close();
    logger.info('Disconnect from tracker server.');
    this.stopHeartbeat();
    this.disconnectFromPeers();
    logger.info('Disconnect from connected peers.');
  }

  startHeartbeat() {
    this.intervalHeartbeat = setInterval(() => {
      Object.values(this.outbound).forEach(socket => {
        // NOTE(minsu): readyState; 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
        if (socket.readyState !== 1) {
          const address = getAddressFromSocket(this.outbound, socket);
          removeSocketConnectionIfExists(this.outbound, address);
          logger.info(`A peer(${address}) is not ready to communicate with. ` +
              `The readyState is(${socket.readyState})`);
        } else {
          socket.ping();
        }
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    clearInterval(this.intervalHeartbeat);
    this.intervalHeartbeat = null;
    logger.info('Stop heartbeating.');
  }
}

module.exports = P2pClient;
