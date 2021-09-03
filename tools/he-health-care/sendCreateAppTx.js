const { signAndSendTx } = require('../util');
const { healthCareAppName, endpointUrl, serviceOwnerPrivateKey, serviceOwnerAddr } = require('./config_local');

function buildCreateAppTxBody(appName, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/manage_app/${appName}/create/${timestamp}`,
      value: {
        admin: {
          [serviceOwnerAddr]: true,
        },
      },
    },
    timestamp,
    nonce: -1,
  };
}

async function main() {
  // TODO(sanghee): Support 'node sendCreateAppTx.js <config_filename>' and check args
  const createHealthCareAppTxBody = buildCreateAppTxBody(healthCareAppName, Date.now());
  const createResult = await signAndSendTx(endpointUrl, createHealthCareAppTxBody, serviceOwnerPrivateKey);
  if (!createResult.success) {
    throw Error(`Can't create health care app (${JSON.stringify(createResult, null, 2)})`);
  }
}

main();
