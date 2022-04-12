const { signAndSendTx } = require('../util');
const { healthCareAppName, endpointUrl, serviceOwnerPrivateKey } = require('./config_local');

function buildSetRuleTxBody(appName, timestamp) {
  return {
    operation: {
      type: 'SET_RULE',
      ref: `/apps/${appName}`,
      value: {
        '.rule': {
          'write': true,
        },
      },
    },
    timestamp,
    gas_price: 500,
    nonce: -1,
  };
}

function usage() {
  console.log('\nExample commandlines:\n  node sendSetRuleTx.js chainId\n');
}

async function main() {
  // TODO(cshcomcom): Support 'node sendSetRuleTx.js <config_filename>' and check args
  if (process.argv.length !== 3) {
    usage();
    process.exit(0);
  }
  const chainId = process.argv[2];
  const setRuleTxBody = buildSetRuleTxBody(healthCareAppName, Date.now());
  const setRuleResult =
      await signAndSendTx(endpointUrl, setRuleTxBody, serviceOwnerPrivateKey, chainId);
  if (!setRuleResult.success) {
    throw Error(`Can't set rule (${JSON.stringify(setRuleResult, null, 2)})`);
  }
}

main();
