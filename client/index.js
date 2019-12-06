#! /usr/bin/node
/**
 * Copyright 2017, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Require process, so we can mock environment variables
const process = require('process');
const fs = require('fs');
// NOTE(seo): This is very useful when the server dies without any logs.
process.on('uncaughtException', function (err) {
  console.log(err);
}); 

const moment = require('moment');
const semver = require('semver');
const PORT = process.env.PORT || 8080;
const CURRENT_PROTOCOL_VERSION = require('../package.json').version;
const { PROTOCOL_VERSIONS } = require('../constants');
if (!fs.existsSync(PROTOCOL_VERSIONS)) {
  throw Error('Missing protocol versions file: ' + PROTOCOL_VERSIONS);
}
const VERSION_LIST = JSON.parse(fs.readFileSync(PROTOCOL_VERSIONS));
if (!VERSION_LIST[CURRENT_PROTOCOL_VERSION]) {
  throw Error("Current protocol version doesn't exist in the protocol versions file");
}
const minProtocolVersion =
    VERSION_LIST[CURRENT_PROTOCOL_VERSION].min || CURRENT_PROTOCOL_VERSION;
const maxProtocolVersion = VERSION_LIST[CURRENT_PROTOCOL_VERSION].max;

// Initiate logging
const LOG = process.env.LOG || false;

if (LOG) {
  const fs = require('fs');
  const util = require('util');
  const logDir = __dirname + '/' + '.logs';
  if (!(fs.existsSync(logDir))) {
    fs.mkdirSync(logDir);
  }
  const logFile =
    fs.createWriteStream(logDir + '/' + PORT +'debug.log', {flags: 'w'});
  const logStdout = process.stdout;

  console.log = function(d) {
    logFile.write(moment(new Date()).format(moment.HTML5_FMT.DATETIME_LOCAL_MS) +
        '\t' + util.format(d) + '\n');
    logStdout.write(util.format(d) + '\n');
  };
}

// [START gae_flex_mysql_app]
const express = require('express');
const DB = require('../db');
const P2pServer = require('../server');

// Define peer2peer server here which will broadcast changes in the database
// and also track which servers are in the network

// Applictation dependencies
const Blockchain = require('../blockchain');
const TransactionPool = require('../db/transaction-pool');

const app = express();

const transactionBatch = [];

app.use(express.json()); // support json encoded bodies

const { WriteDbOperations } = require('../constants');
const bc = new Blockchain(String(PORT));
const tp = new TransactionPool();
const db = new DB();
const p2pServer = new P2pServer(db, bc, tp, minProtocolVersion, maxProtocolVersion);
const jayson = require('jayson');

const jsonRpcMethods = require('../json_rpc/methods')(bc, tp, p2pServer);
app.post('/json-rpc', validateVersion, jayson.server(jsonRpcMethods).middleware());

app.get('/', (req, res, next) => {
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send('Welcome to AIN Blockchain Database')
    .end();
});

app.get('/get_value', (req, res, next) => {
  const result = db.getValue(req.query.ref);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result !== null ? 0 : 1, result})
    .end();
});

app.get('/get_rule', (req, res, next) => {
  const result = db.getRule(req.query.ref);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result !== null ? 0 : 1, result})
    .end();
});

app.get('/get_func', (req, res, next) => {
  const result = db.getFunc(req.query.ref);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result !== null ? 0 : 1, result})
    .end();
});

app.get('/get_owner', (req, res, next) => {
  const result = db.getOwner(req.query.ref);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result !== null ? 0 : 1, result})
    .end();
});

app.post('/eval_rule', (req, res, next) => {
  const body = req.body;
  const result = db.evalRule(body.ref, body.value, body.address, body.timestamp || Date.now());
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0, result})
    .end();
});

app.post('/eval_owner', (req, res, next) => {
  const body = req.body;
  const result = db.evalOwner(body.ref, body.address);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0, result})
    .end();
});

app.post('/get', (req, res, next) => {
  const result = db.get(req.body.op_list);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0, result})
    .end();
});

app.post('/set_value', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.SET_VALUE), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result === true ? 0 : 1, result})
    .end();
});

app.post('/inc_value', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.INC_VALUE), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result === true ? 0 : 1, result})
    .end();
});

app.post('/dec_value', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.DEC_VALUE), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result === true ? 0 : 1, result})
    .end();
});

app.post('/set_rule', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.SET_RULE), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result === true ? 0 : 1, result})
    .end();
});

app.post('/set_func', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.SET_FUNC), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result === true ? 0 : 1, result})
    .end();
});

app.post('/set_owner', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createTransaction(
      createSingleSetTxData(req.body, WriteDbOperations.SET_OWNER), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result === true ? 0 : 1, result})
    .end();
});

// TODO(seo): Replace skip_verif with real signature.
app.post('/set', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createTransaction(createMultiSetTxData(req.body), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: result === true ? 0 : 1, result})
    .end();
});

app.post('/batch', (req, res, next) => {
  const isNoncedTransaction = checkIfTransactionShouldBeNonced(req.body);
  const result = createTransaction(createBatchTxData(req.body), isNoncedTransaction);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0, result})
    .end();
});

app.get('/blocks', (req, res, next) => {
  const result = bc.getChainSection(0, bc.length);
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0, result})
    .end();
});

app.get('/last_block', (req, res, next) => {
  const result = bc.lastBlock();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0, result})
    .end();
});

app.get('/last_block_number', (req, res, next) => {
  const result = bc.lastBlockNumber();
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0, result})
    .end();
});

app.get('/transactions', (req, res, next) => {
  const result = tp.transactions;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0, result})
    .end();
});

app.get('/node_address', (req, res, next) => {
  const result = db.account.address;
  res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0, result})
    .end();
})

// We will want changes in ports and the database to be broadcast across
// all instances so lets pass this info into the p2p server
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
// [END gae_flex_mysql_app]

// Lets start this p2p server up so we listen for changes in either DATABASE
// or NUMBER OF SERVERS
p2pServer.listen();

module.exports = app;

function createSingleSetTxData(input, opType) {
  const txData = {
    operation: {
      type: opType,
      ref: input.ref,
      value: input.value,
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

function createTransaction(txData, isNoncedTransaction) {
  const transaction = db.createTransaction(txData, isNoncedTransaction);
  return p2pServer.executeAndBroadcastTransaction(transaction);
}

function checkIfTransactionShouldBeNonced(input) {
  // Default to true if noncing information is not specified
  return input.is_nonced_transaction !== undefined ? input.is_nonced_transaction : true;
}

function validateVersion(req, res, next) {
  let version = null;
  if (req.query.protoVer) {
    version = req.query.protoVer;
  } else if (req.body.params) {
    version = req.body.params.protoVer;
  }
  if (req.body.method === 'ain_protocolVersion') {
    next();
  } else if (!version) {
    res.status(200)
    .set('Content-Type', 'application/json')
    .send({code: 1, result: "Protocol version not specified.",
           protoVer: CURRENT_PROTOCOL_VERSION})
    .end();
  } else if (!semver.valid(version)) {
    res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 1, result: "Invalid protocol version.",
             protoVer: CURRENT_PROTOCOL_VERSION})
      .end();
  } else {
    if (semver.gt(minProtocolVersion, version) ||
        (maxProtocolVersion && semver.lt(maxProtocolVersion, version))) {
      res.status(200)
      .set('Content-Type', 'application/json')
      .send({code: 1, result: "Incompatible protocol version.",
             protoVer: CURRENT_PROTOCOL_VERSION})
      .end();
    } else {
      next();
    }
  }
}