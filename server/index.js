const url = require('url');
const Websocket = require('ws');
const ip = require('ip');
const publicIp = require('public-ip');
const axios = require('axios');
const semver = require('semver');
const disk = require('diskusage');
const os = require('os');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger');
const Consensus = require('../consensus');
const { ConsensusStatus } = require('../consensus/constants');
const { Block } = require('../blockchain/block');
const Transaction = require('../tx-pool/transaction');
const {
  DEBUG,
  P2P_PORT,
  TRACKER_WS_ADDR,
  HOSTING_ENV,
  MessageTypes,
  PredefinedDbPaths,
  WriteDbOperations,
  GenesisSharding,
  GenesisAccounts,
  AccountProperties,
  OwnerProperties,
  RuleProperties,
  ShardingProperties,
  ShardingProtocols,
  FunctionProperties,
  FunctionTypes,
  NativeFunctionIds,
  buildOwnerPermissions
} = require('../constants');
const ChainUtil = require('../chain-util');
const { sendTxAndWaitForConfirmation } = require('./util');

const GCP_EXTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip';
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;
const RECONNECT_INTERVAL_MS = 10000;
const UPDATE_TO_TRACKER_INTERVAL_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 1000;
const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';
const P2P_PREFIX = 'P2P';

// A peer-to-peer network server that broadcasts changes in the database.
// TODO(seo): Sign messages to tracker or peer.
class P2pServer {
  constructor(node, minProtocolVersion, maxProtocolVersion) {
    this.isStarting = true;
    this.ipAddress = null;
    this.trackerWebSocket = null;
    this.server = null;
    this.node = node;
    this.managedPeersInfo = {};
    this.sockets = [];
    this.consensus = new Consensus(this, node);
    // XXX(minsu): The comment out will be revoked when next heartbeat updates.
    // this.isAlive = true;
    this.waitInBlocks = 4;
    this.minProtocolVersion = minProtocolVersion;
    this.maxProtocolVersion = maxProtocolVersion;
  }

