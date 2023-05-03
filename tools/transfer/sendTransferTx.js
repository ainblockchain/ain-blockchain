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
    gas_price: 500,
    timestamp,
    nonce: -1
  }
}

async function sendTransaction(endpointUrl, chainId) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  if (!endpointUrl) {
    endpointUrl = config.endpointUrl;
  }

  const txBody =
      buildTransferTxBody(config.fromAddr, config.toAddr, timestamp, config.amount, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(endpointUrl, txBody, config.fromPrivateKey, chainId);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Transfer transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(endpointUrl, timestamp, txInfo.txHash);
}

async function processArguments() {
  const len = process.argv.length;
  if (len !== 4 && len !== 5) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  const chainId = Number(process.argv[3]);
  const endpointUrl = len === 5 ? process.argv[4] : null;
  await sendTransaction(endpointUrl, chainId);
}

function usage() {
  console.log('\nUsage: node sendTransferTx.js <Config File> <Chain Id> [<Endpoint Url>]\n');
  console.log('Example:  node sendTransferTx.js config_local.js 0');
  console.log('Example:  node sendTransferTx.js config_local.js 0 http://111.222.333.44:1234');
  console.log('Example:  node sendTransferTx.js config_local.js 1 https://mainnet-api.ainetwork.ai\n');
  process.exit(0)
}

processArguments();
