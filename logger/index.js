/* eslint new-cap: "off" */
const winston = require('winston');
const { getWinstonLevels, getWinstonColors, getWinstonTransports } = require('./winston-util');

const winstonLogger = new winston.createLogger({
  levels: getWinstonLevels(),
  transports: getWinstonTransports(),
  exitOnError: false
});

winston.addColors(getWinstonColors());

global.isFinished = false;

class Logger {
  constructor(prefix) {
    this.prefix = prefix;
  }

  error(text) {
    if (!isFinished) {
      winstonLogger.error(`[${this.prefix}] ${text}`)
    }
  }

  info(text) {
    if (!isFinished) {
      winstonLogger.info(`[${this.prefix}] ${text}`)
    }
  }

  debug(text) {
    if (!isFinished) {
      winstonLogger.debug(`[${this.prefix}] ${text}`)
    }
  }

  finish() {
    isFinished = true;
  }
}

module.exports = Logger;
