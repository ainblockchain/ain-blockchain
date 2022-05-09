const rateLimit = require('express-rate-limit');

const { NodeConfigs } = require('../common/constants');

class Middleware {
  constructor () {
    this.readRateLimit = this.setReadRateLimit();
    this.writeRateLimit = this.setWriteRateLimit();
  }

  setReadRateLimit() {
    this.readRateLimit = NodeConfigs.MAX_READ_RATE_LIMIT;
    return this;
  }

  setWriteRateLimit() {
    this.writeRateLimit = NodeConfigs.MAX_WRITE_RATE_LIMIT;
    return this;
  }

  getReadRateLimit() {
    return this.readRateLimit;
  }

  getWriteRateLimit() {
    return this.writeRateLimit;
  }

  emptyHandler(req, res, next) {
    return next();
  }

  readLimiter() {
    return NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT ?
        rateLimit({
          windowMs: 1000,   // 1 second
          max: this.getReadRateLimit()   // limit each IP to maximum of read rate limit
        }) : this.emptyHandler();
  }

  writeLimiter() {
    return NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT ?
        rateLimit({
          windowMs: 1000,   // 1 second
          max: this.getWriteRateLimit()   // limit each IP to maximum of write rate limit
        }) : this.emptyHandler();
  }
}

module.exports = Middleware;
