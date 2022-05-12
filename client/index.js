'use strict';

const logger = new (require('../logger'))('CLIENT');

const express = require('express');
// NOTE(liayoo): To use async/await (ref: https://github.com/tedeh/jayson#promises)
const jayson = require('jayson/promise');
const BlockchainNode = require('../node');
const P2pClient = require('../p2p');
const EventHandler = require('../event-handler');
const CommonUtil = require('../common/common-util');
const VersionUtil = require('../common/version-util');
const { sendGetRequest } = require('../common/network-util');
const {
  BlockchainConsts,
  NodeConfigs,
  WriteDbOperations,
  TrafficEventTypes,
  trafficStatsManager,
  DevFlags
} = require('../common/constants');
const { DevClientApiResultCode } = require('../common/result-code');
const Middleware = require('./middleware');

const MAX_BLOCKS = 20;

const app = express();
// NOTE(minsulee2): complex express middleware is now built at middleware.js
const middleware = new Middleware();
middleware.printAll();
app.use(middleware.expressJsonRequestBodySizeLimiter());
app.use(middleware.expressUrlencdedRequestBodySizeLimiter());
app.use(middleware.corsLimiter());
app.use(middleware.ipWhitelistLimiter());

const eventHandler = NodeConfigs.ENABLE_EVENT_HANDLER === true ? new EventHandler() : null;
const node = new BlockchainNode(null, eventHandler);
// NOTE(platfowner): This is very useful when the server dies without any logs.
process.on('uncaughtException', function(err) {
  logger.error(err);
});

process.on('SIGINT', (_) => {
  logger.info('Stopping the blockchain client....');
  p2pClient.stop();
  process.exit(1);
});

const { min, max } = VersionUtil.matchVersions(
    BlockchainConsts.PROTOCOL_VERSION_MAP, BlockchainConsts.CURRENT_PROTOCOL_VERSION);
const minProtocolVersion = min === undefined ? BlockchainConsts.CURRENT_PROTOCOL_VERSION : min;
const maxProtocolVersion = max;
const p2pClient = new P2pClient(node, minProtocolVersion, maxProtocolVersion);
const p2pServer = p2pClient.server;

const jsonRpcApis = require('../json_rpc')(
    node, p2pServer, eventHandler, minProtocolVersion, maxProtocolVersion);

app.post(
  '/json-rpc',
  VersionUtil.validateVersion.bind({ minProtocolVersion, maxProtocolVersion }),
  middleware.jsonRpcLimiter(),
  jayson.server(jsonRpcApis).middleware()
);

app.get('/', middleware.readLimiter(), (req, res, next) => {
  const welcome = `[Welcome to AIN Blockchain Node]\n\n- CURRENT_PROTOCOL_VERSION: ${BlockchainConsts.CURRENT_PROTOCOL_VERSION}\n- DATA_PROTOCOL_VERSION: ${BlockchainConsts.DATA_PROTOCOL_VERSION}\n- CONSENSUS_PROTOCOL_VERSION: ${BlockchainConsts.CONSENSUS_PROTOCOL_VERSION}\n\nDevelopers Guide: ${NodeConfigs.BLOCKCHAIN_GUIDE_URL}`;
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(welcome)
    .end();
});

app.get('/health_check', middleware.readLimiter(), (req, res, next) => {
  const result = p2pServer.getNodeHealth();
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(result)
    .end();
});

// Exports metrics for Prometheus.
app.get('/metrics', middleware.readLimiter(), async (req, res, next) => {
  const beginTime = Date.now();
  const status = p2pClient.getStatus();
  const result = CommonUtil.objToMetrics(status);
  if (DevFlags.enableNetworkTopologyLoggingForUnhealthyConsensus) {
    const consensusStatusHealth = status.consensusStatus.health;
    if (!consensusStatusHealth) {
      await sendGetRequest(
          NodeConfigs.TRACKER_UPDATE_JSON_RPC_URL, 'getNetworkTopology', { isError: true });
    }
  }
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(result)
    .end();
});

