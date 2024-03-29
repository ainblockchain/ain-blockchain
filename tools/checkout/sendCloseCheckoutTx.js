const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildCloseCheckoutTxBody(ainErc20Address, fromAddr, tokenAmount, checkoutId, failed = false) {
  const response = {
    tx_hash: '0x6af1ec8d4f0a55bac328cb20336ed0eff46fa6334ebd112147892f1b15aafc8c'
  };
  if (failed) {
    response.status = false;
    response.message = 'Ethereum tx failed..'
  } else {
    response.status = true;
  }
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/checkout/history/ETH/3/${ainErc20Address}/${fromAddr}/${checkoutId}`,
      value: {
        request: {
          amount: tokenAmount,
          recipient: config.recipientAddr,
          fee_rate: 0.001,
        },
        response
      },
      is_global: true,
    },
    gas_price: 500,
    timestamp: Date.now(),
    nonce: -1
  }
}

async function sendTransaction(failed) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const txBody = buildCloseCheckoutTxBody(config.ainErc20Address, config.userAddr, config.tokenAmount, config.checkoutId, failed);
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
