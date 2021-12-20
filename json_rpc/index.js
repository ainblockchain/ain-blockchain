'use strict';

const { NodeConfigs } = require('../common/constants');
const getAccountApis = require('./account');
const getApiAccessApis = require('./api-access');
const getBlockApis = require('./block');
const getDatabaseApis = require('./database');
const getEventHandlerApis = require('./event-handler');
const getNetworkApis = require('./network');
const getStateModifyingApis = require('./state-modifying');
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
module.exports = function getMethods(node, p2pServer, eventHandler, minProtocolVersion, maxProtocolVersion) {
  // Non-transaction methods
  const nonTxMethods = {
    ...getAccountApis(node, p2pServer),
    ...getApiAccessApis(node),
    ...getBlockApis(node),
    ...getDatabaseApis(node),
    ...getNetworkApis(node, p2pServer),
    ...getTransactionApis(node),
    ...getVersionApis(minProtocolVersion, maxProtocolVersion),
  };

  // Transaction methods
  const txMethods = {
    ...getStateModifyingApis(node, p2pServer),
  };

  const methods = nonTxMethods;
  if (NodeConfigs.ENABLE_JSON_RPC_TX_API) {
    Object.assign(methods, txMethods);
  }
  if (eventHandler !== null) {
    Object.assign(methods, getEventHandlerApis(eventHandler));
  }

  return methods;
};
