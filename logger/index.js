/* eslint new-cap: "off" */
const winston = require('winston');
const { getWinstonLevels, getWinstonColors, getWinstonTransports } = require('./winston-util');

const winstonLogger = new winston.createLogger({
  levels: getWinstonLevels(),
  transports: getWinstonTransports(),
  exitOnError: false
});

winston.addColors(getWinstonColors());

global.isLoggerOff = false;

class Logger {
  constructor(prefix) {
    this.prefix = prefix;
  }

  error(text) {
    if (!isLoggerOff) {
      winstonLogger.error(`[${this.prefix}] ${text}`)
    }
  }

  info(text) {
    if (!isLoggerOff) {
      winstonLogger.info(`[${this.prefix}] ${text}`)
    }
  }

  debug(text) {
    if (!isLoggerOff) {
      winstonLogger.debug(`[${this.prefix}] ${text}`)
    }
  }

  onFinish(callback) {
    winstonLogger.on('finish', callback);
    isLoggerOff = true;
  }
}

module.exports = Logger;
