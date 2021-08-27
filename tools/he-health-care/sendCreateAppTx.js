const { signAndSendTx } = require('../util');
const { healthCareAppName, ainUrl, ainPrivateKey, ainAddress } = require('./config_local');

function buildCreateAppTxBody(appName, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/manage_app/${appName}/create/${timestamp}`,
      value: {
        admin: {
          [ainAddress]: true,
        },
      },
    },
    timestamp,
    nonce: -1,
  };
}

async function main() {
  const createHealthCareAppTxBody = buildCreateAppTxBody(healthCareAppName, Date.now());
  const createResult = await signAndSendTx(ainUrl, createHealthCareAppTxBody, ainPrivateKey);
  if (!createResult.success) {
    throw Error(`Can't create health care app (${JSON.stringify(createResult, null, 2)})`);
  }
}

main();
