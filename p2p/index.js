/* eslint no-mixed-operators: "off" */
const _ = require('lodash');
const P2pServer = require('./server');
const url = require('url');
const Websocket = require('ws');
const semver = require('semver');
const logger = require('../logger')('P2P_CLIENT');
const { ConsensusStatus } = require('../consensus/constants');
const VersionUtil = require('../common/version-util');
const {
  PORT,
  P2P_PORT,
  TRACKER_WS_ADDR,
  MessageTypes,
  BlockchainNodeStates,
  DEFAULT_MAX_OUTBOUND,
  DEFAULT_MAX_INBOUND,
  MAX_OUTBOUND_LIMIT,
  MAX_INBOUND_LIMIT,
  FeatureFlags
} = require('../common/constants');
const { sleep } = require('../common/chain-util');
const {
  getAddressFromSocket,
  removeSocketConnectionIfExists,
  signMessage,
  getAddressFromMessage,
  verifySignedMessage,
  checkTimestamp,
  closeSocketSafe,
  encapsulateMessage
} = require('./util');

const RECONNECT_INTERVAL_MS = 5 * 1000;  // 5 seconds
const UPDATE_TO_TRACKER_INTERVAL_MS = 5 * 1000;  // 5 seconds
const HEARTBEAT_INTERVAL_MS = 60 * 1000;  // 1 minute
const WAIT_FOR_ADDRESS_TIMEOUT_MS = 1000;

class P2pClient {
  constructor(node, minProtocolVersion, maxProtocolVersion) {
    this.initConnections();
    this.server = new P2pServer(
        this, node, minProtocolVersion, maxProtocolVersion, this.maxInbound);
    this.trackerWebSocket = null;
    this.outbound = {};
    // this.startHeartbeat();
  }

  run() {
    this.server.listen();
    this.setIntervalForTrackerConnection();
  }

