const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildMessageTxBody(timestamp, message) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/apps/chatbots/common/message/${timestamp}`,
      value: message,
    },
    timestamp,
    nonce: -1
  };
}

async function sendTransaction(message) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody = buildMessageTxBody(timestamp, message);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.serviceOwnerPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Message transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 3 && process.argv.length !== 4) {
    usage();
  }
  let message = 'Hi';
  if (process.argv.length === 4) {
    message = process.argv[3];
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction(message);
}

function usage() {
  console.log("\nExample commandlines:\n  node sendMessageTx.js config_local.js 'Hello'")
  process.exit(0)
}

processArguments();