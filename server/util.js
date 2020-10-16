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

async function sendTxListAndWaitForConfirmation(endpoint, txList, keyBuffer) {
  const res = await signAndSendTxList(endpoint, txList, keyBuffer);
  if (res.errMsg || !res.txHashList) {
    throw Error(`Failed to sign and send tx: ${res.errMsg}`);
  }
  if (!(await waitUntilTxListFinalize(endpoint, res.txHashList))) {
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

async function signAndSendTxList(endpoint, txList, keyBuffer) {
  const txHashList = [];
  let params = null;
  if (!Array.isArray(txList)) {
    return {
      txHashList: []
    };
  } else if (txList.length == 1) {
    const { txHash, signedTx } = signTx(txList[0], keyBuffer);
    txHashList.push(txHash);
    params = {
      protoVer: CURRENT_PROTOCOL_VERSION,
      signature: signedTx.signature,
      transaction: signedTx.transaction,
    };
  } else {
    let signedTxList = [];
    for (let tx of txList) {
      const { txHash, signedTx } = signTx(tx, keyBuffer);
      signedTxList.push(signedTx);
      txHashList.push(txHash);
    }
    params = {
      protoVer: CURRENT_PROTOCOL_VERSION,
      tx_list: signedTxList,
    };
  }
  return await axios.post(
      endpoint,
      {
        method: "ain_sendSignedTransaction",
        params,
        jsonrpc: "2.0",
        id: 0
      })
  .then(resp => {
    const result = _.get(resp, 'data.result');
    if (ChainUtil.transactionFailed(result)) {
      throw Error(`Transaction failed: ${JSON.stringify(result)}`);
    }
    return { txHashList };
  })
  .catch(err => {
    logger.error(`Failed to confirm transaction: ${err}`);
    return { errMsg: err.message };
  });
}

async function waitUntilTxListFinalize(endpoint, txHashList) {
  const tasks = [];
  for (let txHash of txHashList) {
    tasks.push(waitUntilTxFinalize(endpoint, txHash));
  }
  return await Promise.all(tasks);
}

async function waitUntilTxFinalize(endpoint, txHash) {
  let numTries = 0;
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
      return (_.get(resp, 'data.result.result.is_confirmed') === true);
    })
    .catch(err => {
      logger.error(`Failed to confirm transaction: ${err}`);
      return false;
    });
    if (confirmed) {
      return true;
    }
    sleep(1);
    numTries++;
  }
}

async function sendGetRequest(endpoint, method, params) {
  return await axios.post(
      endpoint,
      {
        method,
        params: Object.assign(params, { protoVer: CURRENT_PROTOCOL_VERSION }),
        jsonrpc: "2.0",
        id: 0
      })
  .then(function (resp) {
    return _.get(resp, 'data.result.result');
  });
}

module.exports = {
  sendTxListAndWaitForConfirmation,
  signAndSendTxList,
  sendGetRequest
}