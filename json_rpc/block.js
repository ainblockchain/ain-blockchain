const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

module.exports = function getBlockApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_GET_LAST_BLOCK]: function(args, done) {
      const beginTime = Date.now();
      const result = node.bc.lastBlock();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_LAST_BLOCK_NUMBER]: function(args, done) {
      const beginTime = Date.now();
      const result = node.bc.lastBlockNumber();
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_BLOCK_BY_NUMBER]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      if (block && !CommonUtil.toBool(args.getFullTransactions)) {
        block.transactions = JsonRpcUtil.extractTransactionHashes(block);
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: block }));
    },

    [JSON_RPC_METHODS.AIN_GET_BLOCK_BY_HASH]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      if (block && !CommonUtil.toBool(args.getFullTransactions)) {
        block.transactions = JsonRpcUtil.extractTransactionHashes(block);
      }
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: block }));
    },

    [JSON_RPC_METHODS.AIN_GET_BLOCK_LIST]: function(args, done) {
      const beginTime = Date.now();
      const blocks = node.bc.getBlockList(args.from, args.to);
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result: blocks }));
    },

    [JSON_RPC_METHODS.AIN_GET_BLOCK_HEADERS_LIST]: function(args, done) {
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

    [JSON_RPC_METHODS.AIN_GET_PROPOSER_BY_HASH]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.proposer : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_PROPOSER_BY_NUMBER]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.proposer : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_VALIDATORS_BY_NUMBER]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.validators : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_VALIDATORS_BY_HASH]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.validators : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_BLOCK_TRANSACTION_COUNT_BY_HASH]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.transactions.length : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_BLOCK_TRANSACTION_COUNT_BY_NUMBER]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.transactions.length : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
