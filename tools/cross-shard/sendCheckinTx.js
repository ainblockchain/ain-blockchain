const _ = require("lodash");
const axios = require('axios');
const ainUtil = require('@ainblockchain/ain-util');
const config = require("./config");
const ChainUtil = require('../../chain-util');
const { parentTokenAmount } = require("./config");

const CURRENT_PROTOCOL_VERSION = require('../../package.json').version;

function buildPayloadTx(fromAddr, toAddr, tokenAmount, timestamp) {
  return {
    operation: {
      type: "SET_VALUE",
      ref: `/transfer/${fromAddr}/${toAddr}/${timestamp}/value`,
      value: tokenAmount,
      is_global: true,
    },
    timestamp,
    nonce: -1
  }
}

function buildTriggerTx(address, payload, timestamp) {
  return {
    operation: {
      type: "SET_VALUE",
      ref: `/checkin/${address}/${timestamp}/request`,
      value: {
        payload,
      },
    },
    timestamp,
    nonce: -1
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
      protoVer: CURRENT_PROTOCOL_VERSION,
      transaction: tx,
      signature: sig
    }
  };
}

function signAndSendTx(endpoint, txBody, keyBuffer) {
  const { txHash, signedTx } = signTx(txBody, keyBuffer);
  return axios.post(
      endpoint,
      {
        method: "ain_sendSignedTransaction",
        params: signedTx,
        jsonrpc: "2.0",
        id: 0
      })
  .then(resp => {
    const result = _.get(resp, 'data.result');
    console.log(`result: ${JSON.stringify(result, null, 2)}`);
    if (ChainUtil.transactionFailed(result)) {
      throw Error(`Transaction failed: ${JSON.stringify(result)}`);
    }
    return { txHash, signedTx };
  })
  .catch(err => {
    console.log(`Failed to send transaction: ${err}`);
    return { errMsg: err.message };
  });
}

async function sendTransaction() {
  console.log(`config: ${JSON.stringify(config, null, 2)}`);
  const endpoint = `${config.endpointUrl}/json-rpc`;
  const keyBuffer = Buffer.from(config.userPrivateKey, 'hex');
  const timestamp = Date.now();
  const payloadTxBody =
      buildPayloadTx(config.userAddr, config.shardOwnerAddr, config.parentTokenAmount, timestamp);
  console.log(`payloadTxBody: ${JSON.stringify(payloadTxBody, null, 2)}`);
  const signedPayloadTx = signTx(payloadTxBody, keyBuffer);
  console.log(`signedPayloadTx: ${JSON.stringify(signedPayloadTx, null, 2)}`);
  const triggerTxBody =
      buildTriggerTx(config.userAddr, JSON.stringify(signedPayloadTx.signedTx), timestamp);
  console.log(`triggerTxBody: ${JSON.stringify(triggerTxBody, null, 2)}`);
  console.log('Sending job transaction...')
  const txInfo = await signAndSendTx(endpoint, triggerTxBody, keyBuffer);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
}

function processArguments() {
  if (process.argv.length !== 2) {
    usage();
  }
  return sendTransaction();
}

function usage() {
  console.log('\nExample commandlines:\n  node sendCheckinTx.js\n')
  process.exit(0)
}

processArguments()