const { signAndSendTx } = require('../util');
const { healthCareAppName, ainUrl, ainPrivateKey } = require('./config_local');

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
  const setValueTxBody = buildSetValueTxBody(healthCareAppName, Date.now());
  const setValueResult = await signAndSendTx(ainUrl, setValueTxBody, ainPrivateKey);
  if (!setValueResult.success) {
    throw Error(`Can't set value (${JSON.stringify(setValueResult, null, 2)})`);
  }
}

main();
