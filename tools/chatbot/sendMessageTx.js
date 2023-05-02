// A tool to send chatting messages to chatbots.
// This can be used with the server code under tools/simple-chatbot-server.
const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildMessageTxBody(timestamp, message) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/apps/${config.appName}/common/messages/${timestamp}/user`,
      value: message,
    },
    gas_price: 500,
    timestamp,
    nonce: -1
  };
}

async function sendTransaction(message) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody = buildMessageTxBody(timestamp, message);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.serviceOwnerPrivateKey, config.chainId);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Transaction failed.`);
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
  console.log("\nUsage: node sendMessageTx.js <Config File> [<Message>]\n")
  console.log("Example: node sendMessageTx.js config_local.js")
  console.log("Example: node sendMessageTx.js config_local.js 'Hello'\n")
  process.exit(0)
}

processArguments();