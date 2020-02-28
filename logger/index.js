const process = require('process');
const winston = require('winston');
const winstonDaily = require('winston-daily-rotate-file');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || 0;

const { combine, timestamp, label, printf } = winston.format
const logFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
})

const logDir = path.join(__dirname, '.', 'logs', PORT);
const prefix = `node-${ACCOUNT_INDEX}`;

const logger = new winston.createLogger({
  transports: [
    new (winstonDaily)({
      name: 'daily-combined-log',
      level: 'info',
      filename: `${logDir}/${prefix}-combined-%DATE%.log`,
      handleExceptions: true,
      json: false,
      maxSize: '100m',
      maxFiles: '14d',
      colorize: false,
      format: combine(
        label({ label: prefix }),
        timestamp(),
        logFormat
      )
    }),
    new (winstonDaily)({
      name: 'daily-error-log',
      level: 'error',
      filename: `${logDir}/${prefix}-error-%DATE%.log`,
      handleExceptions: true,
      json: false,
      maxSize: '100m',
      maxFiles: '180d',
      colorize: false,
      format: combine(
        label({ label: prefix }),
        timestamp(),
        logFormat
      )
    }),
    new (winston.transports.Console)({
      name: 'debug-console-log',
      level: 'debug',
      handleExceptions: true,
      json: false,
      colorize: true,
      format: combine(
        label({ label: prefix }),
        timestamp(),
        logFormat
      )
    })
  ],
  exitOnError: false
})

module.exports = logger;

