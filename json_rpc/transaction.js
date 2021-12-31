const sizeof = require('object-sizeof');
const JsonRpcUtil = require('./json-rpc-util');
const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const { JsonRpcApiResultCode } = require('../common/result-code');
const CommonUtil = require('../common/common-util');
const Transaction = require('../tx-pool/transaction');

module.exports = function getTransactionApis(node, p2pServer) {
  return {
    ain_getPendingTransactions: function(args, done) {
      const beginTime = Date.now();
      const result = node.tp.transactions;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getTransactionPoolSizeUtilization: function(args, done) {
      const beginTime = Date.now();
      const address = args.address;
      const txPoolSizeUtil = node.getTxPoolSizeUtilization(address);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: txPoolSizeUtil }));
    },

    ain_getTransactionByHash: function(args, done) {
      const beginTime = Date.now();
      const transactionInfo = node.getTransactionByHash(args.hash);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: transactionInfo }));
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
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
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
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_sendSignedTransaction: function(args, done) {
      const beginTime = Date.now();
      const txBytesLimit = node.getBlockchainParam('resource/tx_bytes_limit');
      if (sizeof(args) > txBytesLimit) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.TX_EXCEEDS_SIZE_LIMIT,
            message: `Transaction size exceeds its limit: ${txBytesLimit} bytes.`
          }
        }));
      } else if (!args.tx_body || !args.signature) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.TX_MISSING_PROPERTIES,
            message: `Missing properties.`
          }
        }));
      } else {
        const chainId = node.getBlockchainParam('genesis/chain_id');
        const createdTx = Transaction.create(args.tx_body, args.signature, chainId);
        if (!createdTx) {
          const latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
          done(null, JsonRpcUtil.addProtocolVersion({
            result: {
              code: JsonRpcApiResultCode.TX_INVALID_FORMAT,
              message: `Invalid transaction format.`
            }
          }));
        } else {
          const result = p2pServer.executeAndBroadcastTransaction(createdTx);
          const latency = Date.now() - beginTime;
          trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
          done(null, JsonRpcUtil.addProtocolVersion({ result }));
        }
      }
    },

    ain_sendSignedTransactionBatch: function(args, done) {
      const beginTime = Date.now();
      const batchTxListSizeLimit = node.getBlockchainParam('resource/batch_tx_list_size_limit');
      if (!args.tx_list || !CommonUtil.isArray(args.tx_list)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.BATCH_INVALID_FORMAT,
            message: `Invalid batch transaction format.`
          }
        }));
      } else if (args.tx_list.length > batchTxListSizeLimit) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: {
            code: JsonRpcApiResultCode.BATCH_TX_LIST_EXCEEDS_SIZE_LIMIT,
            message: `Batch transaction list size exceeds its limit: ${batchTxListSizeLimit}.`
          }
        }));
      } else {
        const txBytesLimit = node.getBlockchainParam('resource/tx_bytes_limit');
        const chainId = node.getBlockchainParam('genesis/chain_id');
        const txList = [];
        for (let i = 0; i < args.tx_list.length; i++) {
          const tx = args.tx_list[i];
          if (sizeof(tx) > txBytesLimit) {
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
            done(null, JsonRpcUtil.addProtocolVersion({
              result: {
                code: JsonRpcApiResultCode.BATCH_TX_EXCEEDS_SIZE_LIMIT,
                message: `Transaction[${i}]'s size exceededs its limit: ${txBytesLimit} bytes.`
              }
            }));
            return;
          } else if (!tx.tx_body || !tx.signature) {
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
            done(null, JsonRpcUtil.addProtocolVersion({
              result: {
                code: JsonRpcApiResultCode.BATCH_TX_MISSING_PROPERTIES,
                message: `Missing properties of transaction[${i}].`
              }
            }));
            return;
          }
          const createdTx = Transaction.create(tx.tx_body, tx.signature, chainId);
          if (!createdTx) {
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
            done(null, JsonRpcUtil.addProtocolVersion({
              result: {
                code: JsonRpcApiResultCode.BATCH_TX_INVALID_FORMAT,
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
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }
    },
  };
};
