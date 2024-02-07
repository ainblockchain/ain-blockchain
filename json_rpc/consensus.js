const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

module.exports = function getBlockApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_GET_VALIDATOR_INFO]: function(args, done) {
      const beginTime = Date.now();
      const addr = args.address;
      const isWhitelisted = node.db.getValue(PathUtil.getConsensusProposerWhitelistAddrPath(addr)) || false;
      const stake = node.db.getValue(PathUtil.getServiceAccountBalancePath(addr)) || 0;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({
        result: {
          isWhitelisted,
          stake,
        }
      }));
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

    [JSON_RPC_METHODS.AIN_GET_PROPOSER_BY_NUMBER]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByNumber(args.number);
      const result = block ? block.proposer : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },

    [JSON_RPC_METHODS.AIN_GET_PROPOSER_BY_HASH]: function(args, done) {
      const beginTime = Date.now();
      const block = node.bc.getBlockByHash(args.hash);
      const result = block ? block.proposer : null;
      const latency = Date.now() - beginTime;
      trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
      done(null, JsonRpcUtil.addProtocolVersion({ result }));
    },
  };
};
