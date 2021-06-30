const path = require('path');
const CommonUtil = require('../../common/common-util');
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
  const signedPayloadTx = CommonUtil.signTransaction(payloadTxBody, config.userPrivateKey);
  console.log(`signedPayloadTx: ${JSON.stringify(signedPayloadTx, null, 2)}`);
  console.log(`payloadTxHash: ${signedPayloadTx.txHash}`);

  const triggerTxBody = buildTriggerTxBody(config.userAddr, signedPayloadTx.signedTx, timestamp);
  console.log(`triggerTxBody: ${JSON.stringify(triggerTxBody, null, 2)}`);

  console.log('Sending job transaction...')
  const triggerTxInfo = await signAndSendTx(config.endpointUrl, triggerTxBody, config.userPrivateKey);
  console.log(`triggerTxInfo: ${JSON.stringify(triggerTxInfo, null, 2)}`);
  if (!triggerTxInfo.success) {
    console.log(`Trigger transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, triggerTxInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction();
}

function usage() {
  console.log('\nExample commandlines:\n  node sendCheckinTx.js config_local.js\n')
  process.exit(0)
}

processArguments();
