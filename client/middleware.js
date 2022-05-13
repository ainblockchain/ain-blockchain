const _ = require('lodash');
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
const { JSON_RPC_METHOD } = require('../json_rpc/constants');

class Middleware {
  constructor () {
    this.minuteAsSeconds = 60;
    this.setExpressRequestBodySizeLimit();
    this.setCorsOriginList();
    this.setDevClientApiIpWhitelist();
    this.setBlockchainApiRateLimit();
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

  setBlockchainApiRateLimit() {
    this.blockchainApiRateLimit = NodeConfigs.MAX_BLOCKCHAIN_API_RATE_LIMIT;
    return this;
  }

  setReadRateLimit() {
    this.readRateLimit = NodeConfigs.MAX_JSON_RPC_API_READ_RATE_LIMIT;
    return this;
  }

  setWriteRateLimit() {
    this.writeRateLimit = NodeConfigs.MAX_JSON_RPC_API_WRITE_RATE_LIMIT;
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

  getBlockchainApiRateLimit() {
    return this.blockchainApiRateLimit;
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

  blockchainApiLimiter() {
    return NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT ?
      rateLimit({
        windowMs: this.minuteAsSeconds * 1000,   // 1 minute
        max: this.minuteAsSeconds * this.getBlockchainApiRateLimit()
      }) : this._emptyHandler();
  }

  readLimiter() {
    return NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT ?
      rateLimit({
        windowMs: this.minuteAsSeconds * 1000,   // 1 minute
        max: this.minuteAsSeconds * this.getReadRateLimit()
      }) : this._emptyHandler();
  }

  writeLimiter() {
    return NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT ?
      rateLimit({
        windowMs: this.minuteAsSeconds * 1000,   // 1 minute
        max: this.minuteAsSeconds * this.getWriteRateLimit()
      }) : this._emptyHandler();
  }

  jsonRpcLimiter(req, res, next) {
    const jsonRpcMethod = _.get(req, 'body.method');
      switch (jsonRpcMethod) {
        case JSON_RPC_METHOD.AIN_ADD_TO_DEV_CLIENT_API_IP_WHITELIST:
        case JSON_RPC_METHOD.AIN_REMOVE_FROM_DEV_CLIENT_API_IP_WHITELIST:
        case JSON_RPC_METHOD.AIN_INJECT_ACCOUNT_FROM_PRIVATE_KEY:
        case JSON_RPC_METHOD.AIN_INJECT_ACCOUNT_FROM_KEYSTORE:
        case JSON_RPC_METHOD.AIN_INJECT_ACCOUNT_FROM_HD_WALLET:
        case JSON_RPC_METHOD.AIN_SEND_SIGNED_TRANSACTION:
        case JSON_RPC_METHOD.AIN_SEND_SIGNED_TRANSACTION_BATCH:
          return this.writeLimiter();
        default:
          return this.readLimiter();
      }
  }

  // NOTE(minsulee2): debugging purpose
  printAll() {
    console.log(this.getCorsOriginList());
    console.log(this.getDevClientApiIpWhitelist());
    console.log(this.getExpressRequestBodySizeLimit());
    console.log(this.getBlockchainApiRateLimit(), this.getReadRateLimit(), this.getWriteRateLimit());
  }
}

module.exports = Middleware;
