/* eslint no-mixed-operators: "off" */
const url = require('url');
const Websocket = require('ws');
const ip = require('ip');
const publicIp = require('public-ip');
const axios = require('axios');
const semver = require('semver');
const disk = require('diskusage');
const os = require('os');
const v8 = require('v8');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('P2P_SERVER');
const Consensus = require('../consensus');
const {ConsensusStatus} = require('../consensus/constants');
const {Block} = require('../blockchain/block');
const Transaction = require('../tx-pool/transaction');
const {
  PORT,
  P2P_PORT,
  TRACKER_WS_ADDR,
  HOSTING_ENV,
  COMCOM_HOST_EXTERNAL_IP,
  COMCOM_HOST_INTERNAL_IP_MAP,
  MessageTypes,
  BlockchainNodeStatus,
  PredefinedDbPaths,
  WriteDbOperations,
  GenesisSharding,
  GenesisAccounts,
  AccountProperties,
  OwnerProperties,
  RuleProperties,
  ShardingProperties,
  FunctionProperties,
  FunctionTypes,
  NativeFunctionIds,
  buildOwnerPermissions,
  LIGHTWEIGHT
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const {sendTxAndWaitForFinalization} = require('./util');

const GCP_EXTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance' +
    '/network-interfaces/0/access-configs/0/external-ip';
const GCP_INTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance' +
    '/network-interfaces/0/ip';
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;
const RECONNECT_INTERVAL_MS = 10000;
const UPDATE_TO_TRACKER_INTERVAL_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 1000;
const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';

// A peer-to-peer network server that broadcasts changes in the database.
// TODO(seo): Sign messages to tracker or peer.
class P2pServer {
  constructor (node, minProtocolVersion, maxProtocolVersion, maxConnection, maxOutbound, maxInbound)
  {
    this.server = null;
    this.node = node;
    this.sockets = [];
    // TODO(minsu): Remove this from Consensus.
    this.consensus = new Consensus(this, node);
    // XXX(minsu): The comment out will be revoked when next heartbeat updates.
    // this.isAlive = true;
    this.minProtocolVersion = minProtocolVersion;
    this.maxProtocolVersion = maxProtocolVersion;
    this.managedPeersInfo = { inbound: [], outbound: [] };
    this.maxConnection = maxConnection;
    this.maxOutbound = maxOutbound;
    this.maxInbound = maxInbound;
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
    // Set the number of maximum clients.
    this.server.setMaxListeners(this.maxInbound);
    this.server.on('connection', (socket) => {
      this.setSocket(socket, null);
    });
    logger.info(`Listening to peer-to-peer connections on: ${P2P_PORT}\n`);
    this.setUpIpAddresses().then(() => {
      const p2pClient = new P2pClient(this);
      p2pClient.setIntervalForTrackerConnection();
    });
  }

  getAccount() {
    return this.node.account.address;
  }

  getConnectionInfo() {
    return {
      maxConnection: this.maxConnection,
      maxOutbound: this.maxOutbound,
      maxInbound: this.maxInbound
    };
  }

  getStateVersions() {
    return {
      num_versions: this.node.stateManager.numVersions(),
      version_list: this.node.stateManager.getVersionList(),
      final_version: this.node.stateManager.getFinalVersion(),
    };
  }

  getExternalIp() {
    return this.node.ipAddrExternal;
  }

  getConsensusStatus() {
    return Object.assign(
      {},
      this.consensus.getState(),
      {
        longestNotarizedChainTipsSize: this.consensus.blockPool ?
          this.consensus.blockPool.longestNotarizedChainTips.length : 0
      }
    );
  }

  getLastBlock() {
    return {
      number: this.node.bc.lastBlockNumber(),
      epoch: this.node.bc.lastBlockEpoch(),
      timestamp: this.node.bc.lastBlockTimestamp(),
    };
  }

  getNodeStatus() {
    return {
      address: this.node.account.address,
      status: this.node.status,
      nonce: this.node.nonce,
      last_block_number: this.node.bc.lastBlockNumber(),
      db: {
        tree_size: this.node.db.getTreeSize('/'),
        proof: this.node.db.getProof('/'),
      },
      state_versions: this.getStateVersions(),
    };
  }

  getDiskUsage() {
    try {
      return disk.checkSync(DISK_USAGE_PATH);
    } catch (err) {
      logger.error(err);
      return {};
    }
  }

  getMemoryUsage() {
    const free = os.freemem();
    const total = os.totalmem();
    const usage = total - free;
    return {
      os: {
        free,
        usage,
        total,
      },
      heap: process.memoryUsage(),
      heapStats: v8.getHeapStatistics(),
    };
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
        // version: os.version(),
        uptime: os.uptime(),
      },
      env: {
        NUM_VALIDATORS: process.env.NUM_VALIDATORS,
        ACCOUNT_INDEX: process.env.ACCOUNT_INDEX,
        HOSTING_ENV: process.env.HOSTING_ENV,
        DEBUG: process.env.DEBUG,
      },
    };
  }

  getTxStatus() {
    return {
      txPoolSize: this.node.tp.getPoolSize(),
      txTrackerSize: Object.keys(this.node.tp.transactionTracker).length,
      committedNonceTrackerSize: Object.keys(this.node.tp.committedNonceTracker).length,
      pendingNonceTrackerSize: Object.keys(this.node.tp.pendingNonceTracker).length,
    };
  }

  getShardingStatus() {
    return this.node.getSharding();
  }

  stop() {
    logger.info(`Stop consensus interval.`);
    this.consensus.stop();
    // logger.info(`Disconnect from connected peers.`);
    // this.disconnectFromPeers();
    // logger.info(`Disconnect from tracker server.`);
    // this.disconnectFromTracker();
    logger.info(`Close server.`);
    this.server.close((_) => { });
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
          logger.error(`Failed to get ip address: ${JSON.stringify(err, null, 2)}`);
          process.exit(0);
        });
      } else if (HOSTING_ENV === 'comcom') {
        let ipAddr = null;
        if (internal) {
          const hostname = _.toLower(os.hostname());
          logger.info(`Hostname: ${hostname}`);
          ipAddr = COMCOM_HOST_INTERNAL_IP_MAP[hostname];
        } else {
          ipAddr = COMCOM_HOST_EXTERNAL_IP;
        }
        if (ipAddr) {
          return ipAddr;
        }
        logger.error(`Failed to get ${internal ? 'internal' : 'external'} ip address.`);
        process.exit(0);
      } else if (HOSTING_ENV === 'local') {
        return ip.address();
      } else {
        return publicIp.v4();
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

  disconnectFromPeers() {
    for (const socket of this.sockets) {
      socket.close();
    }
  }

  setSocket(socket, address) {
    this.sockets.push(socket);
    this.setPeerEventHandlers(socket, address);
    this.requestChainSegment(this.node.bc.lastBlock());
    if (this.consensus.stakeTx) {
      this.broadcastTransaction(this.consensus.stakeTx);
      this.consensus.stakeTx = null;
    }
  }

  setPeerEventHandlers(socket, address) {
    socket.on('message', (message) => {
      const LOG_HEADER = 'peerEventHandler';

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
            logger.debug(
                `[${LOG_HEADER}] Receiving a consensus message: ${JSON.stringify(data.message)}`);
            if (this.node.status === BlockchainNodeStatus.SERVING) {
              this.consensus.handleConsensusMessage(data.message);
            } else {
              logger.info(`\n [${LOG_HEADER}] Needs syncing...\n`);
            }
            break;
          case MessageTypes.TRANSACTION:
            logger.debug(
                `[${LOG_HEADER}] Receiving a transaction: ${JSON.stringify(data.transaction)}`);
            if (this.node.tp.transactionTracker[data.transaction.hash]) {
              logger.debug(`[${LOG_HEADER}] Already have the transaction in my tx tracker`);
              break;
            } else if (this.node.status === BlockchainNodeStatus.SERVING) {
              const tx = data.transaction;
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
                  this.executeAndBroadcastTransaction(
                      { tx_list: newTxList }, MessageTypes.TRANSACTION);
                }
              } else {
                const createdTx = Transaction.create(tx.tx_body, tx.signature);
                if (!createdTx) {
                  logger.info(`[${LOG_HEADER}] Failed to create a transaction for tx: ` +
                      `${JSON.stringify(tx, null, 2)}`);
                } else {
                  this.executeAndBroadcastTransaction(createdTx, MessageTypes.TRANSACTION);
                }
              }
            }
            break;
          case MessageTypes.CHAIN_SEGMENT:
            logger.debug(`[${LOG_HEADER}] Receiving a chain segment: ` +
                `${JSON.stringify(data.chainSegment, null, 2)}`);
            if (data.number <= this.node.bc.lastBlockNumber()) {
              if (this.consensus.status === ConsensusStatus.STARTING) {
                // XXX(minsu): need to be investigated
                // ref: https://eslint.org/docs/rules/no-mixed-operators
                if (!data.chainSegment && !data.catchUpInfo ||
                    data.number === this.node.bc.lastBlockNumber()) {
                  // Regard this situation as if you're synced.
                  // TODO(lia): ask the tracker server for another peer.
                  logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
                  this.node.status = BlockchainNodeStatus.SERVING;
                  this.consensus.init();
                  if (this.consensus.isRunning()) {
                    this.consensus.catchUp(data.catchUpInfo);
                  }
                }
              }
              return;
            }

            // Check if chain segment is valid and can be
            // merged ontop of your local blockchain
            if (this.node.mergeChainSegment(data.chainSegment)) {
              if (data.number === this.node.bc.lastBlockNumber()) {
                // All caught up with the peer
                if (this.node.status !== BlockchainNodeStatus.SERVING) {
                  // Regard this situation as if you're synced.
                  // TODO(lia): ask the tracker server for another peer.
                  logger.info(`[${LOG_HEADER}] Blockchain Node is now synced!`);
                  this.node.status = BlockchainNodeStatus.SERVING;
                }
                if (this.consensus.status === ConsensusStatus.STARTING) {
                  this.consensus.init();
                }
              } else {
                // There's more blocks to receive
                logger.info(`[${LOG_HEADER}] Wait, there's more...`);
              }
              if (this.consensus.isRunning()) {
                // FIXME: add new last block to blockPool and updateLongestNotarizedChains?
                this.consensus.blockPool.addSeenBlock(this.node.bc.lastBlock());
                this.consensus.catchUp(data.catchUpInfo);
              }
              // Continuously request the blockchain segments until
              // your local blockchain matches the height of the consensus blockchain.
              if (data.number > this.node.bc.lastBlockNumber()) {
                setTimeout(() => this.requestChainSegment(this.node.bc.lastBlock()), 1000);
              }
            } else {
              logger.info(`[${LOG_HEADER}] Failed to merge incoming chain segment.`);
              // FIXME: Could be that I'm on a wrong chain.
              if (data.number <= this.node.bc.lastBlockNumber()) {
                logger.info(`[${LOG_HEADER}] I am ahead ` +
                    `(${data.number} > ${this.node.bc.lastBlockNumber()}).`);
                if (this.consensus.status === ConsensusStatus.STARTING) {
                  this.consensus.init();
                  if (this.consensus.isRunning()) {
                    this.consensus.catchUp(data.catchUpInfo);
                  }
                }
              } else {
                logger.info(`[${LOG_HEADER}] I am behind ` +
                    `(${data.number} < ${this.node.bc.lastBlockNumber()}).`);
                setTimeout(() => this.requestChainSegment(this.node.bc.lastBlock()), 1000);
              }
            }
            break;
          case MessageTypes.CHAIN_SEGMENT_REQUEST:
            logger.debug(`[${LOG_HEADER}] Receiving a chain segment request: ` +
                `${JSON.stringify(data.lastBlock, null, 2)}`);
            if (this.node.bc.chain.length === 0) {
              return;
            }
            // Send a chunk of 20 blocks from your blockchain to the requester.
            // Requester will continue to request blockchain chunks
            // until their blockchain height matches the consensus blockchain height
            const chainSegment = this.node.bc.requestBlockchainSection(
                data.lastBlock ? Block.parse(data.lastBlock) : null);
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
        }
      } catch (error) {
        logger.error(error.stack);
      }
    });

    // TODO(minsu): Deal with handling/recording a peer status when connection closes.
    socket.on('close', () => {
      // logger.info(`Disconnected from a peer: ${address || 'unknown'}`);
      // // XXX(minsu): This will be revoked when next updates.
      // // this.clearIntervalHeartbeat(address);
      // this.removeFromListIfExists(socket);

      // if (address && this.managedPeersInfo[address]) {
      //   delete this.managedPeersInfo[address];
      //   logger.info(` => Updated managed peers info: ` +
      //               `${JSON.stringify(this.managedPeersInfo, null, 2)}`);
      // }
    });

    socket.on('pong', (_) => {
      logger.info(`peer(${address}) is alive.`);
    });

    socket.on('error', (error) => {
      logger.error(`Error in communication with peer ${address}: ` +
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

  sendChainSegment(socket, chainSegment, number, catchUpInfo) {
    socket.send(JSON.stringify({
      type: MessageTypes.CHAIN_SEGMENT,
      chainSegment,
      number,
      catchUpInfo,
      protoVer: CURRENT_PROTOCOL_VERSION
    }));
  }

  requestChainSegment(lastBlock) {
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
        type: MessageTypes.CHAIN_SEGMENT_REQUEST,
        lastBlock,
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
    });
  }

  broadcastChainSegment(chainSegment) {
    this.sockets.forEach((socket) => this.sendChainSegment(socket, chainSegment));
  }

  broadcastTransaction(transaction) {
    logger.debug(`SENDING: ${JSON.stringify(transaction)}`);
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
        type: MessageTypes.TRANSACTION,
        transaction,
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
    });
  }

  broadcastConsensusMessage(msg) {
    logger.debug(`SENDING: ${JSON.stringify(msg)}`);
    this.sockets.forEach((socket) => {
      socket.send(JSON.stringify({
        type: MessageTypes.CONSENSUS,
        message: msg,
        protoVer: CURRENT_PROTOCOL_VERSION
      }));
    });
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
        if (!ChainUtil.transactionFailed(result)) {
          txListSucceeded.push(subTx);
        }
      }
      logger.debug(`\n BATCH TX RESULT: ` + JSON.stringify(resultList));
      if (txListSucceeded.length > 0) {
        this.broadcastTransaction({ tx_list: txListSucceeded });
      }

      return resultList;
    } else {
      const result = this.node.executeTransactionAndAddToPool(tx);
      logger.debug(`\n TX RESULT: ` + JSON.stringify(result));
      if (!ChainUtil.transactionFailed(result)) {
        this.broadcastTransaction(tx);
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
    }
  }

  // TODO(seo): Set .shard config for functions, rules, and owners as well.
  async setUpDbForSharding() {
    const parentChainEndpoint = GenesisSharding[ShardingProperties.PARENT_CHAIN_POC] + '/json-rpc';
    const shardOwner = GenesisSharding[ShardingProperties.SHARD_OWNER];
    const ownerPrivateKey = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);
    const shardReporter = GenesisSharding[ShardingProperties.SHARD_REPORTER];
    const shardingPath = GenesisSharding[ShardingProperties.SHARDING_PATH];
    const shardingPathRules = `auth === '${shardOwner}'`;
    const proofHashRulesLight = `auth === '${shardReporter}'`;
    const proofHashRules = `auth === '${shardReporter}' && ` +
        '((newData === null && ' +
        `Number($block_number) < (getValue('${shardingPath}/${ShardingProperties.SHARD}/` +
            `${ShardingProperties.PROOF_HASH_MAP}/latest') || 0)) || ` +
        '(newData !== null && ($block_number === "0" || ' +
        `$block_number === String((getValue('${shardingPath}/${ShardingProperties.SHARD}/` +
            `${ShardingProperties.PROOF_HASH_MAP}/latest') || 0) + 1))))`;

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
            ref: shardingPath,
            value: {
              [RuleProperties.WRITE]: shardingPathRules
            }
          },
          {
            type: WriteDbOperations.SET_RULE,
            ref: ChainUtil.appendPath(
                shardingPath,
                ShardingProperties.SHARD,
                ShardingProperties.PROOF_HASH_MAP,
                '$block_number',
                ShardingProperties.PROOF_HASH),
            value: {
              [RuleProperties.WRITE]: LIGHTWEIGHT ? proofHashRulesLight : proofHashRules
            }
          },
          {
            type: WriteDbOperations.SET_FUNCTION,
            ref: ChainUtil.appendPath(
                shardingPath,
                ShardingProperties.SHARD,
                ShardingProperties.PROOF_HASH_MAP,
                '$block_number',
                ShardingProperties.PROOF_HASH),
            value: {
              [FunctionProperties.FUNCTION]: {
                [FunctionProperties.FUNCTION_TYPE]: FunctionTypes.NATIVE,
                [FunctionProperties.FUNCTION_ID]: NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT
              }
            }
          },
          {
            type: WriteDbOperations.SET_VALUE,
            ref: shardingPath,
            value: {
              [ShardingProperties.SHARD]: {
                [ShardingProperties.SHARDING_ENABLED]: true,
                [ShardingProperties.PROOF_HASH_MAP]: {
                  [ShardingProperties.LATEST]: -1,
                }
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

    await sendTxAndWaitForFinalization(parentChainEndpoint, shardInitTx, ownerPrivateKey);
    logger.info(`setUpDbForSharding success`);
  }
}

class P2pClient {
  constructor(p2pServer) {
    this.server = p2pServer;
    this.trackerWebSocket = null;
    // XXX(minsu): it won't run before updating p2p network.
    // this.heartbeat();
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

  connectToPeers(newPeerInfoList) {
    let updated = false;
    newPeerInfoList.forEach((peerInfo) => {
      if (this.server.managedPeersInfo.outbound.includes(peerInfo.address)) {
        logger.info(`Node ${peerInfo.address} is already a managed peer. Something went wrong.`);
      } else {
        logger.info(`Connecting to peer ${JSON.stringify(peerInfo, null, 2)}`);
        // XXX(minsu): seems not necessary
        // this.managedPeersInfo.outbound[peerInfo.address] = peerInfo;
        updated = true;
        const socket = new Websocket(peerInfo.url);
        socket.on('open', () => {
          logger.info(`Connected to peer ${peerInfo.address} (${peerInfo.url}).`);
          // XXX(minsu): start to here tmr
          this.setSocket(socket, peerInfo.address);
        });
      }
    });
    return updated;
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
            this.server.consensus.init(lastBlockWithoutProposal, true);
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

  getConnectionInfo() {
    return {
      maxConnection: this.server.maxConnection,
      maxOutbound: this.server.maxOutbound,
      maxInbound: this.server.maxInbound
    };
  }

  // TODO(seo): Add sharding status.
  updateNodeStatusToTracker() {
    const updateToTracker = {
      address:  this.server.getAccount(),
      updatedAt: Date.now(),
      url: url.format({
        protocol: 'ws',
        hostname: this.server.getExternalIp(),
        port: P2P_PORT
      }),
      ip: this.server.getExternalIp(),
      port: P2P_PORT,
      lastBlock: this.server.getLastBlock(),
      consensusStatus: this.server.getConsensusStatus(),
      nodeStatus: this.server.getNodeStatus(),
      shardingStatus: this.server.getShardingStatus(),
      txStatus: this.server.getTxStatus(),
      memoryStatus: this.server.getMemoryUsage(),
      diskStatus: this.server.getDiskUsage(),
      runtimeInfo: this.server.getRuntimeInfo(),
      managedPeersInfo: this.server.managedPeersInfo,
      connectionInfo: this.getConnectionInfo()
    };
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

  clearIntervalForTrackerUpdate() {
    clearInterval(this.intervalUpdate);
    this.intervalUpdate = null;
  }

  disconnectFromTracker() {
    this.trackerWebSocket.close();
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

module.exports = P2pServer;
