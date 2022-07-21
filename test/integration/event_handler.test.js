const chai = require('chai');
const expect = chai.expect;
const _ = require('lodash');
const spawn = require('child_process').spawn;
const syncRequest = require('sync-request');
const rimraf = require('rimraf');
const WebSocket = require('ws');
const {
  BlockchainConsts,
  BlockchainParams,
  NodeConfigs,
  BlockchainEventMessageTypes,
  BlockchainEventTypes,
  TransactionStates,
  FilterDeletionReasons,
} = require('../../common/constants');
const CommonUtil = require('../../common/common-util');
const {
  parseOrLog,
  setUpApp,
  waitUntilNetworkIsReady,
} = require('../test-util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');
const SET_VALUE_ENDPOINT = '/set_value';
const PROJECT_ROOT = require('path').dirname(__filename) + '/../../';
const TRACKER_SERVER = PROJECT_ROOT + 'tracker-server/index.js';
const APP_SERVER = PROJECT_ROOT + 'client/index.js';
const EVENT_HANDLER_NODE_INDEX = 2;
const ENV_VARIABLES = [
  {
    UNSAFE_PRIVATE_KEY: 'b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96',
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes', PORT: 8081, P2P_PORT: 5001,
    ENABLE_GAS_FEE_WORKAROUND: true, ENABLE_EXPRESS_RATE_LIMIT: false,
  },
  {
    UNSAFE_PRIVATE_KEY: '921cc48e48c876fc6ed1eb02a76ad520e8d16a91487f9c7e03441da8e35a0947',
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes', PORT: 8082, P2P_PORT: 5002,
    ENABLE_GAS_FEE_WORKAROUND: true, ENABLE_EXPRESS_RATE_LIMIT: false,
  },
  {
    UNSAFE_PRIVATE_KEY: '41e6e5718188ce9afd25e4b386482ac2c5272c49a622d8d217887bce21dce560',
    BLOCKCHAIN_CONFIGS_DIR: 'blockchain-configs/3-nodes', PORT: 8083, P2P_PORT: 5003,
    ENABLE_GAS_FEE_WORKAROUND: true, ENABLE_EXPRESS_RATE_LIMIT: false,
    ENABLE_EVENT_HANDLER: true, EVENT_HANDLER_PORT: 6000,
  },
];

const serverList = [
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:8083',
];
const testAppName = 'test';
const epochMs = _.get(BlockchainParams, 'genesis.epoch_ms', 30000);
const dummyTxHash = '0x9ac44b45853c2244715528f89072a337540c909c36bab4c9ed2fd7b7dbab47b2';

function startServer(application, serverName, envVars, stdioInherit = false) {
  const options = {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      ...envVars,
    },
  };
  if (stdioInherit) {
    options.stdio = 'inherit';
  }
  return spawn('node', [application], options).on('error', (err) => {
    console.error(`Failed to start ${serverName} with error: ${err.message}`);
  });
}

function getEventHandlerNetworkInfo() {
  return _.get(parseOrLog(syncRequest('POST', serverList[EVENT_HANDLER_NODE_INDEX] + '/json-rpc', {
    json: {
      jsonrpc: '2.0', method: JSON_RPC_METHODS.NET_GET_EVENT_HANDLER_NETWORK_INFO, id: 0,
      params: { protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION },
    },
  }).body.toString('utf-8')), 'result.result');
}

function getEventHandlerChannelInfo() {
  return _.get(parseOrLog(syncRequest('POST', serverList[EVENT_HANDLER_NODE_INDEX] + '/json-rpc', {
    json: {
      jsonrpc: '2.0', method: JSON_RPC_METHODS.AIN_GET_EVENT_HANDLER_CHANNEL_INFO, id: 0,
      params: { protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION },
    },
  }).body.toString('utf-8')), 'result.result');
}

function getEventHandlerFilterInfo() {
  return _.get(parseOrLog(syncRequest('POST', serverList[EVENT_HANDLER_NODE_INDEX] + '/json-rpc', {
    json: {
      jsonrpc: '2.0', method: JSON_RPC_METHODS.AIN_GET_EVENT_HANDLER_FILTER_INFO, id: 0,
      params: { protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION },
    },
  }).body.toString('utf-8')), 'result.result');
}

function connectEventHandler() {
  const eventHandlerNetworkInfo = getEventHandlerNetworkInfo();
  const url = _.get(eventHandlerNetworkInfo, 'url', null);
  expect(url).to.not.equal(null);
  return new WebSocket(url, [], {});
}

function registerFilter(wsClient, filterId, eventType, config) {
  wsClient.send(JSON.stringify({
    type: BlockchainEventMessageTypes.REGISTER_FILTER,
    data: {
      id: filterId,
      type: eventType,
      config: config,
    },
  }));
}

function deregisterFilter(wsClient, filterId) {
  wsClient.send(JSON.stringify({
    type: BlockchainEventMessageTypes.DEREGISTER_FILTER,
    data: {
      id: filterId,
    },
  }));
}

