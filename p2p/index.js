/* eslint no-mixed-operators: "off" */
const logger = new (require('../logger'))('P2P_CLIENT');
const _ = require('lodash');
const P2pServer = require('./server');
const Websocket = require('ws');
const { ConsensusStates } = require('../consensus/constants');
const VersionUtil = require('../common/version-util');
const CommonUtil = require('../common/common-util');
const {
  HOSTING_ENV,
  TRACKER_WS_ADDR,
  EPOCH_MS,
  TARGET_NUM_OUTBOUND_CONNECTION,
  MAX_NUM_INBOUND_CONNECTION,
  NETWORK_ID,
  P2P_PEER_CANDIDATE_URL,
  ENABLE_STATUS_REPORT_TO_TRACKER,
  DevFlags,
  MessageTypes,
  TrackerMessageTypes,
  BlockchainNodeStates,
  P2pNetworkStates,
  TrafficEventTypes,
  BlockchainParams,
  trafficStatsManager,
} = require('../common/constants');
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
const {
  sendGetRequest
} = require('../common/network-util');

const TRACKER_RECONNECTION_INTERVAL_MS = 5 * 1000;  // 5 seconds
const TRACKER_UPDATE_INTERVAL_MS = 15 * 1000;  // 15 seconds
const PEER_CANDIDATES_CONNECTION_INTERVAL_MS = 60 * 1000;  // 1 minute
const HEARTBEAT_INTERVAL_MS = 15 * 1000;  // 15 seconds
const WAIT_FOR_ADDRESS_TIMEOUT_MS = 10 * 1000; // 10 seconds
const TRAFFIC_STATS_PERIOD_SECS_LIST = {
  '5m': 300,  // 5 minutes
  '10m': 600,  // 10 minutes
  '1h': 3600,  // 1 hour
  '3h': 10800,  // 3 hours
};

class P2pClient {
  constructor(node, minProtocolVersion, maxProtocolVersion) {
    this.server = new P2pServer(
        this, node, minProtocolVersion, maxProtocolVersion);
    this.peerCandidates = {};
    this.isConnectingToPeerCandidates = false;
    this.trackerWebSocket = null;
    this.outbound = {};
    this.p2pState = P2pNetworkStates.STARTING;
    this.peerConnectionsInProgress = {};
    logger.info(`Now p2p network in STARTING state!`);
    this.startHeartbeat();
  }

  async run() {
    if (CommonUtil.isEmpty(this.server.node.account)) return;
    await this.server.listen();
    if (ENABLE_STATUS_REPORT_TO_TRACKER) this.connectToTracker();
    if (this.server.node.state === BlockchainNodeStates.STARTING) {
      if (!P2P_PEER_CANDIDATE_URL || P2P_PEER_CANDIDATE_URL === '') {
        await this.startBlockchainNode(0);
        return;
      } else {
        await this.startBlockchainNode(1);
      }
    }
    this.connectWithPeerCandidateUrl(P2P_PEER_CANDIDATE_URL);
    this.setIntervalForPeerCandidatesConnection();
  }

  getConnectionStatus() {
    const incomingPeers = Object.keys(this.server.inbound);
    const outgoingPeers = Object.keys(this.outbound);
    return {
      p2pState: this.p2pState,
      maxInbound: MAX_NUM_INBOUND_CONNECTION,
      targetOutBound: TARGET_NUM_OUTBOUND_CONNECTION,
      numInbound: incomingPeers.length,
      numOutbound: outgoingPeers.length,
      incomingPeers: incomingPeers,
      outgoingPeers: outgoingPeers,
    };
  }

  getTrafficStats() {
    const stats = {};
    for (const [periodName, periodSecs] of Object.entries(TRAFFIC_STATS_PERIOD_SECS_LIST)) {
      stats[periodName] = trafficStatsManager.getEventRates(periodSecs)
    }
    return stats;
  }

  getClientStatus() {
    return {
      trafficStats: this.getTrafficStats(),
    };
  }

  getStatus() {
    const blockStatus = this.server.getBlockStatus();
    return {
      address: this.server.getNodeAddress(),
      updatedAt: Date.now(),
      lastBlockNumber: blockStatus.number,
      networkStatus: this.server.getNetworkStatus(),
      blockStatus: blockStatus,
      txStatus: this.server.getTxStatus(),
      consensusStatus: this.server.getConsensusStatus(),
      nodeStatus: this.server.getNodeStatus(),
      clientStatus: this.getClientStatus(),
      shardingStatus: this.server.getShardingStatus(),
      cpuStatus: this.server.getCpuUsage(),
      memoryStatus: this.server.getMemoryUsage(),
      diskStatus: this.server.getDiskUsage(),
      runtimeInfo: this.server.getRuntimeInfo(),
      protocolInfo: this.server.getProtocolInfo(),
      config: this.getConfig(),
    };
  }

