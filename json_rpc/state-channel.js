'use strict';

const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');
const { getStateChannel, getStateChannelEvents } = require('../state-channel');

module.exports = function getStateChannelApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_GET_STATE_CHANNEL]: function(args, done) {
      const beginTime = Date.now();
      try {
        const result = getStateChannel(node, args.channel_id || args.channelId);
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, Date.now() - beginTime);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      } catch (error) {
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, Date.now() - beginTime);
        done(null, JsonRpcUtil.addProtocolVersion({ result: null, code: -32602, message: error.message }));
      }
    },

    [JSON_RPC_METHODS.AIN_GET_STATE_CHANNEL_EVENTS]: function(args, done) {
      const beginTime = Date.now();
      try {
        const result = getStateChannelEvents(node, args.channel_id || args.channelId, args.from, args.to);
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, Date.now() - beginTime);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      } catch (error) {
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, Date.now() - beginTime);
        done(null, JsonRpcUtil.addProtocolVersion({ result: null, code: -32602, message: error.message }));
      }
    },
  };
};
