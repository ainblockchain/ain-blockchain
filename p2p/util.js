/**
 * This file contains utility functions for shard reporters to communicate with
 * the parent_chain_poc through API calls. In the future, these should be refactored
 * into a module, or replaced with another protocol for cross-shard communication.
 */

const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('SERVER_UTIL');
const { CURRENT_PROTOCOL_VERSION } = require('../common/constants');
const ChainUtil = require('../common/chain-util');
const Transaction = require('../tx-pool/transaction');

async function sendTxAndWaitForFinalization(endpoint, tx, privateKey) {
  const res = await signAndSendTx(endpoint, tx, privateKey);
  if (_.get(res, 'errMsg', false) || !_.get(res, 'success', false)) {
    throw Error(`Failed to sign and send tx: ${res.errMsg}`);
  }
  if (!(await waitUntilTxFinalize(endpoint, _.get(res, 'txHash', null)))) {
    throw Error('Transaction did not finalize in time.' +
        'Try selecting a different parent_chain_poc.');
  }
}

async function sendSignedTx(endpoint, params) {
  return await axios.post(
      endpoint,
      {
        method: 'ain_sendSignedTransaction',
        params,
        jsonrpc: '2.0',
        id: 0
      }
  ).then((resp) => {
    const success = !ChainUtil.isFailedTx(_.get(resp, 'data.result.result.result'), null);
    return {success};
  }).catch((err) => {
    logger.error(`Failed to send transaction: ${err}`);
    return {errMsg: err.message, success: false};
  });
}

async function signAndSendTx(endpoint, tx, privateKey) {
  const {txHash, signedTx} = ChainUtil.signTransaction(tx, privateKey);
  const result = await sendSignedTx(endpoint, signedTx);
  return Object.assign(result, {txHash});
}

async function waitUntilTxFinalize(endpoint, txHash) {
  while (true) {
    const confirmed = await sendGetRequest(
        endpoint,
        'ain_getTransactionByHash',
        {hash: txHash}
    )
    .then((resp) => {
      return (_.get(resp, 'data.result.result.is_finalized', false) === true);
    })
    .catch((err) => {
      logger.error(`Failed to confirm transaction: ${err}`);
      return false;
    });
    if (confirmed) {
      return true;
    }
    await ChainUtil.sleep(1000);
  }
}

function sendGetRequest(endpoint, method, params) {
  // NOTE(platfowner): .then() was used here to avoid some unexpected behavior of axios.post()
  //                   (see https://github.com/ainblockchain/ain-blockchain/issues/101)
  return axios.post(
      endpoint,
      {
        method,
        params: Object.assign(params, {protoVer: CURRENT_PROTOCOL_VERSION}),
        jsonrpc: '2.0',
        id: 0
      }
  ).then((resp) => {
    return resp;
  }).catch((err) => {
    logger.error(`Failed to send get request: ${err}`);
    return null;
  });
}

function getAddressFromSocket(connectionObj, socket) {
  return Object.keys(connectionObj).find(address => connectionObj[address] === socket);
}

function removeSocketConnectionIfExists(connectionObj, address) {
  if (address in connectionObj) {
    delete connectionObj[address];
    logger.info(` => Updated managed peers info: ${Object.keys(connectionObj)}`);
  }
}

function signMessage(messageBody, privateKey) {
  return ainUtil.ecSignMessage(JSON.stringify(messageBody), Buffer.from(privateKey, 'hex'));
}

function getAddressFromSignature(message) {
  const hashedMessage = ainUtil.hashMessage(JSON.stringify(message.body));
  // TODO(minsu): getAddress should be in the chain-util??
  return Transaction.getAddress(hashedMessage, message.signature);
}

function verifySignedMessage(message, address) {
  return ainUtil.ecVerifySig(JSON.stringify(message.body), message.signature, address);
}

module.exports = {
  sendTxAndWaitForFinalization,
  sendSignedTx,
  signAndSendTx,
  sendGetRequest,
  getAddressFromSocket,
  removeSocketConnectionIfExists,
  signMessage,
  getAddressFromSignature,
  verifySignedMessage
};