  getConfig() {
    return {
      env: process.env,
      blockchainParams: BlockchainParams,
      devFlags: DevFlags,
    };
  }

  /**
   * Returns json rpc urls.
   */
  getPeerCandidateUrlList() {
    return Object.values(this.outbound).map(peer => {
      const jsonRpcUrl = _.get(peer, 'peerInfo.networkStatus.urls.jsonRpc.url');
      if (jsonRpcUrl) {
        return jsonRpcUrl;
      }
    });
  }

  /**
   * Returns P2p endpoint urls.
   */
  getPeerUrlList() {
    return Object.values(this.outbound)
      .filter(peer => {
        const incomingPeers =
            _.get(peer, 'peerInfo.networkStatus.connectionStatus.incomingPeers', []);
        const maxInbound = _.get(peer, 'peerInfo.networkStatus.connectionStatus.maxInbound', 0);
        return incomingPeers.length < maxInbound;
      })
      .map(peer => peer.peerInfo.networkStatus.urls.p2p.url);
  }

  getPeerCandidateInfo() {
    return {
      isAvailableForConnection:
          MAX_NUM_INBOUND_CONNECTION > Object.keys(this.server.inbound).length,
      networkStatus: this.server.getNetworkStatus(),
      peerCandidateUrlList: this.getPeerCandidateUrlList(),
      newPeerUrlList: this.getPeerUrlList()
    }
  }

  updatePeerInfoToTracker() {
    const message = {
      type: TrackerMessageTypes.PEER_INFO_UPDATE,
      data: this.getStatus()
    };
    logger.debug(`\n >> Update to [TRACKER] ${TRACKER_WS_ADDR}: ` +
        `${JSON.stringify(message, null, 2)}`);
    this.trackerWebSocket.send(JSON.stringify(message));
  }

  setIntervalForTrackerConnection() {
    if (!this.intervalTrackerConnection) {
      this.intervalTrackerConnection = setInterval(() => {
        this.connectToTracker();
      }, TRACKER_RECONNECTION_INTERVAL_MS);
    }
  }

  clearIntervalForTrackerConnection() {
    clearInterval(this.intervalTrackerConnection);
    this.intervalTrackerConnection = null;
  }

  setIntervalForTrackerUpdate() {
    this.updatePeerInfoToTracker();
    this.intervalTrackerUpdate = setInterval(() => {
      this.updatePeerInfoToTracker();
    }, TRACKER_UPDATE_INTERVAL_MS);
  }

  clearIntervalForTrackerUpdate() {
    clearInterval(this.intervalTrackerUpdate);
    this.intervalTrackerUpdate = null;
  }

  /**
   * Returns either true or false and also set p2pState.
   */
  updateP2pState() {
    if (Object.keys(this.outbound).length < TARGET_NUM_OUTBOUND_CONNECTION) {
      this.p2pState = P2pNetworkStates.EXPANDING;
    } else {
      this.p2pState = P2pNetworkStates.STEADY;
    }
  }

  /**
   * Returns randomly picked connectable peers. Refer to details below:
   * 1) Pick one if it is never queried.
   * 2) Choose one in all peerCandidates if there no exists never queried peerCandidates.
   * 3) Use P2P_PEER_CANDIDATE_URL if there are no peerCandidates at all.
   */
  assignRandomPeerCandidate() {
    const peerCandidatesEntries = Object.entries(this.peerCandidates);
    if (peerCandidatesEntries.length === 0) {
      return P2P_PEER_CANDIDATE_URL;
    } else {
      const notQueriedCandidateEntries = peerCandidatesEntries.filter(([, value]) => {
        return value.queriedAt === null;
      });
      if (notQueriedCandidateEntries.length > 0) {
        shuffled = _.shuffle(notQueriedCandidateEntries);
        return shuffled[0][0];
      } else {
        const shuffled = _.shuffle(peerCandidatesEntries);
        return shuffled[0][0];
      }
    }
  }

  setIntervalForPeerCandidatesConnection() {
    this.intervalPeerCandidatesConnection = setInterval(async () => {
      this.updateP2pState();
      if (this.p2pState === P2pNetworkStates.EXPANDING && !this.isConnectingToPeerCandidates) {
        this.isConnectingToPeerCandidates = true;
        const nextPeerCandidate = this.assignRandomPeerCandidate();
        await this.connectWithPeerCandidateUrl(nextPeerCandidate);
        this.isConnectingToPeerCandidates = false;
      }
    }, PEER_CANDIDATES_CONNECTION_INTERVAL_MS);
  }

