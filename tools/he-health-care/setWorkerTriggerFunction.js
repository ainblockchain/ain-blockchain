const { signAndSendTx } = require('../util');
const { healthCareAppName, ainUrl, ainPrivateKey } = require('./constants');

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
            service_name: 'https://ainetwork.ai',
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
  const setFunctionTxBody = buildSetFunctionTxBody(healthCareAppName, Date.now());
  const setFunctionResult = await signAndSendTx(ainUrl, setFunctionTxBody, ainPrivateKey);
  if (!setFunctionResult.success) {
    throw Error(`Can't set function (${JSON.stringify(setFunctionResult, null, 2)})`);
  }
}

main();
