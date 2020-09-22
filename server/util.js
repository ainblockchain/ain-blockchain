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
const MAX_NUM_CONF_CHECK = 10;

async function sendTxAndWaitForConfirmation(endpoint, tx, keyBuffer) {
  const res = await signAndSendTx(endpoint, tx, keyBuffer);
  if (res.errMsg || !res.txHash) {
    throw Error(`Failed to sign and send tx: ${res.errMsg}`);
  }
  if (!(await waitUntilTxFinalize(endpoint, res.txHash))) {
    throw Error('Transaction did not finalize in time. Try selecting a different parent_chain_poc.');
  }
}

async function signAndSendTx(endpoint, tx, keyBuffer) {
  try {
    const sig = ainUtil.ecSignTransaction(tx, keyBuffer);
    const sigBuffer = ainUtil.toBuffer(sig);
    const lenHash = sigBuffer.length - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    const txHash = '0x' + hashedData.toString('hex');
    const response = await axios.post(
      endpoint,
      {
        method: "ain_sendSignedTransaction",
        params: {
          protoVer: CURRENT_PROTOCOL_VERSION,
          signature: sig,
          transaction: tx
        },
        jsonrpc: "2.0",
        id: 0
      }
    );
    if (ChainUtil.transactionFailed(response.data.result)) {
      throw Error(`Transaction failed: ${JSON.stringify(response.data.result)}`);
    }
    return { txHash };
  } catch (e) {
    return { errMsg: e.message };
  }
}

async function waitUntilTxFinalize(endpoint, txHash) {
  let numTries = 0;
  // while (numTries < MAX_NUM_CONF_CHECK) {
  while (true) {
    try {
      const response = await axios.post(
        endpoint,
        {
          method: "ain_getTransactionByHash",
          params: {
            protoVer: CURRENT_PROTOCOL_VERSION,
            hash: txHash
          },
          jsonrpc: "2.0",
          id: 0
        }
      );
      if (_.get(response, 'data.result.result.is_confirmed')) {
        return true;
      }
    } catch (e) {
      logger.error(`Failed to confirm transaction: ${e}`);
      return false;
    }
    sleep(1);
    numTries++;
  }
  return false;
}

async function sendGetRequest(endpoint, method, params) {
  return await axios.post(
    endpoint,
    {
      method,
      params: Object.assign(params, { protoVer: CURRENT_PROTOCOL_VERSION }),
      jsonrpc: "2.0",
      id: 0
    }
  );
}

module.exports = {
  sendTxAndWaitForConfirmation,
  signAndSendTx,
  sendGetRequest
}