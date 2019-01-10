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

// [START gae_flex_mysql_app]
const express = require('express');
// const crypto = require('crypto');
// var Promise = require("bluebird");
// var bodyParser = require('body-parser')
const P2pServer = require('./p2p-server')
const Database = require('../db')
// Define peer2peer server here which will broadcast changes in the database
// and also track which servers are in the network

// Applictation dependencies
const Blockchain = require('../blockchain');
const TransactionPool = require('../db/transaction-pool')
const Miner = require('./miner')


const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json()); // support json encoded bodies
// app.use(bodyParser.urlencoded({ extended: false })); // support encoded bodies

const db = new Database()
const tp = new TransactionPool()
const bc = new Blockchain(String(PORT));
const p2pServer = new P2pServer(db, bc, tp)
const miner = new Miner(bc, tp, p2pServer)

app.get('/', (req, res, next) => {
  res
    .status(200)
    .set('Content-Type', 'text/plain')
    .send('Welcome to afan-tx-server')
    .end();
})

app.get('/transactions', (req, res) => {
  res.json(tp.transactions)
})

app.get('/blocks', (req, res) => {
  res.json(bc.chain);
});

app.get('/mine-transactions', (req, res) => {
  const block = miner.mine()
  console.log(`New block added: ${block.toString()}`)
  res.redirect('/blocks')
})

app.get('/get', (req, res, next) => {
  var result = db.get(req.query.ref)
  res
    .status(result ? 200 : 404)
    .set('Content-Type', 'application/json')
    .send({code: result ? 0 : -1, result})
    .end();
})

app.post('/set', (req, res, next) => {
  console.log(req.body, "something")
  var ref = req.body.ref;
  var value = req.body.value
  db.set(ref, value)
  res
    .status(200)
    .set('Content-Type', 'application/json')
    .send({code: 0})
    .end();
  let transaction = db.createTransaction({type: "SET", ref, value}, tp)
  p2pServer.broadcastTransaction(transaction)

})

app.post('/increase', (req, res, next) => {
  var diff = req.body.diff;
  var result = db.increase(diff)
  res
    .status(200)
    .set('Content-Type', 'application/json')
    .send(result)
    .end();
  let transaction = db.createTransaction({type: "INCREASE", diff}, tp)
  p2pServer.broadcastTransaction(transaction)
})

// We will want changes in ports and the database to be broadcaste across
// all instances so lets pass this info into the p2p server

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to quit.');
});
// [END gae_flex_mysql_app]


// Lets start this p2p server up so we listen for changes in either DATABASE
// or NUMBER OF SERVERS
p2pServer.listen()

module.exports = app;
