const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');

function buildUnstakeTxBody(address, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/staking/test_service/${address}/0/unstake/${timestamp}/value`,
      value: 100
    },
    timestamp,
    nonce: -1
  }
}

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const txBody = buildUnstakeTxBody(config.userAddr, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);
  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.userPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Unstake transaction failed.`);
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
  console.log('\nExample commandlines:\n  node sendUnstakeTx.js config_local.js\n')
  process.exit(0)
}

processArguments();
