/* eslint new-cap: "off" */
const winston = require('winston');
const { getWinstonLevels, getWinstonColors, getWinstonTransports } = require('./winston-util');

const winstonLogger = new winston.createLogger({
  levels: getWinstonLevels(),
  transports: getWinstonTransports(),
  exitOnError: false
});

winston.addColors(getWinstonColors());

let isLoggerOff = false;
const logger = function(prefix) {
  const prefixedLogger = {
    error: function(text) {
      if (!isLoggerOff) {
        winstonLogger.error(`[${prefix}] ${text}`)
      }
    },
    info: function(text) {
      if (!isLoggerOff) {
        winstonLogger.info(`[${prefix}] ${text}`)
      }
    },
    debug: function(text) {
      if (!isLoggerOff) {
        winstonLogger.debug(`[${prefix}] ${text}`)
      }
    },
    onFinish: function(callback) {
      winstonLogger.on('finish', callback);
      isLoggerOff = true;
    }
  };

  return prefixedLogger
}

module.exports = logger;
