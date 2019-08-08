'use strict';

const getJsonRpcApi = require('./methods_impl');

/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {Blockchain} blockchain - Instance of the Blockchain class.
 * @param {TransactionPool} transactionPool - Instance of the TransactionPool class.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(blockchain, transactionPool) {
  const methodsImpl = getJsonRpcApi(blockchain, transactionPool);
  return {
    ain_getBlockList: function(args, done) {
      const queryDict = getQueryDict(args);
      const blocks = methodsImpl.blockchainClosure.getBlockBodies(queryDict);
      done(null, blocks);
    },

    ain_getLastBlock: function(args, done) {
      const block = methodsImpl.blockchainClosure.getLastBlock();
      done(null, block);
    },

    ain_getTransactions: function(args, done) {
      const trans = methodsImpl.transactionPoolClosure.getTransactions();
      done(null, trans);
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
  };
};

function getQueryDict(args) {
  return (typeof args === 'undefined' || args.length < 1) ? {} : args[0];
}
