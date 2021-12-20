const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./util');

module.exports = function getBlockApis(node) {
  return {
    ain_getBlockList: function(args, done) {
      const beginTime = Date.now();
      const blocks = node.bc.getBlockList(args.from, args.to);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: blocks }));
    },

    ain_getLastBlock: function(args, done) {
      const beginTime = Date.now();
      const result = node.bc.lastBlock();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getLastBlockNumber: function(args, done) {
      const beginTime = Date.now();
      const result = node.bc.lastBlockNumber();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getBlockHeadersList: function(args, done) {
      const beginTime = Date.now();
      const blocks = node.bc.getBlockList(args.from, args.to);
      const blockHeaders = [];
      blocks.forEach((block) => {
        blockHeaders.push(block.header);
      });
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: blockHeaders }));
    },

    ain_getBlockByHash: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      if (block && !args.getFullTransactions) {
        block.transactions = JsonRpcUtil.extractTransactionHashes(block);
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: block }));
    },

    ain_getBlockByNumber: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      if (!block || args.getFullTransactions) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result: block }));
      } else {
        block.transactions = JsonRpcUtil.extractTransactionHashes(block);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result: block }));
      }
    },

    ain_getProposerByHash: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.proposer : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getProposerByNumber: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.proposer : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getValidatorsByNumber: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.validators : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getValidatorsByHash: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.validators : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getBlockTransactionCountByHash: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.transactions.length : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    ain_getBlockTransactionCountByNumber: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.transactions.length : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
