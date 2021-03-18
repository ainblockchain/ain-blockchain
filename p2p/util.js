/**
 * This file contains utility functions for shard reporters to communicate with
 * the parent_chain_poc through API calls. In the future, these should be refactored
 * into a module, or replaced with another protocol for cross-shard communication.
 */

const { sleep } = require('sleep');
const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const logger = require('../logger')('SERVER_UTIL');
const { CURRENT_PROTOCOL_VERSION } = require('../common/constants');
const ChainUtil = require('../common/chain-util');

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
    const success = !ChainUtil.transactionFailed(_.get(resp, 'data.result'), null);
    return {success};
  }).catch((err) => {
    logger.error(`Failed to send transaction: ${err}`);
    return {errMsg: err.message, success: false};
  });
}

async function signAndSendTx(endpoint, tx, privateKey) {
  const {txHash, signedTx} = ChainUtil.signTx(tx, privateKey);
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
    sleep(1);
  }
}

function sendGetRequest(endpoint, method, params) {
  // NOTE(seo): .then() was used here to avoid some unexpected behavior of axios.post()
  //            (see https://github.com/ainblockchain/ain-blockchain/issues/101)
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
  return Object.keys(connectionObj).filter(address => connectionObj[address] === socket);
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

function verifySignedMessage(message) {
  return ainUtil.ecVerifySig(JSON.stringify(message.body), message.signature, message.body.address);
}

module.exports = {
  sendTxAndWaitForFinalization,
  sendSignedTx,
  signAndSendTx,
  sendGetRequest,
  getAddressFromSocket,
  removeSocketConnectionIfExists,
  signMessage,
  verifySignedMessage
};
