// TODO(liayoo): Make the functions in this file static.

/**
 * This file contains utility functions for shard reporters to communicate with
 * the parent_chain_poc through API calls. In the future, these should be refactored
 * into a module, or replaced with another protocol for cross-shard communication.
 */
const logger = new (require('../logger'))('SERVER_UTIL');

const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const {
  BlockchainConsts,
  NodeConfigs
} = require('../common/constants');
const CommonUtil = require('../common/common-util');
const DB = require('../db');

class P2pUtil {
  static _isValidMessage(message) {
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

  static getAddressFromSocket(connectionObj, socket) {
    return Object.keys(connectionObj).find(address => connectionObj[address].socket === socket);
  }

  static _removeSocketConnectionIfExists(connectionObj, address) {
    if (address in connectionObj) {
      delete connectionObj[address];
      logger.info(`Address(${address}) has just been disconnected.`);
    }
  }

  // NOTE(minsulee2): this is also called in case address is not set on in/outbound.
  static closeSocketSafe(connections, socket) {
    const address = P2pUtil.getAddressFromSocket(connections, socket);
    P2pUtil._removeSocketConnectionIfExists(connections, address);
    socket.close();
  }

  static closeSocketSafeByAddress(connections, address) {
    const socket = connections[address].socket;
    socket.close();
    P2pUtil._removeSocketConnectionIfExists(connections, address);
  }

  static signMessage(messageBody, privateKey) {
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
    const chainId = DB.getBlockchainParam('genesis/chain_id');
    return ainUtil.ecSignMessage(JSON.stringify(messageBody), privateKeyBuffer, chainId);
  }

  static getAddressFromMessage(message) {
    if (!P2pUtil._isValidMessage(message)) {
      return null;
    } else {
      const hashedMessage = ainUtil.hashMessage(JSON.stringify(message.data.body));
      return CommonUtil.getAddressFromSignature(logger, hashedMessage, message.data.signature);
    }
  }

  static verifySignedMessage(message, address) {
    if (!P2pUtil._isValidMessage(message)) {
      return null;
    } else {
      const chainId = DB.getBlockchainParam('genesis/chain_id');
      return ainUtil.ecVerifySig(JSON.stringify(message.data.body), message.data.signature, address, chainId);
    }
  }

  static encapsulateMessage(type, dataObj) {
    if (!type || !CommonUtil.isString(type)) {
      logger.error('Type must be specified.');
      return null;
    };
    if (!dataObj || !CommonUtil.isDict(dataObj)) {
      logger.error('dataObj cannot be null or undefined.');
      return null;
    }
    const message = {
      type,
      data: dataObj,
      protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
      dataProtoVer: BlockchainConsts.DATA_PROTOCOL_VERSION,
      networkId: DB.getBlockchainParam('genesis/network_id'),
      timestamp: Date.now()
    };
    return message;
  }

  static checkTimestamp(timestamp) {
    if (!timestamp || !CommonUtil.isNumber(timestamp)) {
      return false;
    } else {
      const now = Date.now();
      if (now - timestamp > NodeConfigs.P2P_MESSAGE_TIMEOUT_MS) {
        return false;
      } else {
        return true;
      }
    }
  }

  static checkPeerWhitelist(address) {
    return NodeConfigs.PEER_WHITELIST === '*' || (CommonUtil.isArray(NodeConfigs.PEER_WHITELIST) &&
      NodeConfigs.PEER_WHITELIST.includes(address));
  }

  static addPeerConnection(peerConnectionsInProgress, url) {
    peerConnectionsInProgress.set(url, true);
  }

  static removeFromPeerConnectionsInProgress(peerConnectionsInProgress, url) {
    peerConnectionsInProgress.delete(url);
  }

  static areIdenticalUrls(url1, url2) {
    if (NodeConfigs.HOSTING_ENV === 'local') {
      const comparingUrl1 = new URL(url1);
      const comapringUrl2 = new URL(url2);
      return CommonUtil.isValidPrivateUrl(comparingUrl1.hostname) &&
          CommonUtil.isValidPrivateUrl(comapringUrl2.hostname) &&
          comparingUrl1.port === comapringUrl2.port;
    } else {
      return url1 === url2;
    }
  }
}

module.exports = P2pUtil;
