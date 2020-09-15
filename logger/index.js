const winston = require('winston');
const { LoggingWinston } = require('@google-cloud/logging-winston');
const { HOSTING_ENV } = require('../constants');
const {
  getWinstonConsoleTransport,
  getWinstonDailyDebugFileTransport,
  getWinstonDailyErrorFileTransport,
} = require('./winston-util');

function getTransports() {
  const transports = [
    getWinstonConsoleTransport(),
    getWinstonDailyDebugFileTransport(),
    getWinstonDailyErrorFileTransport(),
  ];
  if (HOSTING_ENV === 'gcp') {
    // Add Stackdriver Logging
    transports.push(new LoggingWinston);
  }
  return transports;
}

const logger = new winston.createLogger({
  transports: getTransports(),
  exitOnError: false
});

module.exports = logger;

