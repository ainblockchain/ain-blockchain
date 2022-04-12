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
    gas_price: 500,
    timestamp,
    nonce: -1,
  };
}

function usage() {
  console.log('\nExample commandlines:\n  node sendCreateAppTx.js chainId\n');
  process.exit(0);
}

async function main() {
  // TODO(cshcomcom): Support 'node sendCreateAppTx.js chainId <config_filename>' and check args
  if (process.argv.length !== 2 && process.argv.length !== 3) {
    usage();
    process.exit(0);
  }
  const chainId = process.argv[2];
  const createHealthCareAppTxBody = buildCreateAppTxBody(healthCareAppName, Date.now());
  const createResult =
      await signAndSendTx(endpointUrl, createHealthCareAppTxBody, serviceOwnerPrivateKey, chainId);
  if (!createResult.success) {
    throw Error(`Can't create health care app (${JSON.stringify(createResult, null, 2)})`);
  }
}

main();
