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
const PORT = process.env.PORT || 8080;

// Initiate logging
const LOG = process.env.LOG || false;
let LAST_NONCE = 0;
let CURRENT_NONCE = 0;
// Number of transactions per second that can be made through this blockchain
// before transactions begin automatically being added to a batch_list
// transaction.
const TX_PER_SECOND_AUTOBATCHING = 120;

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
    logFile.write(util.format(d) + '\n');
    logStdout.write(util.format(d) + '\n');
  };
}


// [START gae_flex_mysql_app]
const express = require('express');
// const crypto = require('crypto');
// var Promise = require("bluebird");
// var bodyParser = require('body-parser')
const P2pServer = require('../server');
const Database = require('../db');

// Define peer2peer server here which will broadcast changes in the database
// and also track which servers are in the network

// Applictation dependencies
const Blockchain = require('../blockchain');
const TransactionPool = require('../db/transaction-pool');

const app = express();


const transactionBatch = [];

app.use(express.json()); // support json encoded bodies
// app.use(bodyParser.urlencoded({ extended: false }));
// support encoded bodies

const bc = new Blockchain(String(PORT));
const tp = new TransactionPool();
const db = Database.getDatabase(bc, tp);
const p2pServer = new P2pServer(db, bc, tp);
const InvalidPermissionsError = require('../errors');
const jayson = require('jayson');

let jsonRpcMethods = require('../json_rpc/methods')(bc, tp);
app.post('/json-rpc', jayson.server(jsonRpcMethods).middleware());

app.get('/', (req, res, next) => {
  try {
    res
        .status(200)
        .set('Content-Type', 'text/plain')
        .send('Welcome to afan-tx-server')
        .end();
  } catch (error) {
    console.log(error);
  }
});

app.post('/update', (req, res, next) => {
  const data = req.body.data;
  const result = createTransaction({op: 'update', data});
  res
      .status(result !== null ? 201: 401)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0: 1, result})
      .end();
});

app.get('/get', (req, res, next) => {
  let statusCode = 200;
  let result = null;
  try {
    result = db.get(req.query.ref);
  } catch (error) {
    statusCode = 400;
    console.log(error.stack);
  }
  res
      .status(statusCode)
      .set('Content-Type', 'application/json')
      .send({code: result ? 0 : -1, result})
      .end();
});

app.post('/set', (req, res, next) => {
  const ref = req.body.ref;
  const value = req.body.value;
  const result = createTransaction({op: 'set', ref, value});
  res
      .status(result !== null ? 201: 401)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0: 1, result})
      .end();
});

app.post('/batch', (req, res, next) => {
  const batchList = req.body.batch_list;
  const result = createTransaction({op: 'batch', batch_list: batchList});
  res
      .status(result !== null ? 201: 401)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0: 1, result})
      .end();
});

app.post('/increase', (req, res, next) => {
  const diff = req.body.diff;
  const result = createTransaction({op: 'increase', diff});
  res
      .status(result !== null ? 201: 401)
      .set('Content-Type', 'application/json')
      .send({code: result !== null ? 0: 1, result})
      .end();
});

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

// eslint-disable-next-line require-jsdoc
function createBatchTransaction(trans) {
  if (transactionBatch.length == 0) {
    setTimeout(() => {
      broadcastBatchTransaction();
    }, 100);
  }
  CURRENT_NONCE += 1;
  transactionBatch.push(trans);
}

function broadcastBatchTransaction() {
  if (transactionBatch.length > 0) {
    const batchList = JSON.parse(JSON.stringify(transactionBatch));
    transactionBatch.length = 0;
    let transaction;
    try {
      transaction = db.createTransaction({type: 'BATCH', batch_list: batchList});
    } catch (error) {
      if (error instanceof InvalidPermissionsError) {
        console.log(`Validation failed: ${console.log(error.stack)}`);
        return null;
      }
      throw error;
    }
    return p2pServer.executeAndBroadcastTransaction(transaction);
  }
}

function createSingularTransaction(trans) {
  CURRENT_NONCE += 1;
  let transaction;
  try {
    switch (trans.op) {
      case 'batch':
        transaction =
          db.createTransaction({type: 'BATCH', batch_list: trans.batch_list});
        break;
      case 'increase':
        transaction =
          db.createTransaction({type: 'INCREASE', diff: trans.diff});
        break;
      case 'update':
        transaction =
          db.createTransaction({type: 'UPDATE', data: trans.data});
        break;
      case 'set':
        transaction =
          db.createTransaction({type: 'SET', ref: trans.ref,
            value: trans.value});
        break;
    }
  } catch (error) {
    if (error instanceof InvalidPermissionsError) {
      console.log(`Validation failed: ${console.log(error.stack)}`);
      return null;
    }
    throw error;
  }
  return p2pServer.executeAndBroadcastTransaction(transaction);
}

let createTransaction;
createTransaction = createSingularTransaction;


// Here we specity
setInterval(() => {
  if (CURRENT_NONCE - LAST_NONCE > TX_PER_SECOND_AUTOBATCHING) {
    createTransaction = createBatchTransaction;
  } else {
    broadcastBatchTransaction();
    createTransaction = createSingularTransaction;
  }
  LAST_NONCE = CURRENT_NONCE;
}, 1000);
