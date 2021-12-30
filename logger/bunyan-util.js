/* eslint-disable no-multi-spaces */
const { LoggingBunyan } = require('@google-cloud/logging-bunyan');
const RotatingFileStream = require('bunyan-rotating-file-stream');
const bunyanFormat = require('bunyan-format');
const path = require('path');
const fs = require('fs');
const { NodeConfigs } = require('../common/constants');
const logDir = path.join(NodeConfigs.LOGS_DIR, String(NodeConfigs.PORT));
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const prefix = process.argv[1].includes('client') ?
    `node-${NodeConfigs.PORT}` : `tracker-${NodeConfigs.PORT}`;
const currentLevel = NodeConfigs.DEBUG ? 'debug' : 'info';

const gcloudLoggingBunyan = () => {
  return new LoggingBunyan().stream(currentLevel);
}

const getBunyanConsoleTransport = () => {
  return { stream: bunyanFormat({ outputMode: 'short', color: true }), level: currentLevel };
};

const getBunyanDailyCombinedFileTransport = () => {
  return {
    level: currentLevel,
    stream: new RotatingFileStream({
      path: `${logDir}/${prefix}-combined-%d-%b-%y.log`,
      period: '1d',          // daily rotation
      totalFiles: 10,        // keep up to 10 back copies
      rotateExisting: true,  // Give ourselves a clean file when we start up, based on period
      threshold: '100m',     // Rotate log files larger than 100 megabytes
      gzip: true,            // Compress the archive log files to save space
    })
  };
};

const getBunyanDailyErrorFileTransport = () => {
  return {
    level: 'error',
    stream: new RotatingFileStream({
      path: `${logDir}/${prefix}-error-%d-%b-%y.log`,
      period: '1d',          // daily rotation
      totalFiles: 10,        // keep up to 10 back copies
      rotateExisting: true,  // Give ourselves a clean file when we start up, based on period
      threshold: '100m',     // Rotate log files larger than 100 megabytes
      gzip: true,            // Compress the archive log files to save space
    })
  };
};

const getBunyanTransports = () => {
  if (NodeConfigs.LIGHTWEIGHT) {
    return [getBunyanDailyErrorFileTransport()];
  }
  const transports = [
    getBunyanDailyCombinedFileTransport(),
    getBunyanDailyErrorFileTransport(),
  ];
  if (NodeConfigs.CONSOLE_LOG) {
    transports.push(getBunyanConsoleTransport());
  }
  if (NodeConfigs.HOSTING_ENV === 'gcp') {
    transports.push(gcloudLoggingBunyan());
  }
  return transports;
}

module.exports = {
  getBunyanTransports,
}
