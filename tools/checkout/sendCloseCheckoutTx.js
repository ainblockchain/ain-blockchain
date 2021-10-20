const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
const { FunctionResultCode } = require('../../common/constants');
let config = {};

function buildCloseCheckoutTxBody(fromAddr, tokenAmount, checkoutId, failed = false) {
  const response = {
    tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c'
  };
  if (failed) {
    response.status = FunctionResultCode.FAILURE;
    response.error_message = 'Ethereum tx failed..'
  } else {
    response.status = FunctionResultCode.SUCCESS;
  }
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/checkout/history/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/${fromAddr}/${checkoutId}`,
      value: {
        request: {
          amount: tokenAmount,
          recipient: config.recipientAddr
        },
        response
      },
      is_global: true,
    },
    timestamp: Date.now(),
    nonce: -1
  }
}

async function sendTransaction(failed) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const txBody = buildCloseCheckoutTxBody(config.userAddr, config.tokenAmount, config.checkoutId, failed);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.tokenPoolPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Close checkout transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 3 && process.argv.length !== 4) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction(process.argv[3] === '--failed');
}

function usage() {
  console.log('\nExample commandlines:\n  node sendCloseCheckoutTx.js config_local.js [--failed]\n')
  process.exit(0)
}

processArguments();
