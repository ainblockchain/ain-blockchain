/* eslint no-mixed-operators: "off" */
const logger = new (require('../logger'))('P2P_CLIENT');
const _ = require('lodash');
const P2pServer = require('./server');
const Websocket = require('ws');
const { ConsensusStates } = require('../consensus/constants');
const VersionUtil = require('../common/version-util');
const CommonUtil = require('../common/common-util');
const {
  DevFlags,
  BlockchainConsts,
  NodeConfigs,
  MessageTypes,
  BlockchainNodeStates,
  P2pNetworkStates,
  TrafficEventTypes,
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
  checkPeerWhitelist
} = require('./util');
const {
  sendGetRequest
} = require('../common/network-util');

class P2pClient {
  constructor(node, minProtocolVersion, maxProtocolVersion) {
    this.server = new P2pServer(
        this, node, minProtocolVersion, maxProtocolVersion);
    this.peerCandidates = {};
    this.isConnectingToPeerCandidates = false;
    this.outbound = {};
    this.p2pState = P2pNetworkStates.STARTING;
    this.peerConnectionsInProgress = {};
    this.chainSyncInProgress = null;
    logger.info(`Now p2p network in STARTING state!`);
    this.startHeartbeat();
  }

  async run() {
    if (CommonUtil.isEmpty(this.server.node.account)) return;
    await this.server.listen();
    if (NodeConfigs.ENABLE_STATUS_REPORT_TO_TRACKER) this.setIntervalForTrackerUpdate();
    if (this.server.node.state === BlockchainNodeStates.STARTING) {
      if (NodeConfigs.PEER_CANDIDATE_JSON_RPC_URL === '' ||
          NodeConfigs.PEER_CANDIDATE_JSON_RPC_URL === _.get(this.server.urls, 'jsonRpc.url', '')) {
        await this.startBlockchainNode(0);
        return;
      } else {
        await this.startBlockchainNode(1);
      }
    }
    this.connectWithPeerCandidateUrl(NodeConfigs.PEER_CANDIDATE_JSON_RPC_URL);
    this.setIntervalForPeerCandidatesConnection();
  }

  getConnectionStatus() {
    const incomingPeers = Object.keys(this.server.inbound);
    const outgoingPeers = Object.keys(this.outbound);
    return {
      p2pState: this.p2pState,
      maxInbound: NodeConfigs.MAX_NUM_INBOUND_CONNECTION,
      targetOutBound: NodeConfigs.TARGET_NUM_OUTBOUND_CONNECTION,
      numInbound: incomingPeers.length,
      numOutbound: outgoingPeers.length,
      incomingPeers: incomingPeers,
      outgoingPeers: outgoingPeers,
    };
  }

  getTrafficStats() {
    const stats = {};
    for (const [periodName, periodSecs] of
        Object.entries(NodeConfigs.TRAFFIC_STATS_PERIOD_SECS_LIST)) {
      stats[periodName] = trafficStatsManager.getEventStats(periodSecs)
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
      blockchainParams: this.server.node.getAllBlockchainParamsFromState(),
      env: process.env,
      devFlags: DevFlags,
      blockchainConsts: BlockchainConsts,
      nodeConfigs: NodeConfigs,
    };
  }

  /**
   * Returns json rpc urls.
   */
  getPeerCandidateJsonRpcUrlList() {
    const outboundEntries = Object.entries(this.outbound).map(([address, peer]) => {
      const jsonRpcUrl = _.get(peer, 'peerInfo.networkStatus.urls.jsonRpc.url');
      return [address, jsonRpcUrl];
    });
    return Object.fromEntries(outboundEntries);
  }

