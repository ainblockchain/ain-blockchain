'use strict';

const process = require('process');
const express = require('express');
const jayson = require('jayson');
const _ = require('lodash');
const logger = require('../logger')('CLIENT');
const BlockchainNode = require('../node');
const P2pClient = require('../p2p');
const ChainUtil = require('../common/chain-util');
const VersionUtil = require('../common/version-util');
const {
  ENABLE_DEV_CLIENT_API,
  CURRENT_PROTOCOL_VERSION,
  PROTOCOL_VERSION_MAP,
  PORT,
  BlockchainNodeStates,
  WriteDbOperations,
  TransactionStatus,
} = require('../common/constants');
const { ConsensusStatus } = require('../consensus/constants');

const MAX_BLOCKS = 20;

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

const app = express();
app.use(express.json()); // support json encoded bodies

const node = new BlockchainNode();
const p2pClient = new P2pClient(node, minProtocolVersion, maxProtocolVersion);
const p2pServer = p2pClient.server;

const jsonRpcMethods = require('../json_rpc')(
    node, p2pServer, minProtocolVersion, maxProtocolVersion);
app.post('/json-rpc', VersionUtil.validateVersion, jayson.server(jsonRpcMethods).middleware());

app.get('/', (req, res, next) => {
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send('Welcome to AIN Blockchain Node')
    .end();
});

app.get('/health_check', (req, res, next) => {
  const nodeStatus = p2pServer.getNodeStatus();
  const consensusState = p2pServer.consensus.getState();
  const result = nodeStatus.state === BlockchainNodeStates.SERVING &&
      consensusState.state === ConsensusStatus.RUNNING &&
      consensusState.health === true;
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(result)
    .end();
});

// Exports metrics for Prometheus.
app.get('/metrics', (req, res, next) => {
  const result = ChainUtil.objToMetrics(p2pClient.getStatus());
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(result)
    .end();
});

