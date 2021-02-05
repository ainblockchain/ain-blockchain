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
const P2pClient = require('./client');
const Consensus = require('../consensus');
const { Block } = require('../blockchain/block');
const Transaction = require('../tx-pool/transaction');
const {
  P2P_PORT,
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
  PeerConnections,
  LIGHTWEIGHT
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const { sendTxAndWaitForFinalization } = require('./util');

const GCP_EXTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance' +
    '/network-interfaces/0/access-configs/0/external-ip';
const GCP_INTERNAL_IP_URL = 'http://metadata.google.internal/computeMetadata/v1/instance' +
    '/network-interfaces/0/ip';
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;
const DISK_USAGE_PATH = os.platform() === 'win32' ? 'c:' : '/';

// A peer-to-peer network server that broadcasts changes in the database.
// TODO(minsu): Sign messages to tracker or peer.
class P2pServer {
  constructor (node, minProtocolVersion, maxProtocolVersion) {
    this.wsServer = null;
    this.client = null;
    this.node = node;
    // TODO(minsu): Remove this from Consensus.
    this.consensus = new Consensus(this, node);
    this.minProtocolVersion = minProtocolVersion;
    this.maxProtocolVersion = maxProtocolVersion;
    this.inbound = {};
    this.initConnections();
  }

  listen() {
    this.wsServer = new Websocket.Server({
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
    this.wsServer.setMaxListeners(this.maxInbound);
    this.wsServer.on('connection', (socket) => {
      this.setPeerEventHandlers(socket);
    });
    logger.info(`Listening to peer-to-peer connections on: ${P2P_PORT}\n`);
    this.setUpIpAddresses().then(() => {
      this.client = new P2pClient(this);
      this.client.setIntervalForTrackerConnection();
    });
  }

  getAccount() {
    return this.node.account.address;
  }

  // NOTE(minsu): the total number of connection is up to more than 5 without limit.
  // maxOutbound is for now limited equal or less than 2.
  // maxInbound is a rest of connection after maxOutbound is set.
  initConnections() {
    const numConnection = process.env.MAX_CONNECTION ?
        Number(process.env.MAX_CONNECTION) : PeerConnections.INITIAL_MAX_CONNECTION;
    const numOutbound = process.env.MAX_OUTBOUND ?
        Number(process.env.MAX_OUTBOUND) : PeerConnections.INITIAL_MAX_OUTBOUND;
    const numInbound = process.env.MAX_INBOUND ?
        Number(process.env.MAX_INBOUND) : PeerConnections.INITIAL_MAX_INBOUND;
    this.maxConnection = Math.max(numConnection, PeerConnections.MAX_CONNECTION_LIMIT);
    this.maxOutbound = Math.min(numOutbound, PeerConnections.MAX_OUTBOUND_LIMIT);
    this.maxInbound = Math.min(numInbound, numConnection - numOutbound);
  }

  // TODO(minsu): make it REST API
  getConnectionInfo() {
    return {
      maxConnection: this.maxConnection,
      maxOutbound: this.maxOutbound,
      maxInbound: this.maxInbound,
      incomingPeers: Object.keys(this.inbound),
      outgoingPeers: Object.keys(this.client.outbound)
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

  getLastBlockSummary() {
    return {
      number: this.node.bc.lastBlockNumber(),
      epoch: this.node.bc.lastBlockEpoch(),
      timestamp: this.node.bc.lastBlockTimestamp(),
    };
  }

  getNodeStatus() {
    return {
      address: this.getAccount(),
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
    logger.info(`Disconnect from connected peers.`);
    this.disconnectFromPeers();
    this.client.stop();
    logger.info(`Close server.`);
    this.wsServer.close();
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
    Object.values(this.inbound).forEach(socket => {
      socket.close();
    });
  }

  setPeerEventHandlers(socket) {
    const LOG_HEADER = 'setPeerEventHandlers';
    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        const version = data.protoVer;
        if (!version || !semver.valid(version)) {
          socket.close();
          return;
        }
        if (semver.gt(this.minProtocolVersion, version) ||
            (this.maxProtocolVersion && semver.lt(this.maxProtocolVersion, version))) {
          socket.close();
          return;
        }

        switch (data.type) {
          case MessageTypes.ACCOUNT_REQUEST:
            if (!data.account) {
              logger.error(`Broken websocket(account unknown) is established.`);
              socket.close();
              return;
            } else {
              logger.info(`A new websocket(${data.account}) is established.`);
              this.inbound[data.account] = socket;
              socket.send(JSON.stringify({
                type: MessageTypes.ACCOUNT_RESPONSE,
                account: this.getAccount(),
                protoVer: CURRENT_PROTOCOL_VERSION
              }));
            }
            break;
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
          default:
            logger.error(`Wrong message type(${data.type}) has been specified.`);
            logger.error('Igonore the message.');
            break;
        }
      } catch (error) {
        logger.error(error.stack);
      }
    });

    socket.on('close', () => {
      const account = this.getAccountFromSocket(socket);
      this.removeFromInboundIfExists(account);
      logger.info(`Disconnected from a peer: ${account || 'unknown'}`);
    });

    // TODO(minsu): heartbeat stuff
    // socket.on('pong', (_) => {
    //   logger.info(`peer(${address}) is alive.`);
    // });

    socket.on('error', (error) => {
      logger.error(`Error in communication with peer ${address}: ` +
          `${JSON.stringify(error, null, 2)}`);
    });
  }

  getAccountFromSocket(socket) {
    return Object.keys(this.inbound).filter(account => this.inbound[account] === socket);
  }

  removeFromInboundIfExists(address) {
    if (address in this.inbound) {
      delete this.inbound[address];
      logger.info(` => Updated managed peers info: ${Object.keys(this.inbound)}`);
    }
  }

  sendChainSegment(socket, chainSegment, number, catchUpInfo) {
    socket.send(JSON.stringify({
      type: MessageTypes.CHAIN_SEGMENT_RESPONSE,
      chainSegment,
      number,
      catchUpInfo,
      protoVer: CURRENT_PROTOCOL_VERSION
    }));
  }

  // TODO(minsu): Seperate execute and broadcast
  // XXX(minsu): disscussed this part off-line and it will be updated the next PR since this is
  // also called at consensus and json-rpc.
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
        this.client.broadcastTransaction({ tx_list: txListSucceeded });
      }

      return resultList;
    } else {
      const result = this.node.executeTransactionAndAddToPool(tx);
      logger.debug(`\n TX RESULT: ` + JSON.stringify(result));
      if (!ChainUtil.transactionFailed(result)) {
        this.client.broadcastTransaction(tx);
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
    const ownerPrivateKey = ChainUtil.getJsObject(
        GenesisAccounts, [AccountProperties.OWNER, AccountProperties.PRIVATE_KEY]);
    const shardInitTxBody = P2pServer.buildShardingSetupTxBody();
    await sendTxAndWaitForFinalization(parentChainEndpoint, shardInitTxBody, ownerPrivateKey);
    logger.info(`setUpDbForSharding success`);
  }

  static buildShardingSetupTxBody() {
    const shardOwner = GenesisSharding[ShardingProperties.SHARD_OWNER];
    const shardReporter = GenesisSharding[ShardingProperties.SHARD_REPORTER];
    const shardingPath = GenesisSharding[ShardingProperties.SHARDING_PATH];
    const shardingPathRules = `auth.addr === '${shardOwner}'`;
    const proofHashRulesLight = `auth.addr === '${shardReporter}'`;
    const proofHashRules = `auth.addr === '${shardReporter}' && ` +
        '((newData === null && ' +
        `Number($block_number) < (getValue('${shardingPath}/${ShardingProperties.SHARD}/` +
            `${ShardingProperties.PROOF_HASH_MAP}/latest') || 0)) || ` +
        '(newData !== null && ($block_number === "0" || ' +
        `$block_number === String((getValue('${shardingPath}/${ShardingProperties.SHARD}/` +
            `${ShardingProperties.PROOF_HASH_MAP}/latest') || 0) + 1))))`;
    const latestBlockNumberRules = `auth.fid === '${NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT}'`;
    return {
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
            type: WriteDbOperations.SET_RULE,
            ref: ChainUtil.appendPath(
                shardingPath,
                ShardingProperties.SHARD,
                ShardingProperties.PROOF_HASH_MAP,
                ShardingProperties.LATEST),
            value: {
              [RuleProperties.WRITE]: latestBlockNumberRules
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
                [NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT]: {
                  [FunctionProperties.FUNCTION_TYPE]: FunctionTypes.NATIVE,
                  [FunctionProperties.FUNCTION_ID]: NativeFunctionIds.UPDATE_LATEST_SHARD_REPORT
                }
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
  }
}

module.exports = P2pServer;