  listen() {
    this.server = new Websocket.Server({
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
    this.server.on('connection', (socket) => this.setSocket(socket, null));
    logger.info(`[${P2P_PREFIX}] Listening to peer-to-peer connections on: ${P2P_PORT}\n`);
    this.setIntervalForTrackerConnection();
    // XXX(minsu): it won't run before updating p2p network.
    // this.heartbeat();
  }

  stop() {
    logger.info(`[${P2P_PREFIX}] Stop consensus interval.`);
    this.consensus.stop();
    logger.info(`[${P2P_PREFIX}] Disconnect from connected peers.`);
    this.disconnectFromPeers();
    logger.info(`[${P2P_PREFIX}] Disconnect from tracker server.`);
    this.disconnectFromTracker();
    logger.info(`[${P2P_PREFIX}] Close server.`);
    this.server.close(_ => { });
  }

  setIntervalForTrackerConnection() {
    this.connectToTracker();
    this.intervalConnection = setInterval(() => {
      this.connectToTracker();
    }, RECONNECT_INTERVAL_MS)
  }

  clearIntervalForTrackerConnection() {
    clearInterval(this.intervalConnection);
    this.intervalConnection = null;
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

  connectToTracker() {
    logger.info(`[${P2P_PREFIX}] Reconnecting to tracker (${TRACKER_WS_ADDR})`);
    this.getIpAddress()
    .then(() => {
      this.trackerWebSocket = new Websocket(TRACKER_WS_ADDR);
      this.trackerWebSocket.on('open', () => {
        logger.info(`[${P2P_PREFIX}] Connected to tracker (${TRACKER_WS_ADDR})`);
        this.clearIntervalForTrackerConnection();
        this.setTrackerEventHandlers();
        this.setIntervalForTrackerUpdate();
      });
      this.trackerWebSocket.on('error', (error) => {
        logger.error(`[${P2P_PREFIX}] Error in communication with tracker (${TRACKER_WS_ADDR}): ` +
                     `${JSON.stringify(error, null, 2)}`);
      });
    });
  }

  disconnectFromTracker() {
    this.trackerWebSocket.close();
  }

  getIpAddress() {
    return Promise.resolve()
    .then(() => {
      if (HOSTING_ENV === 'gcp') {
        return axios.get(GCP_EXTERNAL_IP_URL, {
          headers: {'Metadata-Flavor': 'Google'},
          timeout: 3000
        })
        .then((res) => {
          return res.data;
        })
        .catch((err) => {
          logger.error(`[${P2P_PREFIX}] Failed to get ip address: ${JSON.stringify(err, null, 2)}`);
          process.exit(0);
        });
      } else if (HOSTING_ENV === 'local') {
        return ip.address();
      } else {
        return publicIp.v4();
      }
    })
    .then((ipAddr) => {
      this.ipAddress = ipAddr;
      return ipAddr;
    });
  }

  async setTrackerEventHandlers() {
    this.trackerWebSocket.on('message', async (message) => {
      try {
        const parsedMsg = JSON.parse(message);
        logger.info(`\n$[${P2P_PREFIX}] << Message from [TRACKER]: ` +
                    `${JSON.stringify(parsedMsg, null, 2)}`)
        if (this.connectToPeers(parsedMsg.newManagedPeerInfoList)) {
          logger.info(`[${P2P_PREFIX}] Updated managed peers info: ` +
                      `${JSON.stringify(this.managedPeersInfo, null, 2)}`);
        }
        if (this.isStarting) {
          this.isStarting = false;
          if (parsedMsg.numLivePeers === 0) {
            const lastBlockWithoutProposal = this.node.init(true);
            await this.tryInitializeShard();
            this.node.bc.syncedAfterStartup = true;
            this.consensus.init(lastBlockWithoutProposal, true);
          } else {
            // Consensus will be initialized after syncing with peers
            this.node.init(false);
          }
        }
      } catch (error) {
        logger.error(`[${P2P_PREFIX}] ` + error.stack);
      }
    });

    this.trackerWebSocket.on('close', (code) => {
      logger.info(`\n[${P2P_PREFIX}] Disconnected from [TRACKER] ${TRACKER_WS_ADDR} with code: ${code}`);
      this.clearIntervalForTrackerUpdate();
      this.setIntervalForTrackerConnection();
    });
  }

  updateNodeStatusToTracker() {
    const updateToTracker = {
      url: url.format({
        protocol: 'ws',
        hostname: this.ipAddress,
        port: P2P_PORT
      }),
      ip: this.ipAddress,
      address: this.node.account.address,
      updatedAt: Date.now(),
      lastBlock: {
        number: this.node.bc.lastBlockNumber(),
        epoch: this.node.bc.lastBlockEpoch(),
        timestamp: this.node.bc.lastBlockTimestamp(),
      },
      consensusStatus: Object.assign(
        {},
        this.consensus.getState(),
        { longestNotarizedChainTipsSize: this.consensus.blockPool ?
            this.consensus.blockPool.longestNotarizedChainTips.length : 0 }
      ),
      txStatus: {
        txPoolSize: this.node.tp.getPoolSize(),
        txTrackerSize: Object.keys(this.node.tp.transactionTracker).length,
        committedNonceTrackerSize: Object.keys(this.node.tp.committedNonceTracker).length,
        pendingNonceTrackerSize: Object.keys(this.node.tp.pendingNonceTracker).length,
      },
      managedPeersInfo: this.managedPeersInfo,
    };
    const diskUsage = this.getDiskUsage();
    if (diskUsage !== null) {
      updateToTracker.diskUsage = diskUsage;
    }
    const memoryUsage = this.getMemoryUsage();
    updateToTracker.memoryUsage = memoryUsage;
    if (DEBUG) {
      logger.debug(`\n[${P2P_PREFIX}] >> Update to [TRACKER] ${TRACKER_WS_ADDR}: ` +
                   `${JSON.stringify(updateToTracker, null, 2)}`);
    }
    this.trackerWebSocket.send(JSON.stringify(updateToTracker));
  }

  getDiskUsage() {
    try {
      return disk.checkSync(DISK_USAGE_PATH);
    }
    catch (err) {
      logger.error(`[${P2P_PREFIX}] ` + err);
      return null;
    }
  }

  getMemoryUsage() {
    const free = os.freemem();
    const total = os.totalmem();
    const usage = total - free;
    return {
      free,
      usage,
      total,
    };
  }

  connectToPeers(newManagedPeerInfoList) {
    let updated = false;
    newManagedPeerInfoList.forEach((peerInfo) => {
      if (!!this.managedPeersInfo[peerInfo.address]) {
        logger.info(`[${P2P_PREFIX}] Node ${peerInfo.address} is already a managed peer. ` +
                    `Something is wrong.`)
      } else {
        logger.info(`[${P2P_PREFIX}] Connecting to peer ${JSON.stringify(peerInfo, null, 2)}`);
        this.managedPeersInfo[peerInfo.address] = peerInfo;
        updated = true;
        const socket = new Websocket(peerInfo.url);
        socket.on('open', () => {
          logger.info(`[${P2P_PREFIX}] Connected to peer ${peerInfo.address} (${peerInfo.url}).`);
          this.setSocket(socket, peerInfo.address);
        });
      }
    });

    return updated;
  }

  disconnectFromPeers() {
    for (const socket of this.sockets) {
      socket.close();
    }
  }

  setSocket(socket, address) {
    this.sockets.push(socket);
    this.setPeerEventHandlers(socket, address);
    this.requestChainSubsection(this.node.bc.lastBlock());
    if (this.consensus.stakeTx) {
      this.broadcastTransaction(this.consensus.stakeTx);
      this.consensus.stakeTx = null;
    }
  }

  setPeerEventHandlers(socket, address) {
    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        const version = data.protoVer;
        if (!version || !semver.valid(version)) {
          return;
        }
        if (semver.gt(this.minProtocolVersion, version) ||
            (this.maxProtocolVersion && semver.lt(this.maxProtocolVersion, version))) {
          return;
        }

        switch (data.type) {
          case MessageTypes.CONSENSUS:
            if (DEBUG) {
              logger.debug(`[${P2P_PREFIX}] Receiving a consensus message: ${JSON.stringify(data.message)}`);
            }
            if (this.node.bc.syncedAfterStartup) {
              this.consensus.handleConsensusMessage(data.message);
            } else {
              logger.info(`\n[${P2P_PREFIX}] Needs syncing...\n`);
            }
            break;
          case MessageTypes.TRANSACTION:
            if (DEBUG) {
              logger.debug(`[${P2P_PREFIX}] Receiving a transaction: ${JSON.stringify(data.transaction)}`);
            }
            if (this.node.tp.transactionTracker[data.transaction.hash]) {
              logger.debug(`[${P2P_PREFIX}] Already have the transaction in my tx tracker`);
              break;
            } else if (this.node.initialized) {
              this.executeAndBroadcastTransaction(data.transaction, MessageTypes.TRANSACTION);
            } else {
              // Put the tx in the txPool?
            }
            break;
          case MessageTypes.CHAIN_SUBSECTION:
            if (DEBUG) {
              logger.debug(`[${P2P_PREFIX}] Receiving a chain subsection: ${JSON.stringify(data.chainSubsection, null, 2)}`);
            }
            if (data.number <= this.node.bc.lastBlockNumber()) {
              if (this.consensus.status === ConsensusStatus.STARTING) {
                if (!data.chainSubsection && !data.catchUpInfo || data.number === this.node.bc.lastBlockNumber()) {
                  this.node.bc.syncedAfterStartup = true;
                  this.consensus.init();
                  if (this.consensus.isRunning()) {
                    this.consensus.catchUp(data.catchUpInfo);
                  }
                }
              }
              return;
            }

            // Check if chain subsection is valid and can be
            // merged ontop of your local blockchain
            if (this.node.bc.merge(data.chainSubsection)) {
              this.node.db.setDbToSnapshot(this.node.bc.backupDb);
              data.chainSubsection.forEach((block) => {
                this.node.tp.cleanUpForNewBlock(block);
                this.node.tp.updateNonceTrackers(block.transactions);
              });
              if (data.number === this.node.bc.lastBlockNumber()) {
                // All caught up with the peer
                if (!this.node.bc.syncedAfterStartup) {
                  logger.info(`[${P2P_PREFIX}] Node is now synced!`);
                  this.node.bc.syncedAfterStartup = true;
                }
                if (this.consensus.status === ConsensusStatus.STARTING) {
                  this.consensus.init();
                }
              } else {
                // There's more blocks to receive
                logger.info(`[${P2P_PREFIX}] Wait, there's more...`);
              }
              if (this.consensus.isRunning()) {
                // FIXME: add new last block to blockPool and updateLongestNotarizedChains?
                this.consensus.blockPool.addSeenBlock(this.node.bc.lastBlock());
                this.consensus.catchUp(data.catchUpInfo);
              }
              // Continuously request the blockchain in subsections until
              // your local blockchain matches the height of the consensus blockchain.
              if (data.number > this.node.bc.lastBlockNumber()) {
                setTimeout(() => this.requestChainSubsection(this.node.bc.lastBlock()), 1000);
              }
            } else {
              logger.info(`[${P2P_PREFIX}] Failed to merge incoming chain subsection.`);
              // FIXME: Could be that I'm on a wrong chain.
              if (data.number <= this.node.bc.lastBlockNumber()) {
                logger.info(`[${P2P_PREFIX}] I am ahead(${data.number} > ${this.node.bc.lastBlockNumber()}).`);
                if (this.consensus.status === ConsensusStatus.STARTING) {
                  this.consensus.init();
                  if (this.consensus.isRunning()) {
                    this.consensus.catchUp(data.catchUpInfo);
                  }
                }
              } else {
                logger.info(`[${P2P_PREFIX}] I am behind (${data.number} < ${this.node.bc.lastBlockNumber()}).`);
                setTimeout(() => this.requestChainSubsection(this.node.bc.lastBlock()), 1000);
              }
            }
            break;
          case MessageTypes.CHAIN_SUBSECTION_REQUEST:
            if (DEBUG) {
              logger.debug(`[${P2P_PREFIX}] Receiving a chain subsection request: ${JSON.stringify(data.lastBlock)}`);
            }
            if (this.node.bc.chain.length === 0) {
              return;
            }
            // Send a chunk of 20 blocks from your blockchain to the requester.
            // Requester will continue to request blockchain chunks
            // until their blockchain height matches the consensus blockchain height
            const chainSubsection = this.node.bc.requestBlockchainSection(
                !!data.lastBlock ? Block.parse(data.lastBlock) : null);
            if (!!chainSubsection) {
              const catchUpInfo = this.consensus.getCatchUpInfo();
              if (DEBUG) {
                logger.debug(`Sending a chain subsection ${JSON.stringify(chainSubsection, null, 2)} along with catchUpInfo ${JSON.stringify(catchUpInfo, null, 2)}`);
              }
              this.sendChainSubsection(
                socket,
                chainSubsection,
                this.node.bc.lastBlockNumber(),
                catchUpInfo
              );
            } else {
              logger.info(`[${P2P_PREFIX}] No chainSubsection to send`);
              this.sendChainSubsection(
                socket,
                null,
                this.node.bc.lastBlockNumber(),
                null
              );
            }
            break;
        }
      } catch (error) {
        logger.error(`[${P2P_PREFIX}] ` + error.stack);
      }
    });

    // TODO(minsu): Deal with handling/recording a peer status when connection closes.
    socket.on('close', () => {
      logger.info(`[${P2P_PREFIX}] Disconnected from a peer: ${address || 'unknown'}`);
      // XXX(minsu): This will be revoked when next updates.
      // this.clearIntervalHeartbeat(address);
      this.removeFromListIfExists(socket);

      if (address && this.managedPeersInfo[address]) {
        delete this.managedPeersInfo[address];
        logger.info(`[${P2P_PREFIX}] => Updated managed peers info: ` +
                    `${JSON.stringify(this.managedPeersInfo, null, 2)}`);
      }
    });

    socket.on('pong', _ => {
      logger.info(`[${P2P_PREFIX}] peer(${address}) is alive.`);
    });

    socket.on('error', (error) => {
      logger.error(`[${P2P_PREFIX}] Error in communication with peer ${address}: ` +
                   `${JSON.stringify(error, null, 2)}`);
    });
  }

