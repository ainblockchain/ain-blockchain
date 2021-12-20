const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./util');

module.exports = function getTransactionApis(node) {
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
  };
};
