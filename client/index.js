'use strict';

const express = require('express');
const cors = require('cors');
// NOTE(liayoo): To use async/await (ref: https://github.com/tedeh/jayson#promises)
const jayson = require('jayson/promise');
const _ = require('lodash');
const logger = require('../logger')('CLIENT');
const BlockchainNode = require('../node');
const P2pClient = require('../p2p');
const CommonUtil = require('../common/common-util');
const VersionUtil = require('../common/version-util');
const {
  ENABLE_DEV_SET_CLIENT_API,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP,
  PORT,
  NETWORK_ID,
  CHAIN_ID,
  REQUEST_BODY_SIZE_LIMIT,
  CORS_WHITELIST,
  BlockchainNodeStates,
  WriteDbOperations,
  TrafficEventTypes,
  trafficStatsManager,
} = require('../common/constants');
const { ConsensusStates } = require('../consensus/constants');

const MAX_BLOCKS = 20;


const app = express();
app.use(express.json({ limit: REQUEST_BODY_SIZE_LIMIT }));
app.use(express.urlencoded({
  extended: true,
  limit: REQUEST_BODY_SIZE_LIMIT
}));
app.use(cors({ origin: CORS_WHITELIST }));


const node = new BlockchainNode();
// NOTE(platfowner): This is very useful when the server dies without any logs.
process.on('uncaughtException', function(err) {
  logger.error(err);
});

process.on('SIGINT', (_) => {
  logger.info('Stopping the blockchain client....');
  p2pClient.stop();
  process.exit(1);
});

const { min, max } = VersionUtil.matchVersions(PROTOCOL_VERSION_MAP, CURRENT_PROTOCOL_VERSION);
const minProtocolVersion = min === undefined ? CURRENT_PROTOCOL_VERSION : min;
const maxProtocolVersion = max;
const p2pClient = new P2pClient(node, minProtocolVersion, maxProtocolVersion);
const p2pServer = p2pClient.server;

const jsonRpcMethods = require('../json_rpc')(
    node, p2pServer, minProtocolVersion, maxProtocolVersion);

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

app.post(
  '/json-rpc',
  VersionUtil.validateVersion.bind({ minProtocolVersion, maxProtocolVersion }),
  jayson.server(jsonRpcMethods).middleware()
);

app.get('/', (req, res, next) => {
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send('Welcome to AIN Blockchain Node')
    .end();
});

app.get('/health_check', (req, res, next) => {
  const nodeStatus = p2pServer.getNodeStatus();
  const consensusStatus = p2pServer.consensus.getStatus();
  const result = nodeStatus.state === BlockchainNodeStates.SERVING &&
      consensusStatus.state === ConsensusStates.RUNNING &&
      consensusStatus.health === true;
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(result)
    .end();
});

// Exports metrics for Prometheus.
app.get('/metrics', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = CommonUtil.objToMetrics(p2pClient.getStatus());
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(result)
    .end();
});

app.get('/get_value', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.getValue(req.query.ref, CommonUtil.toGetOptions(req.query));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/get_function', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.getFunction(req.query.ref, CommonUtil.toGetOptions(req.query));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/get_rule', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.getRule(req.query.ref, CommonUtil.toGetOptions(req.query));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/get_owner', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.getOwner(req.query.ref, CommonUtil.toGetOptions(req.query));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

/**
 * Returns the state proof at the given full database path.
 */
app.get('/get_state_proof', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.getStateProof(req.query.ref);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

/**
 * Returns the state proof hash at the given full database path.
 */
app.get('/get_proof_hash', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.getProofHash(req.query.ref);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

/**
 * Returns the state information at the given full database path.
 */
app.get('/get_state_info', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.getStateInfo(req.query.ref);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

/**
 * Returns the state usage of the given app.
 */
app.get('/get_state_usage', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.getStateUsage(req.query.app_name);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/match_function', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.matchFunction(req.query.ref, CommonUtil.toMatchOrEvalOptions(req.query));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/match_rule', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.matchRule(req.query.ref, CommonUtil.toMatchOrEvalOptions(req.query));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/match_owner', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.matchOwner(req.query.ref, CommonUtil.toMatchOrEvalOptions(req.query));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.post('/eval_rule', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
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
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.post('/eval_owner', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
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
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.post('/get', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.db.get(req.body.op_list);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

if (ENABLE_DEV_SET_CLIENT_API) {
  app.post('/set_value', (req, res, next) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_VALUE));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: CommonUtil.isFailedTx(result.result) ? 1 : 0, result })
      .end();
  });

  app.post('/inc_value', (req, res, next) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.INC_VALUE));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: CommonUtil.isFailedTx(result.result) ? 1 : 0, result })
      .end();
  });

  app.post('/dec_value', (req, res, next) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.DEC_VALUE));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: CommonUtil.isFailedTx(result.result) ? 1 : 0, result })
      .end();
  });

  app.post('/set_function', (req, res, next) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_FUNCTION));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: CommonUtil.isFailedTx(result.result) ? 1 : 0, result })
      .end();
  });

  app.post('/set_rule', (req, res, next) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_RULE));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: CommonUtil.isFailedTx(result.result) ? 1 : 0, result })
      .end();
  });

  app.post('/set_owner', (req, res, next) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_OWNER));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: CommonUtil.isFailedTx(result.result) ? 1 : 0, result })
      .end();
  });

  // A custom address can be used as a devel method for bypassing the trasaction verification.
  // TODO(platfowner): Replace custom address with real signature.
  app.post('/set', (req, res, next) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    const result = createAndExecuteTransaction(createMultiSetTxBody(req.body));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: CommonUtil.isFailedTx(result.result) ? 1 : 0, result })
      .end();
  });

  app.post('/batch', (req, res, next) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    const result = createAndExecuteTransaction(createBatchTxBody(req.body));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: 0, result })
      .end();
  });

  app.post('/sign_transaction', (req, res) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: 0, result: node.createTransaction(req.body) })
      .end();
  })

  app.post('/broadcast_consensus_msg', (req, res) => {
    trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_SET);
    p2pClient.broadcastConsensusMessage(req.body);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({ code: 0, result: true })
      .end();
  });
}

