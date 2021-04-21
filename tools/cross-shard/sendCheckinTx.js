const path = require('path');
const ChainUtil = require('../../common/chain-util');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildPayloadTxBody(fromAddr, toAddr, tokenAmount, timestamp) {
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

function buildTriggerTxBody(address, payload, timestamp) {
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

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const payloadTxBody = buildPayloadTxBody(
      config.userAddr, config.shardOwnerAddr, config.parentTokenAmount, timestamp);
  console.log(`payloadTxBody: ${JSON.stringify(payloadTxBody, null, 2)}`);
  const signedPayloadTx = ChainUtil.signTransaction(payloadTxBody, config.userPrivateKey);
  console.log(`signedPayloadTx: ${JSON.stringify(signedPayloadTx, null, 2)}`);
  console.log(`payloadTxHash: ${signedPayloadTx.txHash}`);

  const triggerTxBody = buildTriggerTxBody(config.userAddr, signedPayloadTx.signedTx, timestamp);
  console.log(`triggerTxBody: ${JSON.stringify(triggerTxBody, null, 2)}`);

  console.log('Sending job transaction...')
  const txInfo = await signAndSendTx(config.endpointUrl, triggerTxBody, config.userPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  return {timestamp, txInfo};
}

async function sendCheckinTransaction() {
  console.log('\n*** sendTransaction():');
  console.log(`config: ${JSON.stringify(config, null, 2)}`);
  const {timestamp, txInfo} = await sendTransaction();
  if (txInfo.success) {
    await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
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