  clearIntervalForPeerCandidateConnection() {
    clearInterval(this.intervalPeerCandidatesConnection);
  }

  async setTrackerEventHandlers() {
    this.trackerWebSocket.on('close', (code) => {
      logger.info(`\nDisconnected from [TRACKER] ${TRACKER_WS_ADDR} with code: ${code}`);
      this.clearIntervalForTrackerUpdate();
      this.setIntervalForTrackerConnection();
    });
  }

  async startBlockchainNode(numLivePeers) {
    const LOG_HEADER = 'startBlockchainNode';

    if (numLivePeers === 0) {
      logger.info(`[${LOG_HEADER}] Starting blockchain node without peers..`);
      if (!this.server.node.initNode(true)) {
        this.server.node.state = BlockchainNodeStates.STOPPED;
        logger.error(`[${LOG_HEADER}] Failed to initialize blockchain node!`);
        return;
      }
      logger.info(`[${LOG_HEADER}] Trying to initializing shard..`);
      if (await this.server.tryInitializeShard()) {
        logger.info(`[${LOG_HEADER}] Shard initialization done!`);
      } else {
        logger.info(`[${LOG_HEADER}] No need to initialize shard.`);
      }
      this.server.node.state = BlockchainNodeStates.SERVING;
      logger.info(`[${LOG_HEADER}] Now blockchain node in SERVING state!`);
      logger.info(`[${LOG_HEADER}] Initializing consensus process..`);
      this.server.consensus.initConsensus();
      logger.info(`[${LOG_HEADER}] Consensus process initialized!`);
    } else {
      // Consensus will be initialized after syncing with peers
      logger.info(`[${LOG_HEADER}] Starting blockchain node with ${numLivePeers} peers..`);
      if (!this.server.node.initNode(false)) {
        this.server.node.state = BlockchainNodeStates.STOPPED;
        logger.error(`[${LOG_HEADER}] Failed to initialize blockchain node!`);
        return;
      }
      logger.info(`[${LOG_HEADER}] Blockchain node initialized!`);
    }
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
      this.clearIntervalForTrackerUpdate();
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

  requestChainSegment(socket) {
    if (this.server.node.state !== BlockchainNodeStates.SYNCING &&
      this.server.node.state !== BlockchainNodeStates.SERVING) {
      return;
    }
    const lastBlockNumber = this.server.node.bc.lastBlockNumber();
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

  // TODO(minsulee2): session token will be applied to enhance security.
  sendPeerInfo(socket) {
    const body = {
      address: this.server.getNodeAddress(),
      peerInfo: this.getStatus(),
      timestamp: Date.now(),
      // TODO(minsulee2): Implement sessionToken: token
    };
    const signature = signMessage(body, this.server.getNodePrivateKey());
    if (!signature) {
      logger.error('The signaure is not correctly generated. Discard the message!');
      return false;
    }
    const payload = encapsulateMessage(MessageTypes.ADDRESS_REQUEST,
        { body: body, signature: signature });
    if (!payload) {
      logger.error('The peerInfo message cannot be sent because of msg encapsulation failure.');
      return false;
    }

    socket.send(JSON.stringify(payload));
    return true;
  }

  setClientSidePeerEventHandlers(socket) {
    const LOG_HEADER = 'setClientSidePeerEventHandlers';
    socket.on('message', (message) => {
      trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT);
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
        // NOTE(minsulee2): Now, a distribution of peer nodes are fused in the tracker and node.
        // To integrate the role, TrackerMessageTypes PEER_INFO_REQUEST and PEER_INFO_REPONSE will
        // be moved from tracker into peer node and be combined into MessageTypes ADDRESS_RESPONSE
        // and ADDRESS_REQUEST.
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
              closeSocketSafe(this.outbound, socket);
              return;
            }
            logger.info(`[${LOG_HEADER}] A new websocket(${address}) is established.`);
            this.outbound[address] = {
              socket,
              peerInfo: _.get(parsedMessage, 'data.body.peerInfo')
            };
            Object.assign(this.outbound[address], { version: dataProtoVer });
            this.removePeerConnection(socket.url);
            this.updatePeerInfoToTracker();
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
          this.handleChainSegment(number, chainSegment, catchUpInfo, socket);
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
      logger.info(`Disconnected from a peer: ${address || 'unknown'}`);
    });

    // TODO(minsulee2): needs to update socket.on('error').
  }

