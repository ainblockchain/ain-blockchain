'use strict';

const process = require('process');
const fs = require('fs');
const semver = require('semver');
const express = require('express');
const jayson = require('jayson');
const logger = require('../logger')('CLIENT');
const BlockchainNode = require('../node');
const P2pServer = require('../server');
const ChainUtil = require('../chain-util');
const { PORT, PROTOCOL_VERSIONS, WriteDbOperations, TransactionStatus } = require('../constants');
const { ConsensusStatus } = require('../consensus/constants');
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;

const MAX_BLOCKS = 20;

// NOTE(seo): This is very useful when the server dies without any logs.
process.on('uncaughtException', function(err) {
  logger.error(err);
});

process.on('SIGINT', (_) => {
  logger.info('Stopping the blockchain client....');
  p2pServer.stop();
  process.exit();
});

if (!fs.existsSync(PROTOCOL_VERSIONS)) {
  throw Error('Missing protocol versions file: ' + PROTOCOL_VERSIONS);
}
if (!semver.valid(CURRENT_PROTOCOL_VERSION)) {
  throw Error('Wrong version format is specified in package.json');
}
const VERSION_LIST = JSON.parse(fs.readFileSync(PROTOCOL_VERSIONS));
const { min, max } = matchVersions(CURRENT_PROTOCOL_VERSION);
const minProtocolVersion = min === undefined ? CURRENT_PROTOCOL_VERSION : min;
const maxProtocolVersion = max;

const app = express();
app.use(express.json()); // support json encoded bodies

const node = new BlockchainNode();
const p2pServer = new P2pServer(node, minProtocolVersion, maxProtocolVersion);

const jsonRpcMethods = require('../json_rpc')(
    node, p2pServer, minProtocolVersion, maxProtocolVersion);
app.post('/json-rpc', validateVersion, jayson.server(jsonRpcMethods).middleware());

app.get('/', (req, res, next) => {
  const consensusStatus = p2pServer.consensus.status;
  const message = consensusStatus === ConsensusStatus.RUNNING ?
      'Welcome to AIN Blockchain Node' : 'AIN Blockchain Node is NOT ready yet';
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send(message)
    .end();
});

app.get('/get_value', (req, res, next) => {
  const result = node.db.getValue(req.query.ref, ChainUtil.toBool(req.query.is_global));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/get_function', (req, res, next) => {
  const result = node.db.getFunction(req.query.ref, ChainUtil.toBool(req.query.is_global));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/get_rule', (req, res, next) => {
  const result = node.db.getRule(req.query.ref, ChainUtil.toBool(req.query.is_global));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/get_owner', (req, res, next) => {
  const result = node.db.getOwner(req.query.ref, ChainUtil.toBool(req.query.is_global));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

/**
 * Returns a proof of the state node in the given full database path.
 */
app.get('/get_proof', (req, res, next) => {
  const result = node.db.getProof(req.query.ref);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/match_function', (req, res, next) => {
  const result = node.db.matchFunction(req.query.ref, ChainUtil.toBool(req.query.is_global));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/match_rule', (req, res, next) => {
  const result = node.db.matchRule(req.query.ref, ChainUtil.toBool(req.query.is_global));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/match_owner', (req, res, next) => {
  const result = node.db.matchOwner(req.query.ref, ChainUtil.toBool(req.query.is_global));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.post('/eval_rule', (req, res, next) => {
  const body = req.body;
  const result = node.db.evalRule(
      body.ref, body.value, body.address, body.timestamp || Date.now(),
      ChainUtil.toBool(body.is_global));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.post('/eval_owner', (req, res, next) => {
  const body = req.body;
  const result = node.db.evalOwner(
      body.ref, body.permission, body.address, ChainUtil.toBool(body.is_global));
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.post('/get', (req, res, next) => {
  const result = node.db.get(req.body.op_list);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.post('/set_value', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createAndExecuteTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.SET_VALUE), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result.result === true ? 0 : 1, result })
    .end();
});

app.post('/inc_value', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createAndExecuteTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.INC_VALUE), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result.result === true ? 0 : 1, result })
    .end();
});

app.post('/dec_value', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createAndExecuteTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.DEC_VALUE), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result.result === true ? 0 : 1, result })
    .end();
});

app.post('/set_function', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createAndExecuteTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.SET_FUNCTION), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result.result === true ? 0 : 1, result })
    .end();
});

app.post('/set_rule', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createAndExecuteTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.SET_RULE), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result.result === true ? 0 : 1, result })
    .end();
});

app.post('/set_owner', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createAndExecuteTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.SET_OWNER), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result.result === true ? 0 : 1, result })
    .end();
});

// TODO(seo): Replace skip_verif with real signature.
app.post('/set', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createAndExecuteTransaction(createMultiSetTxData(req.body), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result.result === true ? 0 : 1, result })
    .end();
});