  /**
   * Returns P2p endpoint urls.
   */
  getPeerP2pUrlList() {
    const outboundEntries = Object.entries(this.outbound)
      .filter(([, peer]) => {
        const incomingPeers =
            _.get(peer, 'peerInfo.networkStatus.connectionStatus.incomingPeers', []);
        const maxInbound = _.get(peer, 'peerInfo.networkStatus.connectionStatus.maxInbound', 0);
        return incomingPeers.length < maxInbound;
      })
      .map(([address, peer]) => {
        const p2pUrl = _.get(peer, 'peerInfo.networkStatus.urls.p2p.url');
        return [address, p2pUrl];
      });
    return Object.fromEntries(outboundEntries);
  }

  getPeerCandidateInfo() {
    return {
      address: this.server.getNodeAddress(),
      isAvailableForConnection:
          NodeConfigs.MAX_NUM_INBOUND_CONNECTION > Object.keys(this.server.inbound).length,
      networkStatus: this.server.getNetworkStatus(),
      peerCandidateJsonRpcUrlList: this.getPeerCandidateJsonRpcUrlList(),
      newPeerP2pUrlList: this.getPeerP2pUrlList()
    }
  }

  /**
   * Update peer info to tracker via POST.
   */
  async updateNodeInfoToTracker() {
    try {
      const peerInfo = this.getStatus();
      Object.assign(peerInfo, { updatedAt: Date.now() });
      await sendGetRequest(NodeConfigs.TRACKER_UPDATE_JSON_RPC_URL, 'updateNodeInfo', peerInfo);
    } catch (error) {
      logger.error(error);
    }
  }

  // TODO(minsulee2): Update TRACKER_UPDATE_INTERVAL_MS to a longer value (e.g. 1 min) for mainnet.
  setIntervalForTrackerUpdate() {
    this.updateNodeInfoToTracker();
    this.intervalTrackerUpdate = setInterval(() => {
      this.updateNodeInfoToTracker();
    }, NodeConfigs.TRACKER_UPDATE_INTERVAL_MS);
  }

  clearIntervalForTrackerUpdate() {
    clearInterval(this.intervalTrackerUpdate);
    this.intervalTrackerUpdate = null;
  }

  /**
   * Returns either true or false and also set p2pState.
   */
  updateP2pState() {
    if (Object.keys(this.outbound).length + Object.keys(this.peerConnectionsInProgress).length <
        NodeConfigs.TARGET_NUM_OUTBOUND_CONNECTION) {
      this.p2pState = P2pNetworkStates.EXPANDING;
    } else {
      this.p2pState = P2pNetworkStates.STEADY;
    }
  }

  /**
   * Use the existing peer or, if the peer is unavailable, randomly assign a peer for syncing
   * the chain.
   * @returns {Object|Null} The socket of the peer.
   */
  assignRandomPeerForChainSync() {
    if (Object.keys(this.outbound).length === 0) {
      return null;
    }
    const currentPeer = this.chainSyncInProgress ? this.chainSyncInProgress.address : null;
    if (this.chainSyncInProgress === null || !this.outbound[this.chainSyncInProgress.address]) {
      const candidates = Object.keys(this.outbound).filter((addr) => {
        return addr !== currentPeer &&
            _.get(this.outbound[addr], 'peerInfo.consensusStatus.state') === ConsensusStates.RUNNING;
      });
      const selectedAddr = _.shuffle(candidates)[0];
      if (!selectedAddr) {
        return null;
      }
      this.setChainSyncPeer(selectedAddr);
    }
    const socket = this.outbound[this.chainSyncInProgress.address].socket;
    return socket;
  }

  /**
   * Returns randomly picked connectable peers. Refer to details below:
   * 1) Pick one if it is never queried.
   * 2) Choose one in all peerCandidates if there no exists never queried peerCandidates.
   * 3) Use PEER_CANDIDATE_JSON_RPC_URL if there are no peerCandidates at all.
   */
  assignRandomPeerCandidate() {
    const peerCandidatesEntries = Object.entries(this.peerCandidates);
    if (peerCandidatesEntries.length === 0) {
      return NodeConfigs.PEER_CANDIDATE_JSON_RPC_URL;
    } else {
      const notQueriedCandidateEntries = peerCandidatesEntries.filter(([, value]) => {
        return value.queriedAt === null;
      });
      if (notQueriedCandidateEntries.length > 0) {
        return _.shuffle(notQueriedCandidateEntries)[0][0];
      } else {
        return _.shuffle(peerCandidatesEntries)[0][0];
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
    }, NodeConfigs.PEER_CANDIDATES_CONNECTION_INTERVAL_MS);
  }