  tryInitProcesses(number, chainSegment, catchUpInfo) {
    const LOG_HEADER = 'tryInitProcesses';
    const lastBlockNumber = this.server.node.bc.lastBlockNumber();
    if (lastBlockNumber < number && (chainSegment || catchUpInfo)) {
      // Cannot init processes yet
      return false;
    }
    if (this.server.node.state !== BlockchainNodeStates.SERVING) {
      logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
      this.server.node.state = BlockchainNodeStates.SERVING;
    }
    if (this.server.consensus.state === ConsensusStates.STARTING) {
      this.server.consensus.initConsensus();
    }
    return true;
  }

  handleChainSegment(number, chainSegment, catchUpInfo, socket) {
    const LOG_HEADER = 'handleChainSegment';
    if (this.tryInitProcesses(number, chainSegment, catchUpInfo)) { // Already caught up
      return;
    }
    if (this.server.node.mergeChainSegment(chainSegment) >= 0) { // Merge success
      this.tryInitProcesses(number, chainSegment, catchUpInfo);
    } else {
      logger.info(`[${LOG_HEADER}] Failed to merge incoming chain segment.`);
    }
    if (this.server.consensus.isRunning()) {
      this.server.consensus.catchUp(catchUpInfo);
    }
    if (this.server.node.state !== BlockchainNodeStates.SERVING &&
        this.server.node.bc.lastBlockNumber() <= number) {
      // Continuously request the blockchain segments until
      // your local blockchain matches the height of the consensus blockchain.
      setTimeout(() => {
        this.requestChainSegment(socket);
      }, EPOCH_MS);
    }
  }

  setTimerForPeerAddressResponse(socket) {
    setTimeout(() => {
      const address = getAddressFromSocket(this.outbound, socket);
        if (address) {
          logger.info(`with (${address}).`);
          this.requestChainSegment(socket, this.server.node.bc.lastBlockNumber());
          if (this.server.consensus.stakeTx) {
            this.broadcastTransaction(this.server.consensus.stakeTx);
            this.server.consensus.stakeTx = null;
          }
        } else {
          logger.error('Address confirmation hasn\'t sent back. Close the socket connection');
          this.removePeerConnection(socket.url);
          closeSocketSafe(this.outbound, socket);
        }
    }, WAIT_FOR_ADDRESS_TIMEOUT_MS);
  }

  /**
   * Checks validity of JSON-RPC endpoint url based on HOSTING_ENV.
   * @param {string} url is an IPv4 ip address.
   */
  isValidJsonRpcUrl(url) {
    if (!CommonUtil.isString(url)) {
      return false;
    }
    const JSON_RPC_PATH = '/json-rpc';
    const urlWithoutJsonRpc =
        url.endsWith(JSON_RPC_PATH) ? url.slice(0, -JSON_RPC_PATH.length) : false;
    if (!urlWithoutJsonRpc) {
      return urlWithoutJsonRpc;
    } else {
      return HOSTING_ENV === 'local' ? CommonUtil.isValidPrivateUrl(urlWithoutJsonRpc) :
          CommonUtil.isValidUrl(urlWithoutJsonRpc);
    }
  }

  /**
   * Tries to connect multiple peer candidates via the given peer candidate url.
   * @param {string} peerCandidateUrl should be something like http(s)://xxx.xxx.xxx.xxx/json-rpc
   */
  async connectWithPeerCandidateUrl(peerCandidateUrl) {
    if (!peerCandidateUrl || peerCandidateUrl === '') {
      return;
    }
    const resp = await sendGetRequest(peerCandidateUrl, 'p2p_getPeerCandidateInfo', { });
    const peerCandidateInfo = _.get(resp, 'data.result.result');
    if (!peerCandidateInfo) {
      logger.error(`Invalid peer candidate info from peer candidate url (${peerCandidateUrl}).`);
      return;
    }
    // NOTE(platfowner): As peerCandidateUrl can be a domain name url with multiple nodes,
    // use the json rpc url in response instead.
    const peerCandidateJsonRpcUrl = _.get(peerCandidateInfo, 'networkStatus.urls.jsonRpc.url');
    if (!peerCandidateJsonRpcUrl) {
      logger.error(`Invalid peer candidate json rpc url from peer candidate url (${peerCandidateUrl}).`);
      return;
    }

    this.peerCandidates[peerCandidateJsonRpcUrl] = { queriedAt: Date.now() };
    const peerCandidateUrlList = _.get(peerCandidateInfo, 'peerCandidateUrlList', []);
    peerCandidateUrlList.forEach(url => {
      if (!this.peerCandidates[url] && this.isValidJsonRpcUrl(url)) {
        this.peerCandidates[url] = { queriedAt: null };
      }
    });

    const networkStatus = this.server.getNetworkStatus();
    const myUrl = _.get(networkStatus, 'urls.p2p.url', '');
    const newPeerUrlList = _.get(peerCandidateInfo, 'newPeerUrlList', []);
    const newPeerUrlListWithoutMyUrl = newPeerUrlList.filter(url => {
      return url !== myUrl;
    });
    const isAvailableForConnection = _.get(peerCandidateInfo, 'isAvailableForConnection');
    const peerCandidateP2pUrl = _.get(peerCandidateInfo, 'networkStatus.urls.p2p.url');
    if (isAvailableForConnection && !this.outbound[peerCandidateP2pUrl]) {
      // NOTE(minsulee2): Add a peer candidate up on the list if it is not connected.
      newPeerUrlListWithoutMyUrl.push(peerCandidateP2pUrl);
    }
    this.connectWithPeerUrlList(_.shuffle(newPeerUrlListWithoutMyUrl));
  }

