const winston = require('winston');
const { getWinstonLevels, getWinstonColors, getWinstonTransports } = require('./winston-util');

const logger = new winston.createLogger({
  levels: getWinstonLevels(),
  transports: getWinstonTransports(),
  exitOnError: false
});

winston.addColors(getWinstonColors());

module.exports = logger;