  // NOTE(minsulee2): The total number of connection is up to more than 5 without limit.
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
      cpuStatus: this.server.getCpuUsage(),
      memoryStatus: this.server.getMemoryUsage(),
      diskStatus: this.server.getDiskUsage(),
      runtimeInfo: this.server.getRuntimeInfo(),
      protocolInfo: this.server.getProtocolInfo(),
    };
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
      } catch (err) {
        logger.error(`Error: ${err} ${err.stack}`);
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

  broadcastConsensusMessage(consensusMessage) {
    const payload = encapsulateMessage(MessageTypes.CONSENSUS, { message: consensusMessage });
    if (!payload) {
      logger.error('The consensus msg cannot be broadcasted because of msg encapsulation failure.');
      return;
    }
    const stringPayload = JSON.stringify(payload);
    Object.values(this.outbound).forEach(node => {
      node.socket.send(stringPayload);
    });
    logger.debug(`SENDING: ${JSON.stringify(consensusMessage)}`);
  }

  requestChainSegment(socket, lastBlock) {
    const payload = encapsulateMessage(MessageTypes.CHAIN_SEGMENT_REQUEST,
        { lastBlock: lastBlock });
    if (!payload) {
      logger.error('The request chainSegment cannot be sent because of msg encapsulation failure.');
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  broadcastTransaction(transaction) {
    const payload = encapsulateMessage(MessageTypes.TRANSACTION, { transaction: transaction });
    if (!payload) {
      logger.error('The transaction cannot be broadcasted because of msg encapsulation failure.');
      return;
    }
    const stringPayload = JSON.stringify(payload);
    Object.values(this.outbound).forEach(node => {
      node.socket.send(stringPayload);
    });
    logger.debug(`SENDING: ${JSON.stringify(transaction)}`);
  }

  sendAddress(socket) {
    const body = {
      address: this.server.getNodeAddress(),
      timestamp: Date.now(),
    };
    const signature = signMessage(body, this.server.getNodePrivateKey());
    if (!signature) {
      logger.error('The signaure is not correctly generated. Discard the message!');
      return;
    }
    const payload = encapsulateMessage(MessageTypes.ADDRESS_REQUEST,
        { body: body, signature: signature });
    if (!payload) {
      logger.error('The address cannot be sent because of msg encapsulation failure.');
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  // TODO(minsulee2): This check will be updated when data compatibility version up.
  checkDataProtoVerForAddressResponse(version) {
    const majorVersion = VersionUtil.toMajorVersion(version);
    const isGreater = semver.gt(this.server.majorDataProtocolVersion, majorVersion);
    if (isGreater) {
      // TODO(minsulee2): Compatible message.
    }
    const isLower = semver.lt(this.server.majorDataProtocolVersion, majorVersion);
    if (isLower) {
      // TODO(minsulee2): Compatible message.
    }
  }

  checkDataProtoVerForChainSegmentResponse(version) {
    const majorVersion = VersionUtil.toMajorVersion(version);
    const isGreater = semver.gt(this.server.majorDataProtocolVersion, majorVersion);
    if (isGreater) {
      // TODO(minsulee2): Compatible message.
    }
    const isLower = semver.lt(this.server.majorDataProtocolVersion, majorVersion);
    if (isLower) {
      if (FeatureFlags.enableRichP2pCommunicationLogging) {
        logger.error('CANNOT deal with higher data protocol version. Discard the ' +
          'CHAIN_SEGMENT_RESPONSE message.');
      }
      return false;
    }
    return true;
  }

  setPeerEventHandlers(socket) {
    const LOG_HEADER = 'setPeerEventHandlers';
    socket.on('message', (message) => {
      const parsedMessage = JSON.parse(message);
      const dataProtoVer = _.get(parsedMessage, 'dataProtoVer');
      if (!VersionUtil.isValidProtocolVersion(dataProtoVer)) {
        const address = getAddressFromSocket(this.outbound, socket);
        logger.error(`The data protocol version of the node(${address}) is MISSING or ` +
              `INAPPROPRIATE. Disconnect the connection.`);
        closeSocketSafe(this.outbound, socket);
        return;
      }
      if (!checkTimestamp(_.get(parsedMessage, 'timestamp'))) {
        logger.error(`[${LOG_HEADER}] The message from the node(${address}) is stale. ` +
            `Discard the message.`);
        logger.debug(`[${LOG_HEADER}] The detail is as follows: ${parsedMessage}`);
        return;
      }

      switch (parsedMessage.type) {
        case MessageTypes.ADDRESS_RESPONSE:
          // TODO(minsulee2): Add compatibility check here after data version up.
          // this.checkDataProtoVerForAddressResponse(dataProtoVer);
          const address = _.get(parsedMessage, 'data.body.address');
          if (!address) {
            logger.error(`[${LOG_HEADER}] Providing an address is compulsary when initiating ` +
                `p2p communication.`);
            closeSocketSafe(this.outbound, socket);
            return;
          } else if (!_.get(parsedMessage, 'data.signature')) {
            logger.error(`[${LOG_HEADER}] A sinature of the peer(${address}) is missing during ` +
                `p2p communication. Cannot proceed the further communication.`);
            // NOTE(minsulee2): Strictly close socket necessary??
            closeSocketSafe(this.outbound, socket);
            return;
          } else {
            const addressFromSig = getAddressFromMessage(parsedMessage);
            if (addressFromSig !== address) {
              logger.error(`[${LOG_HEADER}] The addresses(${addressFromSig} and ${address}) are ` +
                  `not the same!!`);
              closeSocketSafe(this.outbound, socket);
              return;
            }
            if (!verifySignedMessage(parsedMessage, addressFromSig)) {
              logger.error(`[${LOG_HEADER}] The message is not correctly signed. ` +
                  `Discard the message!!`);
              return;
            }
            logger.info(`[${LOG_HEADER}] A new websocket(${address}) is established.`);
            this.outbound[address] = {
              socket: socket,
              version: dataProtoVer
            };
          }
          break;
        case MessageTypes.CHAIN_SEGMENT_RESPONSE:
          if (!this.checkDataProtoVerForChainSegmentResponse(parsedMessage.dataProtoVer)) {
            return;
          }
          const chainSegment = _.get(parsedMessage, 'data.chainSegment');
          const number = _.get(parsedMessage, 'data.number');
          const catchUpInfo = _.get(parsedMessage, 'data.catchUpInfo');
          logger.debug(`[${LOG_HEADER}] Receiving a chain segment: ` +
              `${JSON.stringify(chainSegment, null, 2)}`);
          // Check catchup info is behind or equal to me
          if (number <= this.server.node.bc.lastBlockNumber()) {
            if (this.server.consensus.status === ConsensusStatus.STARTING) {
              if ((!chainSegment && !catchUpInfo) ||
                  number === this.server.node.bc.lastBlockNumber()) {
                // Regard this situation as if you're synced.
                // TODO(liayoo): Ask the tracker server for another peer.
                // TODO(minsulee2): Need to more discussion about this.
                logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
                this.server.node.state = BlockchainNodeStates.SERVING;
                this.server.consensus.init();
                if (this.server.consensus.isRunning()) {
                  this.server.consensus.catchUp(catchUpInfo);
                }
              }
            }
            return;
          }
          // Check if chain segment is valid and can be merged ontop of your local blockchain
          if (this.server.node.mergeChainSegment(chainSegment)) {
            if (number === this.server.node.bc.lastBlockNumber()) {
              // All caught up with the peer
              if (this.server.node.state !== BlockchainNodeStates.SERVING) {
                // Regard this situation as if you're synced.
                // TODO(liayoo): Ask the tracker server for another peer.
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
              this.server.consensus.catchUp(catchUpInfo);
            }
            // Continuously request the blockchain segments until
            // your local blockchain matches the height of the consensus blockchain.
            if (number > this.server.node.bc.lastBlockNumber()) {
              setTimeout(() => {
                this.requestChainSegment(socket, this.server.node.bc.lastBlock());
              }, 1000);
            }
          } else {
            logger.info(`[${LOG_HEADER}] Failed to merge incoming chain segment.`);
            // FIXME: Could be that I'm on a wrong chain.
            if (number <= this.server.node.bc.lastBlockNumber()) {
              logger.info(`[${LOG_HEADER}] I am ahead ` +
                  `(${number} > ${this.server.node.bc.lastBlockNumber()}).`);
              if (this.server.consensus.status === ConsensusStatus.STARTING) {
                this.server.consensus.init();
                if (this.server.consensus.isRunning()) {
                  this.server.consensus.catchUp(catchUpInfo);
                }
              }
            } else {
              logger.info(`[${LOG_HEADER}] I am behind ` +
                  `(${number} < ${this.server.node.bc.lastBlockNumber()}).`);
              setTimeout(() => {
                this.requestChainSegment(socket, this.server.node.bc.lastBlock());
              }, 1000);
            }
          }
          break;
        default:
          logger.error(`[${LOG_HEADER}] Wrong message type(${parsedMessage.type}) has been ` +
              `specified. Igonore the message.`);
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

  waitForAddress = (socket) => {
    sleep(WAIT_FOR_ADDRESS_TIMEOUT_MS)
      .then(() => {
        const address = getAddressFromSocket(this.outbound, socket);
        if (address) {
          logger.info(`with (${address}).`);
        } else {
          logger.debug(`Waiting for adress of the socket(${JSON.stringify(socket, null, 2)})`);
          this.waitForAddress(socket);
        }
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
        socket.on('open', async () => {
          logger.info(`Connected to peer(${peerInfo.url}),`);
          this.setPeerEventHandlers(socket);
          this.sendAddress(socket);
          await this.waitForAddress(socket);
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
    Object.values(this.outbound).forEach(node => {
      node.socket.close();
    });
  }

  stop() {
    this.server.stop();
    // NOTE(minsulee2): The trackerWebsocket should be checked initialized in order not to get error
    // in case trackerWebsocket is not properly setup.
    this.clearIntervalForTrackerConnection();
    if (this.trackerWebSocket) this.trackerWebSocket.close();
    logger.info('Disconnect from tracker server.');
    this.stopHeartbeat();
    this.disconnectFromPeers();
    logger.info('Disconnect from connected peers.');
  }

  startHeartbeat() {
    this.intervalHeartbeat = setInterval(() => {
      Object.values(this.outbound).forEach(node => {
        // NOTE(minsulee2): readyState; 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/readyState
        const socket = _.get(node, 'socket');
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