// Used in wait_until_node_sync_gcp.sh
app.get('/last_block_number', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.bc.lastBlockNumber();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

/**
 * Dev Client GET APIs (available to whitelisted IPs)
 */

app.get('/get_value', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getValue(req.query.ref, CommonUtil.toGetOptions(req.query, true));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.get('/get_function', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getFunction(req.query.ref, CommonUtil.toGetOptions(req.query, true));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.get('/get_rule', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getRule(req.query.ref, CommonUtil.toGetOptions(req.query, true));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.get('/get_owner', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getOwner(req.query.ref, CommonUtil.toGetOptions(req.query, true));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

/**
 * Returns the state proof at the given full database path.
 */
app.get('/get_state_proof', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getStateProof(req.query.ref);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

/**
 * Returns the state proof hash at the given full database path.
 */
app.get('/get_proof_hash', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getProofHash(req.query.ref);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

/**
 * Returns the state information at the given full database path.
 */
app.get('/get_state_info', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getStateInfo(req.query.ref);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

/**
 * Returns the state usage of the given app.
 */
app.get('/get_state_usage', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.getStateUsageWithStakingInfo(req.query.app_name);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.get('/match_function', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.matchFunction(req.query.ref, CommonUtil.toMatchOrEvalOptions(req.query, true));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.get('/match_rule', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.matchRule(req.query.ref, CommonUtil.toMatchOrEvalOptions(req.query, true));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.get('/match_owner', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.matchOwner(req.query.ref, CommonUtil.toMatchOrEvalOptions(req.query, true));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.post('/eval_rule', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const body = req.body;
  const auth = {};
  if (body.address) {
    auth.addr = body.address;
  }
  if (body.fid) {
    auth.fid = body.fid;
  }
  const timestamp = body.timestamp || Date.now();
  const options = Object.assign(CommonUtil.toMatchOrEvalOptions(body, true), { timestamp });
  const result = node.db.evalRule(body.ref, body.value, auth, options);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.post('/eval_owner', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const body = req.body;
  const auth = {};
  if (body.address) {
    auth.addr = body.address;
  }
  if (body.fid) {
    auth.fid = body.fid;
  }
  const result = node.db.evalOwner(
      body.ref, body.permission, auth, CommonUtil.toMatchOrEvalOptions(body, true));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.post('/get', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.get(req.body.op_list);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.get('/status', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = p2pClient.getStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/node_status', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = p2pServer.getNodeStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/connection_status', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = p2pClient.getConnectionStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
})

app.get('/client_status', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = p2pClient.getClientStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
})

app.get('/blocks', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const blockEnd = node.bc.lastBlockNumber() + 1;
  const blockBegin = Math.max(blockEnd - MAX_BLOCKS, 0);
  const result = node.bc.getBlockList(blockBegin, blockEnd);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/last_block', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.bc.lastBlock();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/tx_pool', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = Object.fromEntries(node.tp.transactions);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/tx_tracker', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = Object.fromEntries(node.tp.transactionTracker);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/committed_nonce_tracker', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.tp.committedNonceTracker;
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/pending_nonce_tracker', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.tp.pendingNonceTracker;
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/protocol_versions', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = p2pClient.server.getProtocolInfo();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/state_versions', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = p2pServer.getStateVersionStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

// TODO(platfowner): Support for subtree snapshots (i.e. with ref path).
app.get('/get_final_state_snapshot', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = node.takeFinalStateSnapshot(CommonUtil.toGetOptions(req.query, true));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

// TODO(platfowner): Support for subtree snapshots (i.e. with ref path).
app.get('/get_final_radix_snapshot', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = node.takeFinalRadixSnapshot();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/tx_pool_size_util', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const address = req.query.address;
  const txPoolSizeUtil = node.getTxPoolSizeUtilization(address);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result: txPoolSizeUtil })
    .end();
});

app.get('/get_transaction', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const transactionInfo = node.getTransactionByHash(req.query.hash);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result: transactionInfo })
    .end();
});

app.get('/get_block_by_hash', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const block = node.bc.getBlockByHash(req.query.hash);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result: block })
    .end();
});

app.get('/get_block_by_number', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const block = node.bc.getBlockByNumber(req.query.number);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result: block })
    .end();
});

app.get('/get_block_info_by_number', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const blockInfo = node.bc.getBlockInfoByNumber(req.query.number);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result: blockInfo })
    .end();
});

