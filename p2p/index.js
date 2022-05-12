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
  getEnvVariables,
  TimerFlags,
  TimerFlagEnabledBandageMap,
  isEnabledTimerFlag,
} = require('../common/constants');
const FileUtil = require('../common/file-util');
const P2pUtil = require('./p2p-util');
const { sendGetRequest } = require('../common/network-util');
const { Block } = require('../blockchain/block');
const { JSON_RPC_METHOD } = require('../json_rpc/constants');

class P2pClient {
  constructor(node, minProtocolVersion, maxProtocolVersion) {
    this.server = new P2pServer(
        this, node, minProtocolVersion, maxProtocolVersion);
    this.isFirstNode = false;
    this.peerCandidates = new Map();
    this.isConnectingToPeerCandidates = false;
    this.steadyIntervalCount = 0;
    this.outbound = {};
    this.p2pState = P2pNetworkStates.STARTING;
    this.peerConnectionsInProgress = new Map();
    this.stateSyncInProgress = null;
    this.chainSyncInProgress = null;
    this.oldChainSyncInProgress = null;
    this.oldChainSyncDone = false;
    this.peerConnectionStartedAt = null;
    logger.info(`Now p2p network in STARTING state!`);
    this.startHeartbeat();
  }

  async run() {
    // 1. Check node account
    if (CommonUtil.isEmpty(this.server.node.account)) {
      return;
    }

    // 2. Start p2p server
    await this.server.listen();

    // 3. Set interval for tracker updates
    if (NodeConfigs.ENABLE_STATUS_REPORT_TO_TRACKER) {
      this.setIntervalForTrackerUpdate();
    }

    // 4. Start peer discovery process
    await this.discoverPeerWithGuardingFlag();
    this.setIntervalForPeerCandidatesConnection();

    // 5. Set up blockchain node
    if (this.server.node.state === BlockchainNodeStates.STARTING) {
      const isFirstNode = P2pUtil.areIdenticalUrls(
          NodeConfigs.PEER_CANDIDATE_JSON_RPC_URL, _.get(this.server.urls, 'jsonRpc.url', ''));
      this.setIsFirstNode(isFirstNode);
      await this.prepareBlockchainNode();
    }
  }

  getConnectionStatus() {
    const incomingPeers = Object.keys(this.server.inbound);
    const outgoingPeers = Object.keys(this.outbound);
    const peerConnectionsInProgress = Array.from(this.peerConnectionsInProgress.keys());
    const peerCandidates = Array.from(this.peerCandidates.keys());
    const peerConnectionElapsedTime = this.peerConnectionStartedAt === null ? 0 :
        Date.now() - this.peerConnectionStartedAt;
    return {
      state: this.p2pState,
      stateNumeric: Object.keys(P2pNetworkStates).indexOf(this.p2pState),
      isConnectingToPeerCandidates: this.isConnectingToPeerCandidates,
      peerConnectionStartedAt: this.peerConnectionStartedAt,
      peerConnectionElapsedTime: peerConnectionElapsedTime,
      maxInbound: NodeConfigs.MAX_NUM_INBOUND_CONNECTION,
      targetOutBound: NodeConfigs.TARGET_NUM_OUTBOUND_CONNECTION,
      peerConnectionsInProgress: peerConnectionsInProgress,
      peerCandidates: peerCandidates,
      numInbound: incomingPeers.length,
      numOutbound: outgoingPeers.length,
      numConnections: incomingPeers.length + outgoingPeers.length,
      numPeerConnectionsInProgress: peerConnectionsInProgress.length,
      numPeerCandidates: peerCandidates.length,
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
      chainSyncInProgress: this.chainSyncInProgress,
    };
  }

  getConfig() {
    return {
      blockchainParams: this.server.node.getAllBlockchainParamsFromState(),
      env: getEnvVariables(),
      devFlags: DevFlags,
      blockchainConsts: BlockchainConsts,
      nodeConfigs: NodeConfigs,
      timerFlags: TimerFlags,
      bandageMap: this.getBandageMap(),
      timerFlagStatus: this.getTimerFlagStatus(),
    };
  }

  getTimerFlagStatus() {
    const lastBlockNumber = this.server.node.bc.lastBlockNumber();
    const flagStates = {};
    for (const flagName of Object.keys(TimerFlags)) {
      flagStates[flagName] = isEnabledTimerFlag(flagName, lastBlockNumber);
    }
    return {
      lastBlockNumber,
      flagStates: flagStates,
      numFlags: Object.keys(TimerFlags).length,
      numEnabledFlags: Object.values(flagStates).reduce((acc, state) => {
        return acc + (state ? 1 : 0);
      }, 0),
    };
  }

  getBandageMap() {
    return Object.fromEntries(TimerFlagEnabledBandageMap.entries());
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
    if (Object.keys(this.outbound).length + this.peerConnectionsInProgress.size <
        NodeConfigs.TARGET_NUM_OUTBOUND_CONNECTION) {
      this.p2pState = P2pNetworkStates.EXPANDING;
    } else {
      this.p2pState = P2pNetworkStates.STEADY;
    }
  }

