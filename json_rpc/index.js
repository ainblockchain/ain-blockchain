'use strict';

const semver = require('semver');
const sizeof = require('object-sizeof');
const _ = require('lodash');
const {
  BlockchainConfigs,
  NodeConfigs,
  BlockchainNodeStates,
  BlockchainParamsCategories,
  ReadDbOperations,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const Transaction = require('../tx-pool/transaction');
const CommonUtil = require('../common/common-util');
const PathUtil = require('../common/path-util');

/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {Node} node Instance of the Node class.
 * @param {P2pServer} p2pServer Instance of the the P2pServer class.
 * @param {EventHandler} eventHandler Instance of the EventHandler class.
 * @param {string} minProtocolVersion Minimum compatible protocol version.
 * @param {string} maxProtocolVersion Maximum compatible protocol version.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(node, p2pServer, eventHandler, minProtocolVersion, maxProtocolVersion) {
  // Non-transaction methods
  const nonTxMethods = {
    ain_getProtocolVersion: function(args, done) {
      const beginTime = Date.now();
      const result = BlockchainConfigs.CURRENT_PROTOCOL_VERSION;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_checkProtocolVersion: function(args, done) {
      const beginTime = Date.now();
      const version = args.protoVer;
      const coercedVer = semver.coerce(version);
      if (version === undefined) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, addProtocolVersion({ code: 1, message: 'Protocol version not specified.' }));
      } else if (!semver.valid(coercedVer)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, addProtocolVersion({ code: 1, message: 'Invalid protocol version.' }));
      } else if (semver.lt(coercedVer, minProtocolVersion) ||
                (maxProtocolVersion && semver.gt(coercedVer, maxProtocolVersion))) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, addProtocolVersion({ code: 1, message: 'Incompatible protocol version.' }));
      } else {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, addProtocolVersion({ code: 0, result: 'Success' }));
      }
    },

    // Bloock API
    ain_getBlockList: function(args, done) {
      const beginTime = Date.now();
      const blocks = node.bc.getBlockList(args.from, args.to);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result: blocks }));
    },

    ain_getLastBlock: function(args, done) {
      const beginTime = Date.now();
      const result = node.bc.lastBlock();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getLastBlockNumber: function(args, done) {
      const beginTime = Date.now();
      const result = node.bc.lastBlockNumber();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getBlockHeadersList: function(args, done) {
      const beginTime = Date.now();
      const blocks = node.bc.getBlockList(args.from, args.to);
      const blockHeaders = [];
      blocks.forEach((block) => {
        blockHeaders.push(block.header);
      });
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result: blockHeaders }));
    },

    ain_getBlockByHash: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      if (block && !args.getFullTransactions) {
        block.transactions = extractTransactionHashes(block);
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result: block }));
    },

    ain_getBlockByNumber: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      if (!block || args.getFullTransactions) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, addProtocolVersion({ result: block }));
      } else {
        block.transactions = extractTransactionHashes(block);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, addProtocolVersion({ result: block }));
      }
    },

    ain_getProposerByHash: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.proposer : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getProposerByNumber: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.proposer : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getValidatorsByNumber: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.validators : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getValidatorsByHash: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.validators : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getBlockTransactionCountByHash: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.transactions.length : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getBlockTransactionCountByNumber: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.transactions.length : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    // Transaction API
    ain_getPendingTransactions: function(args, done) {
      const beginTime = Date.now();
      const result = node.tp.transactions;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getTransactionPoolSizeUtilization: function(args, done) {
      const beginTime = Date.now();
      const address = args.address;
      const txPoolSizeUtil = node.getTxPoolSizeUtilization(address);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result: txPoolSizeUtil }));
    },

    ain_getTransactionByHash: function(args, done) {
      const beginTime = Date.now();
      const transactionInfo = node.getTransactionByHash(args.hash);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result: transactionInfo }));
    },

    ain_getTransactionByBlockHashAndIndex: function(args, done) {
      const beginTime = Date.now();
      let result = null;
      if (args.block_hash && Number.isInteger(args.index)) {
        const index = Number(args.index);
        const block = node.bc.getBlockByHash(args.block_hash);
        if (block && block.transactions.length > index && index >= 0) {
          result = {
            transaction: block.transactions[index],
            is_executed: true,
            is_finalized: true
          };
        }
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getTransactionByBlockNumberAndIndex: function(args, done) {
      const beginTime = Date.now();
      let result = null;
      if (Number.isInteger(args.block_number) && Number.isInteger(args.index)) {
        const index = Number(args.index);
        const block = node.bc.getBlockByNumber(args.block_number);
        if (block && block.transactions.length > index && index >= 0) {
          result = {
            transaction: block.transactions[index],
            is_executed: true,
            is_finalized: true
          };
        }
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    // Database API
    ain_get: function(args, done) {
      const beginTime = Date.now();
      let result;
      let latency;
      switch (args.type) {
        case ReadDbOperations.GET_VALUE:
          result = p2pServer.node.db.getValue(args.ref, CommonUtil.toGetOptions(args));
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, addProtocolVersion({ result }));
          return;
        case ReadDbOperations.GET_RULE:
          result = p2pServer.node.db.getRule(args.ref, CommonUtil.toGetOptions(args));
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, addProtocolVersion({ result }));
          return;
        case ReadDbOperations.GET_FUNCTION:
          result = p2pServer.node.db.getFunction(args.ref, CommonUtil.toGetOptions(args));
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, addProtocolVersion({ result }));
          return;
        case ReadDbOperations.GET_OWNER:
          result = p2pServer.node.db.getOwner(args.ref, CommonUtil.toGetOptions(args));
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, addProtocolVersion({ result }));
          return;
        case ReadDbOperations.GET:
          result = p2pServer.node.db.get(args.op_list);
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, addProtocolVersion({ result }));
          return;
        default:
          latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
          done(null, addProtocolVersion({ code: 1, message: 'Invalid get request type' }));
      }
    },

    ain_matchFunction: function(args, done) {
      const beginTime = Date.now();
      const result =
          p2pServer.node.db.matchFunction(args.ref, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_matchRule: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.db.matchRule(args.ref, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_matchOwner: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.db.matchOwner(args.ref, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_evalRule: function(args, done) {
      const beginTime = Date.now();
      const auth = {};
      if (args.address) {
        auth.addr = args.address;
      }
      if (args.fid) {
        auth.fid = args.fid;
      }
      const timestamp = args.timestamp || Date.now();
      const result = p2pServer.node.db.evalRule(
          args.ref, args.value, auth, timestamp, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_evalOwner: function(args, done) {
      const beginTime = Date.now();
      const auth = {};
      if (args.address) {
        auth.addr = args.address;
      }
      if (args.fid) {
        auth.fid = args.fid;
      }
      const result = p2pServer.node.db.evalOwner(
          args.ref, args.permission, auth, CommonUtil.toMatchOrEvalOptions(args));
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getStateProof: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.db.getStateProof(args.ref);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getProofHash: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.db.getProofHash(args.ref);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getStateInfo: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.db.getStateInfo(args.ref);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getStateUsage: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.getStateUsage(args.app_name);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    // Account API
    ain_getBootstrapPubKey: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.bootstrapAccount ?
          p2pServer.node.bootstrapAccount.public_key : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_injectAccountFromKeystore: async function(args, done) {
      const beginTime = Date.now();
      let result = false;
      if (await p2pServer.node.injectAccountFromKeystore(args.encryptedPassword)) {
        result = true;
        p2pServer.client.run();
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
      return addProtocolVersion({ result });
    },

    ain_injectAccountFromHDWallet: async function(args, done) {
      const beginTime = Date.now();
      let result = false;
      if (await p2pServer.node.injectAccountFromHDWallet(args.encryptedMnemonic, args.index)) {
        result = true;
        p2pServer.client.run();
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
      return addProtocolVersion({ result });
    },

    ain_getAddress: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.account ? p2pServer.node.account.address : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getBalance: function(args, done) {
      const beginTime = Date.now();
      const address = args.address;
      const balance = p2pServer.node.db.getValue(PathUtil.getAccountBalancePath(address)) || 0;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result: balance }));
    },

    ain_getNonce: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.getNonceForAddr(args.address, args.from === 'pending');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_getTimestamp: function(args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.getTimestampForAddr(args.address, args.from === 'pending');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    ain_isValidator: function(args, done) {
      const beginTime = Date.now();
      const addr = args.address;
      const whitelisted = p2pServer.node.db.getValue(PathUtil.getConsensusWhitelistAddrPath(addr));
      const stake = p2pServer.node.db.getValue(PathUtil.getServiceAccountBalancePath(addr));
      const result = stake && whitelisted ? stake : 0;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    // Network API
    net_listening: function (args, done) {
      const beginTime = Date.now();
      const peerCount = Object.keys(p2pServer.inbound).length;
      const result = !!peerCount;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    net_peerCount: function (args, done) {
      const beginTime = Date.now();
      const peerCount = Object.keys(p2pServer.inbound).length;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result: peerCount }));
    },

    net_syncing: function (args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.state === BlockchainNodeStates.SYNCING;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      // TODO(liayoo): Return { starting, latest } with block numbers
      // if the node is currently syncing.
      done(null, addProtocolVersion({ result }));
    },

    net_getNetworkId: function (args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.getBlockchainParam(BlockchainParamsCategories.NETWORK, 'network_id');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    net_getChainId: function (args, done) {
      const beginTime = Date.now();
      const result = p2pServer.node.getBlockchainParam(BlockchainParamsCategories.BLOCKCHAIN, 'chain_id');
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    net_consensusStatus: function (args, done) {
      const beginTime = Date.now();
      const result = p2pServer.consensus.getStatus();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    net_rawConsensusStatus: function (args, done) {
      const beginTime = Date.now();
      const result = p2pServer.consensus.getRawStatus();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },

    p2p_getPeerCandidateInfo: function (args, done) {
      const beginTime = Date.now();
      const result = p2pServer.client.getPeerCandidateInfo();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, addProtocolVersion({ result }));
    },
  };

  // Transaction methods
  const txMethods = {
    ain_sendSignedTransaction: function(args, done) {
      const beginTime = Date.now();
      const txBytesLimit = p2pServer.node.getBlockchainParam(
          BlockchainParamsCategories.RESOURCE, 'tx_bytes_limit');
      if (sizeof(args) > txBytesLimit) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, addProtocolVersion({
          result: {
            code: 1,
            message: `Transaction size exceeds its limit: ${txBytesLimit} bytes.`
          }
        }));
      } else if (!args.tx_body || !args.signature) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, addProtocolVersion({
          result: {
            code: 2,
            message: `Missing properties.`
          }
        }));
      } else {
        const createdTx = Transaction.create(args.tx_body, args.signature);
        if (!createdTx) {
          const latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
          done(null, addProtocolVersion({
            result: {
              code: 3,
              message: `Invalid transaction format.`
            }
          }));
        } else {
          const result = p2pServer.executeAndBroadcastTransaction(createdTx);
          const latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
          done(null, addProtocolVersion({ result }));
        }
      }
    },

    ain_sendSignedTransactionBatch: function(args, done) {
      const beginTime = Date.now();
      const batchTxListSizeLimit = p2pServer.node.getBlockchainParam(
          BlockchainParamsCategories.RESOURCE, 'batch_tx_list_size_limit');
      if (!args.tx_list || !CommonUtil.isArray(args.tx_list)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, addProtocolVersion({
          result: {
            code: 1,
            message: `Invalid batch transaction format.`
          }
        }));
      } else if (args.tx_list.length > batchTxListSizeLimit) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, addProtocolVersion({
          result: {
            code: 2,
            message: `Batch transaction list size exceeds its limit: ${batchTxListSizeLimit}.`
          }
        }));
      } else {
        const txBytesLimit = p2pServer.node.getBlockchainParam(
            BlockchainParamsCategories.RESOURCE, 'tx_bytes_limit');
        const txList = [];
        for (let i = 0; i < args.tx_list.length; i++) {
          const tx = args.tx_list[i];
          if (sizeof(tx) > txBytesLimit) {
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
            done(null, addProtocolVersion({
              result: {
                code: 3,
                message: `Transaction[${i}]'s size exceededs its limit: ${txBytesLimit} bytes.`
              }
            }));
            return;
          } else if (!tx.tx_body || !tx.signature) {
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
            done(null, addProtocolVersion({
              result: {
                code: 4,
                message: `Missing properties of transaction[${i}].`
              }
            }));
            return;
          }
          const createdTx = Transaction.create(tx.tx_body, tx.signature);
          if (!createdTx) {
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
            done(null, addProtocolVersion({
              result: {
                code: 5,
                message: `Invalid format of transaction[${i}].`
              }
            }));
            return;
          }
          txList.push(createdTx);
        }
        const result = p2pServer.executeAndBroadcastTransaction({tx_list: txList});
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, addProtocolVersion({ result }));
      }
    }
  };

  let methods = nonTxMethods;
  if (NodeConfigs.ENABLE_JSON_RPC_TX_API) {
    methods = Object.assign(methods, txMethods);
  }
  if (eventHandler !== null) {
    const eventHandlerMethods = {
      net_getEventHandlerNetworkInfo: async function(args) {
        const beginTime = Date.now();
        const result = await eventHandler.eventChannelManager.getNetworkInfo();
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        return addProtocolVersion({ result });
      },
    };
    methods = Object.assign(methods, eventHandlerMethods);
  }

  return methods;
};

function extractTransactionHashes(block) {
  if (!block) return [];
  const hashes = [];
  block.transactions.forEach((tx) => {
    hashes.push(tx.hash);
  });
  return hashes;
}

function addProtocolVersion(result) {
  result.protoVer = BlockchainConfigs.CURRENT_PROTOCOL_VERSION;
  return result;
}
