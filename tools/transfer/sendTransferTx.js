const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildTransferTxBody(fromAddr, toAddr, key, amount, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/transfer/${fromAddr}/${toAddr}/${key}/value`,
      value: amount,
    },
    timestamp,
    nonce: -1
  }
}

async function sendTransaction(endpointUrl) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  if (!endpointUrl) {
    endpointUrl = config.endpointUrl;
  }

  const txBody =
      buildTransferTxBody(config.fromAddr, config.toAddr, timestamp, config.amount, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(endpointUrl, txBody, config.fromPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Transfer transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(endpointUrl, timestamp, txInfo.txHash);
}

async function processArguments() {
  const len = process.argv.length;
  if (len !== 3 && len !== 4) {
    usage();
  }
  const endpointUrl = len === 4 ? process.argv[3] : null;
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction(endpointUrl);
}

function usage() {
  console.log('\nUsage: node sendTransferTx.js <config file name> [<endpoint url>]\n');
  console.log('Example:  node sendTransferTx.js config_local.js ');
  console.log('Example:  node sendTransferTx.js config_local.js http://111.222.333.44:1234\n');
  process.exit(0)
}

processArguments();
