/* eslint new-cap: "off" */
const { NodeConfigs, DevFlags } = require('../common/constants');

let logger = null;
if (DevFlags.enableWinstonLogger) {
  const winston = require('winston');
  const { getWinstonLevels, getWinstonColors, getWinstonTransports } = require('./winston-util');

  logger = new winston.createLogger({
    levels: getWinstonLevels(),
    transports: getWinstonTransports(),
    exitOnError: false
  });
  winston.addColors(getWinstonColors());
} else {
  const bunyan = require('bunyan');
  const { getBunyanTransports } = require('./bunyan-util');

  const configsDir = NodeConfigs.BLOCKCHAIN_CONFIGS_DIR.split('/');
  logger = bunyan.createLogger({
    name: configsDir[configsDir.length - 1],
    streams: getBunyanTransports(),
  });
}


global.isFinished = false;

class Logger {
  constructor(prefix) {
    this.prefix = prefix;
  }

  error(text) {
    if (!isFinished) {
      try {
        logger.error(`[${this.prefix}] ${text}`);
      } catch (e) {
        console.error(e);
      }
    }
  }

  info(text) {
    if (!isFinished) {
      try {
        logger.info(`[${this.prefix}] ${text}`);
      } catch (e) {
        console.log(e);
      }
    }
  }

  debug(text) {
    if (!isFinished && NodeConfigs.DEBUG) {
      try {
        logger.debug(`[${this.prefix}] ${text}`);
      } catch (e) {
        console.debug(e);
      }
    }
  }

  finish() {
    isFinished = true;
  }
}

module.exports = Logger;
