const sizeof = require('object-sizeof');
const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const { JsonRpcApiResultCode } = require('../common/result-code');
const Transaction = require('../tx-pool/transaction');
const CommonUtil = require('../common/common-util');
const JsonRpcUtil = require('./util');

module.exports = function getStateModifyingApis(node, p2pServer) {
  return {
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
        const createdTx = Transaction.create(args.tx_body, args.signature);
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
          const createdTx = Transaction.create(tx.tx_body, tx.signature);
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
