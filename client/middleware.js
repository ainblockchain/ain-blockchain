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
const { JSON_RPC_SET_METHOD_SET } = require('../json_rpc/constants');

class Middleware {
  constructor () {
    this.allBlockchainApiRateLimiter = rateLimit({
      windowMs: NodeConfigs.EXPRESS_RATE_LIMIT_WINDOW_SECS * 1000,   // 1 minute window
      max: NodeConfigs.EXPRESS_RATE_LIMIT_WINDOW_SECS * NodeConfigs.MAX_BLOCKCHAIN_API_RATE_LIMIT
    });
    this.jsonRpcReadRateLimiter = rateLimit({
      windowMs: NodeConfigs.EXPRESS_RATE_LIMIT_WINDOW_SECS * 1000,
      max: NodeConfigs.EXPRESS_RATE_LIMIT_WINDOW_SECS * NodeConfigs.MAX_JSON_RPC_API_READ_RATE_LIMIT
    });
    this.jsonRpcWriteRateLimiter = rateLimit({
      windowMs: NodeConfigs.EXPRESS_RATE_LIMIT_WINDOW_SECS * 1000,
      max: NodeConfigs.EXPRESS_RATE_LIMIT_WINDOW_SECS * NodeConfigs.MAX_JSON_RPC_API_WRITE_RATE_LIMIT
    });
  }

  expressJsonRequestBodySizeLimiter() {
    return express.json({ limit: NodeConfigs.REQUEST_BODY_SIZE_LIMIT });
  }

  expressUrlencdedRequestBodySizeLimiter() {
    return express.urlencoded({
      extended: true,
      limit: NodeConfigs.REQUEST_BODY_SIZE_LIMIT
    });
  }

  corsLimiter() {
    return cors({ origin: NodeConfigs.CORS_WHITELIST === '*' ?
        NodeConfigs.CORS_WHITELIST : getRegexpList(NodeConfigs.CORS_WHITELIST) });
  }

  ipWhitelistLimiter() {
    return ipWhitelist((ip) => {
      return isWildcard(NodeConfigs.DEV_CLIENT_API_IP_WHITELIST) ||
          matchUrl(ip, NodeConfigs.DEV_CLIENT_API_IP_WHITELIST) ||
          matchUrl(convertIpv6ToIpv4(ip), NodeConfigs.DEV_CLIENT_API_IP_WHITELIST);
    })
  }

  blockchainApiRateLimiter = (req, res, next) => {
    if (!NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT) {
      return next();
    }
    return this.allBlockchainApiRateLimiter(req, res, next);
  }

  jsonRpcRateLimiter = (req, res, next) => {
    if (!NodeConfigs.ENABLE_EXPRESS_RATE_LIMIT) {
      return next();
    }
    const jsonRpcMethod = _.get(req, 'body.method');
    // NOTE(minsulee2): Write request is controlled tightest that is 1 tps per ip.
    if (JSON_RPC_SET_METHOD_SET.has(jsonRpcMethod)) {
      return this.jsonRpcWriteRateLimiter(req, res, next);
    } else {
      return this.jsonRpcReadRateLimiter(req, res, next);
    }
  }
}

module.exports = Middleware;
