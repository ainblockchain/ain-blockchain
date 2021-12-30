const path = require('path');
const _ = require('lodash');
const { signAndSendTx, confirmTransaction } = require('../util');
const { sendGetRequest } = require('../../common/network-util');
let config = {};

async function buildCloseCheckinTxBody(fromAddr, checkinId, failed = false) {
  const request = (await sendGetRequest(`${config.endpointUrl}/json-rpc`, 'ain_get', {
    type: 'GET_VALUE',
    ref: `/checkin/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/${fromAddr}/${checkinId}`,
  })).data.result.result;
  console.log(`request to close = ${JSON.stringify(request, null, 2)}`);
  if (!request) {
    console.log(`No request to close`);
    process.exit(1);
  }
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
      ref: `/checkin/history/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/${fromAddr}/${checkinId}`,
      value: {
        request,
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
  const txBody = await buildCloseCheckinTxBody(config.userAddr, config.checkinId, failed);
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
