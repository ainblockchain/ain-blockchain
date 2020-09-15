const winston = require('winston');
const { getWinstonLevels, getWinstonTransports } = require('./winston-util');

const logger = new winston.createLogger({
  levels: getWinstonLevels(),
  transports: getWinstonTransports(),
  exitOnError: false
});

module.exports = logger;
