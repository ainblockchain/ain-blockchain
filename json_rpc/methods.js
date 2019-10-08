'use strict';

const getJsonRpcApi = require('./methods_impl');
const {OperationTypes} = require('../constants');

/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {Blockchain} blockchain Instance of the Blockchain class.
 * @param {TransactionPool} transactionPool Instance of the TransactionPool class.
 * @param {P2pServer} p2pServer Instance of the the P2pServer class.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(blockchain, transactionPool, p2pServer) {
  const methodsImpl = getJsonRpcApi(blockchain, transactionPool, p2pServer);
  return {
    // Bloock API
    ain_getBlockList: function(args, done) {
      const queryDict = getQueryDict(args);
      const blocks = methodsImpl.blockchainClosure.getBlockBodies(queryDict);
      done(null, blocks);
    },

    ain_getLastBlock: function(args, done) {
      const block = methodsImpl.blockchainClosure.getLastBlock();
      done(null, block);
    },

    ain_getBlockHeadersList: function(args, done) {
      const queryDict = getQueryDict(args);
      const blockHeaders = methodsImpl.blockchainClosure.getBlockHeaders(queryDict);
      done(null, blockHeaders);
    },

    ain_getBlockByHash: function(args, done) {
      const hashSubstring = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByHash(hashSubstring);
      done(null, (block === null) ? null: block.body());
    },

    ain_getBlockHeaderByHash: function(args, done) {
      const hashSubstring = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByHash(hashSubstring);
      done(null, (block === null) ? null: block.header());
    },

    ain_getBlockByNumber: function(args, done) {
      const height = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByNumber(height);
      done(null, (block === null) ? null: block.body());
    },

    ain_getBlockHeaderByNumber: function(args, done) {
      const height = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByNumber(height);
      done(null, (block === null) ? null: block.header());
    },

    ain_getForgerByHash: function(args, done) {
      const hashSubstring = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByHash(hashSubstring);
      done(null, (block === null) ? null: block.body().forger);
    },

    ain_getForgerByNumber: function(args, done) {
      const height = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByNumber(height);
      done(null, (block === null) ? null: block.body().forger);
    },

    ain_getValidatorsByNumber: function(args, done) {
      const height = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByNumber(height);
      done(null, (block === null) ? null: block.header().validators);
    },

    ain_getValidatorsByHash: function(args, done) {
      const hashSubstring = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByHash(hashSubstring);
      done(null, (block === null) ? null: block.header().validators);
    },

    ain_getBlockTransactionCountByHash: function(args, done) {
      const hashSubstring = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByHash(hashSubstring);
      done(null, (block === null) ? null: block.body().data.length);
    },

    ain_getBlockTransactionCountByNumber: function(args, done) {
      const height = getQueryDict(args);
      const block = methodsImpl.blockchainClosure.getBlockByNumber(height);
      done(null, (block === null) ? null: block.body().data.length);
    },

    // Transaction API
    ain_getPendingTransactions: function(args, done) {
      const trans = methodsImpl.transactionPoolClosure.getTransactions();
      done(null, trans);
    },

    ain_sendSignedTransaction: function(args, done) {
      const transaction = getQueryDict(args);
      // TODO (lia): return the transaction hash or an error message
      done(null, methodsImpl.p2pServerClosure.executeTransaction(transaction));
    },

    ain_getTransactionByBlockHashAndIndex: function(args, done) {
      const queryDict = getQueryDict(args);
      let result;
      if (!queryDict.blockHash || !queryDict.index) {
        result = null;
      } else {
        const index = Number(queryDict.index);
        const block = methodsImpl.blockchainClosure.getBlockByHash(queryDict.blockHash);
        result = block.data.length > index && index >= 0 ? block.data[index] : null;
      }
      done(null, result);
    },

    ain_getTransactionByBlockNumberAndIndex: function(args, done) {
      const queryDict = getQueryDict(args);
      let result;
      if (!queryDict.blockNumber || !queryDict.index) {
        result = null;
      } else {
        const index = Number(queryDict.index);
        const block = methodsImpl.blockchainClosure.getBlockByNumber(queryDict.blockNumber);
        result = block.data.length > index && index >= 0 ? block.data[index] : null;
      }
      done(null, result);
    },

    // Database API
    ain_get: function(args, done) {
      if (!args.type || (args.type !== OperationTypes.GET_VALUE &&
          args.type !== OperationTypes.GET_RULE &&
          args.type !== OperationTypes.GET_OWNER &&
          args.type !== OperationTypes.GET)) {
        done(null, {error: "Invalid get request"});
      } else {
        done(null, p2pServer.db.execute(args));
      }
    },

    // Account API
    ain_getBalance: function(args, done) {
      const address = args.address;
      const balance = p2pServer.db.getValue(`/accounts/${address}/balance`) || 0;
      done(null, balance);
    },

    ain_getNonce: function(args, done) {
      const address = args.address;
      const nonce = (p2pServer.db.publicKey === address ?
          p2pServer.db.nonce : transactionPool.nonceTracker[address]) || 0;
      done(null, nonce);
    },

    ain_isValidator: function(args, done) {
      // TODO (lia): fill this function out after revamping consensus staking
    },

    // Network API
    net_listening: function(args, done) {
      // TODO (lia): Check if this number is lower than max peer number
      const peerCount = p2pServer.sockets.length;
      done(null, !!peerCount);
    },

    net_peerCount: function(args, done) {
      const peerCount = p2pServer.sockets.length;
      done(null, peerCount);
    },

    net_syncing: function(args, done) {
      // TODO (lia): return { starting, latest } with block numbers if the node
      // is currently syncing.
      done(null, blockchain.syncedAfterStartup);
    },
  };
};

function getQueryDict(args) {
  return (typeof args === 'undefined' || args.length < 1) ? {} : args[0];
}