  clearIntervalForPeerCandidateConnection() {
    clearInterval(this.intervalPeerCandidatesConnection);
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

  broadcastConsensusMessage(consensusMessage) {
    const payload = encapsulateMessage(MessageTypes.CONSENSUS, { message: consensusMessage });
    if (!payload) {
      logger.error('The consensus msg cannot be broadcasted because of msg encapsulation failure.');
      return;
    }
    const stringPayload = JSON.stringify(payload);
    Object.values(this.outbound).forEach((node) => {
      if (_.get(node, 'peerInfo.consensusStatus.state') === ConsensusStates.RUNNING) {
        node.socket.send(stringPayload);
      }
    });
    logger.debug(`SENDING: ${JSON.stringify(consensusMessage)}`);
  }

  /**
   * Request a chain segment to sync with from a peer.
   * The peer to request from is randomly selected & maintained until it's disconnected, it gives
   * an invalid chain, or we're fully synced.
   */
  requestChainSegment() {
    const LOG_HEADER = 'requestChainSegment';
    if (this.server.node.state !== BlockchainNodeStates.SYNCING &&
      this.server.node.state !== BlockchainNodeStates.SERVING) {
      return;
    }
    const socket = this.assignRandomPeerForChainSync();
    if (!socket) {
      logger.error(`[${LOG_HEADER}] Failed to get a peer for CHAIN_SEGMENT_REQUEST`);
      return;
    }
    const lastBlockNumber = this.server.node.bc.lastBlockNumber();
    const epochMs = this.server.node.getBlockchainParam('genesis/epoch_ms');
    if (this.chainSyncInProgress.lastBlockNumber >= lastBlockNumber &&
        this.chainSyncInProgress.updatedAt > Date.now() - epochMs) { // time buffer
      logger.info(`[${LOG_HEADER}] Already sent a request with the same/higher lastBlockNumber`);
      return;
    }
    const payload = encapsulateMessage(MessageTypes.CHAIN_SEGMENT_REQUEST, { lastBlockNumber });
    if (!payload) {
      logger.error(`[${LOG_HEADER}] The request chainSegment cannot be sent because ` +
          `of msg encapsulation failure.`);
      return;
    }
    this.updateChainSyncPeer(lastBlockNumber);
    socket.send(JSON.stringify(payload));
  }

  broadcastTransaction(transaction) {
    const payload = encapsulateMessage(MessageTypes.TRANSACTION, { transaction: transaction });
    if (!payload) {
      logger.error('The transaction cannot be broadcasted because of msg encapsulation failure.');
      return;
    }
    const stringPayload = JSON.stringify(payload);
    _.shuffle(Object.values(this.outbound)).slice(0, 2).forEach((node) => {
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
      const beginTime = Date.now();
      const parsedMessage = JSON.parse(message);
      const peerNetworkId = _.get(parsedMessage, 'networkId');
      const address = getAddressFromSocket(this.outbound, socket);
      if (peerNetworkId !== this.server.node.getBlockchainParam('genesis/network_id')) {
        logger.error(`The given network ID(${peerNetworkId}) of the node(${address}) is MISSING ` +
          `or DIFFERENT from mine. Disconnect the connection.`);
        closeSocketSafe(this.outbound, socket);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
        return;
      }
      const dataProtoVer = _.get(parsedMessage, 'dataProtoVer');
      if (!VersionUtil.isValidProtocolVersion(dataProtoVer)) {
        logger.error(`The data protocol version of the node(${address}) is MISSING or ` +
              `INAPPROPRIATE. Disconnect the connection.`);
        closeSocketSafe(this.outbound, socket);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
        return;
      }
      if (!checkTimestamp(_.get(parsedMessage, 'timestamp'))) {
        logger.error(`[${LOG_HEADER}] The message from the node(${address}) is stale. ` +
            `Discard the message.`);
        logger.debug(`[${LOG_HEADER}] The detail is as follows: ${parsedMessage}`);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
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
            this.removePeerConnection(socket.url);
            closeSocketSafe(this.outbound, socket);
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
            return;
          } else if (!_.get(parsedMessage, 'data.signature')) {
            logger.error(`[${LOG_HEADER}] A sinature of the peer(${address}) is missing during ` +
                `p2p communication. Cannot proceed the further communication.`);
            this.removePeerConnection(socket.url);
            closeSocketSafe(this.outbound, socket);
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
            return;
          } else {
            const addressFromSig = getAddressFromMessage(parsedMessage);
            if (addressFromSig !== address) {
              logger.error(`[${LOG_HEADER}] The addresses(${addressFromSig} and ${address}) are ` +
                  `not the same!!`);
              this.removePeerConnection(socket.url);
              closeSocketSafe(this.outbound, socket);
              const latency = Date.now() - beginTime;
              trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
              return;
            }
            if (!verifySignedMessage(parsedMessage, addressFromSig)) {
              logger.error(`[${LOG_HEADER}] The message is not correctly signed. ` +
                  `Discard the message!!`);
              this.removePeerConnection(socket.url);
              closeSocketSafe(this.outbound, socket);
              const latency = Date.now() - beginTime;
              trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
              return;
            }
            logger.info(`[${LOG_HEADER}] A new websocket(${address}) is established.`);
            this.outbound[address] = {
              socket,
              peerInfo: _.get(parsedMessage, 'data.body.peerInfo')
            };
            Object.assign(this.outbound[address], { version: dataProtoVer });
            this.removePeerConnection(socket.url);
            this.updateNodeInfoToTracker();
          }
          break;
        case MessageTypes.CHAIN_SEGMENT_RESPONSE:
          if (this.server.node.state !== BlockchainNodeStates.SYNCING &&
              this.server.node.state !== BlockchainNodeStates.SERVING) {
            logger.error(`[${LOG_HEADER}] Not ready to process chain segment response.\n` +
                `Node state: ${this.server.node.state}.`);
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
            return;
          }
          const dataVersionCheckForChainSegment =
              this.server.checkDataProtoVer(dataProtoVer, MessageTypes.CHAIN_SEGMENT_RESPONSE);
          if (dataVersionCheckForChainSegment > 0) {
            logger.error(`[${LOG_HEADER}] CANNOT deal with higher data protocol ` +
                `version(${dataProtoVer}). Discard the CHAIN_SEGMENT_RESPONSE message.`);
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
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
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
    });

    socket.on('pong', () => {
      const address = getAddressFromSocket(this.outbound, socket);
      logger.info(`The peer(${address}) is alive.`);
    });

    socket.on('close', () => {
      const address = getAddressFromSocket(this.outbound, socket);
      removeSocketConnectionIfExists(this.outbound, address);
      this.removePeerConnection(socket.url);
      if (_.get(this.chainSyncInProgress, 'address') === address) {
        this.resetChainSyncPeer();
      }
      logger.info(`Disconnected from a peer: ${address || 'unknown'}`);
    });

    socket.on('error', () => {
      const address = getAddressFromSocket(this.inbound, socket);
      logger.error(`Error in communication with peer ${address}: ` +
          `${JSON.stringify(error, null, 2)}`);
    });
  }

  tryInitProcesses(number) {
    const LOG_HEADER = 'tryInitProcesses';
    const lastBlockNumber = this.server.node.bc.lastBlockNumber();
    if (lastBlockNumber < number) {
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
    const address = getAddressFromSocket(this.outbound, socket);
    // Received from a peer that I didn't request from
    if (_.get(this.chainSyncInProgress, 'address') !== address) {
      return;
    }
    if (this.tryInitProcesses(number)) { // Already caught up
      this.resetChainSyncPeer();
      this.server.consensus.catchUp(catchUpInfo);
      return;
    }
    const mergeResult = this.server.node.mergeChainSegment(chainSegment);
    if (mergeResult !== 0) {
      // Received an invalid chain, or fully synced with this peer.
      this.resetChainSyncPeer();
    } else {
      // There's more to receive from this peer.
    }
    if (mergeResult >= 0) { // Merge success
      this.tryInitProcesses(number);
    } else {
      logger.info(`[${LOG_HEADER}] Failed to merge incoming chain segment.`);
    }
    this.server.consensus.catchUp(catchUpInfo);
    if (this.server.node.bc.lastBlockNumber() <= number) {
      // Continuously request the blockchain segments until
      // your local blockchain matches the height of the consensus blockchain.
      this.requestChainSegment();
    }
  }

  setTimerForPeerAddressResponse(socket) {
    setTimeout(() => {
      const address = getAddressFromSocket(this.outbound, socket);
        if (address) {
          logger.info(`Received address: ${address}`);
          this.requestChainSegment();
          if (this.server.consensus.stakeTx) {
            this.broadcastTransaction(this.server.consensus.stakeTx);
            this.server.consensus.stakeTx = null;
          }
        } else {
          logger.error('Address confirmation hasn\'t sent back. Close the socket connection');
          this.removePeerConnection(socket.url);
          closeSocketSafe(this.outbound, socket);
        }
    }, NodeConfigs.P2P_WAIT_FOR_ADDRESS_TIMEOUT_MS);
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
      return NodeConfigs.HOSTING_ENV === 'local' ? CommonUtil.isValidPrivateUrl(urlWithoutJsonRpc) :
          CommonUtil.isValidUrl(urlWithoutJsonRpc);
    }
  }

  /**
   * Tries to connect multiple peer candidates via the given peer candidate url.
   * @param {string} peerCandidateJsonRpcUrl should be something like
   * http(s)://xxx.xxx.xxx.xxx/json-rpc
   */
  async connectWithPeerCandidateUrl(peerCandidateJsonRpcUrl) {
    const myP2pUrl = _.get(this.server.urls, 'p2p.url', '');
    const myJsonRpcUrl = _.get(this.server.urls, 'jsonRpc.url', '');
    if (!peerCandidateJsonRpcUrl || peerCandidateJsonRpcUrl === '' ||
        peerCandidateJsonRpcUrl === myJsonRpcUrl) {
      return;
    }
    const resp = await sendGetRequest(peerCandidateJsonRpcUrl, 'p2p_getPeerCandidateInfo', { });
    const peerCandidateInfo = _.get(resp, 'data.result.result');
    if (!peerCandidateInfo) {
      logger.error(`Invalid peer candidate info from peer candidate url ` +
          `(${peerCandidateJsonRpcUrl}).`);
      return;
    }
    // NOTE(platfowner): As peerCandidateUrl can be a domain name url with multiple nodes,
    // use the json rpc url in response instead.
    const jsonRpcUrlFromResp = _.get(peerCandidateInfo, 'networkStatus.urls.jsonRpc.url');
    if (!jsonRpcUrlFromResp) {
      logger.error(`Invalid peer candidate json rpc url from peer candidate url ` +
          `(${peerCandidateJsonRpcUrl}).`);
      return;
    }
    if (jsonRpcUrlFromResp !== myJsonRpcUrl) {
      this.peerCandidates[jsonRpcUrlFromResp] = { queriedAt: Date.now() };
    }
    const peerCandidateJsonRpcUrlList = _.get(peerCandidateInfo, 'peerCandidateJsonRpcUrlList', []);
    Object.entries(peerCandidateJsonRpcUrlList).forEach(([address, url]) => {
      if (url !== myJsonRpcUrl && !this.peerCandidates[url] && this.isValidJsonRpcUrl(url) &&
          checkPeerWhitelist(address)) {
        this.peerCandidates[url] = { queriedAt: null };
      }
    });
    const newPeerP2pUrlList = _.get(peerCandidateInfo, 'newPeerP2pUrlList', []);
    const newPeerP2pUrlListWithoutMyUrl = Object.entries(newPeerP2pUrlList)
      .filter(([address, p2pUrl]) => {
        return checkPeerWhitelist(address) && p2pUrl !== myP2pUrl;
      })
      .map(([, p2pUrl]) => p2pUrl);
    const isAvailableForConnection = _.get(peerCandidateInfo, 'isAvailableForConnection');
    const peerCandidateP2pUrl = _.get(peerCandidateInfo, 'networkStatus.urls.p2p.url');
    const address = _.get(peerCandidateInfo, 'address');
    if (peerCandidateP2pUrl !== myP2pUrl && isAvailableForConnection && !this.outbound[address]) {
      // NOTE(minsulee2): Add a peer candidate up on the list if it is not connected.
      newPeerP2pUrlListWithoutMyUrl.push(peerCandidateP2pUrl);
    }
    this.connectWithPeerUrlList(_.shuffle(newPeerP2pUrlListWithoutMyUrl));
  }

  addPeerConnection(url) {
    this.peerConnectionsInProgress[url] = true;
  }

  removePeerConnection(url) {
    delete this.peerConnectionsInProgress[url];
  }

  setChainSyncPeer(address) {
    this.chainSyncInProgress = {
      address,
      lastBlockNumber: -2, // less than -1 (initialized)
      updatedAt: Date.now
    };
  }

  updateChainSyncPeer(lastBlockNumber) {
    if (!this.chainSyncInProgress) return;
    this.chainSyncInProgress.lastBlockNumber = lastBlockNumber;
    this.chainSyncInProgress.updatedAt = Date.now();
  }

  resetChainSyncPeer() {
    this.chainSyncInProgress = null;
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
      const peerInfo = this.outbound[address].peerInfo;
      if (url === peerInfo.networkStatus.urls.p2p.url) {
        return address;
      }
    }
    return null;
  }

  getMaxNumberOfNewPeers() {
    const totalConnections =
        Object.keys(this.outbound).length + Object.keys(this.peerConnectionsInProgress).length;
    return Math.max(0, NodeConfigs.TARGET_NUM_OUTBOUND_CONNECTION - totalConnections);
  }

  connectWithPeerUrlList(newPeerP2pUrlList) {
    const maxNumberOfNewPeers = this.getMaxNumberOfNewPeers();
    newPeerP2pUrlList.slice(0, maxNumberOfNewPeers).forEach((url) => {
      const address = this.getAddrFromOutboundMapping(url);
      if (address) {
        logger.debug(`Node ${address}(${url}) is already a managed peer.`);
      } else {
        logger.info(`Connecting to peer(${url})`);
        this.connectToPeer(url);
      }
    });
  }

  disconnectFromPeers() {
    Object.values(this.outbound).forEach((node) => {
      node.socket.close();
    });
  }

  setIntervalForShardProofHashReports() {
    if (!this.shardReportInterval && this.server.node.isShardReporter) {
      const epochMs = this.server.node.getBlockchainParam('genesis/epoch_ms');
      this.shardReportInterval = setInterval(() => {
        if (this.server.consensus.isRunning()) {
          this.server.reportShardProofHashes();
        }
      }, epochMs);
    }
  }

  clearIntervalForShardProofHashReports() {
    clearInterval(this.shardReportInterval);
    this.shardReportInterval = null;
  }

  stop() {
    this.server.stop();
    this.clearIntervalForTrackerUpdate();
    this.clearIntervalForPeerCandidateConnection();
    this.clearIntervalForShardProofHashReports();
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
    }, NodeConfigs.P2P_HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    clearInterval(this.intervalHeartbeat);
    this.intervalHeartbeat = null;
    logger.info('Stop heartbeating.');
  }
}

module.exports = P2pClient;
