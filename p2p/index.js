/* eslint no-mixed-operators: "off" */
const _ = require('lodash');
const P2pServer = require('./server');
const Websocket = require('ws');
const logger = require('../logger')('P2P_CLIENT');
const { ConsensusStates } = require('../consensus/constants');
const VersionUtil = require('../common/version-util');
const {
  HOSTING_ENV,
  PORT,
  P2P_PORT,
  TRACKER_WS_ADDR,
  MessageTypes,
  TrackerMessageTypes,
  BlockchainNodeStates,
  TARGET_NUM_OUTBOUND_CONNECTION,
  MAX_NUM_INBOUND_CONNECTION,
  NETWORK_ID,
} = require('../common/constants');
const { sleep } = require('../common/common-util');
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
    this.startHeartbeat();
  }

  async run() {
    await this.server.listen();
    this.connectToTracker();
  }

  // NOTE(minsulee2): The total number of connection is up to more than 5 without limit.
  // maxOutbound is for now limited equal or less than 2.
  // maxInbound is a rest of connection after maxOutbound is set.
  initConnections() {
    this.maxOutbound = process.env.MAX_OUTBOUND ?
        Number(process.env.MAX_OUTBOUND) : TARGET_NUM_OUTBOUND_CONNECTION;
    this.maxInbound = process.env.MAX_INBOUND ?
        Number(process.env.MAX_INBOUND) : MAX_NUM_INBOUND_CONNECTION;
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
    const intIp = this.server.getInternalIp();
    const extIp = this.server.getExternalIp();
    const intUrl = new URL(`ws://${intIp}:${P2P_PORT}`);
    const extUrl = new URL(`ws://${extIp}:${P2P_PORT}`);
    const p2pUrl = HOSTING_ENV === 'comcom' ? intUrl.toString() : extUrl.toString();
    extUrl.protocol = 'http:';
    extUrl.port = PORT;
    const clientApiUrl = extUrl.toString();
    extUrl.pathname = 'json-rpc';
    const jsonRpcUrl = extUrl.toString();
    return {
      ip: extIp,
      p2p: {
        url: p2pUrl,
        port: P2P_PORT,
      },
      clientApi: {
        url: clientApiUrl,
        port: PORT,
      },
      jsonRpc: {
        url: jsonRpcUrl,
        port: PORT,
      },
      connectionStatus: this.getConnectionStatus()
    };
  }

  setIntervalForTrackerConnection() {
    if (!this.intervalConnection) {
      this.intervalConnection = setInterval(() => {
        this.connectToTracker();
      }, RECONNECT_INTERVAL_MS);
    }
  }

  clearIntervalForTrackerConnection() {
    clearInterval(this.intervalConnection);
    this.intervalConnection = null;
  }

  connectToCorrespondingNode(address) {
    const message = {
      type: TrackerMessageTypes.CORRESPOND,
      data: address
    }
    logger.debug(`\n >> Update to [TRACKER] ${TRACKER_WS_ADDR}: ` +
        `${JSON.stringify(message, null, 2)}`);
    this.trackerWebSocket.send(JSON.stringify(message));
  }

  connectToOtherPeers() {
    const message = {
      type: TrackerMessageTypes.CONNECTION,
      data: this.getStatus()
    };
    logger.debug(`\n >> Connect to [TRACKER] ${TRACKER_WS_ADDR}: ` +
        `${JSON.stringify(message, null, 2)}`);
    this.trackerWebSocket.send(JSON.stringify(message));
  }

  updateNodeInfoToTracker() {
    const message = {
      type: TrackerMessageTypes.UPDATE,
      data: this.getStatus()
    };
    logger.debug(`\n >> Update to [TRACKER] ${TRACKER_WS_ADDR}: ` +
        `${JSON.stringify(message, null, 2)}`);
    this.trackerWebSocket.send(JSON.stringify(message));
  }

  setIntervalForTrackerUpdate() {
    this.updateNodeInfoToTracker();
    this.intervalUpdate = setInterval(() => {
      this.updateNodeInfoToTracker();
    }, UPDATE_TO_TRACKER_INTERVAL_MS);
  }

  async setTrackerEventHandlers() {
    this.trackerWebSocket.on('message', async (message) => {
      const parsedMessage = JSON.parse(message);
      logger.info(`\n<< Message from [TRACKER]: ${JSON.stringify(parsedMessage, null, 2)}`);
      switch(_.get(parsedMessage, 'type')) {
        case TrackerMessageTypes.CONNECTION:
          const data = parsedMessage.data;
          this.connectToPeers(data.newManagedPeerInfoList);
          if (this.server.node.state === BlockchainNodeStates.STARTING) {
            await this.startNode(data.numLivePeers);
          }
          break;
        case TrackerMessageTypes.CORRESPOND:
          const url = parsedMessage.data;
          this.connectToPeer(url);
          break;
        default:
          logger.error(`Unknown message type(${parsedMessage.type}) has been ` +
              'specified. Ignore the message.');
          break;
      }
    });
    this.trackerWebSocket.on('close', (code) => {
      logger.info(`\nDisconnected from [TRACKER] ${TRACKER_WS_ADDR} with code: ${code}`);
      // this.clearIntervalForTrackerUpdate();
      this.setIntervalForTrackerConnection();
    });
  }

  async startNode(numLivePeers) {
    const LOG_HEADER = 'startNode';

    if (numLivePeers === 0) {
      logger.info(`[${LOG_HEADER}] Starting node without peers..`);
      const lastBlockWithoutProposal = this.server.node.init(true);
      logger.info(`[${LOG_HEADER}] lastBlockWithoutProposal=${lastBlockWithoutProposal}`);
      logger.info(`[${LOG_HEADER}] Trying to initializing shard..`);
      if (await this.server.tryInitializeShard()) {
        logger.info(`[${LOG_HEADER}] Shard initialization done!`);
      } else {
        logger.info(`[${LOG_HEADER}] No need to initialize shard.`);
      }
      this.server.node.state = BlockchainNodeStates.SERVING;
      logger.info(`[${LOG_HEADER}] Now node in SERVING state!`);
      logger.info(`[${LOG_HEADER}] Initializing consensus process..`);
      this.server.consensus.init(lastBlockWithoutProposal);
      logger.info(`[${LOG_HEADER}] Consensus process initialized!`);
    } else {
      // Consensus will be initialized after syncing with peers
      logger.info(`[${LOG_HEADER}] Starting node with ${numLivePeers} peers..`);
      this.server.node.init(false);
      logger.info(`[${LOG_HEADER}] Node initialized!`);
    }
  }

  connectToTracker() {
    logger.info(`Reconnecting to tracker (${TRACKER_WS_ADDR})`);
    this.trackerWebSocket = new Websocket(TRACKER_WS_ADDR);
    this.trackerWebSocket.on('open', () => {
      logger.info(`Connected to tracker (${TRACKER_WS_ADDR})`);
      this.clearIntervalForTrackerConnection();
      this.setTrackerEventHandlers();
      this.connectToOtherPeers();
      this.setIntervalForTrackerUpdate();
    });
    this.trackerWebSocket.on('error', (error) => {
      logger.error(`Error in communication with tracker (${TRACKER_WS_ADDR}): ` +
        `${JSON.stringify(error, null, 2)}`);
      // this.clearIntervalForTrackerUpdate();
      this.setIntervalForTrackerConnection();
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

  requestChainSegment(socket, lastBlockNumber) {
    if (this.server.node.state !== BlockchainNodeStates.SYNCING &&
      this.server.node.state !== BlockchainNodeStates.SERVING) {
      return;
    }
    const payload = encapsulateMessage(MessageTypes.CHAIN_SEGMENT_REQUEST, { lastBlockNumber });
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

  setClientSidePeerEventHandlers(socket) {
    const LOG_HEADER = 'setClientSidePeerEventHandlers';
    socket.on('message', (message) => {
      const parsedMessage = JSON.parse(message);
      const networkId = _.get(parsedMessage, 'networkId');
      const address = getAddressFromSocket(this.outbound, socket);
      if (!isValidNetworkId(networkId)) {
        logger.error(`The given network ID(${networkId}) of the node(${address}) is MISSING or ` +
          `DIFFERENT from mine(${NETWORK_ID}). Disconnect the connection.`);
        closeSocketSafe(this.outbound, socket);
        return;
      }
      const dataProtoVer = _.get(parsedMessage, 'dataProtoVer');
      if (!VersionUtil.isValidProtocolVersion(dataProtoVer)) {
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
          const dataVersionCheckForAddress =
              this.server.checkDataProtoVer(dataProtoVer, MessageTypes.ADDRESS_RESPONSE);
          if (dataVersionCheckForAddress < 0) {
            // TODO(minsulee2): need to convert message when updating ADDRESS_RESPONSE necessary.
            // this.convertAddressMessage();
          }
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
            this.updateNodeInfoToTracker();
          }
          break;
        case MessageTypes.CHAIN_SEGMENT_RESPONSE:
          if (this.server.node.state !== BlockchainNodeStates.SYNCING &&
              this.server.node.state !== BlockchainNodeStates.SERVING) {
            logger.error(`[${LOG_HEADER}] Not ready to process chain segment response.\n` +
                `Node state: ${this.server.node.state}.`);
            return;
          }
          const dataVersionCheckForChainSegment =
              this.server.checkDataProtoVer(dataProtoVer, MessageTypes.CHAIN_SEGMENT_RESPONSE);
          if (dataVersionCheckForChainSegment > 0) {
            logger.error(`[${LOG_HEADER}] CANNOT deal with higher data protocol ` +
                `version(${dataProtoVer}). Discard the CHAIN_SEGMENT_RESPONSE message.`);
            return;
          } else if (dataVersionCheckForChainSegment < 0) {
            // TODO(minsulee2): need to convert message when updating CHAIN_SEGMENT_RESPONSE.
            // this.convertChainSegmentResponseMessage();
          }
          const chainSegment = _.get(parsedMessage, 'data.chainSegment');
          const number = _.get(parsedMessage, 'data.number');
          const catchUpInfo = _.get(parsedMessage, 'data.catchUpInfo');
          logger.debug(`[${LOG_HEADER}] Receiving a chain segment: ` +
              `${JSON.stringify(chainSegment, null, 2)}`);
          // Check catchup info is behind or equal to me
          if (number <= this.server.node.bc.lastBlockNumber()) {
            if (this.server.consensus.state === ConsensusStates.STARTING) {
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
              if (this.server.consensus.state === ConsensusStates.STARTING) {
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
                this.requestChainSegment(socket, this.server.node.bc.lastBlockNumber());
              }, 1000);
            }
          } else {
            logger.info(`[${LOG_HEADER}] Failed to merge incoming chain segment.`);
            // FIXME: Could be that I'm on a wrong chain.
            if (number <= this.server.node.bc.lastBlockNumber()) {
              logger.info(`[${LOG_HEADER}] I am ahead ` +
                  `(${number} > ${this.server.node.bc.lastBlockNumber()}).`);
              if (this.server.consensus.state === ConsensusStates.STARTING) {
                this.server.consensus.init();
                if (this.server.consensus.isRunning()) {
                  this.server.consensus.catchUp(catchUpInfo);
                }
              }
            } else {
              logger.info(`[${LOG_HEADER}] I am behind ` +
                  `(${number} < ${this.server.node.bc.lastBlockNumber()}).`);
              setTimeout(() => {
                this.requestChainSegment(socket, this.server.node.bc.lastBlockNumber());
              }, 1000);
            }
          }
          break;
        default:
          logger.error(`[${LOG_HEADER}] Unknown message type(${parsedMessage.type}) has been ` +
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
      this.connectToOtherPeers();
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
          logger.debug(`Waiting for address of the socket(${JSON.stringify(socket, null, 2)})`);
          this.waitForAddress(socket);
        }
      });
  }

  connectToPeer(url) {
    const socket = new Websocket(url);
    socket.on('open', async () => {
      logger.info(`Connected to peer(${url}),`);
      this.setClientSidePeerEventHandlers(socket);
      this.sendAddress(socket);
      await this.waitForAddress(socket);
      this.requestChainSegment(socket, this.server.node.bc.lastBlockNumber());
      if (this.server.consensus.stakeTx) {
        this.broadcastTransaction(this.server.consensus.stakeTx);
        this.server.consensus.stakeTx = null;
      }
    });
  }

  connectToPeers(newPeerInfoList) {
    newPeerInfoList.forEach((peerInfo) => {
      if (peerInfo.address in this.outbound) {
        logger.info(`Node ${peerInfo.address} is already a managed peer. Something went wrong.`);
      } else {
        logger.info(`Connecting to peer ${JSON.stringify(peerInfo, null, 2)}`);
        this.connectToPeer(peerInfo.url);
      }
    });
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
    this.clearIntervalForTrackerUpdate();
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
