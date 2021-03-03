const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildClaimTxBody(ownerAddr, userAddr, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/payments/test_service/${userAddr}/claim/${timestamp}`,
      value: {
        amount: 10000,
        target: ownerAddr
      }
    },
    timestamp,
    nonce: -1
  }
}

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody = buildClaimTxBody(config.serviceOwnerAddr, config.userAddr, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.serviceOwnerPrivateKey);
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
  console.log('\nExample commandlines:\n  node sendClaimTx.js config_local.js\n')
  process.exit(0)
}

processArguments();