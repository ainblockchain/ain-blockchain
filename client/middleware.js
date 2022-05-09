const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { NodeConfigs } = require('../common/constants');
const { getRegexpList } = require('../common/common-util');

class Middleware {
  constructor () {
    this.expressRequestBodySizeLimit = this.setExpressRequestBodySizeLimit();
    this.corsOriginList = this.setCorsOriginList();
    this.readRateLimit = this.setReadRateLimit();
    this.writeRateLimit = this.setWriteRateLimit();
  }

  _emptyHandler() {
    return (req, res, next) => {
      return next();
    }
  }

  setExpressRequestBodySizeLimit() {
    this.expressRequestBodySizeLimit = NodeConfigs.REQUEST_BODY_SIZE_LIMIT;
    return this;
  }

  setCorsOriginList() {
    this.corsOriginList = NodeConfigs.CORS_WHITELIST === '*' ?
    NodeConfigs.CORS_WHITELIST : getRegexpList(NodeConfigs.CORS_WHITELIST);
    return this;
  }

  setReadRateLimit() {
    this.readRateLimit = NodeConfigs.MAX_READ_RATE_LIMIT;
    return this;
  }

  setWriteRateLimit() {
    this.writeRateLimit = NodeConfigs.MAX_WRITE_RATE_LIMIT;
    return this;
  }

  getExpressRequestBodySizeLimit() {
    return this.expressRequestBodySizeLimit;
  }

  getCorsOriginList() {
    return this.corsOriginList;
  }

  getReadRateLimit() {
    return this.readRateLimit;
  }

  getWriteRateLimit() {
    return this.writeRateLimit;
  }

  expressJsonRequestBodySizeLimiter() {
    return express.json({ limit: this.getExpressRequestBodySizeLimit() });
  }

  expressUrlencdedRequestBodySizeLimiter() {
    return express.urlencoded({
      extended: true,
      limit: this.getExpressRequestBodySizeLimit()
    });
  }

  corsLimiter() {
    return cors({ origin: this.getCorsOriginList() })
  }

  readLimiter() {
    return NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT ?
        rateLimit({
          windowMs: 1000,   // 1 second
          max: this.getReadRateLimit()   // limit each IP to maximum of read rate limit
        }) : this._emptyHandler();
  }

  writeLimiter() {
    return NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT ?
        rateLimit({
          windowMs: 1000,   // 1 second
          max: this.getWriteRateLimit()   // limit each IP to maximum of write rate limit
        }) : this._emptyHandler();
  }
}

module.exports = Middleware;
