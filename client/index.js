'use strict';

const logger = new (require('../logger'))('CLIENT');

const express = require('express');
const cors = require('cors');
// NOTE(liayoo): To use async/await (ref: https://github.com/tedeh/jayson#promises)
const jayson = require('jayson/promise');
const rateLimit = require('express-rate-limit');
const ipWhitelist = require('ip-whitelist');
const matchUrl = require('match-url-wildcard');
const BlockchainNode = require('../node');
const P2pClient = require('../p2p');
const EventHandler = require('../event-handler');
const CommonUtil = require('../common/common-util');
const VersionUtil = require('../common/version-util');
const { convertIpv6ToIpv4 } = require('../common/network-util');
const {
  BlockchainConsts,
  WriteDbOperations,
  TrafficEventTypes,
  trafficStatsManager,
  NodeConfigs,
} = require('../common/constants');
const { DevClientApiResultCode } = require('../common/result-code');

const MAX_BLOCKS = 20;

const app = express();
app.use(express.json({ limit: NodeConfigs.REQUEST_BODY_SIZE_LIMIT }));
app.use(express.urlencoded({
  extended: true,
  limit: NodeConfigs.REQUEST_BODY_SIZE_LIMIT
}));
const corsOrigin = NodeConfigs.CORS_WHITELIST === '*' ?
    NodeConfigs.CORS_WHITELIST : CommonUtil.getRegexpList(NodeConfigs.CORS_WHITELIST);
app.use(cors({ origin: corsOrigin }));
if (NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT) {
  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60 // limit each IP to 60 requests per windowMs
  });
  app.use(limiter);
}

const eventHandler = NodeConfigs.ENABLE_EVENT_HANDLER === true ? new EventHandler() : null;
const node = new BlockchainNode(null, eventHandler);
// NOTE(platfowner): This is very useful when the server dies without any logs.
// process.on('uncaughtException', function(err) {
//   logger.error(err);
// });

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
  jayson.server(jsonRpcApis).middleware()
);

app.get('/', (req, res, next) => {
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send('Welcome to AIN Blockchain Node')
    .end();
});

app.get('/health_check', (req, res, next) => {
  const result = p2pServer.getNodeHealth();
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(result)
    .end();
});

// Exports metrics for Prometheus.
app.get('/metrics', (req, res, next) => {
  const beginTime = Date.now();
  const result = CommonUtil.objToMetrics(p2pClient.getStatus());
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(result)
    .end();
});