  removeFromListIfExists(entry) {
    const index = this.sockets.indexOf(entry);

    if (index >= 0) {
      this.sockets.splice(index, 1);
      return true;
    }

    return false;
  }

  sendChainSubsection(socket, chainSubsection, number, catchUpInfo) {
    socket.send(JSON.stringify({
      type: MessageTypes.CHAIN_SUBSECTION,
      chainSubsection,
      number,
      catchUpInfo,
      protoVer: CURRENT_PROTOCOL_VERSION
    }));
  }

  requestChainSubsection(lastBlock) {
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
        type: MessageTypes.CHAIN_SUBSECTION_REQUEST,
        lastBlock,
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
    });
  }

  broadcastChainSubsection(chainSubsection) {
    this.sockets.forEach((socket) => this.sendChainSubsection(socket, chainSubsection));
  }

  broadcastTransaction(transaction) {
    if (DEBUG) {
      logger.debug(`[${P2P_PREFIX}] SENDING: ${JSON.stringify(transaction)}`);
    }
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
        type: MessageTypes.TRANSACTION,
        transaction,
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
    });
  }

  broadcastConsensusMessage(msg) {
    if (DEBUG) {
      logger.debug(`[${P2P_PREFIX}] SENDING: ${JSON.stringify(msg)}`);
    }
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
        type: MessageTypes.CONSENSUS,
        message: msg,
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
    });
  }

  /**
   * Adds transaction to the transactionPool and executes the operations specified
   * in the transaction.
   * @param {Object} transactionWithSig An object with a signature and a transaction.
   */
  // TODO(seo): Remove new Transaction() use cases.
  executeTransaction(transactionWithSig) {
    if (!transactionWithSig) return null;
    const transaction = transactionWithSig instanceof Transaction ?
        transactionWithSig : new Transaction(transactionWithSig);
    if (DEBUG) {
      logger.debug(`[${P2P_PREFIX}] EXECUTING: ${JSON.stringify(transaction)}`);
    }
    if (this.node.tp.isTimedOutFromPool(transaction.timestamp, this.node.bc.lastBlockTimestamp())) {
      if (DEBUG) {
        logger.debug(`[${P2P_PREFIX}] TIMED-OUT TRANSACTION: ${JSON.stringify(transaction)}`);
      }
      logger.info(`[${P2P_PREFIX}] Timed-out transaction`);
      return null;
    }
    if (this.node.tp.isNotEligibleTransaction(transaction)) {
      if (DEBUG) {
        logger.debug(`[${P2P_PREFIX}] ALREADY RECEIVED: ${JSON.stringify(transaction)}`);
      }
      logger.info(`[${P2P_PREFIX}] Transaction already received`);
      return null;
    }
    if (this.node.bc.syncedAfterStartup === false) {
      if (DEBUG) {
        logger.debug(`[${P2P_PREFIX}] NOT SYNCED YET. WILL ADD TX TO THE POOL: ${JSON.stringify(transaction)}`);
      }
      this.node.tp.addTransaction(transaction);
      return null;
    }
    const result = this.node.db.executeTransaction(transaction);
    if (!ChainUtil.transactionFailed(result)) {
      this.node.tp.addTransaction(transaction);
    } else if (DEBUG) {
      logger.debug(`[${P2P_PREFIX}] FAILED TRANSACTION: ${JSON.stringify(transaction)}\t RESULT:${JSON.stringify(result)}`);
    }

    return result;
  }

  executeAndBroadcastTransaction(transactionWithSig) {
    if (!transactionWithSig) return null;
    if (Transaction.isBatchTransaction(transactionWithSig)) {
      const resultList = [];
      const txListSucceeded = [];
      transactionWithSig.tx_list.forEach((tx) => {
        const transaction = tx instanceof Transaction ? tx : new Transaction(tx);
        const response = this.executeTransaction(transaction);
        resultList.push(response);
        if (!ChainUtil.transactionFailed(response)) {
          txListSucceeded.push(tx);
        }
      })
      if (txListSucceeded.length > 0) {
        this.broadcastTransaction({ tx_list: txListSucceeded });
      }

      return resultList;
    } else {
      const transaction = transactionWithSig instanceof Transaction ? transactionWithSig
                                                                    : new Transaction(transactionWithSig);
      const response = this.executeTransaction(transaction);
      logger.debug(`\n[${P2P_PREFIX}] TX RESPONSE: ` + JSON.stringify(response))
      if (!ChainUtil.transactionFailed(response)) {
        this.broadcastTransaction(transaction);
      }

      return response;
    }
  }

  async tryInitializeShard() {
    if (GenesisSharding[ShardingProperties.SHARDING_PROTOCOL] === ShardingProtocols.NONE) {
      // Not a shard
      return;
    }
    const isShardReporter = ainUtil.areSameAddresses(
      GenesisSharding[ShardingProperties.SHARD_REPORTER],
      this.node.account.address
    );
    if (this.node.bc.lastBlockNumber() !== 0 || !isShardReporter) {
      // Shard initialization not necessary
      return;
    }
    await this.setUpDbForSharding();
  }

  async setUpDbForSharding() {
    const parentChainEndpoint = GenesisSharding[ShardingProperties.PARENT_CHAIN_POC] + '/json-rpc';
    const shardOwner = GenesisSharding[ShardingProperties.SHARD_OWNER];
    const ownerPrivateKey = ChainUtil.getJsObject(
      GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);
    const keyBuffer = Buffer.from(ownerPrivateKey, 'hex');
    const shardReporter = GenesisSharding[ShardingProperties.SHARD_REPORTER];
    const shardingPath = GenesisSharding[ShardingProperties.SHARDING_PATH];
    const reportingPeriod = GenesisSharding[ShardingProperties.REPORTING_PERIOD];

    const shardInitTx = {
      operation: {
        type: WriteDbOperations.SET,
        op_list: [
          {
            type: WriteDbOperations.SET_OWNER,
            ref: shardingPath,
            value: {
              [OwnerProperties.OWNER]: {
                [OwnerProperties.OWNERS]: {
                  [shardOwner]: buildOwnerPermissions(false, true, true, true),
                  [OwnerProperties.ANYONE]: buildOwnerPermissions(false, false, false, false),
                }
              }
            }
          },
          {
            type: WriteDbOperations.SET_RULE,
            ref: ChainUtil.formatPath([
              ...ChainUtil.parsePath(shardingPath),
              '$block_number',
              PredefinedDbPaths.SHARDING_PROOF_HASH
            ]),
            value: {
              [RuleProperties.WRITE]: `auth === '${shardReporter}'`
            }
          },
          {
            type: WriteDbOperations.SET_FUNCTION,
            ref: ChainUtil.formatPath([
              ...ChainUtil.parsePath(shardingPath),
              '$block_number',
              PredefinedDbPaths.SHARDING_PROOF_HASH
            ]),
            value: {
              [FunctionProperties.FUNCTION]: {
                [FunctionProperties.FUNCTION_TYPE]: FunctionTypes.NATIVE,
                [FunctionProperties.FUNCTION_ID]: NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT
              }
            }
          },
          {
            type: WriteDbOperations.SET_VALUE,
            ref: ChainUtil.formatPath([
              PredefinedDbPaths.SHARDING,
              PredefinedDbPaths.SHARDING_SHARD,
              ainUtil.encode(shardingPath)
            ]),
            value: GenesisSharding
          }
        ]
      },
      timestamp: Date.now(),
      nonce: -1
    };
    await sendTxAndWaitForConfirmation(parentChainEndpoint, shardInitTx, keyBuffer);
    logger.info(`[${P2P_PREFIX}] setUpDbForSharding success`);
  }

  // TODO(minsu): Since the p2p network has not been built completely, it will be updated afterwards.
  heartbeat() {
    logger.info(`[${P2P_PREFIX}] Start heartbeat`);
    this.intervalHeartbeat = setInterval(() => {
      this.server.clients.forEach(ws => {
        ws.ping();
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  clearIntervalHeartbeat(address) {
    clearInterval(this.managedPeersInfo[address].intervalHeartbeat);
    this.managedPeersInfo[address].intervalHeartbeat = null;
  }
}

module.exports = P2pServer;
