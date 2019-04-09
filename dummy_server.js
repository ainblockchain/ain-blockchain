
'use strict';

// Require process, so we can mock environment variables
const process = require('process');
const PORT = process.env.PORT || 8080;

// [START gae_flex_mysql_app]
const express = require('express');
// const crypto = require('crypto');
// var Promise = require("bluebird");

const app = express();

app.use(express.json()); // support json encoded bodies
// app.use(bodyParser.urlencoded({ extended: false })); // support encoded bodies




app.post('/update', (req, res, next) => {
  res
    .status(201)
    .set('Content-Type', 'application/json')
    .send({code: 0, result: "result"})
    .end();
})


app.post('/set', (req, res, next) => {
  var statusCode = 201

  res.status(statusCode)
  .set('Content-Type', 'application/json')
  .send({code: statusCode < 299? 0: 1}).end();
})


app.post('/batch', (req, res, next) => {
  res
    .status(200)
    .set('Content-Type', 'application/json')
    .send([])
    .end();
})

app.post('/increase', (req, res, next) => {
  var result = "something"
  res
  .status(200)
  .set('Content-Type', 'application/json')
  .send({code: result ? 0 : -1, result})
  .end();
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

module.exports = app;

