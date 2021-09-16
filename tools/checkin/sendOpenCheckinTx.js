const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildOpenCheckinTxBody(fromAddr, tokenAmount, checkinId) {
  // NOTE(liayoo): `sender` is the address on `networkName` that will send `tokenId` tokens to the pool.
  // For example, with the Eth token bridge, it will be an Ethereum address that will send ETH to the pool.
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/checkin/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/${fromAddr}/${checkinId}`,
      value: {
        amount: tokenAmount,
        sender: config.senderAddr
      },
      is_global: true,
    },
    timestamp: Date.now(),
    nonce: -1
  }
}

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const txBody = buildOpenCheckinTxBody(config.userAddr, config.tokenAmount, config.checkinId);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.userPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Open checkin transaction failed.`);
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
  console.log('\nExample commandlines:\n  node sendOpenCheckinTx.js config_local.js\n')
  process.exit(0)
}

processArguments();
