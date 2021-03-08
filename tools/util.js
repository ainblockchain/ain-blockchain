const _ = require('lodash');
const axios = require('axios');
const {sleep} = require('sleep');
const { CURRENT_PROTOCOL_VERSION } = require('../common/constants');
const ChainUtil = require('../common/chain-util');

function signAndSendTx(endpointUrl, txBody, privateKey) {
  console.log('\n*** signAndSendTx():');
  const {txHash, signedTx} = ChainUtil.signTx(txBody, privateKey);
  console.log(`signedTx: ${JSON.stringify(signedTx, null, 2)}`);
  console.log(`txHash: ${txHash}`);
  console.log('Sending transaction...');

  return axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: 'ain_sendSignedTransaction',
      params: signedTx,
      jsonrpc: '2.0',
      id: 0
    }
  ).then((resp) => {
    const success = !ChainUtil.transactionFailed(_.get(resp, 'data.result.result.result', null));
    console.log(`result: ${JSON.stringify(success, null, 2)}`);
    return {txHash, signedTx, success};
  }).catch((err) => {
    console.log(`Failed to send transaction: ${err}`);
    return {errMsg: err.message};
  });
}

async function sendGetTxByHashRequest(endpointUrl, txHash) {
  return await axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: 'ain_getTransactionByHash',
      params: {
        protoVer: CURRENT_PROTOCOL_VERSION,
        hash: txHash,
      },
      jsonrpc: '2.0',
      id: 0
    }
  ).then(function(resp) {
    return _.get(resp, 'data.result.result', null);
  });
}

async function confirmTransaction(endpointUrl, timestamp, txHash) {
  console.log('\n*** confirmTransaction():');
  console.log(`txHash: ${txHash}`);
  let iteration = 0;
  let result = null;
  while (true) {
    iteration++;
    result = await sendGetTxByHashRequest(endpointUrl, txHash);
    sleep(1);
    if (_.get(result, 'is_finalized')) {
      break;
    }
  }
  console.log(`iteration = ${iteration}, result: ${JSON.stringify(result, null, 2)}`);
  console.log(`elapsed time (ms) = ${result.finalized_at - timestamp}`);
}

module.exports = {
  signAndSendTx,
  sendGetTxByHashRequest,
  confirmTransaction,
};