  /**
   * Use the existing peer or, if the peer is unavailable, randomly assign a peer for syncing
   * the states.
   * @returns {Object|Null} The socket of the peer.
   */
  assignRandomPeerForStateSync() {
    if (Object.keys(this.outbound).length === 0) {
      return null;
    }
    const currentPeer = this.stateSyncInProgress ? this.stateSyncInProgress.address : null;
    if (this.stateSyncInProgress === null || !this.outbound[this.stateSyncInProgress.address]) {
      const candidates = Object.keys(this.outbound).filter((addr) => {
        return addr !== currentPeer && _.get(
            this.outbound[addr], 'peerInfo.consensusStatus.state') === ConsensusStates.RUNNING;
      });
      const selectedAddr = _.shuffle(candidates)[0];
      if (!selectedAddr) {
        return null;
      }
      const p2pUrl = P2pUtil.getP2pUrlFromAddress(this.outbound, selectedAddr);
      this.setStateSyncPeer(selectedAddr, p2pUrl);
    }
    const socket = this.outbound[this.stateSyncInProgress.address].socket;
    return socket;
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
        return addr !== currentPeer && _.get(
            this.outbound[addr], 'peerInfo.consensusStatus.state') === ConsensusStates.RUNNING;
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
   * Use the existing peer or, if the peer is unavailable, randomly assign a peer for syncing
   * the old chain (after 'peer' sync mode cold start).
   * @returns {Object|Null} The socket of the peer.
   */
  assignRandomPeerForOldChainSync(forceToReset = false) {
    if (Object.keys(this.outbound).length === 0) {
      return null;
    }
    const currentPeer = this.oldChainSyncInProgress ? this.oldChainSyncInProgress.address : null;
    if (forceToReset ||
        this.oldChainSyncInProgress === null ||
        !this.outbound[this.oldChainSyncInProgress.address]) {
      const candidates = Object.keys(this.outbound).filter((addr) => {
        return addr !== currentPeer && _.get(
            this.outbound[addr], 'peerInfo.consensusStatus.state') === ConsensusStates.RUNNING;
      });
      const selectedAddr = _.shuffle(candidates)[0];
      if (!selectedAddr) {
        return null;
      }
      const oldestBlockNumber = this.server.node.bc.oldestBlockNumber();
      this.setOldChainSyncPeer(selectedAddr, oldestBlockNumber);
    }
    const socket = this.outbound[this.oldChainSyncInProgress.address].socket;
    return socket;
  }

  /**
   * Returns randomly picked connectable peers. Refer to details below:
   * 1) Pick one if it is never queried.
   * 2) Choose one in all peerCandidates if there no exists never queried peerCandidates.
   * 3) Use PEER_CANDIDATE_JSON_RPC_URL if there are no peerCandidates at all.
   */
  assignRandomPeerCandidate() {
    if (this.peerCandidates.size === 0) {
      return NodeConfigs.PEER_CANDIDATE_JSON_RPC_URL;
    } else {
      const notQueriedCandidateEntries = [...this.peerCandidates.entries()].filter(([, value]) => {
        // NOTE(minsulee2): this gets stuck if the never queried node gets offline. To avoid this,
        // the node which queried more than 5 minutes ago can also be considered as notQueried.
        return value.queriedAt === null ? true :
            Date.now() - value.queriedAt > NodeConfigs.PEER_CANDIDATE_RETRY_THRESHOLD_MS;
      });
      if (notQueriedCandidateEntries.length > 0) {
        return _.shuffle(notQueriedCandidateEntries)[0][0];
      } else {
        return _.shuffle(this.peerCandidates.keys())[0];
      }
    }
  }

  async discoverPeerWithGuardingFlag() {
    const LOG_HEADER = 'discoverPeerWithGuardingFlag';
    if (!this.isConnectingToPeerCandidates) {
      this.peerConnectionStartedAt = Date.now();
      try {
        this.isConnectingToPeerCandidates = true;
        const nextPeerCandidate = this.assignRandomPeerCandidate();
        await this.connectWithPeerCandidateUrl(nextPeerCandidate);
      } catch (e) {
        logger.error(`[${LOG_HEADER}] ${e}`);
      } finally {
        this.isConnectingToPeerCandidates = false;
      }
    }
  }

  closeSocketWithP2pStateUpdate(socket) {
    P2pUtil.closeSocketSafe(this.outbound, socket);
    const address = P2pUtil.getAddressFromSocket(this.outbound, socket);
    if (address in this.server.inbound) {
      P2pUtil.closeSocketSafeByAddress(this.server.inbound, address);
    }
    this.updateP2pState();
  }

  pickRandomPeerAndDisconnect(addressArray) {
    if (addressArray.length === 0) {
      return;
    }
    const randomPeerAddress = _.shuffle(addressArray)[0];
    if (!this.outbound[randomPeerAddress]) {
      return;
    }
    this.closeSocketWithP2pStateUpdate(this.outbound[randomPeerAddress].socket);
  }

  disconnectRandomPeer() {
    if (Object.keys(this.outbound) === 0) {
      return;
    }
    // NOTE(minsulee2): To avoid breaking connections between ADDRESS_REQUEST and ADDRESS_RESPONSE,
    // bidirectionally connected peers are picked to disconnect.
    const bidirectedConnections = Object.keys(this.outbound).filter(address => {
      return Object.keys(this.server.inbound).includes(address);
    });
    // NOTE(minsulee2): ENABLE_JSON_RPC_API === true means API server nodes for now.
    // TODO(minsulee2): Need to introduce a new flag which marks a 'bridge node' role.
    if (NodeConfigs.ENABLE_JSON_RPC_API) {
      const whitelist = this.server.node.db.getValue('/consensus/validator_whitelist');
      const [whitelisted, notWhitelisted] =
          _.partition(bidirectedConnections, ((address) => whitelist[address]));
      const whitelistDisconnectThreshold = Math.floor(NodeConfigs.MAX_NUM_INBOUND_CONNECTION / 2);
      // NOTE(minsulee2): Keep less than majority whitelisted.
      if (whitelisted.length >= whitelistDisconnectThreshold) {
        trafficStatsManager.addEvent(
            TrafficEventTypes.PEER_REORG_CANDIDATES_WHITELISTED, whitelisted.length);
        this.pickRandomPeerAndDisconnect(whitelisted);
      } else {
        trafficStatsManager.addEvent(
            TrafficEventTypes.PEER_REORG_CANDIDATES_NOT_WHITELISTED, notWhitelisted.length);
        this.pickRandomPeerAndDisconnect(notWhitelisted);
      }
    } else {
      trafficStatsManager.addEvent(
          TrafficEventTypes.PEER_REORG_CANDIDATES_BIDIRECTED, bidirectedConnections.length);
      this.pickRandomPeerAndDisconnect(bidirectedConnections);
    }
  }

  async tryReorgPeerConnections() {
    const numOutbound = Object.keys(this.outbound).length;
    if (numOutbound < NodeConfigs.PEER_REORG_MIN_OUTBOUND) {
      trafficStatsManager.addEvent(TrafficEventTypes.PEER_REORG_BELOW_MIN_OUTBOUND, numOutbound);
      return;
    }
    if (this.steadyIntervalCount < NodeConfigs.PEER_REORG_STEADY_INTERVAL_COUNT) {
      this.steadyIntervalCount++;
    } else {
      this.steadyIntervalCount = 0;
      this.disconnectRandomPeer();
      this.updateP2pState();
      await this.discoverPeerWithGuardingFlag();
    }
  }

  setIntervalForPeerCandidatesConnection() {
    this.intervalPeerCandidatesConnection = setInterval(async () => {
      this.updateP2pState();
      if (this.p2pState === P2pNetworkStates.EXPANDING) {
        await this.discoverPeerWithGuardingFlag();
      } else if (this.p2pState === P2pNetworkStates.STEADY) {
        await this.tryReorgPeerConnections();
      }
    }, NodeConfigs.PEER_CANDIDATES_CONNECTION_INTERVAL_MS);
  }

  clearIntervalForPeerCandidateConnection() {
    clearInterval(this.intervalPeerCandidatesConnection);
  }

  async prepareBlockchainNode() {
    const LOG_HEADER = 'prepareBlockchainNode';

    logger.info(
        `[${LOG_HEADER}] Preparing blockchain node with isFirstNode = ${this.isFirstNode} ..`);
    this.server.node.setNodeStateBySyncMode();
    if (this.server.node.state === BlockchainNodeStates.STATE_SYNCING) {
      this.requestSnapshotChunks();
      return;
    } else if (this.server.node.state === BlockchainNodeStates.STATE_LOADING) {
      if (!(await this.server.node.loadLatestSnapshot())) {
        this.server.node.state = BlockchainNodeStates.STOPPED;
        logger.error(`[${LOG_HEADER}] Blockchain node stopped!`);
        return;
      }
      this.server.node.state = BlockchainNodeStates.READY_TO_START;
      logger.info(`[${LOG_HEADER}] Now blockchain node in READY_TO_START state!`);
    }
    await this.startBlockchainNode();
  }

  async startBlockchainNode() {
    const LOG_HEADER = 'startBlockchainNode';

    if (this.server.node.state !== BlockchainNodeStates.READY_TO_START) {
      logger.error(
          `[${LOG_HEADER}] Blockchain node is not in READY_TO_START state: ${this.server.node.state}`);
      this.server.node.state = BlockchainNodeStates.STOPPED;
      logger.error(`[${LOG_HEADER}] Blockchain node stopped!`);
      return;
    }
    if (!this.server.node.startNode(this.isFirstNode)) {
      logger.error(`[${LOG_HEADER}] Failed to init blockchain node!`);
      this.server.node.state = BlockchainNodeStates.STOPPED;
      logger.error(`[${LOG_HEADER}] Blockchain node stopped!`);
      return;
    }
    logger.info(`[${LOG_HEADER}] Blockchain node started!`);

    if (!this.isFirstNode) {
      // Does nothing.
      // NOTE: Consensus will be initialized after syncing with peers
      return;
    }
    logger.info(`[${LOG_HEADER}] Trying to initializing shard..`);
    // TODO(liayoo): Move this to after node account is injected.
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
  }

  broadcastConsensusMessage(consensusMessage, tags = []) {
    tags.push(this.server.node.account.address);
    const payload = P2pUtil.encapsulateMessage(MessageTypes.CONSENSUS, { message: consensusMessage, tags });
    if (!payload) {
      logger.error('The consensus msg cannot be broadcasted because of msg encapsulation failure.');
      return;
    }
    const stringPayload = JSON.stringify(payload);
    if (DevFlags.enableP2pMessageTagsChecking) {
      const tagSet = new Set(tags);
      Object.entries(this.outbound).forEach(([address, node]) => {
        if (!tagSet.has(address) &&
            _.get(node, 'peerInfo.consensusStatus.state') === ConsensusStates.RUNNING) {
          node.socket.send(stringPayload);
        }
      });
    } else {
      Object.values(this.outbound).forEach((node) => {
        if (_.get(node, 'peerInfo.consensusStatus.state') === ConsensusStates.RUNNING) {
          node.socket.send(stringPayload);
        }
      });
    }
    logger.debug(`SENDING: ${JSON.stringify(consensusMessage)}`);
  }

  /**
   * Send a request for snapshot chunks to a peer.
   * The peer is randomly selected and maintained until it's disconnected, it gives
   * an invalid chain, or we're fully synced.
   */
  requestSnapshotChunks() {
    const LOG_HEADER = 'requestSnapshotChunks';

    if (this.server.node.state !== BlockchainNodeStates.STATE_SYNCING ||
        this.stateSyncInProgress !== null ||
        Object.keys(this.outbound).length === 0) {
      return;
    }
    const socket = this.assignRandomPeerForStateSync();
    if (!socket) {
      logger.error(`[${LOG_HEADER}] Failed to get a peer for SNAPSHOT_CHUNK_REQUEST`);
      return;
    }
    const payload = P2pUtil.encapsulateMessage(MessageTypes.SNAPSHOT_CHUNK_REQUEST, {});
    if (!payload) {
      logger.error(`[${LOG_HEADER}] The request for snapshot chunks couldn't be sent because ` +
          `of msg encapsulation failure.`);
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  /**
   * Send a request for a chain segment to a peer.
   * The peer is randomly selected and maintained until it's disconnected, it gives
   * an invalid chain, or we're fully synced.
   */
  requestChainSegment() {
    const LOG_HEADER = 'requestChainSegment';
    if (this.server.node.state !== BlockchainNodeStates.CHAIN_SYNCING &&
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
    const payload = P2pUtil.encapsulateMessage(MessageTypes.CHAIN_SEGMENT_REQUEST, { lastBlockNumber });
    if (!payload) {
      logger.error(`[${LOG_HEADER}] The request for chain segment couldn't be sent because ` +
          `of msg encapsulation failure.`);
      return;
    }
    this.updateChainSyncStatus(lastBlockNumber);
    socket.send(JSON.stringify(payload));
  }

  /**
   * Send a request for an 'old' chain segment to a peer.
   * The peer is randomly selected and maintained until it's disconnected, it gives
   * an invalid chain, or we're fully synced.
   */
  requestOldChainSegment(forceToReset = false) {
    const LOG_HEADER = 'requestOldChainSegment';
    if (this.oldChainSyncDone === true) {
      return;
    }
    if (this.server.node.state !== BlockchainNodeStates.CHAIN_SYNCING &&
      this.server.node.state !== BlockchainNodeStates.SERVING) {
      return;
    }
    const socket = this.assignRandomPeerForOldChainSync(forceToReset);
    if (!socket) {
      logger.error(`[${LOG_HEADER}] Failed to get a peer for OLD_CHAIN_SEGMENT_REQUEST`);
      return;
    }
    const oldestBlockNumber = this.oldChainSyncInProgress.oldestBlockNumber;
    if (oldestBlockNumber === 0) {
      this.resetOldChainSyncPeer();
      logger.info(`[${LOG_HEADER}] Old chain is already synced!`);
      return;
    }
    const payload = P2pUtil.encapsulateMessage(
        MessageTypes.OLD_CHAIN_SEGMENT_REQUEST, { oldestBlockNumber });
    if (!payload) {
      logger.error(`[${LOG_HEADER}] The request for old chain segment couldn't be sent because ` +
          `of msg encapsulation failure.`);
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  broadcastTransaction(transaction, tags = []) {
    tags.push(this.server.node.account.address);
    const payload = P2pUtil.encapsulateMessage(MessageTypes.TRANSACTION, { transaction, tags });
    if (!payload) {
      logger.error('The transaction cannot be broadcasted because of msg encapsulation failure.');
      return;
    }
    const stringPayload = JSON.stringify(payload);
    if (DevFlags.enableP2pMessageTagsChecking) {
      const tagSet = new Set(tags);
      Object.entries(this.outbound).forEach(([address, node]) => {
        if (!tagSet.has(address)) {
          node.socket.send(stringPayload);
        }
      });
    } else {
      Object.entries(this.outbound).forEach(([address, node]) => {
        node.socket.send(stringPayload);
      });
    }
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
    const signature = P2pUtil.signMessage(body, this.server.getNodePrivateKey());
    if (!signature) {
      logger.error('The signaure is not correctly generated. Discard the message!');
      return false;
    }
    const payload = P2pUtil.encapsulateMessage(MessageTypes.ADDRESS_REQUEST,
        { body: body, signature: signature });
    if (!payload) {
      logger.error('The peerInfo message cannot be sent because of msg encapsulation failure.');
      return false;
    }

    socket.send(JSON.stringify(payload));
    return true;
  }

  clearPeerConnectionsInProgress(socket) {
    P2pUtil.removeFromPeerConnectionsInProgress(this.peerConnectionsInProgress, socket.url);
    this.closeSocketWithP2pStateUpdate(socket);
  }

  setClientSidePeerEventHandlers(socket) {
    const LOG_HEADER = 'setClientSidePeerEventHandlers';
    socket.on('message', async (message) => {
      const beginTime = Date.now();
      const parsedMessage = JSON.parse(message);
      const peerNetworkId = _.get(parsedMessage, 'networkId');
      const address = P2pUtil.getAddressFromSocket(this.outbound, socket);
      if (peerNetworkId !== this.server.node.getBlockchainParam('genesis/network_id')) {
        logger.error(`The given network ID(${peerNetworkId}) of the node(${address}) is MISSING ` +
            `or DIFFERENT from mine. Disconnect the connection.`);
        this.clearPeerConnectionsInProgress(socket);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
        return;
      }
      const dataProtoVer = _.get(parsedMessage, 'dataProtoVer');
      if (!VersionUtil.isValidProtocolVersion(dataProtoVer)) {
        logger.error(`The data protocol version of the node(${address}) is MISSING or ` +
            `INAPPROPRIATE. Disconnect the connection.`);
        this.clearPeerConnectionsInProgress(socket);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
        return;
      }
      if (!P2pUtil.checkTimestamp(_.get(parsedMessage, 'timestamp'))) {
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
            this.clearPeerConnectionsInProgress(socket);
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
            return;
          } else if (!_.get(parsedMessage, 'data.signature')) {
            logger.error(`[${LOG_HEADER}] A sinature of the peer(${address}) is missing during ` +
                `p2p communication. Cannot proceed the further communication.`);
            this.clearPeerConnectionsInProgress(socket);
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
            return;
          } else {
            const addressFromSig = P2pUtil.getAddressFromMessage(parsedMessage);
            if (addressFromSig !== address) {
              logger.error(`[${LOG_HEADER}] The addresses(${addressFromSig} and ${address}) are ` +
                  `not the same!!`);
              this.clearPeerConnectionsInProgress(socket);
              const latency = Date.now() - beginTime;
              trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
              return;
            }
            if (!P2pUtil.verifySignedMessage(parsedMessage, addressFromSig)) {
              logger.error(`[${LOG_HEADER}] The message is not correctly signed. ` +
                  `Discard the message!!`);
              this.clearPeerConnectionsInProgress(socket);
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
            P2pUtil.removeFromPeerConnectionsInProgress(this.peerConnectionsInProgress, socket.url);
            this.updateNodeInfoToTracker();
          }
          break;
        case MessageTypes.SNAPSHOT_CHUNK_RESPONSE:
          if (this.server.node.state !== BlockchainNodeStates.STATE_SYNCING &&
              this.server.node.state !== BlockchainNodeStates.SERVING) {
            logger.error(`[${LOG_HEADER}] Not ready to process snapshot chunk response.\n` +
                `Node state: ${this.server.node.state}.`);
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
            return;
          }
          const dataVersionCheckForSnapshotChunk =
              this.server.checkDataProtoVer(dataProtoVer, MessageTypes.SNAPSHOT_CHUNK_RESPONSE);
          if (dataVersionCheckForSnapshotChunk > 0) {
            logger.error(`[${LOG_HEADER}] CANNOT deal with higher data protocol ` +
                `version(${dataProtoVer}). Discard the SNAPSHOT_CHUNK_RESPONSE message.`);
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.P2P_MESSAGE_CLIENT, latency);
            return;
          } else if (dataVersionCheckForSnapshotChunk < 0) {
            // TODO(minsulee2): need to convert message when updating SNAPSHOT_CHUNK_RESPONSE.
            // this.convertSnapshotChunkResponseMessage();
          }
          const chunk = _.get(parsedMessage, 'data.chunk');
          const chunkIndex = _.get(parsedMessage, 'data.chunkIndex');
          const numChunks = _.get(parsedMessage, 'data.numChunks');
          const blockNumber = _.get(parsedMessage, 'data.blockNumber');
          logger.debug(`[${LOG_HEADER}] Receiving a snapshot chunk: ` +
              `${JSON.stringify(chunk, null, 2)}\n` +
              `of chunkIndex ${chunkIndex} and numChunks ${numChunks}.`);
          await this.handleSnapshotChunk(chunk, chunkIndex, numChunks, blockNumber, socket);
          break;
        case MessageTypes.CHAIN_SEGMENT_RESPONSE:
          if (this.server.node.state !== BlockchainNodeStates.CHAIN_SYNCING &&
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
          await this.handleChainSegment(number, chainSegment, catchUpInfo, socket);
          break;
        case MessageTypes.OLD_CHAIN_SEGMENT_RESPONSE:
          const oldChainSegment = _.get(parsedMessage, 'data.oldChainSegment');
          const segmentSize = CommonUtil.isArray(oldChainSegment) ? oldChainSegment.length : 0;
          const fromBlockNumber = segmentSize > 0 ? oldChainSegment[0].number : -1;
          const toBlockNumber = segmentSize > 0 ? oldChainSegment[segmentSize - 1].number : -1;
          logger.info(
              `[${LOG_HEADER}] Receiving an old chain segment of size ${segmentSize} ` +
              `(${fromBlockNumber} ~ ${toBlockNumber})`);
          await this.handleOldChainSegment(
              oldChainSegment, segmentSize, fromBlockNumber, toBlockNumber, socket);
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
      const address = P2pUtil.getAddressFromSocket(this.outbound, socket);
      logger.debug(`The peer (${address}) is alive.`);
    });

    socket.on('close', () => {
      const address = P2pUtil.getAddressFromSocket(this.outbound, socket);
      if (_.get(this.chainSyncInProgress, 'address') === address) {
        this.resetChainSyncPeer();
      }
      this.clearPeerConnectionsInProgress(socket);
      if (address in this.server.inbound) {
        P2pUtil.closeSocketSafeByAddress(this.server.inbound, address);
      }
      logger.info(`Disconnected from a peer: ${address || socket.url}`);
    });

    socket.on('error', () => {
      const address = P2pUtil.getAddressFromSocket(this.inbound, socket);
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

  // TODO(platfowner): Add peer blacklisting.
  async handleSnapshotChunk(chunk, chunkIndex, numChunks, blockNumber, socket) {
    const LOG_HEADER = 'handleSnapshotChunk';

    logger.info(
        `[${LOG_HEADER}] Handling a snapshot chunk ${chunkIndex} / ${numChunks} of ` +
        `block number ${blockNumber}.`);
    const senderAddress = P2pUtil.getAddressFromSocket(this.outbound, socket);
    const peerAddress = _.get(this.stateSyncInProgress, 'address', null);
    if (senderAddress !== peerAddress) {
      // Received from a peer that I didn't request from
      logger.error(`[${LOG_HEADER}] Mismatched senderAddress: ${senderAddress} !== ${peerAddress}`);
      return;
    }

    if (numChunks === 0) {
      const source = `${this.stateSyncInProgress.address} (${this.stateSyncInProgress.p2pUrl})`;
      logger.error(`[${LOG_HEADER}] Snapshot chunk request was rejected by peer ${source}`);
      this.server.node.state = BlockchainNodeStates.STOPPED;
      logger.error(`[${LOG_HEADER}] Blockchain node stopped!`);
      return;
    }

    const chunkArraySize = _.get(this.stateSyncInProgress, 'chunks.length', null);
    if (chunkIndex !== chunkArraySize) {
      logger.error(`[${LOG_HEADER}] Mismatched chunkIndex: ${chunkIndex} !== ${chunkArraySize}`);
      this.server.node.state = BlockchainNodeStates.STOPPED;
      logger.error(`[${LOG_HEADER}] Blockchain node stopped!`);
      return;
    }
    this.updateStateSyncStatus(chunk, chunkIndex);

    // Last chunk
    if (chunkIndex === numChunks - 1) {
      await this.buildSnapshotAndStartBlockchainNode();
    }
  }

  async buildSnapshotAndStartBlockchainNode() {
    const LOG_HEADER = 'buildSnapshotAndStartBlockchainNode';

    const chunks = _.get(this.stateSyncInProgress, 'chunks', null);
    if (!chunks || chunks.length === 0) {
      logger.error(`[${LOG_HEADER}] Empty chunks.`);
      this.server.node.state = BlockchainNodeStates.STOPPED;
      logger.error(`[${LOG_HEADER}] Blockchain node stopped!`);
      return;
    }
    const snapshot = FileUtil.buildObjectFromChunks(chunks);
    const source = `${this.stateSyncInProgress.address} (${this.stateSyncInProgress.p2pUrl})`;
    const blockNumber = this.server.node.setBootstrapSnapshot(source, snapshot);
    logger.info(
        `[${LOG_HEADER}] Set a latest snapshot of block number ${blockNumber} from ${source}.`);
    this.server.node.state = BlockchainNodeStates.READY_TO_START;
    logger.info(`[${LOG_HEADER}] Now blockchain node in READY_TO_START state!`);
    await this.startBlockchainNode();
    this.resetStateSyncPeer();
    this.requestChainSegment();
    this.requestOldChainSegment();
  }

  // TODO(platfowner): Add peer blacklisting.
  async handleChainSegment(number, chainSegment, catchUpInfo, socket) {
    const LOG_HEADER = 'handleChainSegment';

    const senderAddress = P2pUtil.getAddressFromSocket(this.outbound, socket);
    const peerAddress = _.get(this.chainSyncInProgress, 'address', null);
    if (senderAddress !== peerAddress) {
      // Received from a peer that I didn't request from
      logger.error(`[${LOG_HEADER}] Mismatched senderAddress: ${senderAddress} !== ${peerAddress}`);
      return;
    }
    if (!this.precheckChainSegment(chainSegment, senderAddress)) {
      // Buffer time to avoid network resource abusing
      await CommonUtil.sleep(NodeConfigs.CHAIN_SEGMENT_SLEEP_MS);
      this.resetChainSyncPeer();
      this.requestChainSegment();
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
      this.server.consensus.catchUp(catchUpInfo);
    } else {
      logger.info(`[${LOG_HEADER}] Failed to merge incoming chain segment.`);
    }
    if (this.server.node.bc.lastBlockNumber() <= number) {
      // Continuously request the blockchain segments until
      // your local blockchain matches the height of the consensus blockchain.
      this.requestChainSegment();
    }
  }

  precheckChainSegment(chainSegment, peerAddress) {
    const LOG_HEADER = 'precheckChainSegment';

    const p2pUrl = P2pUtil.getP2pUrlFromAddress(this.outbound, peerAddress);
    for (let i = 0; i < chainSegment.length; i++) {
      const block = chainSegment[i];
      if (!Block.hasRequiredFields(block)) {
        logger.error(
            `[${LOG_HEADER}] chainSegment[${i}] from ${peerAddress} (${p2pUrl}) is in a non-standard format: ${JSON.stringify(block)}`
            + `\n${new Error().stack}.`);
        // non-standard format case
        return false;
      }
      if (i === 0) {
        const genesisBlockHash = this.server.node.bc.genesisBlockHash;
        if (block.number === 0 && block.hash !== genesisBlockHash) {
          logger.error(
              `[${LOG_HEADER}] Genesis block from ${peerAddress} (${p2pUrl}) has a mismatched hash: ${block.hash} / ${genesisBlockHash}`
              + `\n${new Error().stack}.`);
          // genesis block hash mismatch case
          return false;
        }
      } else {
        const lastHash = block.last_hash;
        const prevBlockHash = chainSegment[i - 1].hash;
        if (lastHash !== prevBlockHash) {
          logger.error(
              `[${LOG_HEADER}] chainSegment[${i}] from ${peerAddress} (${p2pUrl}) has a mismatched last_hash: ${lastHash} / ${prevBlockHash}`
              + `\n${new Error().stack}.`);
          // last_hash mismatch case
          return false;
        }
      }
    }

    return true;
  }

  // TODO(platfowner): Add peer blacklisting.
  async handleOldChainSegment(
      oldChainSegment, segmentSize, fromBlockNumber, toBlockNumber, socket) {
    const LOG_HEADER = 'handleOldChainSegment';

    const senderAddress = P2pUtil.getAddressFromSocket(this.outbound, socket);
    const peerAddress = _.get(this.oldChainSyncInProgress, 'address', null);
    if (senderAddress !== peerAddress) {
      // Received from a peer that I didn't request from
      logger.error(`[${LOG_HEADER}] Mismatched senderAddress: ${senderAddress} !== ${peerAddress}`);
      return;
    }
    if (segmentSize > 0) {
      if (!this.precheckOldChainSegment(oldChainSegment, senderAddress)) {
        logger.error(
            `[${LOG_HEADER}] Precheck failed for an old chain segment of size ${segmentSize} ` +
            `(${fromBlockNumber} ~ ${toBlockNumber}) from ${senderAddress}`);
        // Buffer time to avoid network resource abusing
        await CommonUtil.sleep(NodeConfigs.OLD_CHAIN_SEGMENT_SLEEP_MS);
        this.requestOldChainSegment(true);
        return;
      }
      this.writeOldChainSegment(oldChainSegment);
      this.updateOldChainSyncStatus(toBlockNumber);
      logger.info(
          `[${LOG_HEADER}] Old chain segment of size ${segmentSize} ` +
          `(${fromBlockNumber} ~ ${toBlockNumber}) from ${senderAddress} was written.`);
    } 

    const oldestBlockNumber = this.oldChainSyncInProgress.oldestBlockNumber;
    if (oldestBlockNumber > 0) {
      // Buffer time to avoid network resource abusing
      await CommonUtil.sleep(NodeConfigs.OLD_CHAIN_SEGMENT_SLEEP_MS);
      const forceToReset = segmentSize === 0;
      this.requestOldChainSegment(forceToReset);
    } else {
      this.resetOldChainSyncPeer();
      logger.info(`[${LOG_HEADER}] Old chain is now synced!`);
    }
  }

  precheckOldChainSegment(oldChainSegment, peerAddress) {
    const LOG_HEADER = 'precheckOldChainSegment';

    const p2pUrl = P2pUtil.getP2pUrlFromAddress(this.outbound, peerAddress);
    for (let i = 0; i < oldChainSegment.length; i++) {
      const block = oldChainSegment[i];
      const number = block.number;
      if (!Block.hasRequiredFields(block)) {
        logger.error(
            `[${LOG_HEADER}] oldChainSegment[${i}] (${number}) from ${peerAddress} (${p2pUrl}) is in a non-standard format: ${JSON.stringify(block)}`
            + `\n${new Error().stack}.`);
        // non-standard format case
        return false;
      }
      let nextBlock = null;
      if (i === 0) {
        nextBlock = this.server.node.bc.getBlockByNumber(number + 1);
      } else {
        nextBlock = oldChainSegment[i - 1];
      }
      const lastBlockHash = nextBlock ? nextBlock.last_hash : null;
      const blockHash = block.hash;
      if (blockHash !== lastBlockHash) {
        logger.error(
            `[${LOG_HEADER}] oldChainSegment[${i}] (${number}) from ${peerAddress} (${p2pUrl}) has a mismatched hash: ${blockHash} / ${lastBlockHash}`
            + `\n${new Error().stack}.`);
        // mismatched last_hash case
        return false;
      }
    }

    return true;
  }

  writeOldChainSegment(oldChainSegment) {
    for (const block of oldChainSegment) {
      this.server.node.bc.writeBlock(block);
    }
  }

  setTimerForPeerAddressResponse(socket) {
    setTimeout(() => {
      const address = P2pUtil.getAddressFromSocket(this.outbound, socket);
        if (address) {
          const p2pUrl = P2pUtil.getP2pUrlFromAddress(this.outbound, address);
          logger.info(`Received address ${address} from ${p2pUrl}`);
          if (this.server.node.state === BlockchainNodeStates.STATE_SYNCING) {
            this.requestSnapshotChunks();
          } else {
            this.requestChainSegment();
          }
          if (this.server.consensus.stakeTx) {
            this.broadcastTransaction(this.server.consensus.stakeTx);
            this.server.consensus.stakeTx = null;
          }
        } else {
          logger.error(`Address confirmation hasn\'t sent back. ` +
              `Close the socket(${socket.url}) connection`);
          this.clearPeerConnectionsInProgress(socket);
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

  setPeerCandidate(jsonRpcUrl, address, queriedAt) {
    if (CommonUtil.isWildcard(NodeConfigs.PEER_WHITELIST) ||
        (CommonUtil.isArray(NodeConfigs.PEER_WHITELIST) &&
            NodeConfigs.PEER_WHITELIST.includes(address))) {
      this.peerCandidates.set(jsonRpcUrl, { queriedAt });
    }
  }

  /**
   * Tries to connect multiple peer candidates via the given peer candidate url.
   * @param {string} peerCandidateJsonRpcUrl should be something like
   * http(s)://xxx.xxx.xxx.xxx/json-rpc
   */
  async connectWithPeerCandidateUrl(peerCandidateJsonRpcUrl) {
    const LOG_HEADER = 'connectWithPeerCandidateUrl';
    const myP2pUrl = _.get(this.server.urls, 'p2p.url', '');
    const myJsonRpcUrl = _.get(this.server.urls, 'jsonRpc.url', '');
    if (!peerCandidateJsonRpcUrl || peerCandidateJsonRpcUrl === '' ||
        P2pUtil.areIdenticalUrls(peerCandidateJsonRpcUrl, myJsonRpcUrl)) {
      this.peerCandidates.delete(peerCandidateJsonRpcUrl);
      return;
    }
    const resp = await sendGetRequest(
        peerCandidateJsonRpcUrl, JSON_RPC_METHOD.P2P_GET_PEER_CANDIDATE_INFO, { });
    const peerCandidateInfo = _.get(resp, 'data.result.result');
    if (!peerCandidateInfo) {
      logger.error(`Invalid peer candidate info from peer candidate url ` +
          `(${peerCandidateJsonRpcUrl}).`);
      return;
    }
    // NOTE(platfowner): As peerCandidateUrl can be a domain name url with multiple nodes,
    // use the json rpc url in response instead.
    const jsonRpcUrlFromResp = _.get(peerCandidateInfo, 'networkStatus.urls.jsonRpc.url');
    const address = _.get(peerCandidateInfo, 'address');
    if (!jsonRpcUrlFromResp) {
      logger.error(`Invalid peer candidate json rpc url from peer candidate url ` +
          `(${peerCandidateJsonRpcUrl}).`);
      return;
    }
    if (jsonRpcUrlFromResp !== myJsonRpcUrl) {
      this.setPeerCandidate(jsonRpcUrlFromResp, address, Date.now());
    }
    const peerCandidateJsonRpcUrlList = _.get(peerCandidateInfo, 'peerCandidateJsonRpcUrlList', []);
    Object.entries(peerCandidateJsonRpcUrlList).forEach(([address, url]) => {
      if (url !== myJsonRpcUrl && !this.peerCandidates.has(url) && this.isValidJsonRpcUrl(url) &&
          P2pUtil.checkPeerWhitelist(address)) {
        this.setPeerCandidate(url, address, null);
      }
    });
    const newPeerP2pUrlList = _.get(peerCandidateInfo, 'newPeerP2pUrlList', []);
    const newPeerP2pUrlListWithoutMyUrl = Object.entries(newPeerP2pUrlList)
      .filter(([address, p2pUrl]) => {
        return P2pUtil.checkPeerWhitelist(address) && p2pUrl !== myP2pUrl;
      })
      .map(([, p2pUrl]) => p2pUrl);
    const isAvailableForConnection = _.get(peerCandidateInfo, 'isAvailableForConnection');
    const peerCandidateP2pUrl = _.get(peerCandidateInfo, 'networkStatus.urls.p2p.url');
    if (peerCandidateP2pUrl !== myP2pUrl && isAvailableForConnection && !this.outbound[address]) {
      // NOTE(minsulee2): Add a peer candidate up on the list if it is not connected.
      newPeerP2pUrlListWithoutMyUrl.push(peerCandidateP2pUrl);
    }
    logger.info(`[${LOG_HEADER}] Try to connect(${JSON.stringify(newPeerP2pUrlListWithoutMyUrl)})`);
    this.connectWithPeerUrlList(_.shuffle(newPeerP2pUrlListWithoutMyUrl));
  }

  setIsFirstNode(isFirstNode) {
    this.isFirstNode = isFirstNode;
  }

  setStateSyncPeer(address, p2pUrl) {
    this.stateSyncInProgress = {
      address,
      p2pUrl,
      chunks: [],
      lastChunkIndex: -1,
      updatedAt: Date.now
    };
  }

  updateStateSyncStatus(chunk, chunkIndex) {
    if (!this.stateSyncInProgress) {
      return;
    }
    this.stateSyncInProgress.chunks.push(chunk);
    this.stateSyncInProgress.lastChunkIndex = chunkIndex;
    this.stateSyncInProgress.updatedAt = Date.now();
  }

  resetStateSyncPeer() {
    this.stateSyncInProgress = null;
  }

  setChainSyncPeer(address) {
    this.chainSyncInProgress = {
      address,
      lastBlockNumber: -2, // less than -1 (initialized)
      updatedAt: Date.now
    };
  }

  updateChainSyncStatus(lastBlockNumber) {
    if (!this.chainSyncInProgress) {
      return;
    }
    this.chainSyncInProgress.lastBlockNumber = lastBlockNumber;
    this.chainSyncInProgress.updatedAt = Date.now();
  }

  resetChainSyncPeer() {
    this.chainSyncInProgress = null;
  }

  setOldChainSyncPeer(address, oldestBlockNumber) {
    this.oldChainSyncInProgress = {
      address,
      oldestBlockNumber, // less than -1 (initialized)
      updatedAt: Date.now
    };
  }

  updateOldChainSyncStatus(oldestBlockNumber) {
    if (!this.oldChainSyncInProgress) {
      return;
    }
    this.oldChainSyncInProgress.oldestBlockNumber = oldestBlockNumber;
    this.oldChainSyncInProgress.updatedAt = Date.now();
  }

  resetOldChainSyncPeer() {
    this.oldChainSyncInProgress = null;
    this.oldChainSyncDone = true;
  }

  connectToPeer(url) {
    // TODO(*): Add maxPayload option (e.g. ~50MB)
    const socket = new Websocket(url);
    socket.on('open', async () => {
      logger.info(`Connected to peer (${url}),`);
      this.setClientSidePeerEventHandlers(socket, url);
      const isMessageSent = this.sendPeerInfo(socket);
      if (isMessageSent) {
        P2pUtil.addPeerConnection(this.peerConnectionsInProgress, url);
        this.updateP2pState();
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
        Object.keys(this.outbound).length + this.peerConnectionsInProgress.size;
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
    const payload = P2pUtil.encapsulateMessage(MessageTypes.PEER_INFO_UPDATE, this.getStatus());
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
          logger.info(`A peer(${node.peerInfo.address}) is not ready to communicate with. ` +
              `The readyState is(${socket.readyState})`);
          this.closeSocketWithP2pStateUpdate(socket);
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
