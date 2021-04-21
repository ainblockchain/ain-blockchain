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

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody =
      buildTransferTxBody(config.fromAddr, config.toAddr, timestamp, config.amount, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.fromPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (txInfo.success) {
    await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
  }
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction();
}

function usage() {
  console.log('\nExample commandlines:\n  node sendTransferTx.js config_local.js\n')
  process.exit(0)
}

processArguments();