// Used in wait_until_node_sync_gcp.sh
app.get('/last_block_number', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.bc.lastBlockNumber();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.use(ipWhitelist((ip) => {
  return CommonUtil.isWildcard(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST) ||
      matchUrl(ip, NodeConfigs.DEV_CLIENT_API_IP_WHITELIST) ||
      matchUrl(convertIpv6ToIpv4(ip), NodeConfigs.DEV_CLIENT_API_IP_WHITELIST);
}));

/**
 * Dev Client GET APIs (available to whitelisted IPs)
 */

app.get('/get_value', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getValue(req.query.ref, CommonUtil.toGetOptions(req.query));
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

app.get('/get_function', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getFunction(req.query.ref, CommonUtil.toGetOptions(req.query));
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

app.get('/get_rule', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getRule(req.query.ref, CommonUtil.toGetOptions(req.query));
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

app.get('/get_owner', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.getOwner(req.query.ref, CommonUtil.toGetOptions(req.query));
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
app.get('/get_state_proof', (req, res, next) => {
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
app.get('/get_proof_hash', (req, res, next) => {
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
app.get('/get_state_info', (req, res, next) => {
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
app.get('/get_state_usage', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.getStateUsage(req.query.app_name);
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

app.get('/match_function', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.matchFunction(req.query.ref, CommonUtil.toMatchOrEvalOptions(req.query));
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

app.get('/match_rule', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.matchRule(req.query.ref, CommonUtil.toMatchOrEvalOptions(req.query));
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

app.get('/match_owner', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.db.matchOwner(req.query.ref, CommonUtil.toMatchOrEvalOptions(req.query));
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

app.post('/eval_rule', (req, res, next) => {
  const beginTime = Date.now();
  const body = req.body;
  const auth = {};
  if (body.address) {
    auth.addr = body.address;
  }
  if (body.fid) {
    auth.fid = body.fid;
  }
  const result = node.db.evalRule(
      body.ref, body.value, auth, body.timestamp || Date.now(),
      CommonUtil.toMatchOrEvalOptions(body));
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

app.post('/eval_owner', (req, res, next) => {
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
      body.ref, body.permission, auth, CommonUtil.toMatchOrEvalOptions(body));
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

app.post('/get', (req, res, next) => {
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

app.get('/status', (req, res, next) => {
  const beginTime = Date.now();
  const result = p2pClient.getStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/node_status', (req, res, next) => {
  const beginTime = Date.now();
  const result = p2pServer.getNodeStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/connection_status', (req, res) => {
  const beginTime = Date.now();
  const result = p2pClient.getConnectionStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
})

app.get('/client_status', (req, res) => {
  const beginTime = Date.now();
  const result = p2pClient.getClientStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
})

app.get('/blocks', (req, res, next) => {
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

app.get('/last_block', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.bc.lastBlock();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/tx_pool', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.tp.transactions;
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/tx_tracker', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.tp.transactionTracker;
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/committed_nonce_tracker', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.tp.committedNonceTracker;
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/pending_nonce_tracker', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.tp.pendingNonceTracker;
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/protocol_versions', (req, res) => {
  const beginTime = Date.now();
  const result = p2pClient.server.getProtocolInfo();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/state_versions', (req, res) => {
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
app.get('/get_final_state_snapshot', (req, res) => {
  const beginTime = Date.now();
  const result = node.takeFinalStateSnapshot(CommonUtil.toGetOptions(req.query));
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

// TODO(platfowner): Support for subtree snapshots (i.e. with ref path).
app.get('/get_final_radix_snapshot', (req, res) => {
  const beginTime = Date.now();
  const result = node.takeFinalRadixSnapshot();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/tx_pool_size_util', (req, res) => {
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

app.get('/get_transaction', (req, res, next) => {
  const beginTime = Date.now();
  const transactionInfo = node.getTransactionByHash(req.query.hash);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result: transactionInfo })
    .end();
});

app.get('/get_block_by_hash', (req, res, next) => {
  const beginTime = Date.now();
  const block = node.bc.getBlockByHash(req.query.hash);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result: block })
    .end();
});

app.get('/get_block_by_number', (req, res) => {
  const beginTime = Date.now();
  const block = node.bc.getBlockByNumber(req.query.number);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result: block })
    .end();
});

app.get('/get_block_info_by_number', (req, res) => {
  const beginTime = Date.now();
  const blockInfo = node.bc.getBlockInfoByNumber(req.query.number);
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result: blockInfo })
    .end();
});

app.get('/get_address', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.account ? node.account.address : null;
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_nonce', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.getNonceForAddr(req.query.address, req.query.from === 'pending');
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_timestamp', (req, res, next) => {
  const beginTime = Date.now();
  const result = node.getTimestampForAddr(req.query.address, req.query.from === 'pending');
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_sharding', (req, res, next) => {
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

app.get('/get_raw_consensus_status', (req, res) => {
  const beginTime = Date.now();
  const result = p2pServer.consensus.getRawStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_consensus_status', (req, res) => {
  const beginTime = Date.now();
  const result = p2pServer.consensus.getStatus();
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_network_id', (req, res) => {
  const beginTime = Date.now();
  const result = p2pServer.node.getBlockchainParam('genesis/network_id');
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_chain_id', (req, res) => {
  const beginTime = Date.now();
  const result = p2pServer.node.getBlockchainParam('genesis/chain_id');
  const latency = Date.now() - beginTime;
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET, latency);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: DevClientApiResultCode.SUCCESS, result })
    .end();
});

app.get('/get_config', (req, res) => {
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
  app.post('/set_value', (req, res, next) => {
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

  app.post('/inc_value', (req, res, next) => {
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

  app.post('/dec_value', (req, res, next) => {
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

  app.post('/set_function', (req, res, next) => {
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

  app.post('/set_rule', (req, res, next) => {
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

  app.post('/set_owner', (req, res, next) => {
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
  app.post('/set', (req, res, next) => {
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

  app.post('/batch', (req, res, next) => {
    const beginTime = Date.now();
    const result = createAndExecuteTransaction(createBatchTxBody(req.body));
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: DevClientApiResultCode.SUCCESS, result })
      .end();
  });

  app.post('/sign_transaction', (req, res) => {
    const beginTime = Date.now();
    const latency = Date.now() - beginTime;
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET, latency);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: DevClientApiResultCode.SUCCESS, result: node.createTransaction(req.body) })
      .end();
  })

  app.post('/broadcast_consensus_msg', (req, res) => {
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