if (ENABLE_DEV_CLIENT_API) {
  app.get('/get_value', (req, res, next) => {
    const result = node.db.getValue(req.query.ref, ChainUtil.toBool(req.query.is_global));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  app.get('/get_function', (req, res, next) => {
    const result = node.db.getFunction(req.query.ref, ChainUtil.toBool(req.query.is_global));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  app.get('/get_rule', (req, res, next) => {
    const result = node.db.getRule(req.query.ref, ChainUtil.toBool(req.query.is_global));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  app.get('/get_owner', (req, res, next) => {
    const result = node.db.getOwner(req.query.ref, ChainUtil.toBool(req.query.is_global));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  /**
   * Returns the state proof at the given full database path.
   */
  app.get('/get_state_proof', (req, res, next) => {
    const result = node.db.getStateProof(req.query.ref);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  /**
   * Returns the state information at the given full database path.
   */
  app.get('/get_state_info', (req, res, next) => {
    const result = node.db.getStateInfo(req.query.ref);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  app.get('/match_function', (req, res, next) => {
    const result = node.db.matchFunction(req.query.ref, ChainUtil.toBool(req.query.is_global));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  app.get('/match_rule', (req, res, next) => {
    const result = node.db.matchRule(req.query.ref, ChainUtil.toBool(req.query.is_global));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  app.get('/match_owner', (req, res, next) => {
    const result = node.db.matchOwner(req.query.ref, ChainUtil.toBool(req.query.is_global));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  app.post('/eval_rule', (req, res, next) => {
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
        ChainUtil.toBool(body.is_global));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.post('/eval_owner', (req, res, next) => {
    const body = req.body;
    const auth = {};
    if (body.address) {
      auth.addr = body.address;
    }
    if (body.fid) {
      auth.fid = body.fid;
    }
    const result = node.db.evalOwner(
        body.ref, body.permission, auth, ChainUtil.toBool(body.is_global));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.post('/get', (req, res, next) => {
    const result = node.db.get(req.body.op_list);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.post('/set_value', (req, res, next) => {
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_VALUE));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: ChainUtil.isFailedTx(result.result) ? 1 : 0, result})
      .end();
  });

  app.post('/inc_value', (req, res, next) => {
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.INC_VALUE));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: ChainUtil.isFailedTx(result.result) ? 1 : 0, result})
      .end();
  });

  app.post('/dec_value', (req, res, next) => {
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.DEC_VALUE));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: ChainUtil.isFailedTx(result.result) ? 1 : 0, result})
      .end();
  });

  app.post('/set_function', (req, res, next) => {
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_FUNCTION));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: ChainUtil.isFailedTx(result.result) ? 1 : 0, result})
      .end();
  });

  app.post('/set_rule', (req, res, next) => {
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_RULE));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: ChainUtil.isFailedTx(result.result) ? 1 : 0, result})
      .end();
  });

  app.post('/set_owner', (req, res, next) => {
    const result = createAndExecuteTransaction(createSingleSetTxBody(
        req.body, WriteDbOperations.SET_OWNER));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: ChainUtil.isFailedTx(result.result) ? 1 : 0, result})
      .end();
  });

  // A custom address can be used as a devel method for bypassing the trasaction verification.
  // TODO(platfowner): Replace custom address with real signature.
  app.post('/set', (req, res, next) => {
    const result = createAndExecuteTransaction(createMultiSetTxBody(req.body));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: ChainUtil.isFailedTx(result.result) ? 1 : 0, result})
      .end();
  });

  app.post('/batch', (req, res, next) => {
    const result = createAndExecuteTransaction(createBatchTxBody(req.body));
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/status', (req, res, next) => {
    const result = p2pClient.getStatus();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/node_status', (req, res, next) => {
    const result = p2pServer.getNodeStatus();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/connection_status', (req, res) => {
    const result = p2pClient.getConnectionStatus();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  })

  app.get('/blocks', (req, res, next) => {
    const blockEnd = node.bc.lastBlockNumber() + 1;
    const blockBegin = Math.max(blockEnd - MAX_BLOCKS, 0);
    const result = node.bc.getChainSection(blockBegin, blockEnd);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/last_block', (req, res, next) => {
    const result = node.bc.lastBlock();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/last_block_number', (req, res, next) => {
    const result = node.bc.lastBlockNumber();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/tx_pool', (req, res, next) => {
    const result = node.tp.transactions;
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/tx_tracker', (req, res, next) => {
    const result = node.tp.transactionTracker;
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/committed_nonce_tracker', (req, res, next) => {
    const result = node.tp.committedNonceTracker;
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/pending_nonce_tracker', (req, res, next) => {
    const result = node.tp.pendingNonceTracker;
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/protocol_versions', (req, res) => {
    const result = p2pClient.server.getProtocolInfo();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/state_versions', (req, res) => {
    const result = p2pServer.getStateVersionStatus();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  // TODO(platfowner): Support for subtree dumping (i.e. with ref path).
  app.get('/dump_final_version', (req, res) => {
    const result = node.dumpFinalVersion(true);
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/get_transaction', (req, res, next) => {
    const transactionInfo = node.tp.transactionTracker[req.query.hash];
    if (transactionInfo) {
      if (transactionInfo.status === TransactionStatus.BLOCK_STATUS) {
        const block = node.bc.getBlockByNumber(transactionInfo.number);
        const index = transactionInfo.index;
        if (index >= 0) {
          transactionInfo.transaction = block.transactions[index];
        } else {
          transactionInfo.transaction = _.find(block.last_votes, (tx) => tx.hash === req.query.hash);
        }
      } else if (transactionInfo.status === TransactionStatus.POOL_STATUS) {
        const address = transactionInfo.address;
        transactionInfo.transaction = _.find(node.tp.transactions[address], (tx) => tx.hash === req.query.hash);
      }
    }
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result: transactionInfo})
      .end();
  });

  app.get('/get_address', (req, res, next) => {
    const result = node.account.address;
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/get_nonce', (req, res, next) => {
    const result = node.nonce;
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/get_sharding', (req, res, next) => {
    const result = node.getSharding();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0 : 1, result})
      .end();
  });

  app.get('/get_raw_consensus_state', (req, res) => {
    const result = p2pServer.consensus.getRawState();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });

  app.get('/get_consensus_state', (req, res) => {
    const result = p2pServer.consensus.getState();
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 0, result})
      .end();
  });
}

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
  txBody.gas_price = input.gas_price !== undefined ? input.gas_price : 1;
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
  txBody.gas_price = input.gas_price !== undefined ? input.gas_price : 1;
  return txBody;
}

function createBatchTxBody(input) {
  const txList = [];
  for (const tx of input.tx_list) {
    tx.gas_price = tx.gas_price !== undefined ? tx.gas_price : 1;
    txList.push(tx);
  }
  return { tx_body_list: txList };
}

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
