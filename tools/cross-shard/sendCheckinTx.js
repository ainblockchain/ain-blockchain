const path = require('path');
const _ = require('lodash');
const axios = require('axios');
const { sleep } = require('sleep');
const ainUtil = require('@ainblockchain/ain-util');
const ChainUtil = require('../../chain-util');

const CURRENT_PROTOCOL_VERSION = require('../../package.json').version;
let config = {};

function buildPayloadTx(fromAddr, toAddr, tokenAmount, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
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
      type: 'SET_VALUE',
      ref: `${config.shardingPath}/checkin/${address}/${timestamp}/request`,
      value: {
        payload,
      },
      is_global: true,
    },
    timestamp,
    nonce: -1
  }
}

function signTx(tx, privateKey) {
  const keyBuffer = Buffer.from(privateKey, 'hex');
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

function signAndSendTx(endpointUrl, txBody, privateKey) {
  console.log('\n*** signAndSendTx():');
  const { txHash, signedTx } = signTx(txBody, privateKey);
  return axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: 'ain_sendSignedTransaction',
      params: signedTx,
      jsonrpc: '2.0',
      id: 0
    })
    .then(resp => {
      const success = !ChainUtil.transactionFailed(_.get(resp, 'data.result'), null);
      console.log(`result: ${JSON.stringify(success, null, 2)}`);
      return { txHash, signedTx, success };
    })
    .catch(err => {
      console.log(`Failed to send transaction: ${err}`);
      return { errMsg: err.message };
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
    })
    .then(function (resp) {
      return _.get(resp, 'data.result.result', null);
    });
}

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const keyBuffer = Buffer.from(config.userPrivateKey, 'hex');
  const payloadTxBody =
    buildPayloadTx(config.userAddr, config.shardOwnerAddr, config.parentTokenAmount, timestamp);
  console.log(`payloadTxBody: ${JSON.stringify(payloadTxBody, null, 2)}`);
  const signedPayloadTx = signTx(payloadTxBody, keyBuffer);
  console.log(`signedPayloadTx: ${JSON.stringify(signedPayloadTx, null, 2)}`);
  console.log(`payloadTxHash: ${signedPayloadTx.txHash}`);

  const triggerTxBody =
    buildTriggerTx(config.userAddr, signedPayloadTx.signedTx, timestamp);
  console.log(`triggerTxBody: ${JSON.stringify(triggerTxBody, null, 2)}`);

  console.log('Sending job transaction...')
  const txInfo = await signAndSendTx(config.endpointUrl, triggerTxBody, keyBuffer);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  return { timestamp, txInfo };
}

async function confirmTransaction(timestamp, txHash) {
  console.log('\n*** confirmTransaction():');
  console.log(`txHash: ${txHash}`);
  let iteration = 0;
  let result = null;
  while (true) {
    iteration++;
    result = await sendGetTxByHashRequest(config.endpointUrl, txHash);
    sleep(1);
    if (_.get(result, 'is_finalized')) {
      break;
    }
  }
  console.log(`iteration = ${iteration}, result: ${JSON.stringify(result, null, 2)}`);
  console.log(`elapsed time (ms) = ${result.finalized_at - timestamp}`);
}

async function sendCheckinTransaction() {
  console.log('\n*** sendTransaction():');
  console.log(`config: ${JSON.stringify(config, null, 2)}`);
  const { timestamp, txInfo } = await sendTransaction();
  if (txInfo.success) {
    await confirmTransaction(timestamp, txInfo.txHash);
  }
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendCheckinTransaction();
}

function usage() {
  console.log('\nExample commandlines:\n  node sendCheckinTx.js config_local.js\n')
  process.exit(0)
}

processArguments();
