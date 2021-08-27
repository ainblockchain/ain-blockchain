const { signAndSendTx } = require('../util');
const {
  healthCareAppName,
  endpointUrl,
  serviceOwnerPrivateKey,
  healthCareServiceName,
} = require('./config_local');

const workerTriggerUrl = 'http://localhost:3000/trigger';

function buildSetFunctionTxBody(appName, timestamp) {
  return {
    operation: {
      type: 'SET_FUNCTION',
      ref: `/apps/${appName}/tasks/$key`,
      value: {
        '.function': {
          'he-trigger': {
            function_type: 'REST',
            event_listener: workerTriggerUrl,
            service_name: healthCareServiceName,
            function_id: 'he-trigger',
          },
        },
      },
    },
    timestamp,
    nonce: -1,
  };
}

async function main() {
  // TODO(sanghee): Support 'node sendSetFunctionTx.js <config_filename>' and check args
  const setFunctionTxBody = buildSetFunctionTxBody(healthCareAppName, Date.now());
  const setFunctionResult = await signAndSendTx(endpointUrl, setFunctionTxBody, serviceOwnerPrivateKey);
  if (!setFunctionResult.success) {
    throw Error(`Can't set function (${JSON.stringify(setFunctionResult, null, 2)})`);
  }
}

main();
