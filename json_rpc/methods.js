'use strict';

const getJsonRpcApi = require('./methods_impl');

 /**
 * Defines the list of funtions which are accessibly to clients through the 
 * JSON-RPC calls 
 * 
 * @param {Blockchain} blockchain - Instance of the Blockchain class
 * @param {TransactionPool} transactionPool - Instance of the TransactionPool class
 * @return {dict} A closure of functions compatible with the jayson library for 
 *                  servicing JSON-RPC requests
 */
module.exports = function getMethods(blockchain, transactionPool) {
    
    const methodsImpl = getJsonRpcApi(blockchain, transactionPool)
    return {     
            getBlocks: function(args, done){
                const queryDict = (typeof args === "undefined" || args.length < 1) ? {} : args[0]
                const blocks = methodsImpl.blockchainClosure.getBlockBodies(queryDict)
                done(null, blocks)
            },
    
            getLastBlock: function(args, done){
                const block = methodsImpl.blockchainClosure.getLastBlock()
                done(null, block)
            },
    
            getTransactions: function(args, done){
                const trans =  methodsImpl.transactionPoolClosure.getTransactions()
                done(null, trans)
            },

            getBlockHeaders: function(args, done){
                const queryDict = (typeof args === "undefined" || args.length < 1) ? {} : args[0]
                const blockHeaders =  methodsImpl.blockchainClosure.getBlockHeaders(queryDict)
                done(null, blockHeaders)
            }
    }
}
