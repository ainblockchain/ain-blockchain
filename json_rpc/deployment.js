const {
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const JsonRpcUtil = require('./json-rpc-util');
const { JSON_RPC_METHODS } = require('./constants');

module.exports = function getDeploymentApis(node) {
  return {
    [JSON_RPC_METHODS.AIN_DEPLOYMENT_DEPLOY]: function(args, done) {
      const beginTime = Date.now();
      const cm = node.containerManager;
      if (!cm || !cm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'Container manager not enabled'
        }));
        return;
      }
      cm.deploy(args).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_DEPLOYMENT_STATUS]: function(args, done) {
      const beginTime = Date.now();
      const cm = node.containerManager;
      if (!cm || !cm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'Container manager not enabled'
        }));
        return;
      }
      cm.status(args.name).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_DEPLOYMENT_STOP]: function(args, done) {
      const beginTime = Date.now();
      const cm = node.containerManager;
      if (!cm || !cm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'Container manager not enabled'
        }));
        return;
      }
      cm.stop(args.name).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_DEPLOYMENT_LOGS]: function(args, done) {
      const beginTime = Date.now();
      const cm = node.containerManager;
      if (!cm || !cm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'Container manager not enabled'
        }));
        return;
      }
      cm.logs(args.name, args.tail).then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      });
    },

    [JSON_RPC_METHODS.AIN_DEPLOYMENT_AUTHORIZE]: function(args, done) {
      const beginTime = Date.now();
      const cm = node.containerManager;
      if (!cm || !cm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'Container manager not enabled'
        }));
        return;
      }
      try {
        const result = cm.authorize(args.github_username);
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      } catch(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_SET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      }
    },

    [JSON_RPC_METHODS.AIN_DEPLOYMENT_LIST]: function(args, done) {
      const beginTime = Date.now();
      const cm = node.containerManager;
      if (!cm || !cm.isEnabled()) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30801, message: 'Container manager not enabled'
        }));
        return;
      }
      cm.list().then(function(result) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({ result }));
      }).catch(function(err) {
        const latency = Date.now() - beginTime;
        trafficStatsManager.addEvent(TrafficEventTypes.JSON_RPC_GET, latency);
        done(null, JsonRpcUtil.addProtocolVersion({
          result: null, code: 30802, message: err.message
        }));
      });
    },
  };
};
