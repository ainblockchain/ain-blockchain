'use strict';

const { NodeConfigs } = require('../common/constants');
const getAccountApis = require('./account');
const getApiAccessApis = require('./api-access');
const getBlockApis = require('./block');
const getDatabaseApis = require('./database');
const getEventHandlerApis = require('./event-handler');
const getNetworkApis = require('./network');
const getTransactionApis = require('./transaction');
const getVersionApis = require('./version');

/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {Node} node Instance of the Node class.
 * @param {P2pServer} p2pServer Instance of the the P2pServer class.
 * @param {EventHandler} eventHandler Instance of the EventHandler class.
 * @param {string} minProtocolVersion Minimum compatible protocol version.
 * @param {string} maxProtocolVersion Maximum compatible protocol version.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getApis(node, p2pServer, eventHandler, minProtocolVersion, maxProtocolVersion) {
  // Minimally required APIs
  const apis = {
    ...getAccountApis(node, p2pServer),
    ...getApiAccessApis(node),
  };
  if (NodeConfigs.ENABLE_JSON_RPC_API) {
    Object.assign(apis, {
      ...getBlockApis(node),
      ...getDatabaseApis(node),
      ...getNetworkApis(node, p2pServer),
      ...getTransactionApis(node, p2pServer),
      ...getVersionApis(minProtocolVersion, maxProtocolVersion),
    });
  } else {
    Object.assign(apis, {
      p2p_getPeerCandidateInfo: getNetworkApis(node, p2pServer).p2p_getPeerCandidateInfo,
    });
  }
  if (eventHandler !== null) {
    Object.assign(apis, getEventHandlerApis(eventHandler));
  }

  return apis;
};