app.get('/status', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = p2pClient.getStatus();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/node_status', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = p2pServer.getNodeStatus();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/connection_status', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = p2pClient.getConnectionStatus();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
})

app.get('/client_status', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = p2pClient.getClientStatus();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
})

app.get('/blocks', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const blockEnd = node.bc.lastBlockNumber() + 1;
  const blockBegin = Math.max(blockEnd - MAX_BLOCKS, 0);
  const result = node.bc.getBlockList(blockBegin, blockEnd);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/last_block', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.bc.lastBlock();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/last_block_number', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.bc.lastBlockNumber();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/tx_pool', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.tp.transactions;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/tx_tracker', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.tp.transactionTracker;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/committed_nonce_tracker', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.tp.committedNonceTracker;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/pending_nonce_tracker', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.tp.pendingNonceTracker;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/protocol_versions', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = p2pClient.server.getProtocolInfo();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/state_versions', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = p2pServer.getStateVersionStatus();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

// TODO(platfowner): Support for subtree dumping (i.e. with ref path).
app.get('/dump_final_db_states', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.dumpFinalDbStates(CommonUtil.toGetOptions(req.query));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/tx_pool_size_util', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const address = req.query.address;
  const txPoolSizeUtil = node.getTxPoolSizeUtilization(address);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result: txPoolSizeUtil })
    .end();
});

app.get('/get_transaction', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const transactionInfo = node.getTransactionByHash(req.query.hash);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result: transactionInfo })
    .end();
});

app.get('/get_block_by_hash', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const block = node.bc.getBlockByHash(req.query.hash);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result: block })
    .end();
});

app.get('/get_block_by_number', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const block = node.bc.getBlockByNumber(req.query.number);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result: block })
    .end();
});

app.get('/get_block_info_by_number', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const blockInfo = node.bc.getBlockInfoByNumber(req.query.number);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result: blockInfo })
    .end();
});

app.get('/get_address', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.account.address;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/get_nonce', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.getNonceForAddr(req.query.address, req.query.from === 'pending');
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/get_timestamp', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.getTimestampForAddr(req.query.address, req.query.from === 'pending');
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/get_sharding', (req, res, next) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = node.getSharding();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/get_raw_consensus_status', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = p2pServer.consensus.getRawStatus();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/get_consensus_status', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  const result = p2pServer.consensus.getStatus();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/get_network_id', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result: NETWORK_ID })
    .end();
});

app.get('/get_chain_id', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result: CHAIN_ID })
    .end();
});

app.get('/blockchain_config', (req, res) => {
  trafficStatsManager.addEvent(TrafficEventTypes.CLIENT_API_GET);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result: p2pServer.getBlockchainConfig() })
    .end();
});

// We will want changes in ports and the database to be broadcast across
// all instances so lets pass this info into the p2p server
const server = app.listen(PORT, () => {
  logger.info(`App listening on port ${PORT}`);
  logger.info(`Press Ctrl+C to quit.`);
});

server.keepAliveTimeout = 620 * 1000; // 620 seconds
server.headersTimeout = 630 * 1000; // 630 seconds

// Lets start this p2p client up so we look for peers in the network and listen for changes
// in either DATABASE or NUMBER OF SERVERS.
p2pClient.run();

module.exports = app;

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
