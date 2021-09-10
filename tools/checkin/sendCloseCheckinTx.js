const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
const { FunctionResultCode } = require('../../common/constants');
let config = {};

function buildCloseCheckinTxBody(fromAddr, tokenAmount, checkinId, failed = false) {
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
      ref: `/checkin/history/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/${fromAddr}/${checkinId}`,
      value: {
        request: {
          amount: tokenAmount,
          sender: config.senderAddr
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
  const txBody = buildCloseCheckinTxBody(config.userAddr, config.tokenAmount, config.checkinId, failed);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.tokenPoolPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Close checkin transaction failed.`);
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
  console.log('\nExample commandlines:\n  node sendCloseCheckinTx.js config_local.js [--failed]\n')
  process.exit(0)
}

processArguments();
