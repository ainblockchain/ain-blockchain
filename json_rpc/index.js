'use strict';

const semver = require('semver');
const sizeof = require('object-sizeof');
const _ = require('lodash');
const {
  CURRENT_PROTOCOL_VERSION,
  BlockchainNodeStates,
  ReadDbOperations,
  PredefinedDbPaths,
  TransactionStatus,
  TX_BYTES_LIMIT,
  NETWORK_ID,
} = require('../common/constants');
const {
  ConsensusConsts,
} = require('../consensus/constants');
const Transaction = require('../tx-pool/transaction');

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
      done(null, addProtocolVersion({result: CURRENT_PROTOCOL_VERSION}));
    },

    ain_checkProtocolVersion: function(args, done) {
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
      const blocks = node.bc.getChainSection(args.from, args.to);
      done(null, addProtocolVersion({result: blocks}));
    },

    ain_getRecentBlock: function(args, done) {
      done(null, addProtocolVersion({result: node.bc.lastBlock()}));
    },

    ain_getRecentBlockNumber: function(args, done) {
      const block = node.bc.lastBlock();
      done(null, addProtocolVersion({result: block ? block.number : null}));
    },

    ain_getBlockHeadersList: function(args, done) {
      const blocks = node.bc.getChainSection(args.from, args.to);
      const blockHeaders = [];
      blocks.forEach((block) => {
        blockHeaders.push(block.header);
      });
      done(null, addProtocolVersion({result: blockHeaders}));
    },

    ain_getBlockByHash: function(args, done) {
      const block = node.bc.getBlockByHash(args.hash);
      if (block && !args.getFullTransactions) {
        block.transactions = extractTransactionHashes(block);
      }
      done(null, addProtocolVersion({result: block}));
    },

    ain_getBlockByNumber: function(args, done) {
      const block = node.bc.getBlockByNumber(args.number);
      if (!block || args.getFullTransactions) {
        done(null, addProtocolVersion({result: block}));
      } else {
        block.transactions = extractTransactionHashes(block);
        done(null, addProtocolVersion({result: block}));
      }
    },

    ain_getProposerByHash: function(args, done) {
      const block = node.bc.getBlockByHash(args.hash);
      done(null, addProtocolVersion({result: block ? block.proposer : null}));
    },

    ain_getProposerByNumber: function(args, done) {
      const block = node.bc.getBlockByNumber(args.number);
      done(null, addProtocolVersion({result: block ? block.proposer : null}));
    },

    ain_getValidatorsByNumber: function(args, done) {
      const block = node.bc.getBlockByNumber(args.number);
      done(null, addProtocolVersion({result: block ? block.validators : null}));
    },

    ain_getValidatorsByHash: function(args, done) {
      const block = node.bc.getBlockByHash(args.hash);
      done(null, addProtocolVersion({result: block ? block.validators : null}));
    },

    ain_getBlockTransactionCountByHash: function(args, done) {
      const block = node.bc.getBlockByHash(args.hash);
      done(null, addProtocolVersion({result: block ? block.transactions.length : null}));
    },

    ain_getBlockTransactionCountByNumber: function(args, done) {
      const block = node.bc.getBlockByNumber(args.number);
      done(null, addProtocolVersion({result: block ? block.transactions.length : null}));
    },

    // Transaction API
    ain_getPendingTransactions: function(args, done) {
      done(null, addProtocolVersion({result: node.tp.transactions}));
    },

    // TODO(seo): Instantly reject requests with invalid signatures.
    ain_sendSignedTransaction: function(args, done) {
      if (sizeof(args) > TX_BYTES_LIMIT) {
        done(null, addProtocolVersion({
          result: {
            code: 1,
            message: `Transaction size exceeds ${TX_BYTES_LIMIT} bytes.`
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
      if (sizeof(args) > TX_BYTES_LIMIT) {
        done(null, addProtocolVersion({
          result: {
            code: 1,
            message: `Transaction size exceeds ${TX_BYTES_LIMIT} bytes.`
          }
        }));
      } else if (!args.tx_list || !Array.isArray(args.tx_list)) {
        done(null, addProtocolVersion({
          result: {
            code: 2,
            message: `Invalid batch transaction format.`
          }
        }));
      } else {
        const txList = [];
        for (let i = 0; i < args.tx_list.length; i++) {
          const tx = args.tx_list[i];
          if (!tx.tx_body || !tx.signature) {
            done(null, addProtocolVersion({
              result: {
                code: 3,
                message: `Missing properties of transaction[${i}].`
              }
            }));
            return;
          }
          const createdTx = Transaction.create(tx.tx_body, tx.signature);
          if (!createdTx) {
            done(null, addProtocolVersion({
              result: {
                code: 4,
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
      const transactionInfo = node.tp.transactionTracker[args.hash];
      if (transactionInfo) {
        if (transactionInfo.status === TransactionStatus.BLOCK_STATUS) {
          const block = node.bc.getBlockByNumber(transactionInfo.number);
          const index = transactionInfo.index;
          if (index >= 0) {
            transactionInfo.transaction = block.transactions[index];
          } else {
            transactionInfo.transaction = _.find(block.last_votes, (tx) => tx.hash === args.hash);
          }
        } else if (transactionInfo.status === TransactionStatus.POOL_STATUS) {
          const address = transactionInfo.address;
          transactionInfo.transaction = _.find(node.tp.transactions[address], (tx) => tx.hash === args.hash);
        }
      }
      done(null, addProtocolVersion({result: transactionInfo}));
    },

    ain_getTransactionByBlockHashAndIndex: function(args, done) {
      let result = null;
      if (args.block_hash && Number.isInteger(args.index)) {
        const index = Number(args.index);
        const block = node.bc.getBlockByHash(args.block_hash);
        if (block.transactions.length > index && index >= 0) {
          result = {
            transaction: block.transactions[index],
            is_finalized: true
          };
        }
      }
      done(null, addProtocolVersion({result}));
    },

    ain_getTransactionByBlockNumberAndIndex: function(args, done) {
      let result = null;
      if (Number.isInteger(args.block_number) && Number.isInteger(args.index)) {
        const index = Number(args.index);
        const block = node.bc.getBlockByNumber(args.block_number);
        if (block.transactions.length > index && index >= 0) {
          result = {
            transaction: block.transactions[index],
            is_finalized: true
          };
        }
      }
      done(null, addProtocolVersion({result}));
    },

    // Database API
    ain_get: function(args, done) {
      switch (args.type) {
        case ReadDbOperations.GET_VALUE:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.getValue(args.ref, args.is_global)
          }));
          return;
        case ReadDbOperations.GET_RULE:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.getRule(args.ref, args.is_global)
          }));
          return;
        case ReadDbOperations.GET_FUNCTION:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.getFunction(args.ref, args.is_global)
          }));
          return;
        case ReadDbOperations.GET_OWNER:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.getOwner(args.ref, args.is_global)
          }));
          return;
        case ReadDbOperations.GET:
          done(null, addProtocolVersion({
            result: p2pServer.node.db.get(args.op_list, args.is_global)
          }));
          return;
        default:
          done(null, addProtocolVersion({code: 1, message: 'Invalid get request type'}));
      }
    },

    ain_matchFunction: function(args, done) {
      const result = p2pServer.node.db.matchFunction(args.ref, args.is_global);
      done(null, addProtocolVersion({result}));
    },

    ain_matchRule: function(args, done) {
      const result = p2pServer.node.db.matchRule(args.ref, args.is_global);
      done(null, addProtocolVersion({result}));
    },

    ain_matchOwner: function(args, done) {
      const result = p2pServer.node.db.matchOwner(args.ref, args.is_global);
      done(null, addProtocolVersion({result}));
    },

    ain_evalRule: function(args, done) {
      const auth = {};
      if (args.address) {
        auth.addr = args.address;
      }
      if (args.fid) {
        auth.fid = args.fid;
      }
      const result = p2pServer.node.db.evalRule(
          args.ref, args.value, auth, args.timestamp || Date.now(), args.is_global);
      done(null, addProtocolVersion({result}));
    },

    ain_evalOwner: function(args, done) {
      const auth = {};
      if (args.address) {
        auth.addr = args.address;
      }
      if (args.fid) {
        auth.fid = args.fid;
      }
      const result =
          p2pServer.node.db.evalOwner(args.ref, args.permission, auth, args.is_global);
      done(null, addProtocolVersion({result}));
    },

    ain_getStateProof: function(args, done) {
      const result = p2pServer.node.db.getStateProof(args.ref);
      done(null, addProtocolVersion({result}));
    },

    ain_getStateInfo: function(args, done) {
      const result = p2pServer.node.db.getStateInfo(args.ref);
      done(null, addProtocolVersion({result}));
    },

    // Account API
    ain_getAddress: function(args, done) {
      done(null, addProtocolVersion({
        result: p2pServer.node.account ? p2pServer.node.account.address : null
      }));
    },

    ain_getBalance: function(args, done) {
      const address = args.address;
      const balance =
          p2pServer.node.db.getValue(`/${PredefinedDbPaths.ACCOUNTS}/${address}/balance`) || 0;
      done(null, addProtocolVersion({result: balance}));
    },

    ain_getNonce: function(args, done) {
      done(null, addProtocolVersion({
          result: p2pServer.node.getNonceForAddr(args.address, args.from === 'pending')
        }));
    },

    ain_isValidator: function(args, done) {
      const whitelisted = p2pServer.node.db.getValue(
          `${PredefinedDbPaths.DEPOSIT_ACCOUNTS_CONSENSUS}/${PredefinedDbPaths.WHITELIST}/${args.address}`);
      const deposit = p2pServer.node.db.getValue(
          `${PredefinedDbPaths.DEPOSIT_ACCOUNTS_CONSENSUS}/${args.address}`);
      const stakeValid = deposit && deposit.value > 0 &&
          deposit.expire_at > Date.now() + ConsensusConsts.DAY_MS;
      done(null, addProtocolVersion({result: stakeValid && whitelisted ? stakeValid : 0}));
    },

    // Network API
    net_listening: function(args, done) {
      const peerCount = Object.keys(p2pServer.inbound).length;
      done(null, addProtocolVersion({result: !!peerCount}));
    },

    net_peerCount: function(args, done) {
      const peerCount = Object.keys(p2pServer.inbound).length;
      done(null, addProtocolVersion({result: peerCount}));
    },

    net_syncing: function(args, done) {
      // TODO(lia): return { starting, latest } with block numbers if the node is currently syncing.
      done(null, addProtocolVersion(
          {result: p2pServer.node.state === BlockchainNodeStates.SYNCING}));
    },

    net_getNetworkId: function(args, done) {
      done(null, addProtocolVersion({result: NETWORK_ID}));
    },

    net_consensusState: function(args, done) {
      const result = p2pServer.consensus.getState();
      done(null, addProtocolVersion({result}));
    },

    net_rawConsensusState: function(args, done) {
      const result = p2pServer.consensus.getRawState();
      done(null, addProtocolVersion({result}));
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
