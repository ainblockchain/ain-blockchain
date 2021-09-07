/**
 * This file contains utility functions for shard reporters to communicate with
 * the parent_chain_poc through API calls. In the future, these should be refactored
 * into a module, or replaced with another protocol for cross-shard communication.
 */

const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('SERVER_UTIL');
const {
  CURRENT_PROTOCOL_VERSION,
  DATA_PROTOCOL_VERSION,
  P2P_MESSAGE_TIMEOUT_MS,
  NETWORK_ID
} = require('../common/constants');
const CommonUtil = require('../common/common-util');

function _isValidMessage(message) {
  const body = _.get(message, 'data.body');
  if (!body || !CommonUtil.isDict(body)) {
    logger.error('Data body is not included in the message.');
    return false;
  }
  const signature = _.get(message, 'data.signature');
  if (!signature) {
    logger.error('Data signature is not included in the message.');
    return false;
  }
  return true;
}

function getAddressFromSocket(connectionObj, socket) {
  return Object.keys(connectionObj).find(address => connectionObj[address].socket === socket);
}

function removeSocketConnectionIfExists(connectionObj, address) {
  if (address in connectionObj) {
    delete connectionObj[address];
    logger.info(` => Updated managed peers info: ${Object.keys(connectionObj)}`);
  }
}

function closeSocketSafe(connections, socket) {
  const address = getAddressFromSocket(connections, socket);
  removeSocketConnectionIfExists(connections, address);
  socket.close();
}

function signMessage(messageBody, privateKey) {
  if (!CommonUtil.isDict(messageBody)) {
    logger.error('The message body must be the object type.');
    return null;
  }
  let privateKeyBuffer;
  try {
    privateKeyBuffer = Buffer.from(privateKey, 'hex');
  } catch {
    logger.error('The private key is not correctly set on the buffer to sign a message.');
    return null;
  }
  if (!privateKey || !ainUtil.isValidPrivate(privateKeyBuffer)) {
    logger.error('The private key is not optional but mandatory or worng private key is typed.');
    return null;
  }
  return ainUtil.ecSignMessage(JSON.stringify(messageBody), privateKeyBuffer);
}

function getAddressFromMessage(message) {
  if (!_isValidMessage(message)) {
    return null;
  } else {
    const hashedMessage = ainUtil.hashMessage(JSON.stringify(message.data.body));
    return CommonUtil.getAddressFromSignature(hashedMessage, message.data.signature);
  }
}

function verifySignedMessage(message, address) {
  if (!_isValidMessage(message)) {
    return null;
  } else {
    return ainUtil.ecVerifySig(JSON.stringify(message.data.body), message.data.signature, address);
  }
}

function encapsulateMessage(type, dataObj) {
  if (!type || !CommonUtil.isString(type)) {
    logger.error('Type must be specified.');
    return null;
  };
  if (!dataObj || !CommonUtil.isDict(dataObj)) {
    logger.error('dataObj cannot be null or undefined.');
    return null;
  }
  const message = {
    type: type,
    data: dataObj,
    protoVer: CURRENT_PROTOCOL_VERSION,
    dataProtoVer: DATA_PROTOCOL_VERSION,
    networkId: NETWORK_ID,
    timestamp: Date.now()
  };
  return message;
}

function checkTimestamp(timestamp) {
  if (!timestamp || !CommonUtil.isNumber(timestamp)) {
    return false;
  } else {
    const now = Date.now();
    if (now - timestamp > P2P_MESSAGE_TIMEOUT_MS) {
      return false;
    } else {
      return true;
    }
  }
}

function isValidNetworkId(networkId) {
  if (networkId !== NETWORK_ID) {
    return false;
  } else {
    return true;
  }
}

module.exports = {
  getAddressFromSocket,
  removeSocketConnectionIfExists,
  signMessage,
  getAddressFromMessage,
  verifySignedMessage,
  closeSocketSafe,
  checkTimestamp,
  encapsulateMessage,
  isValidNetworkId
};
