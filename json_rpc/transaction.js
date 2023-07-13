const sizeof = require('object-sizeof');
const JsonRpcUtil = require('./json-rpc-util');
const {
  NodeConfigs,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const { JsonRpcApiResultCode } = require('../common/result-code');
const CommonUtil = require('../common/common-util');
const Transaction = require('../tx-pool/transaction');
const { JSON_RPC_METHODS } = require('./constants');

function executeTransactionOnNode(node, p2pServer, args, done, isDryrun) {
  const beginTime = Date.now();
  const txBytesLimit = node.getBlockchainParam('resource/tx_bytes_limit');
  if (sizeof(args) > txBytesLimit) {
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
    done(null, JsonRpcUtil.addProtocolVersion({
      result: null,
      code: JsonRpcApiResultCode.TX_EXCEEDS_SIZE_LIMIT,
      message: `Transaction size exceeds its limit: ${txBytesLimit} bytes.`
    }));
  } else if (!args.tx_body || !args.signature) {
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
    done(null, JsonRpcUtil.addProtocolVersion({
      result: null,
      code: JsonRpcApiResultCode.TX_MISSING_PROPERTIES,
      message: 'Missing properties.'
    }));
  } else {
    const chainId = node.getBlockchainParam('genesis/chain_id');
    const createdTx = Transaction.create(args.tx_body, args.signature, chainId);
    if (!createdTx) {
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({
        result: null,
        code: JsonRpcApiResultCode.TX_INVALID_FORMAT,
        message: 'Invalid transaction format.'
      }));
    } else {
      if (!NodeConfigs.LIGHTWEIGHT &&
          NodeConfigs.ENABLE_EARLY_TX_SIG_VERIF &&
          !Transaction.verifyTransaction(createdTx, chainId)) {
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null,
          code: JsonRpcApiResultCode.TX_INVALID_SIGNATURE,
          message: 'Invalid transaction signature.'
        }));
      } else {
        const result = p2pServer.executeAndBroadcastTransaction(createdTx, isDryrun);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }
    }
  }
}

module.exports = function getTransactionApis(node, p2pServer) {
  return {
    [JSON_RPC_METHODS.AIN_GET_PENDING_TRANSACTIONS]: function(args, done) {
      const beginTime = Date.now();
      const result = node.tp.transactions;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_TRANSACTION_POOL_SIZE_UTILIZATION]: function(args, done) {
      const beginTime = Date.now();
      const address = args.address;
      const txPoolSizeUtil = node.getTxPoolSizeUtilization(address);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: txPoolSizeUtil }));
    },

    [JSON_RPC_METHODS.AIN_GET_TRANSACTION_BY_HASH]: function(args, done) {
      const beginTime = Date.now();
      const transactionInfo = node.getTransactionByHash(args.hash);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: transactionInfo }));
    },

    [JSON_RPC_METHODS.AIN_GET_TRANSACTION_BY_BLOCK_HASH_AND_INDEX]: function(args, done) {
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

    [JSON_RPC_METHODS.AIN_GET_TRANSACTION_BY_BLOCK_NUMBER_AND_INDEX]: function(args, done) {
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

    [JSON_RPC_METHODS.AIN_DRYRUN_SIGNED_TRANSACTION]: function(args, done) {
      executeTransactionOnNode(node, p2pServer, args, done, true);
    },

    [JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION]: function(args, done) {
      executeTransactionOnNode(node, p2pServer, args, done, false);
    },

    [JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION_BATCH]: function(args, done) {
      const beginTime = Date.now();
      const batchTxListSizeLimit = node.getBlockchainParam('resource/batch_tx_list_size_limit');
      if (!CommonUtil.isArray(args.tx_list) || CommonUtil.isEmpty(args.tx_list)) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null,
          code: JsonRpcApiResultCode.BATCH_INVALID_FORMAT,
          message: 'Invalid batch transaction format.'
        }));
      } else if (args.tx_list.length > batchTxListSizeLimit) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null,
          code: JsonRpcApiResultCode.BATCH_TX_LIST_EXCEEDS_SIZE_LIMIT,
          message: `Batch transaction list size exceeds its limit: ${batchTxListSizeLimit}.`
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
              result: null,
              code: JsonRpcApiResultCode.BATCH_TX_EXCEEDS_SIZE_LIMIT,
              message: `Transaction[${i}]'s size exceededs its limit: ${txBytesLimit} bytes.`
            }));
            return;
          } else if (!tx.tx_body || !tx.signature) {
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
            done(null, JsonRpcUtil.addProtocolVersion({
              result: null,
              code: JsonRpcApiResultCode.BATCH_TX_MISSING_PROPERTIES,
              message: `Missing properties of transaction[${i}].`
            }));
            return;
          }
          const createdTx = Transaction.create(tx.tx_body, tx.signature, chainId);
          if (!createdTx) {
            const latency = Date.now() - beginTime;
            trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
            done(null, JsonRpcUtil.addProtocolVersion({
              result: null,
              code: JsonRpcApiResultCode.BATCH_TX_INVALID_FORMAT,
              message: `Invalid format of transaction[${i}].`
            }));
            return;
          }
          if (!NodeConfigs.LIGHTWEIGHT &&
              NodeConfigs.ENABLE_EARLY_TX_SIG_VERIF &&
              !Transaction.verifyTransaction(createdTx, chainId)) {
            done(null, JsonRpcUtil.addProtocolVersion({
              result: null,
              code: JsonRpcApiResultCode.BATCH_TX_INVALID_SIGNATURE,
              message: `Invalid signature of transaction[${i}].`
            }));
            return;
          }
          txList.push(createdTx);
        }
        const result = p2pServer.executeAndBroadcastTransaction({ tx_list: txList });
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }
    },
  };
};
