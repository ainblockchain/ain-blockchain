/* eslint no-mixed-operators: "off" */
const P2pServer = require('./server');
const url = require('url');
const Websocket = require('ws');
const semver = require('semver');
const logger = require('../logger')('P2P_SERVER');
const { ConsensusStatus } = require('../consensus/constants');
const ChainUtil = require('../common/chain-util');
const {
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP,
  PORT,
  P2P_PORT,
  TRACKER_WS_ADDR,
  MessageTypes,
  BlockchainNodeStatus,
  INITIAL_MAX_CONNECTION,
  INITIAL_MAX_OUTBOUND,
  INITIAL_MAX_INBOUND,
  MAX_CONNECTION_LIMIT,
  MAX_OUTBOUND_LIMIT
} = require('../common/constants');

const RECONNECT_INTERVAL_MS = 5 * 1000;  // 5 seconds
const UPDATE_TO_TRACKER_INTERVAL_MS = 5 * 1000;  // 5 seconds
const HEARTBEAT_INTERVAL_MS = 1000;  // 1 second

class P2pClient {
  constructor(node, minProtocolVersion, maxProtocolVersion) {
    this.initConnections();
    this.server = new P2pServer(
        this, node, minProtocolVersion, maxProtocolVersion, this.maxInbound);
    this.trackerWebSocket = null;
    this.outbound = {};
    // XXX(minsu): The comment out will be revoked when next heartbeat updates.
    // this.isAlive = true;
    // this.heartbeat();   // XXX(minsu): it won't run before updating p2p network.
  }

  run() {
    this.server.listen();
    this.setIntervalForTrackerConnection();
  }

  // NOTE(minsu): the total number of connection is up to more than 5 without limit.
  // maxOutbound is for now limited equal or less than 2.
  // maxInbound is a rest of connection after maxOutbound is set.
  initConnections() {
    const numConnection = process.env.MAX_CONNECTION ?
        Number(process.env.MAX_CONNECTION) : INITIAL_MAX_CONNECTION;
    const numOutbound = process.env.MAX_OUTBOUND ?
        Number(process.env.MAX_OUTBOUND) : INITIAL_MAX_OUTBOUND;
    const numInbound = process.env.MAX_INBOUND ?
        Number(process.env.MAX_INBOUND) : INITIAL_MAX_INBOUND;
    this.maxConnection = Math.max(numConnection, MAX_CONNECTION_LIMIT);
    this.maxOutbound = Math.min(numOutbound, MAX_OUTBOUND_LIMIT);
    this.maxInbound = Math.min(numInbound, numConnection - numOutbound);
  }

  getConnectionInfo() {
    return {
      maxConnection: this.maxConnection,
      maxOutbound: this.maxOutbound,
      maxInbound: this.maxInbound,
      incomingPeers: Object.keys(this.server.inbound),
      outgoingPeers: Object.keys(this.outbound)
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
      connectionInfo: this.getConnectionInfo()
    }
  }

