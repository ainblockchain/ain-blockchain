/* eslint new-cap: "off" */
const winston = require('winston');
const { getWinstonLevels, getWinstonColors, getWinstonTransports } = require('./winston-util');

const winstonLogger = new winston.createLogger({
  levels: getWinstonLevels(),
  transports: getWinstonTransports(),
  exitOnError: false
});

winston.addColors(getWinstonColors());

const logger = function(prefix) {
  const prefixedLogger = {
    error: function(text) {
      winstonLogger.error(`[${prefix}] ${text}`)
    },
    info: function(text) {
      winstonLogger.info(`[${prefix}] ${text}`)
    },
    debug: function(text) {
      winstonLogger.debug(`[${prefix}] ${text}`)
    }
  }

  return prefixedLogger
}

module.exports = logger;
