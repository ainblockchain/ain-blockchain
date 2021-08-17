const _ = require('lodash');
const axios = require('axios');
const logger = require('../logger')('NETWORK-UTIL');
const {
  CURRENT_PROTOCOL_VERSION,
  CHAIN_ID
} = require('../common/constants');
const CommonUtil = require('../common/common-util');


async function _waitUntilTxFinalize(endpoint, txHash) {
  while (true) {
    const confirmed = await sendGetRequest(
      endpoint,
      'ain_getTransactionByHash',
      { hash: txHash }
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
    await CommonUtil.sleep(1000);
  }
}

async function sendTxAndWaitForFinalization(endpoint, tx, privateKey) {
  const res = await signAndSendTx(endpoint, tx, privateKey);
  if (_.get(res, 'errMsg', false) || !_.get(res, 'success', false)) {
    throw Error(`Failed to sign and send tx: ${res.errMsg}`);
  }
  if (!(await _waitUntilTxFinalize(endpoint, _.get(res, 'txHash', null)))) {
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
    const result = _.get(resp, 'data.result.result.result', {});
    const success = !CommonUtil.isFailedTx(result);
    return { success, errMsg: result.error_message };
  }).catch((err) => {
    logger.error(`Failed to send transaction: ${err}`);
    return { success: false, errMsg: err.message };
  });
}

// FIXME(minsulee2): this is duplicated function see: ./tools/util.js
async function signAndSendTx(endpoint, tx, privateKey) {
  const { txHash, signedTx } = CommonUtil.signTransaction(tx, privateKey, CHAIN_ID);
  const result = await sendSignedTx(endpoint, signedTx);
  return Object.assign(result, { txHash });
}

function sendGetRequest(endpoint, method, params) {
  // NOTE(platfowner): .then() was used here to avoid some unexpected behavior of axios.post()
  //                   (see https://github.com/ainblockchain/ain-blockchain/issues/101)
  return axios.post(
    endpoint,
    {
      method,
      params: Object.assign(params, { protoVer: CURRENT_PROTOCOL_VERSION }),
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

module.exports = {
  sendTxAndWaitForFinalization,
  sendSignedTx,
  signAndSendTx,
  sendGetRequest
};
