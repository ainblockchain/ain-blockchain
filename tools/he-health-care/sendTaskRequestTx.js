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
    nonce: -1,
  };
}

async function main() {
  // TODO(sanghee): Support 'node sendTaskRequestTx.js <config_filename>' and check args
  const setValueTxBody = buildSetValueTxBody(healthCareAppName, Date.now());
  const setValueResult = await signAndSendTx(endpointUrl, setValueTxBody, userPrivateKey);
  if (!setValueResult.success) {
    throw Error(`Can't set value (${JSON.stringify(setValueResult, null, 2)})`);
  }
}

main();