app.post('/batch', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createAndExecuteTransaction(createBatchTxData(req.body), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/blocks', (req, res, next) => {
  const blockEnd = node.bc.lastBlockNumber() + 1;
  const blockBegin = Math.max(blockEnd - MAX_BLOCKS, 0);
  const result = node.bc.getChainSection(blockBegin, blockEnd);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/last_block', (req, res, next) => {
  const result = node.bc.lastBlock();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/last_block_number', (req, res, next) => {
  const result = node.bc.lastBlockNumber();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/tx_pool', (req, res, next) => {
  const result = node.tp.transactions;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/tx_tracker', (req, res, next) => {
  const result = node.tp.transactionTracker;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/committed_nonce_tracker', (req, res, next) => {
  const result = node.tp.committedNonceTracker;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/pending_nonce_tracker', (req, res, next) => {
  const result = node.tp.pendingNonceTracker;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/get_transaction', (req, res, next) => {
  const transactionInfo = node.tp.transactionTracker[req.query.hash];
  if (transactionInfo) {
    if (transactionInfo.status === TransactionStatus.BLOCK_STATUS) {
      const block = node.bc.getBlockByNumber(transactionInfo.number);
      const index = transactionInfo.index;
      transactionInfo.transaction = block.transactions[index];
    } else if (transactionInfo.status === TransactionStatus.POOL_STATUS) {
      const address = transactionInfo.address;
      const index = transactionInfo.index;
      transactionInfo.transaction = node.tp.transactions[address][index];
    }
  }
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result: transactionInfo })
    .end();
});

app.get('/get_address', (req, res, next) => {
  const result = node.account.address;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/get_sharding', (req, res, next) => {
  const result = node.getSharding();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: result !== null ? 0 : 1, result })
    .end();
});

app.get('/get_raw_consensus_state', (req, res) => {
  const result = p2pServer.consensus.getRawState();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
    .end();
});

app.get('/get_consensus_state', (req, res) => {
  const result = p2pServer.consensus.getState();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({ code: 0, result })
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

// Lets start this p2p server up so we listen for changes in either DATABASE
// or NUMBER OF SERVERS
p2pServer.listen();

module.exports = app;

function createSingleSetTxData(input, opType) {
  const op = {
    type: opType,
    ref: input.ref,
    value: input.value,
  };
  if (input.is_global !== undefined) {
    op.is_global = input.is_global;
  }
  const txData = { operation: op };
  if (input.address !== undefined) {
    txData.address = input.address;
  }
  if (input.nonce !== undefined) {
    txData.nonce = input.nonce;
  }
  return txData;
}

function createMultiSetTxData(input) {
  const txData = {
    operation: {
      type: WriteDbOperations.SET,
      op_list: input.op_list,
    }
  };
  if (input.address !== undefined) {
    txData.address = input.address;
  }
  if (input.nonce !== undefined) {
    txData.nonce = input.nonce;
  }
  return txData;
}

function createBatchTxData(input) {
  return { tx_list: input.tx_list };
}

function createAndExecuteTransaction(txData, isNoncedTransaction) {
  const transaction = node.createTransaction(txData, isNoncedTransaction);
  return {
    tx_hash: transaction.hash,
    result: p2pServer.executeAndBroadcastTransaction(transaction)
  };
}

function checkIfTransactionShouldBeNonced(input) {
  // Default to true if noncing information is not specified
  return input.is_nonced_transaction !== undefined ? input.is_nonced_transaction : true;
}

function isValidVersionMatch(ver) {
  return ver && semver.valid(semver.coerce(ver.min)) &&
    (!ver.max || semver.valid(semver.coerce(ver.max)));
}

function matchVersions(ver) {
  let match = VERSION_LIST[ver];
  if (isValidVersionMatch(match)) {
    return match;
  }
  const majorVer = semver.major(ver);
  const majorMinorVer = `${majorVer}.${semver.minor(ver)}`;
  match = VERSION_LIST[majorMinorVer];
  if (isValidVersionMatch(match)) {
    return match;
  }
  match = VERSION_LIST[majorVer];
  if (isValidVersionMatch(match)) {
    return match;
  }
  return {};
}

function validateVersion(req, res, next) {
  let version = null;
  if (req.query.protoVer) {
    version = req.query.protoVer;
  } else if (req.body.params) {
    version = req.body.params.protoVer;
  }
  const coercedVer = semver.coerce(version);
  if (req.body.method === 'ain_getProtocolVersion' ||
      req.body.method === 'ain_checkProtocolVersion') {
    next();
  } else if (version === undefined) {
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: 1,
        message: 'Protocol version not specified.',
        protoVer: CURRENT_PROTOCOL_VERSION
      })
      .end();
  } else if (!semver.valid(coercedVer)) {
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: 1,
        message: 'Invalid protocol version.',
        protoVer: CURRENT_PROTOCOL_VERSION
      })
      .end();
  } else if (semver.lt(coercedVer, minProtocolVersion) ||
    (maxProtocolVersion && semver.gt(coercedVer, maxProtocolVersion))) {
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({
        code: 1,
        message: 'Incompatible protocol version.',
        protoVer: CURRENT_PROTOCOL_VERSION
      })
      .end();
  } else {
    next();
  }
}
