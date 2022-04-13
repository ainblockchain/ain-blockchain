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
            function_url: workerTriggerUrl,
            function_id: 'he-trigger',
          },
        },
      },
    },
    timestamp,
    nonce: -1,
  };
}

function usage() {
  console.log('\nExample commandlines:\n  node sendSetFunctionTx.js chainId\n');
}

async function main() {
  // TODO(cshcomcom): Support 'node sendSetFunctionTx.js chainId <config_filename>' and check args
  if (process.argv.length !== 3) {
    usage();
    process.exit(0);
  }
  const chainId = process.argv[2];
  const setFunctionTxBody = buildSetFunctionTxBody(healthCareAppName, Date.now());
  const setFunctionResult =
      await signAndSendTx(endpointUrl, setFunctionTxBody, serviceOwnerPrivateKey, chainId);
  if (!setFunctionResult.success) {
    throw Error(`Can't set function (${JSON.stringify(setFunctionResult, null, 2)})`);
  }
}

main();
