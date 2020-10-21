/**
 * This file contains utility functions for shard reporters to communicate with
 * the parent_chain_poc through API calls. In the future, these should be refactored
 * into a module, or replaced with another protocol for cross-shard communication.
 */

const { sleep } = require('sleep');
const axios = require('axios');
const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');
const logger = require('../logger');
const ChainUtil = require('../chain-util');

const CURRENT_PROTOCOL_VERSION = require('../package.json').version;

async function sendTxAndWaitForConfirmation(endpoint, tx, keyBuffer) {
  const res = await signAndSendTx(endpoint, tx, keyBuffer);
  if (_.get(res, 'errMsg', false) || !_.get(res, 'success', false)) {
    throw Error(`Failed to sign and send tx: ${res.errMsg}`);
  }
  if (!(await waitUntilTxFinalize(endpoint, _.get(res, 'txHash', null)))) {
    throw Error('Transaction did not finalize in time. Try selecting a different parent_chain_poc.');
  }
}

function signTx(tx, keyBuffer) {
  const sig = ainUtil.ecSignTransaction(tx, keyBuffer);
  const sigBuffer = ainUtil.toBuffer(sig);
  const lenHash = sigBuffer.length - 65;
  const hashedData = sigBuffer.slice(0, lenHash);
  const txHash = '0x' + hashedData.toString('hex');
  return {
    txHash,
    signedTx: {
      signature: sig,
      transaction: tx
    }
  };
}

async function sendSignedTx(endpoint, signedTxParams) {
  return await axios.post(
      endpoint,
      {
        method: "ain_sendSignedTransaction",
        params: signedTxParams,
        jsonrpc: "2.0",
        id: 0
      })
  .then(resp => {
    const success = _.get(resp, 'data.result', false);
    return { success };
  })
  .catch(err => {
    logger.error(`Failed to send transaction: ${err}`);
    return { errMsg: err.message, success: false };
  });
}

async function signAndSendTx(endpoint, tx, keyBuffer) {
  const { txHash, signedTx } = signTx(tx, keyBuffer);
  params = {
    protoVer: CURRENT_PROTOCOL_VERSION,
    signature: signedTx.signature,
    transaction: signedTx.transaction,
  };
  const result = await sendSignedTx(endpoint, params);
  return Object.assign(result, { txHash });
}

async function waitUntilTxFinalize(endpoint, txHash) {
  while (true) {
    const confirmed = await axios.post(
        endpoint,
        {
          method: "ain_getTransactionByHash",
          params: {
            protoVer: CURRENT_PROTOCOL_VERSION,
            hash: txHash
          },
          jsonrpc: "2.0",
          id: 0
        })
    .then(resp => {
      return (_.get(resp, 'data.result.result.is_confirmed', false) === true);
    })
    .catch(err => {
      logger.error(`Failed to confirm transaction: ${err}`);
      return false;
    });
    if (confirmed) {
      return true;
    }
    sleep(1);
  }
}

async function sendGetRequest(endpoint, method, params) {
  // NOTE(seo): .then() was used here to avoid some unexpected behavior or axios.post()
  //            (see https://github.com/ainblockchain/ain-blockchain/issues/101)
  return await axios.post(
      endpoint,
      {
        method,
        params: Object.assign(params, { protoVer: CURRENT_PROTOCOL_VERSION }),
        jsonrpc: "2.0",
        id: 0
      })
  .then(resp => {
    return resp;
  })
  .catch(err => {
    logger.error(`Failed to send get request: ${err}`);
    return null;
  });
}

module.exports = {
  sendTxAndWaitForConfirmation,
  signAndSendTx,
  sendGetRequest
}