function setValue(nodeEndpoint, ref, value) {
  return parseOrLog(syncRequest('POST', nodeEndpoint + SET_VALUE_ENDPOINT, {
    json: {
      ref: ref, value: value,
    },
  }).body.toString('utf-8'));
}

// TODO(cshcomcom): Add to deploy_test_gcp.sh
describe('Event Handler Test', function() {
  const server_proc_list = [];
  let tracker_proc;

  before(async function() {
    rimraf.sync(NodeConfigs.CHAINS_DIR);
    rimraf.sync(NodeConfigs.SNAPSHOTS_ROOT_DIR);
    tracker_proc = startServer(TRACKER_SERVER, 'tracker server', { CONSOLE_LOG: false }, true);
    for (const [idx, env] of ENV_VARIABLES.entries()) {
      await CommonUtil.sleep(idx === 1 ? 3000 : 10000);
      const proc = startServer(APP_SERVER, `server${idx + 1}`, env, true);
      server_proc_list.push(proc);
    }
    await waitUntilNetworkIsReady(serverList);

    const serverAddrList = [];
    for (const server of serverList) {
      serverAddrList.push(parseOrLog(syncRequest(
          'GET', server + '/get_address').body.toString('utf-8')).result);
    }

    await setUpApp(testAppName, serverList, {
      admin: {
        [serverAddrList[0]]: true,
        [serverAddrList[1]]: true,
        [serverAddrList[2]]: true,
      },
    });
  });

  after(function() {
    tracker_proc.kill();
    for (const server_proc of server_proc_list) {
      server_proc.kill();
    }
    rimraf.sync(NodeConfigs.CHAINS_DIR);
    rimraf.sync(NodeConfigs.SNAPSHOTS_ROOT_DIR);
  });

  describe('Full flow', () => {
    let wsClient = null;
    let filterId = null;

    it('Connect to event handler & check number of channels === 1', async function() {
      // Connect to event handler
      wsClient = await connectEventHandler();
      await CommonUtil.sleep(5000); // Wait connecting
      expect(wsClient.readyState).to.equal(1); // OPEN

      // Check number of channels === 1
      const eventHandlerChannelInfo = getEventHandlerChannelInfo();
      expect(Object.keys(eventHandlerChannelInfo).length).to.equal(1);
    });

    it('Register filter & check number of filters === 1', async function() {
      // Register filter
      filterId = Date.now();
      const config = {
        block_number: null,
      };
      registerFilter(wsClient, filterId, BlockchainEventTypes.BLOCK_FINALIZED, config);

      // Check number of filters === 1
      const eventHandlerFilterInfo = getEventHandlerFilterInfo();
      expect(Object.keys(eventHandlerFilterInfo).length).to.equal(1);
    });

    it('Wait BLOCK_FINALIZED events', function(done) {
      this.timeout(3 * epochMs);
      wsClient.once('message', (message) => {
        const parsedMessage = JSON.parse(message);
        const messageType = parsedMessage.type;
        const eventType = _.get(parsedMessage, 'data.type');
        if (messageType === BlockchainEventMessageTypes.EMIT_EVENT &&
            eventType === BlockchainEventTypes.BLOCK_FINALIZED) {
          done();
        }
      });
    });

    it('Deregister filter & check number of filters === 0', async function() {
      // Deregister filter
      deregisterFilter(wsClient, filterId);
      await CommonUtil.sleep(5000); // Wait deleting

      // Check number of filters === 0
      const eventHandlerFilterInfo = getEventHandlerFilterInfo();
      expect(Object.keys(eventHandlerFilterInfo).length).to.equal(0);
    });

    it('Disconnect & check number of channels === 0', async function() {
      // Disconnect
      wsClient.terminate();
      await CommonUtil.sleep(5000); // Wait terminating
      expect(wsClient.readyState).to.equal(3); // CLOSED

      // Check number of channels === 0
      const eventHandlerChannelInfo = getEventHandlerChannelInfo();
      expect(Object.keys(eventHandlerChannelInfo).length).to.equal(0);
    });
  });

  describe('Events', function() {
    let wsClient = null;

    beforeEach(async function() {
      wsClient = await connectEventHandler();
      await CommonUtil.sleep(5000); // Wait connecting
    });

    afterEach(async function() {
      wsClient.terminate();
      await CommonUtil.sleep(5000); // Wait terminating
    });

    it('BLOCK_FINALIZED', function(done) {
      this.timeout(3 * epochMs);
      const filterId = Date.now();
      const config = {
        block_number: null,
      };
      registerFilter(wsClient, filterId, BlockchainEventTypes.BLOCK_FINALIZED, config);
      wsClient.once('message', (message) => {
        const parsedMessage = JSON.parse(message);
        const messageType = parsedMessage.type;
        const eventType = _.get(parsedMessage, 'data.type');
        if (messageType === BlockchainEventMessageTypes.EMIT_EVENT &&
            eventType === BlockchainEventTypes.BLOCK_FINALIZED) {
          done();
        }
      });
    });

    it('VALUE_CHANGED', function(done) {
      this.timeout(10 * epochMs);
      const filterId = Date.now();
      const targetPath = `/apps/${testAppName}`;
      const config = {
        path: targetPath,
      };
      registerFilter(wsClient, filterId, BlockchainEventTypes.VALUE_CHANGED, config);
      wsClient.once('message', (message) => {
        const parsedMessage = JSON.parse(message);
        const messageType = parsedMessage.type;
        const eventType = _.get(parsedMessage, 'data.type');
        if (messageType === BlockchainEventMessageTypes.EMIT_EVENT &&
            eventType === BlockchainEventTypes.VALUE_CHANGED) {
          done();
        }
      });
      setValue(serverList[EVENT_HANDLER_NODE_INDEX], targetPath, 'dummy');
    });

    describe('TX_STATE_CHANGED', () => {
      it('send valid transaction', function(done) {
        this.timeout(10 * epochMs);
        const filterId = Date.now();
        const targetPath = `/apps/${testAppName}`;
        const txResult = setValue(serverList[EVENT_HANDLER_NODE_INDEX], targetPath, 'change')
            .result;
        const config = {
          tx_hash: txResult.tx_hash,
          timeout: 10 * epochMs
        };
        registerFilter(wsClient, filterId, BlockchainEventTypes.TX_STATE_CHANGED, config);
        wsClient.once('message', (message) => {
          const parsedMessage = JSON.parse(message);
          const messageType = parsedMessage.type;
          const eventType = _.get(parsedMessage, 'data.type');
          const txState = _.get(parsedMessage, 'data.payload.tx_state');
          if (messageType === BlockchainEventMessageTypes.EMIT_EVENT &&
              eventType === BlockchainEventTypes.TX_STATE_CHANGED) {
            expect(txState.before).to.equal(TransactionStates.EXECUTED);
            expect(txState.after).to.equal(TransactionStates.FINALIZED);
            done();
          }
        });
      });

      it('send invalid transaction', function(done) {
        this.timeout(10 * epochMs);
        const filterId = Date.now();
        const invalidTargetPath = `/apps/dummy`;
        const txResult = setValue(serverList[EVENT_HANDLER_NODE_INDEX], invalidTargetPath, 'change')
            .result;
        const config = {
          tx_hash: txResult.tx_hash,
          timeout: 10 * epochMs
        };
        registerFilter(wsClient, filterId, BlockchainEventTypes.TX_STATE_CHANGED, config);
        wsClient.once('message', (message) => {
          const parsedMessage = JSON.parse(message);
          const messageType = parsedMessage.type;
          const eventType = _.get(parsedMessage, 'data.type');
          const txState = _.get(parsedMessage, 'data.payload.tx_state');
          if (messageType === BlockchainEventMessageTypes.EMIT_EVENT &&
              eventType === BlockchainEventTypes.TX_STATE_CHANGED) {
            expect(txState.before).to.equal(TransactionStates.PENDING);
            expect(txState.after).to.equal(TransactionStates.REVERTED);
            done();
          }
        });
      });
    });

    describe('FILTER_DELETED', () => {
      it('deleted because of timeout', function(done) {
        this.timeout(3 * epochMs);
        const filterId = Date.now();
        const config = {
          tx_hash: dummyTxHash,
          timeout: epochMs
        };
        registerFilter(wsClient, filterId, BlockchainEventTypes.TX_STATE_CHANGED, config);
        wsClient.on('message', (message) => {
          const parsedMessage = JSON.parse(message);
          const messageType = parsedMessage.type;
          const eventType = _.get(parsedMessage, 'data.type');
          const payload = _.get(parsedMessage, 'data.payload');
          if (messageType === BlockchainEventMessageTypes.EMIT_EVENT &&
              eventType === BlockchainEventTypes.FILTER_DELETED) {
            expect(payload.cause).to.equal(FilterDeletionReasons.TIMED_OUT);
            expect(payload.filter_id).to.equal(filterId.toString());
            done();
          }
        });
      });

      it('deleted because of permanent state', function(done) {
        this.timeout(10 * epochMs);
        const filterId = Date.now();
        const targetPath = `/apps/${testAppName}`;
        const txResult = setValue(serverList[EVENT_HANDLER_NODE_INDEX], targetPath, 'change')
            .result;
        const config = {
          tx_hash: txResult.tx_hash,
          timeout: 10 * epochMs
        };
        registerFilter(wsClient, filterId, BlockchainEventTypes.TX_STATE_CHANGED, config);
        wsClient.on('message', (message) => {
          const parsedMessage = JSON.parse(message);
          const messageType = parsedMessage.type;
          const eventType = _.get(parsedMessage, 'data.type');
          const payload = _.get(parsedMessage, 'data.payload');
          if (messageType === BlockchainEventMessageTypes.EMIT_EVENT &&
              eventType === BlockchainEventTypes.FILTER_DELETED) {
            expect(payload.cause).to.equal(FilterDeletionReasons.PERMANENT_STATE);
            expect(payload.filter_id).to.equal(filterId.toString());
            done();
          }
        });
      });
    });
  });
});
