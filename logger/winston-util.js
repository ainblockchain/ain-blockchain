/* eslint new-cap: "off" */
/* eslint func-call-spacing: "off" */
/* eslint new-parens: "off" */
const winston = require('winston');
const { LoggingWinston } = require('@google-cloud/logging-winston');
const winstonDaily = require('winston-daily-rotate-file');
const path = require('path');
const { BlockchainConfigs } = require('../common/constants');

const { combine, timestamp, label, printf, colorize } = winston.format;

const logDir = path.join(BlockchainConfigs.LOGS_DIR, String(BlockchainConfigs.PORT));
// TODO(liayoo): Deprecate ACCOUNT_INDEX.
const prefix = BlockchainConfigs.ACCOUNT_INDEX || BlockchainConfigs.ACCOUNT_INJECTION_OPTION ? `node-${BlockchainConfigs.PORT}` : `tracker-${BlockchainConfigs.PORT}`;
const logFormat = printf(({level, message, label, timestamp}) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

/*
  We are able to set new winston log levels when necessary in the near future.
  Reminder: winston prints messages out less than or equal to this level.
  e.i. it prints all messages if set to debug,
       it prints both error and info if info is specified.
       it only prints error when error is set.
*/
const getWinstonLevels = () => {
  return {
    error: 0,
    info: 1,
    debug: 2
  };
};

const getWinstonColors = () => {
  return {
    error: 'red',
    info: 'green',
    debug: 'yellow'
  };
};

const getWinstonConsoleTransport = () => {
  return new (winston.transports.Console)({
    name: 'debug-console-log',
    level: BlockchainConfigs.DEBUG ? 'debug' : 'info',
    handleExceptions: true,
    json: false,
    colorize: true,
    format: combine(
        colorize(),
        label({label: prefix}),
        timestamp(),
        logFormat
    ),
    silent: !BlockchainConfigs.CONSOLE_LOG
  });
};

const getWinstonDailyCombinedFileTransport = () => {
  return new (winstonDaily)({
    name: 'daily-combined-log',
    level: BlockchainConfigs.DEBUG ? 'debug' : 'info',
    filename: `${logDir}/${prefix}-combined-%DATE%.log`,
    handleExceptions: true,
    json: false,
    maxSize: '100m',
    maxFiles: '14d',
    colorize: false,
    format: combine(
        label({label: prefix}),
        timestamp(),
        logFormat
    ),
  });
};

const getWinstonDailyErrorFileTransport = () => {
  return new (winstonDaily)({
    name: 'daily-error-log',
    level: 'error',
    filename: `${logDir}/${prefix}-error-%DATE%.log`,
    handleExceptions: true,
    json: false,
    maxSize: '100m',
    maxFiles: '180d',
    colorize: false,
    format: combine(
        label({label: prefix}),
        timestamp(),
        logFormat
    )
  });
};

const getWinstonTransports = () => {
  const transports = BlockchainConfigs.LIGHTWEIGHT ? [getWinstonDailyErrorFileTransport()]
      : [
        getWinstonConsoleTransport(),
        getWinstonDailyCombinedFileTransport(),
        getWinstonDailyErrorFileTransport(),
      ];
  if (BlockchainConfigs.HOSTING_ENV === 'gcp') {
    // Add Stackdriver Logging
    transports.push(new LoggingWinston);
  }
  return transports;
};

module.exports = {
  getWinstonLevels,
  getWinstonColors,
  getWinstonTransports,
};
