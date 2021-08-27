const { signAndSendTx } = require('../util');
const { healthCareAppName, ainUrl, serviceOwnerPrivateKey } = require('./config_local');

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
    nonce: -1,
  };
}

async function main() {
  const setRuleTxBody = buildSetRuleTxBody(healthCareAppName, Date.now());
  const setRuleResult = await signAndSendTx(ainUrl, setRuleTxBody, serviceOwnerPrivateKey);
  if (!setRuleResult.success) {
    throw Error(`Can't set rule (${JSON.stringify(setRuleResult, null, 2)})`);
  }
}

main();
