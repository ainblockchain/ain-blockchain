const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildCancelCheckinTxBody(ainErc20Address, fromAddr, checkinId) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/checkin/requests/ETH/3/${ainErc20Address}/${fromAddr}/${checkinId}`,
      value: null,
      is_global: true,
    },
    gas_price: 500,
    timestamp: Date.now(),
    nonce: -1
  }
}

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const txBody = buildCancelCheckinTxBody(config.ainErc20Address, config.userAddr, config.checkinId);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.userPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Cancel checkin transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction();
}

function usage() {
  console.log('\nExample commandlines:\n  node sendCancelCheckinTx.js config_local.js\n')
  process.exit(0)
}

processArguments();
