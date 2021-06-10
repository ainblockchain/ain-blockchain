/**
 * This file contains utility functions for shard reporters to communicate with
 * the parent_chain_poc through API calls. In the future, these should be refactored
 * into a module, or replaced with another protocol for cross-shard communication.
 */

const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const semver = require('semver');
const logger = require('../logger')('SERVER_UTIL');
const {
  CURRENT_PROTOCOL_VERSION,
  DATA_PROTOCOL_VERSION,
  P2P_MESSAGE_TIMEOUT_MS,
  FeatureFlags
} = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const VersionUtil = require('../common/version-util');

function _isValidMessage(message) {
  const body = _.get(message, 'data.body');
  if (!body || !ChainUtil.isDict(body)) {
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
  if (!ChainUtil.isDict(messageBody)) {
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
    return ChainUtil.getAddressFromSignature(hashedMessage, message.data.signature);
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
  if (!type || !ChainUtil.isString(type)) {
    logger.error('Type must be specified.');
    return null;
  };
  if (!dataObj || !ChainUtil.isDict(dataObj)) {
    logger.error('dataObj cannot be null or undefined.');
    return null;
  }
  const message = {
    type: type,
    data: dataObj,
    protoVer: CURRENT_PROTOCOL_VERSION,
    dataProtoVer: DATA_PROTOCOL_VERSION,
    timestamp: Date.now()
  };
  return message;
}

function checkTimestamp(timestamp) {
  if (!timestamp || !ChainUtil.isNumber(timestamp)) {
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

function checkDataProtoVer(nodeMajorVersion, comningVersion, msgType) {
  const comingMajorVersion = VersionUtil.toMajorVersion(comningVersion);
  const isGreater = semver.gt(nodeMajorVersion, comingMajorVersion);
  if (isGreater) {
    if (FeatureFlags.enableRichP2pCommunicationLogging) {
      logger.error(`The given ${msgType} message is stale.`);
    }
    return 1;
  }
  const isLower = semver.lt(nodeMajorVersion, comingMajorVersion);
  if (isLower) {
    if (FeatureFlags.enableRichP2pCommunicationLogging) {
      logger.error('I may be running of the old DATA_PROTOCOL_VERSION of ain-blockchain node. ' +
          'Please check the new release via visiting the URL below:');
      logger.error('https://github.com/ainblockchain/ain-blockchain');
    }
    return -1;
  }
  return 0;
}

module.exports = {
  getAddressFromSocket,
  removeSocketConnectionIfExists,
  signMessage,
  getAddressFromMessage,
  verifySignedMessage,
  closeSocketSafe,
  checkTimestamp,
  checkDataProtoVer,
  encapsulateMessage
};
