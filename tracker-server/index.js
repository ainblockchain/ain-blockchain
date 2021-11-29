/* eslint no-unused-vars: "off" */
const logger = new (require('../logger'))('TRACKER_SERVER');
const express = require('express');
const jayson = require('jayson');

const { getGraphData } = require('./network-topology');
const CommonUtil = require('../common/common-util');
const Tracker = require('./tracker');

const PORT = process.env.PORT || 8080;

const tracker = new Tracker();

const app = express();
const jsonRpcMethods = require('./json-rpc')(tracker);
app.use(express.json());
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.post('/json-rpc', jayson.server(jsonRpcMethods).middleware());

app.get('/', (req, res, next) => {
  res.status(200)
      .set('Content-Type', 'text/plain')
      .send('Welcome to AIN Blockchain Tracker')
      .end();
});

app.get('/status', (req, res, next) => {
  const result = tracker.getStatus();
  res.status(200)
      .set('Content-Type', 'application/json')
      .send(result)
      .end();
});

// Exports metrics for Prometheus.
app.get('/metrics', (req, res, next) => {
  const status = tracker.getStatus();
  const result = CommonUtil.objToMetrics(status);
  res.status(200)
      .set('Content-Type', 'text/plain')
      .send(result)
      .end();
});

app.get('/network_status', (req, res, next) => {
  const result = tracker.getNetworkStatus();
  res.status(200)
      .set('Content-Type', 'application/json')
      .send(result)
      .end();
});

app.get('/network_topology', (req, res) => {
  res.render(__dirname + '/index.html', {}, (err, html) => {
    const networkStatus = tracker.getNetworkStatus();
    const graphData = getGraphData(networkStatus);
    html = html.replace(/{ \/\* replace this \*\/ };/g, JSON.stringify(graphData));
    res.send(html);
  });
});

const trackerServer = app.listen(PORT, () => {
  logger.info(`App listening on port ${PORT}`);
  logger.info('Press Ctrl+C to quit.');
});

trackerServer.keepAliveTimeout = 620 * 1000; // 620 seconds
trackerServer.headersTimeout = 630 * 1000; // 630 seconds

// NOTE(platfowner): This is very useful when the server dies without any logs.
process.on('uncaughtException', function(err) {
  logger.error(err);
});
