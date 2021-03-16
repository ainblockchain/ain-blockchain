/* eslint no-mixed-operators: "off" */
const P2pServer = require('./server');
const url = require('url');
const Websocket = require('ws');
const semver = require('semver');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('P2P_SERVER');
const { ConsensusStatus } = require('../consensus/constants');
const {
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP,
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

  getProtocolInfo() {
    return {
      versionMap: PROTOCOL_VERSION_MAP,
      currentVersion: CURRENT_PROTOCOL_VERSION,
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
      protocolInfo: this.getProtocolInfo(),
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

  _signPayload(payload) {
    const keyBuffer = Buffer.from(this.server.node.account.private_key, 'hex');
    const stringPayload = JSON.stringify(payload);
    return ainUtil.ecSignMessage(stringPayload, keyBuffer);
  }

  broadcastConsensusMessage(msg) {
    const payload = {
      type: MessageTypes.CONSENSUS,
      message: msg,
      protoVer: CURRENT_PROTOCOL_VERSION
    };
    payload.signature = this._signPayload(payload);
    payload.address = this.server.getNodeAddress();
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
      protoVer: CURRENT_PROTOCOL_VERSION
    };
    payload.signature = this._signPayload(payload);
    payload.address = this.server.getNodeAddress();
    socket.send(JSON.stringify(payload));
  }

  broadcastTransaction(transaction) {
    const payload = {
      type: MessageTypes.TRANSACTION,
      transaction,
      protoVer: CURRENT_PROTOCOL_VERSION
    };
    payload.signature = this._signPayload(payload);
    payload.address = this.server.getNodeAddress();
    const stringPayload = JSON.stringify(payload);
    Object.values(this.outbound).forEach(socket => {
      socket.send(stringPayload);
    });
    logger.debug(`SENDING: ${JSON.stringify(transaction)}`);
  }

  sendAddress(socket) {
    const payload = {
      type: MessageTypes.ADDRESS_REQUEST,
      address: this.server.getNodeAddress(),
      protoVer: CURRENT_PROTOCOL_VERSION
    };
    payload.signature = this._signPayload(payload);
    socket.send(JSON.stringify(payload));
  }

  setPeerEventHandlers(socket) {
    const LOG_HEADER = 'setPeerEventHandlers';
    socket.on('message', (message) => {
      const data = JSON.parse(message);
      const version = data.protoVer;
      if (!version || !semver.valid(version)) {
        socket.close();
        return;
      }
      if (semver.gt(this.server.minProtocolVersion, version) ||
        (this.maxProtocolVersion && semver.lt(this.maxProtocolVersion, version))) {
        socket.close();
        return;
      }

      switch (data.type) {
        case MessageTypes.ADDRESS_RESPONSE:
          if (!data.address) {
            logger.error(`Providing an address is compulsary when initiating p2p communication.`);
            socket.close();
            return;
          } else if (!data.signature) {
            logger.error(`A sinature of the peer(${data.address}) is missing during p2p ` +
                `communication. Cannot proceed the further communication.`);
            socket.close();   // NOTE(minsu): strictly close socket necessary??
            return;
          } else {
            const signature = data.signature;
            delete data.signature;
            if (!ainUtil.ecVerifySig(JSON.stringify(data), signature, data.address)) {
              logger.error('The message is not correctly signed. Discard the message!!');
              return;
            }
            logger.info(`A new websocket(${data.address}) is established.`);
            this.outbound[data.address] = socket;
          }
          break;
        case MessageTypes.CHAIN_SEGMENT_RESPONSE:
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
      const address = this.getAddressFromSocket(socket);
      logger.info(`The peer(${address}) is alive.`);
    });

    socket.on('close', () => {
      const address = this.getAddressFromSocket(socket);
      this.removeSocketFromOutboundIfExists(address);
      logger.info(`Disconnected from a peer: ${address || 'unknown'}`);
    });
  }

  getAddressFromSocket(socket) {
    return Object.keys(this.outbound).filter(address => this.outbound[address] === socket);
  }

  removeSocketFromOutboundIfExists(address) {
    if (address in this.outbound) {
      delete this.outbound[address];
      logger.info(` => Updated managed peers info: ${Object.keys(this.outbound)}`);
    }
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
          const address = this.getAddressFromSocket(socket);
          this.removeFromOutboundIfExists(address);
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