  addPeerConnection(url) {
    this.peerConnectionsInProgress[url] = true;
  }

  removePeerConnection(url) {
    delete this.peerConnectionsInProgress[url];
  }

  connectToPeer(url) {
    const socket = new Websocket(url);
    socket.on('open', async () => {
      logger.info(`Connected to peer (${url}),`);
      this.setClientSidePeerEventHandlers(socket);
      const isMessageSent = this.sendPeerInfo(socket);
      if (isMessageSent) {
        this.addPeerConnection(url);
        this.setTimerForPeerAddressResponse(socket);
      }
    });
  }

  getAddrFromOutboundMapping(url) {
    for (const address in this.outbound) {
      const peerInfo = this.outbound[address];
      if (url === peerInfo.networkStatus.urls.p2p.url) {
        return address;
      }
    }
    return null;
  }

  getMaxNumberOfNewPeers() {
    const totalConnections =
        Object.keys(this.outbound).length + Object.keys(this.peerConnectionsInProgress).length;
    return Math.max(0, TARGET_NUM_OUTBOUND_CONNECTION - totalConnections);
  }

  connectWithPeerUrlList(newPeerUrlList) {
    const maxNumberOfNewPeers = this.getMaxNumberOfNewPeers();
    newPeerUrlList.slice(0, maxNumberOfNewPeers).forEach(url => {
      const address = this.getAddrFromOutboundMapping(url);
      if (address) {
        logger.debug(`Node ${address}(${url}) is already a managed peer.`);
      } else {
        logger.info(`Connecting to peer ${address}(${url})`);
        this.connectToPeer(url);
      }
    });
  }

  disconnectFromPeers() {
    Object.values(this.outbound).forEach(node => {
      node.socket.close();
    });
  }

  setIntervalForShardProofHashReports() {
    if (!this.shardReportInterval && this.server.node.isShardReporter) {
      this.shardReportInterval = setInterval(() => {
        if (this.server.consensus.isRunning()) {
          this.server.reportShardProofHashes();
        }
      }, EPOCH_MS);
    }
  }

  clearIntervalForShardProofHashReports() {
    clearInterval(this.shardReportInterval);
    this.shardReportInterval = null;
  }

  stop() {
    this.server.stop();
    // NOTE(minsulee2): The trackerWebsocket should be checked initialized in order not to get error
    // in case trackerWebsocket is not properly setup.
    this.clearIntervalForTrackerConnection();
    this.clearIntervalForTrackerUpdate();
    this.clearIntervalForPeerCandidateConnection();
    this.clearIntervalForShardProofHashReports();
    if (this.trackerWebSocket) this.trackerWebSocket.close();
    logger.info('Disconnect from tracker server.');
    this.stopHeartbeat();
    this.disconnectFromPeers();
    logger.info('Disconnect from connected peers.');
  }

  updateStatusToPeer(socket, address) {
    const payload = encapsulateMessage(MessageTypes.PEER_INFO_UPDATE, this.getStatus());
    if (!payload) {
      logger.error('The message cannot be sent because of msg encapsulation failure.');
      return;
    }
    socket.send(JSON.stringify(payload));
    logger.debug(`\n >> Update to ${address}: ${JSON.stringify(payload, null, 2)}`);
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
          this.updateStatusToPeer(socket, node.peerInfo.address);
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