app.get('/get_address', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.account ? node.account.address : null;
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_nonce', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.getNonceForAddr(req.query.address, req.query.from === 'pending');
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_timestamp', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.getTimestampForAddr(req.query.address, req.query.from === 'pending');
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/validate_app_name', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.validateAppName(req.query.app_name);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_sharding', middleware.readLimiter(), (req, res, next) => {
  const beginTime = Date.now();
  const result = node.getSharding();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({
      code: result !== null ? DevClientApiResultCode.SUCCESS : DevClientApiResultCode.FAILURE,
      result
    })
    .end();
});

app.get('/get_raw_consensus_status', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = p2pServer.consensus.getRawStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_consensus_status', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = p2pServer.consensus.getStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_network_id', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = p2pServer.node.getBlockchainParam('genesis/network_id');
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_chain_id', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = p2pServer.node.getBlockchainParam('genesis/chain_id');
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_config', middleware.readLimiter(), (req, res) => {
  const beginTime = Date.now();
  const result = p2pClient.getConfig();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

/**
 * Dev Client SET APIs (available to whitelisted IPs, if ENABLE_DEV_CLIENT_SET_API == true)
 */

if (NodeConfigs.ENABLE_DEV_CLIENT_SET_API) {
  app.post('/set_value', middleware.writeLimiter(), (req, res, next) => {
    const beginTime = Date.now();
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_VALUE));
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: CommonUtil.isFailedTx(result.result) ?
            DevClientApiResultCode.FAILURE : DevClientApiResultCode.SUCCESS,
        result
      })
      .end();
  });

  app.post('/inc_value', middleware.writeLimiter(), (req, res, next) => {
    const beginTime = Date.now();
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.INC_VALUE));
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: CommonUtil.isFailedTx(result.result) ?
            DevClientApiResultCode.FAILURE : DevClientApiResultCode.SUCCESS,
        result
      })
      .end();
  });

  app.post('/dec_value', middleware.writeLimiter(), (req, res, next) => {
    const beginTime = Date.now();
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.DEC_VALUE));
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: CommonUtil.isFailedTx(result.result) ?
            DevClientApiResultCode.FAILURE : DevClientApiResultCode.SUCCESS,
        result
      })
      .end();
  });

  app.post('/set_function', middleware.writeLimiter(), (req, res, next) => {
    const beginTime = Date.now();
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_FUNCTION));
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: CommonUtil.isFailedTx(result.result) ?
            DevClientApiResultCode.FAILURE : DevClientApiResultCode.SUCCESS,
        result
      })
      .end();
  });

  app.post('/set_rule', middleware.writeLimiter(), (req, res, next) => {
    const beginTime = Date.now();
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_RULE));
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: CommonUtil.isFailedTx(result.result) ?
            DevClientApiResultCode.FAILURE : DevClientApiResultCode.SUCCESS,
        result
      })
      .end();
  });

  app.post('/set_owner', middleware.writeLimiter(), (req, res, next) => {
    const beginTime = Date.now();
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_OWNER));
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: CommonUtil.isFailedTx(result.result) ?
            DevClientApiResultCode.FAILURE : DevClientApiResultCode.SUCCESS,
        result
      })
      .end();
  });

  // A custom address can be used as a devel method for bypassing the trasaction verification.
  // TODO(platfowner): Replace custom address with real signature.
  app.post('/set', middleware.writeLimiter(), (req, res, next) => {
    const beginTime = Date.now();
    const result = createAndExecuteTransaction(createMultiSetTxBody(req.body));
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: CommonUtil.isFailedTx(result.result) ?
            DevClientApiResultCode.FAILURE : DevClientApiResultCode.SUCCESS,
        result
      })
      .end();
  });

  app.post('/batch', middleware.writeLimiter(), (req, res, next) => {
    const beginTime = Date.now();
    const result = createAndExecuteTransaction(createBatchTxBody(req.body));
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: DevClientApiResultCode.SUCCESS, result })
      .end();
  });

  app.post('/sign_transaction', middleware.writeLimiter(), (req, res) => {
    const beginTime = Date.now();
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: DevClientApiResultCode.SUCCESS, result: node.createTransaction(req.body) })
      .end();
  })

  app.post('/broadcast_consensus_msg', middleware.writeLimiter(), (req, res) => {
    const beginTime = Date.now();
    p2pClient.broadcastConsensusMessage(req.body);
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: DevClientApiResultCode.SUCCESS, result: true })
      .end();
  });
}

