const { signAndSendTx } = require('../util');
const { healthCareAppName, endpointUrl, userPrivateKey } = require('./config_local');

function buildSetValueTxBody(appName, timestamp) {
  const dummy = 'a'.repeat(4 * 1024); // 8KB
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/apps/${appName}/tasks/${timestamp}`,
      value: dummy,
    },
    timestamp,
    gas_price: 500,
    nonce: -1,
  };
}

function usage() {
  console.log('\nExample commandlines:\n  node sendTaskRequestTx.js chainId\n');
}

async function main() {
  // TODO(cshcomcom): Support 'node sendTaskRequestTx.js <config_filename>' and check args
  if (process.argv.length !== 3) {
    usage();
    process.exit(0);
  }
  const chainId = process.argv[2];
  const setValueTxBody = buildSetValueTxBody(healthCareAppName, Date.now());
  const setValueResult = await signAndSendTx(endpointUrl, setValueTxBody, userPrivateKey, chainId);
  if (!setValueResult.success) {
    throw Error(`Can't set value (${JSON.stringify(setValueResult, null, 2)})`);
  }
}

main();
