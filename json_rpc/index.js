'use strict';

const semver = require('semver');
const sizeof = require('object-sizeof');
const {
  ReadDbOperations,
  PredefinedDbPaths,
  TransactionStatus,
  MAX_TX_BYTES,
  NETWORK_ID
} = require('../constants');
const ainUtil = require('@ainblockchain/ain-util');
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;

/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {Node} node Instance of the Node class.
 * @param {P2pServer} p2pServer Instance of the the P2pServer class.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(
    node,
    p2pServer,
    minProtocolVersion,
    maxProtocolVersion
  ) {
  return {
    ain_getProtocolVersion: function(args, done) {
      done(null, addProtocolVersion({}));
    },

    ain_checkProtocolVersion: function(args, done) {
      const version = args.protoVer;
      if (version === undefined) {
        done(null, addProtocolVersion({ code: 1, message: 'Protocol version not specified.' }));
      } else if (!semver.valid(version)) {
        done(null, addProtocolVersion({ code: 1, message: 'Invalid protocol version.' }));
      } else if (semver.gt(minProtocolVersion, version) ||
                (maxProtocolVersion && semver.lt(maxProtocolVersion, version))) {
        done(null, addProtocolVersion({ code: 1, message: 'Incompatible protocol version.' }));
      } else {
        done(null, addProtocolVersion({ code: 0, result: 'Success' }));
      }
    },

    // Bloock API
    ain_getBlockList: function(args, done) {
      const blocks = node.bc.getChainSection(args.from, args.to);
      done(null, addProtocolVersion({ result: blocks }));
    },

    ain_getRecentBlock: function(args, done) {
      done(null, addProtocolVersion({ result: node.bc.lastBlock() }));
    },

    ain_getRecentBlockNumber: function(args, done) {
      const block = node.bc.lastBlock();
      done(null, addProtocolVersion({ result: block ? block.number : null }));
    },

    ain_getBlockHeadersList: function(args, done) {
      const blocks = node.bc.getChainSection(args.from, args.to);
      const blockHeaders = [];
      blocks.forEach((block) => {
        blockHeaders.push(block.header);
      });
      done(null, addProtocolVersion({ result: blockHeaders }));
    },

    ain_getBlockByHash: function(args, done) {
      let block = node.bc.getBlockByHash(args.hash);
      if (block && !args.getFullTransactions) {
        block.transactions = extractTransactionHashes(block);
      }
      done(null, addProtocolVersion({ result: block }));
    },

    ain_getBlockByNumber: function(args, done) {
      let block = node.bc.getBlockByNumber(args.number);
      if (!block || args.getFullTransactions) {
        done(null, addProtocolVersion({ result: block }));
      } else {
        block.transactions = extractTransactionHashes(block);
        done(null, addProtocolVersion({ result: block }));
      }
    },

    ain_getProposerByHash: function(args, done) {
      const block = node.bc.getBlockByHash(args.hash);
      done(null, addProtocolVersion({ result: block ? block.proposer : null }));
    },

    ain_getProposerByNumber: function(args, done) {
      const block = node.bc.getBlockByNumber(args.number);
      done(null, addProtocolVersion({ result: block ? block.proposer : null }));
    },

    ain_getValidatorsByNumber: function(args, done) {
      const block = node.bc.getBlockByNumber(args.number);
      done(null, addProtocolVersion({ result: block ? block.validators : null }));
    },

    ain_getValidatorsByHash: function(args, done) {
      const block = node.bc.getBlockByHash(args.hash);
      done(null, addProtocolVersion({ result: block ? block.validators : null }));
    },

    ain_getBlockTransactionCountByHash: function(args, done) {
      const block = node.bc.getBlockByHash(args.hash);
      done(null, addProtocolVersion({ result: block ? block.transactions.length : null }));
    },

    ain_getBlockTransactionCountByNumber: function(args, done) {
      const block = node.bc.getBlockByNumber(args.number);
      done(null, addProtocolVersion({ result: block ? block.transactions.length : null }));
    },

    // Transaction API
    ain_getPendingTransactions: function(args, done) {
      done(null, addProtocolVersion({ result: node.tp.transactions }));
    },

    ain_sendSignedTransaction: function(args, done) {
      // TODO (lia): return the transaction hash or an error message
      if (sizeof(args) > MAX_TX_BYTES) {
        done(null, addProtocolVersion({ code: 1, message: `Transaction size exceeds ${MAX_TX_BYTES} bytes.` }));
      } else {
        done(null, addProtocolVersion({ result: p2pServer.executeAndBroadcastTransaction(args) }));
      }
    },

    ain_getTransactionByHash: function(args, done) {
      const transactionInfo = node.tp.transactionTracker[args.hash];
      if (!transactionInfo) {
        done(null, addProtocolVersion({ result: null }));
      } else {
        let transaction = null;
        if (transactionInfo.status === TransactionStatus.BLOCK_STATUS) {
          const block = node.bc.getBlockByNumber(transactionInfo.number);
          const index = transactionInfo.index;
          transaction = Object.assign({}, block.transactions[index], { is_confirmed: true });
        } else if (transactionInfo.status === TransactionStatus.POOL_STATUS) {
          const address = transactionInfo.address;
          const index = transactionInfo.index;
          transaction = Object.assign({}, node.tp.transactions[address][index], { is_confirmed: false });
        }
        done(null, addProtocolVersion({ result: transaction }));
      }
    },

    ain_getTransactionByBlockHashAndIndex: function(args, done) {
      let result = null;
      if (args.block_hash && Number.isInteger(args.index)) {
        const index = Number(args.index);
        const block = node.bc.getBlockByHash(args.block_hash);
        if (block.transactions.length > index && index >= 0) {
          result = Object.assign({}, block.transactions[index], { is_confirmed: true });
        }
      }
      done(null, addProtocolVersion({ result }));
    },

    ain_getTransactionByBlockNumberAndIndex: function(args, done) {
      let result = null;
      if (Number.isInteger(args.block_number) && Number.isInteger(args.index)) {
        const index = Number(args.index);
        const block = node.bc.getBlockByNumber(args.block_number);
        if (block.transactions.length > index && index >= 0) {
          result = Object.assign({}, block.transactions[index], { is_confirmed: true });
        }
      }
      done(null, addProtocolVersion({ result }));
    },

    // Database API
    ain_get: function(args, done) { // TODO (lia): split this method
      switch (args.type) {
        case ReadDbOperations.GET_VALUE:
          done(null, addProtocolVersion({ result: p2pServer.node.db.getValue(args.ref) }));
          return;
        case ReadDbOperations.GET_RULE:
          done(null, addProtocolVersion({ result: p2pServer.node.db.getRule(args.ref) }));
          return;
        case ReadDbOperations.GET_OWNER:
          done(null, addProtocolVersion({ result: p2pServer.node.db.getOwner(args.ref) }));
          return;
        case ReadDbOperations.GET_FUNCTION:
          done(null, addProtocolVersion({ result: p2pServer.node.db.getFunction(args.ref) }));
          return;
        case ReadDbOperations.GET:
          done(null, addProtocolVersion({ result: p2pServer.node.db.get(args.op_list) }));
          return;
        default:
          done(null, addProtocolVersion({ code: 1, message: "Invalid get request type" }));
      }
    },

    ain_matchFunction: function(args, done) {
      const result = p2pServer.node.db.matchFunction(args.ref);
      done(null, addProtocolVersion({ result }));
    },

    ain_matchRule: function(args, done) {
      const result = p2pServer.node.db.matchRule(args.ref);
      done(null, addProtocolVersion({ result }));
    },

    ain_matchOwner: function(args, done) {
      const result = p2pServer.node.db.matchOwner(args.ref);
      done (null, addProtocolVersion({ result }));
    },

    ain_evalRule: function(args, done) {
      const result = p2pServer.node.db.evalRule(
          args.ref, args.value, args.address, args.timestamp || Date.now());
      done(null, addProtocolVersion({ result }));
    },

    ain_evalOwner: function(args, done) {
      const result = p2pServer.node.db.evalOwner(args.ref, args.permission, args.address);
      done (null, addProtocolVersion({ result }));
    },

    // Account API
    ain_getAddress: function(args, done) {
      done(null, addProtocolVersion({ result: p2pServer.node.account ?
          p2pServer.node.account.address : null }));
    },

    ain_getBalance: function(args, done) {
      const address = args.address;
      const balance =
          p2pServer.node.db.getValue(`/${PredefinedDbPaths.ACCOUNTS}/${address}/balance`) || 0;
      done(null, addProtocolVersion({ result: balance }));
    },

    ain_getNonce: function(args, done) {
      const address = args.address;
      if (args.from === 'pending') {
        if (ainUtil.areSameAddresses(p2pServer.node.account.address, address)) {
          done(null, addProtocolVersion({ result: p2pServer.node.nonce }));
        } else {
          const nonce = node.tp.pendingNonceTracker[address];
          done(null, addProtocolVersion({ result: nonce === undefined ? -1 : nonce }));
        }
      } else {
        // get the "committed nonce" by default
        const nonce = node.tp.committedNonceTracker[address];
        done(null, addProtocolVersion({ result: nonce === undefined ? -1 : nonce }));
      }
    },

    ain_isValidator: function(args, done) {
      // TODO (lia): update this function after revamping consensus staking
      // FIXME: may need to deprecate or modify this logic for the new consensus
      const deposit = p2pServer.node.db.getValue(
          `${PredefinedDbPaths.DEPOSIT_ACCOUNTS_CONSENSUS}/${args.address}`);
      const stakeValid = deposit && deposit.value > 0 && deposit.expire_at > Date.now() + ConsensusConsts.DAY_MS;
      done(null, addProtocolVersion({ result: stakeValid }));
    },

    // Network API
    net_listening: function(args, done) {
      // TODO (lia): Check if this number is lower than max peer number
      const peerCount = p2pServer.sockets.length;
      done(null, addProtocolVersion({ result: !!peerCount }));
    },

    net_peerCount: function(args, done) {
      const peerCount = p2pServer.sockets.length;
      done(null, addProtocolVersion({ result: peerCount }));
    },

    net_syncing: function(args, done) {
      // TODO (lia): return { starting, latest } with block numbers if the node
      // is currently syncing.
      done(null, addProtocolVersion({ result: !node.bc.syncedAfterStartup }));
    },

    net_getNetworkId: function(args, done) {
      done(null, addProtocolVersion({ result: NETWORK_ID }));
    },

    net_consensusState: function(args, done) {
      const result = p2pServer.consensus.getState();
      done(null, addProtocolVersion( result ));
    },

    net_rawConsensusState: function(args, done) {
      const result = p2pServer.consensus.getRawState();
      done(null, addProtocolVersion( result ));
    }
  };
};

function extractTransactionHashes(block) {
  if (!block) return [];
  const hashes = [];
  block.transactions.forEach(tx => {
    hashes.push(tx.hash);
  });
  return hashes;
}

function addProtocolVersion(result) {
  result['protoVer'] = CURRENT_PROTOCOL_VERSION;
  return result;
}