  getStatus() {
    const blockStatus = this.server.getBlockStatus();
    return {
      address: this.server.getNodeAddress(),
      updatedAt: Date.now(),
      lastBlockNumber: blockStatus.number,
      networkStatus: this.getNetworkStatus(),
      blockStatus: this.server.getBlockStatus(),
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
        if (node.status === BlockchainNodeStatus.STARTING) {
          node.status = BlockchainNodeStatus.SYNCING;
          if (parsedMsg.numLivePeers === 0) {
            const lastBlockWithoutProposal = node.init(true);
            await this.server.tryInitializeShard();
            node.status = BlockchainNodeStatus.SERVING;
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
    logger.debug(`SENDING: ${JSON.stringify(msg)}`);
    Object.values(this.outbound).forEach((socket) => {
      socket.send(JSON.stringify({
        type: MessageTypes.CONSENSUS,
        message: msg,
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
    });
  }

  requestChainSegment(socket, lastBlock) {
    socket.send(JSON.stringify({
      type: MessageTypes.CHAIN_SEGMENT_REQUEST,
      lastBlock,
      protoVer: CURRENT_PROTOCOL_VERSION
    }));
  }

  broadcastTransaction(transaction) {
    logger.debug(`SENDING: ${JSON.stringify(transaction)}`);
    Object.values(this.outbound).forEach((socket) => {
      socket.send(JSON.stringify({
        type: MessageTypes.TRANSACTION,
        transaction,
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
    });
  }

  sendAccount(socket) {
    const account = this.server.getNodeAddress();
    logger.debug(`SENDING: account(${account}) to p2p server`);
    socket.send(JSON.stringify({
      type: MessageTypes.ACCOUNT_REQUEST,
      account: account,
      protoVer: CURRENT_PROTOCOL_VERSION
    }));
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
        case MessageTypes.ACCOUNT_RESPONSE:
          if (!data.account) {
            logger.error(`Broken websocket(account unknown) is established.`);
            socket.close();
            return;
          } else {
            logger.info(`A new websocket(${data.account}) is established.`);
            this.outbound[data.account] = socket;
          }
          break;
        case MessageTypes.CHAIN_SEGMENT_RESPONSE:
          logger.debug(`[${LOG_HEADER}] Receiving a chain segment: ` +
            `${JSON.stringify(data.chainSegment, null, 2)}`);
          if (data.number <= this.server.node.bc.lastBlockNumber()) {
            if (this.server.consensus.status === ConsensusStatus.STARTING) {
              // XXX(minsu): need to be investigated
              // ref: https://eslint.org/docs/rules/no-mixed-operators
              if (!data.chainSegment && !data.catchUpInfo ||
                data.number === this.server.node.bc.lastBlockNumber()) {
                // Regard this situation as if you're synced.
                // TODO(lia): ask the tracker server for another peer.
                logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
                this.server.node.status = BlockchainNodeStatus.SERVING;
                this.server.consensus.init();
                if (this.server.consensus.isRunning()) {
                  this.server.consensus.catchUp(data.catchUpInfo);
                }
              }
            }
            return;
          }

          // Check if chain segment is valid and can be
          // merged ontop of your local blockchain
          if (this.server.node.mergeChainSegment(data.chainSegment)) {
            if (data.number === this.server.node.bc.lastBlockNumber()) {
              // All caught up with the peer
              if (this.server.node.status !== BlockchainNodeStatus.SERVING) {
                // Regard this situation as if you're synced.
                // TODO(lia): ask the tracker server for another peer.
                logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
                this.server.node.status = BlockchainNodeStatus.SERVING;
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

    socket.on('close', () => {
      const account = this.getAccountFromSocket(socket);
      this.removeFromOutboundIfExists(account);
      logger.info(`Disconnected from a peer: ${account || 'unknown'}`);
    });
  }

  getAccountFromSocket(socket) {
    return Object.keys(this.outbound).filter(account => this.outbound[account] === socket);
  }

  removeFromOutboundIfExists(account) {
    if (account in this.outbound) {
      delete this.outbound[account];
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
          this.sendAccount(socket);
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
    logger.info('Disconnect from tracker server.');
    this.trackerWebSocket.close();
    logger.info('Disconnect from connected peers.');
    this.disconnectFromPeers();
    // XXX(minsu): This will be revoked when next updates.
    // this.clearIntervalHeartbeat(address);
  }

  // TODO(minsu): Since the p2p network has not been built completely,
  // it will be updated afterwards.
  heartbeat() {
    logger.info(`Start heartbeat`);
    this.intervalHeartbeat = setInterval(() => {
      this.server.clients.forEach((ws) => {
        ws.ping();
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  // TODO(minsu): Finish it later on
  // clearIntervalHeartbeat(address) {
  //   clearInterval(this.managedPeersInfo[address].intervalHeartbeat);
  //   this.managedPeersInfo[address].intervalHeartbeat = null;
  // }
}

module.exports = P2pClient;
