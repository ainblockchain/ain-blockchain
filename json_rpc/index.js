'use strict';

const semver = require('semver');
const sizeof = require('object-sizeof');
const _ = require('lodash');
const {
  CURRENT_PROTOCOL_VERSION,
  TX_BYTES_LIMIT,
  BATCH_TX_LIST_SIZE_LIMIT,
  NETWORK_ID,
  CHAIN_ID,
  BlockchainNodeStates,
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
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(node, p2pServer, minProtocolVersion, maxProtocolVersion) {
  return {
    ain_getProtocolVersion: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      done(null, addProtocolVersion({result: CURRENT_PROTOCOL_VERSION}));
    },

    ain_checkProtocolVersion: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const version = args.protoVer;
      const coercedVer = semver.coerce(version);
      if (version === undefined) {
        done(null, addProtocolVersion({code: 1, message: 'Protocol version not specified.'}));
      } else if (!semver.valid(coercedVer)) {
        done(null, addProtocolVersion({code: 1, message: 'Invalid protocol version.'}));
      } else if (semver.lt(coercedVer, minProtocolVersion) ||
                (maxProtocolVersion && semver.gt(coercedVer, maxProtocolVersion))) {
        done(null, addProtocolVersion({code: 1, message: 'Incompatible protocol version.'}));
      } else {
        done(null, addProtocolVersion({code: 0, result: 'Success'}));
      }
    },

    // Bloock API
    ain_getBlockList: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const blocks = node.bc.getBlockList(args.from, args.to);
      done(null, addProtocolVersion({result: blocks}));
    },

    ain_getRecentBlock: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      done(null, addProtocolVersion({result: node.bc.lastBlock()}));
    },

    ain_getRecentBlockNumber: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const block = node.bc.lastBlock();
      done(null, addProtocolVersion({result: block ? block.number : null}));
    },

    ain_getBlockHeadersList: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const blocks = node.bc.getBlockList(args.from, args.to);
      const blockHeaders = [];
      blocks.forEach((block) => {
        blockHeaders.push(block.header);
      });
      done(null, addProtocolVersion({result: blockHeaders}));
    },

    ain_getBlockByHash: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const block = node.bc.getBlockByHash(args.hash);
      if (block && !args.getFullTransactions) {
        block.transactions = extractTransactionHashes(block);
      }
      done(null, addProtocolVersion({result: block}));
    },

    ain_getBlockByNumber: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const block = node.bc.getBlockByNumber(args.number);
      if (!block || args.getFullTransactions) {
        done(null, addProtocolVersion({ result: block }));
      } else {
        block.transactions = extractTransactionHashes(block);
        done(null, addProtocolVersion({ result: block }));
      }
    },

    ain_getProposerByHash: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const block = node.bc.getBlockByHash(args.hash);
      done(null, addProtocolVersion({result: block ? block.proposer : null}));
    },

    ain_getProposerByNumber: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const block = node.bc.getBlockByNumber(args.number);
      done(null, addProtocolVersion({result: block ? block.proposer : null}));
    },

    ain_getValidatorsByNumber: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const block = node.bc.getBlockByNumber(args.number);
      done(null, addProtocolVersion({result: block ? block.validators : null}));
    },

    ain_getValidatorsByHash: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const block = node.bc.getBlockByHash(args.hash);
      done(null, addProtocolVersion({result: block ? block.validators : null}));
    },

    ain_getBlockTransactionCountByHash: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const block = node.bc.getBlockByHash(args.hash);
      done(null, addProtocolVersion({result: block ? block.transactions.length : null}));
    },

    ain_getBlockTransactionCountByNumber: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const block = node.bc.getBlockByNumber(args.number);
      done(null, addProtocolVersion({result: block ? block.transactions.length : null}));
    },

    // Transaction API
    ain_getPendingTransactions: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      done(null, addProtocolVersion({result: node.tp.transactions}));
    },

    ain_getTransactionPoolSizeUtilization: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const address = args.address;
      const txPoolSizeUtil = node.getTxPoolSizeUtilization(address);
      done(null, addProtocolVersion({result: txPoolSizeUtil}));
    },

    ain_sendSignedTransaction: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET);
      if (sizeof(args) > TX_BYTES_LIMIT) {
        done(null, addProtocolVersion({
          result: {
            code: 1,
            message: `Transaction size exceeds its limit: ${TX_BYTES_LIMIT} bytes.`
          }
        }));
      } else if (!args.tx_body || !args.signature) {
        done(null, addProtocolVersion({
          result: {
            code: 2,
            message: `Missing properties.`
          }
        }));
      } else {
        const createdTx = Transaction.create(args.tx_body, args.signature);
        if (!createdTx) {
          done(null, addProtocolVersion({
            result: {
              code: 3,
              message: `Invalid transaction format.`
            }
          }));
        } else {
          done(null,
              addProtocolVersion({result: p2pServer.executeAndBroadcastTransaction(createdTx)}));
        }
      }
    },

    ain_sendSignedTransactionBatch: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET);
      if (!args.tx_list || !CommonUtil.isArray(args.tx_list)) {
        done(null, addProtocolVersion({
          result: {
            code: 1,
            message: `Invalid batch transaction format.`
          }
        }));
      } else if (args.tx_list.length > BATCH_TX_LIST_SIZE_LIMIT) {
        done(null, addProtocolVersion({
          result: {
            code: 2,
            message: `Batch transaction list size exceeds its limit: ${BATCH_TX_LIST_SIZE_LIMIT}.`
          }
        }));
      } else {
        const txList = [];
        for (let i = 0; i < args.tx_list.length; i++) {
          const tx = args.tx_list[i];
          if (sizeof(tx) > TX_BYTES_LIMIT) {
            done(null, addProtocolVersion({
              result: {
                code: 3,
                message: `Transaction[${i}]'s size exceededs its limit: ${TX_BYTES_LIMIT} bytes.`
              }
            }));
            return;
          } else if (!tx.tx_body || !tx.signature) {
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
        done(null, addProtocolVersion({
          result: p2pServer.executeAndBroadcastTransaction({tx_list: txList})
        }));
      }
    },

    ain_getTransactionByHash: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const transactionInfo = node.getTransactionByHash(args.hash);
      done(null, addProtocolVersion({result: transactionInfo}));
    },

    ain_getTransactionByBlockHashAndIndex: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
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
      done(null, addProtocolVersion({result}));
    },

    ain_getTransactionByBlockNumberAndIndex: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
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
      done(null, addProtocolVersion({result}));
    },

    // Database API
    ain_get: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      switch (args.type) {
        case ReadDbOperations.GET_VALUE:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.getValue(args.ref, CommonUtil.toGetOptions(args))
          }));
          return;
        case ReadDbOperations.GET_RULE:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.getRule(args.ref, CommonUtil.toGetOptions(args))
          }));
          return;
        case ReadDbOperations.GET_FUNCTION:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.getFunction(args.ref, CommonUtil.toGetOptions(args))
          }));
          return;
        case ReadDbOperations.GET_OWNER:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.getOwner(args.ref, CommonUtil.toGetOptions(args))
          }));
          return;
        case ReadDbOperations.GET:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.get(args.op_list)
          }));
          return;
        default:
          done(null, addProtocolVersion({code: 1, message: 'Invalid get request type'}));
      }
    },

    ain_matchFunction: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const result =
          p2pServer.node.db.matchFunction(args.ref, CommonUtil.toMatchOrEvalOptions(args));
      done(null, addProtocolVersion({result}));
    },

    ain_matchRule: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const result = p2pServer.node.db.matchRule(args.ref, CommonUtil.toMatchOrEvalOptions(args));
      done(null, addProtocolVersion({result}));
    },

    ain_matchOwner: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const result = p2pServer.node.db.matchOwner(args.ref, CommonUtil.toMatchOrEvalOptions(args));
      done(null, addProtocolVersion({result}));
    },

    ain_evalRule: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
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
      done(null, addProtocolVersion({result}));
    },

    ain_evalOwner: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const auth = {};
      if (args.address) {
        auth.addr = args.address;
      }
      if (args.fid) {
        auth.fid = args.fid;
      }
      const result = p2pServer.node.db.evalOwner(
          args.ref, args.permission, auth, CommonUtil.toMatchOrEvalOptions(args));
      done(null, addProtocolVersion({result}));
    },

    ain_getStateProof: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const result = p2pServer.node.db.getStateProof(args.ref);
      done(null, addProtocolVersion({result}));
    },

    ain_getProofHash: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const result = p2pServer.node.db.getProofHash(args.ref);
      done(null, addProtocolVersion({result}));
    },

    ain_getStateInfo: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const result = p2pServer.node.db.getStateInfo(args.ref);
      done(null, addProtocolVersion({result}));
    },

    ain_getStateUsage: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const result = p2pServer.node.getStateUsage(args.app_name);
      done(null, addProtocolVersion({result}));
    },

    // Account API
    ain_getBootstrapPubKey: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      done(null, addProtocolVersion({
        result: p2pServer.node.bootstrapAccount ? p2pServer.node.bootstrapAccount.public_key : null
      }));
    },

    ain_injectAccount: async function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      let result = false;
      if (await p2pServer.node.injectAccount(args.encryptedPassword)) {
        result = true;
        p2pServer.client.run();
      }
      return addProtocolVersion({ result });
    },

    ain_getAddress: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      done(null, addProtocolVersion({
        result: p2pServer.node.account ? p2pServer.node.account.address : null
      }));
    },

    ain_getBalance: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const address = args.address;
      const balance = p2pServer.node.db.getValue(PathUtil.getAccountBalancePath(address)) || 0;
      done(null, addProtocolVersion({result: balance}));
    },

    ain_getNonce: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      done(null, addProtocolVersion({
          result: p2pServer.node.getNonceForAddr(args.address, args.from === 'pending')
        }));
    },

    ain_getTimestamp: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      done(null, addProtocolVersion({
          result: p2pServer.node.getTimestampForAddr(args.address, args.from === 'pending')
        }));
    },

    ain_isValidator: function(args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const addr = args.address;
      const whitelisted = p2pServer.node.db.getValue(PathUtil.getConsensusWhitelistAddrPath(addr));
      const stake = p2pServer.node.db.getValue(PathUtil.getServiceAccountBalancePath(addr));
      done(null, addProtocolVersion({result: stake && whitelisted ? stake : 0}));
    },

    // Network API
    net_listening: function (args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const peerCount = Object.keys(p2pServer.inbound).length;
      done(null, addProtocolVersion({ result: !!peerCount }));
    },

    net_peerCount: function (args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const peerCount = Object.keys(p2pServer.inbound).length;
      done(null, addProtocolVersion({ result: peerCount }));
    },

    net_syncing: function (args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      // TODO(liayoo): Return { starting, latest } with block numbers
      // if the node is currently syncing.
      done(null, addProtocolVersion({
        result: p2pServer.node.state === BlockchainNodeStates.SYNCING
      }));
    },

    net_getNetworkId: function (args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      done(null, addProtocolVersion({ result: NETWORK_ID }));
    },

    net_getChainId: function (args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      done(null, addProtocolVersion({ result: CHAIN_ID }));
    },

    net_consensusStatus: function (args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const result = p2pServer.consensus.getStatus();
      done(null, addProtocolVersion({ result }));
    },

    net_rawConsensusStatus: function (args, done) {
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET);
      const result = p2pServer.consensus.getRawStatus();
      done(null, addProtocolVersion({ result }));
    }
  };
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
  result.protoVer = CURRENT_PROTOCOL_VERSION;
  return result;
}