if (eventHandler) {
  // NOTE(cshcomcom): For event handler load balancer! It doesn't mean healthy.
  app.get('/eh_load_balancer_health_check', middleware.readLimiter(), (req, res, next) => {
    const result = eventHandler.getEventHandlerHealth();
    res.status(200)
      .set('Content-Type', 'text/plain')
      .send(result)
      .end();
  });
}

const server = app.listen(NodeConfigs.PORT, () => {
  logger.info(`App listening on port ${NodeConfigs.PORT}`);
  logger.info(`Press Ctrl+C to quit.`);
});

server.keepAliveTimeout = 620 * 1000; // 620 seconds
server.headersTimeout = 630 * 1000; // 630 seconds

// Lets start this p2p client up so we look for peers in the network and listen for changes
// in either DATABASE or NUMBER OF SERVERS.
p2pClient.run();

module.exports = app;

function createAndExecuteTransaction(txBody) {
  const tx = node.createTransaction(txBody);
  if (!tx) {
    return {
      tx_hash: null,
      result: false,
    };
  }
  return p2pServer.executeAndBroadcastTransaction(tx);
}

function createSingleSetTxBody(input, opType) {
  const op = {
    type: opType,
    ref: input.ref,
    value: input.value,
  };
  if (input.is_global !== undefined) {
    op.is_global = input.is_global;
  }
  const txBody = {operation: op};
  if (input.address !== undefined) {
    txBody.address = input.address;
  }
  if (input.nonce !== undefined) {
    txBody.nonce = input.nonce;
  }
  if (input.timestamp !== undefined) {
    txBody.timestamp = input.timestamp;
  }
  if (input.gas_price !== undefined) {
    txBody.gas_price = input.gas_price;
  }
  if (input.billing !== undefined) {
    txBody.billing = input.billing;
  }
  return txBody;
}

function createMultiSetTxBody(input) {
  const txBody = {
    operation: {
      type: WriteDbOperations.SET,
      op_list: input.op_list,
    }
  };
  if (input.address !== undefined) {
    txBody.address = input.address;
  }
  if (input.nonce !== undefined) {
    txBody.nonce = input.nonce;
  }
  if (input.timestamp !== undefined) {
    txBody.timestamp = input.timestamp;
  }
  if (input.gas_price !== undefined) {
    txBody.gas_price = input.gas_price;
  }
  if (input.billing !== undefined) {
    txBody.billing = input.billing;
  }
  return txBody;
}

function createBatchTxBody(input) {
  const txList = [];
  for (const tx of input.tx_list) {
    txList.push(tx);
  }
  return { tx_body_list: txList };
}
