'use strict';


module.exports = function getJsonRpcApi(blockchain, transactionPool, p2pServer) {
  return {
    blockchainClosure: getBlockchainClosure(blockchain),
    transactionPoolClosure: getTransactionPoolClosure(transactionPool),
    p2pServerClosure: getP2pServerClosure(p2pServer),
  };
};


/**
 * Wraps a blockchain instance in a closure with a set of functions.
 * These functions will be invoked through JSON-RPC calls to ./methods.js
 * that allow clients to query information from the blockchain
 *
 * @param {Blockchain} blockchain Instance of the Blockchain class
 * @return {dict} A closure allowing read access to information from the wrapped blockchain
 *
 */
function getBlockchainClosure(blockchain) {
  return {
    getBlockList(query) {
      const to = ('to' in query) ? query.to: blockchain.length;
      const from = ('from' in query) ? query.from: 0;
      return blockchain.getChainSection(from, to);
    },

    getBlockBodies(query) {
      const blockBodies = [];
      const blocks = this.getBlockList(query);
      blocks.forEach((block) => {
        blockBodies.push(block.body());
      });
      return blockBodies;
    },

    getLastBlock() {
      return blockchain.lastBlock();
    },

    getBlockHeaders(query) {
      const blockHeaders = [];
      const blocks = this.getBlockList(query);
      blocks.forEach((block) => {
        blockHeaders.push(block.header());
      });
      return blockHeaders;
    },

    getBlockByNumber(height) {
      return blockchain.getBlockByNumber(height);
    },

    getBlockByHash(hash) {
      return blockchain.getBlockByHash(hash);
    },
  };
}

/**
 * Wraps a TransactionPool instance in a closure with a set of functions.
 * These functions will be invoked through JSON-RPC calls to ./methods.js
 * that allow clients to query information from the transactionPool.
 *
 * @param {TransactionPool} transactionPool Instance of the TransactionPool class.
 * @param {P2pServer} p2pServer Instance of the P2pServer class.
 * @return {dict} A closure allowing read access to information from the wrapped transactionPool.
 */
function getTransactionPoolClosure(transactionPool) {
  return {
    getTransactions() {
      return transactionPool.transactions;
    },
  };
}

/**
 * Wraps a P2pServer instance in a closure with a set of functions.
 * These functions will be invoked through JSON-RPC calls to ./methods.js
 * that allow clients to query information and execute transactions through the p2pServer.
 *
 * @param {P2pServer} p2pServer Instance of the P2pServer class.
 * @return {dict} A closure allowing access to information from the wrapped transactionPool.
 */
function getP2pServerClosure(p2pServer) {
  return {
    executeTransaction(transaction) {
      return p2pServer.executeAndBroadcastTransaction(transaction);
    },
  };
}
