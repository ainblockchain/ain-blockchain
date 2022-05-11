const express = require('express');
const cors = require('cors');
const ipWhitelist = require('ip-whitelist');
const rateLimit = require('express-rate-limit');
const matchUrl = require('match-url-wildcard');

const { NodeConfigs } = require('../common/constants');
const {
  getRegexpList,
  isWildcard
} = require('../common/common-util');
const { convertIpv6ToIpv4 } = require('../common/network-util');

class Middleware {
  constructor () {
    this.setExpressRequestBodySizeLimit();
    this.setCorsOriginList();
    this.setDevClientApiIpWhitelist();
    this.setReadRateLimit();
    this.setWriteRateLimit();
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

  setDevClientApiIpWhitelist() {
    this.devClientApiIpWhitelist = NodeConfigs.DEV_CLIENT_API_IP_WHITELIST;
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

  getDevClientApiIpWhitelist() {
    return this.devClientApiIpWhitelist;
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

  ipWhitelistLimiter() {
    return ipWhitelist((ip) => {
      const whitelist = this.getDevClientApiIpWhitelist();
      return isWildcard(whitelist) ||
          matchUrl(ip, whitelist) ||
          matchUrl(convertIpv6ToIpv4(ip), whitelist);
    })
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

  test() {
    return (req, res, next) => {
      console.log(req)
      return next();
    }
  }

  // NOTE(minsulee2): debugging purpose
  printAll() {
    console.log(this.getCorsOriginList());
    console.log(this.getDevClientApiIpWhitelist());
    console.log(this.getExpressRequestBodySizeLimit());
    console.log(this.getReadRateLimit(), this.getWriteRateLimit());
  }
}

module.exports = Middleware;
