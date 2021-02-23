const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');

let config = {};

function buildPaymentsSetupTxBody(address, timestamp) {
  return {
    operation: {
      type: 'SET',
      op_list: [
        {
          type: 'SET_OWNER',
          ref: `/payments/test_service/config/`,
          value: {
            ".owner": {
              "owners": {
                "*": {
                  "branch_owner": false,
                  "write_owner": false,
                  "write_rule": false,
                  "write_function": false
                },
                [address]: {
                  "branch_owner": true,
                  "write_owner": true,
                  "write_rule": true,
                  "write_function": true
                }
              }
            }
          }
        },
        {
          type: 'SET_VALUE',
          ref: `/payments/test_service/config/admin/${address}`,
          value: true
        }
      ]
    },
    timestamp,
    nonce: -1
  }
}

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody = buildPaymentsSetupTxBody(config.serviceOwnerAddr, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.serviceOwnerPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (txInfo.success) {
    await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
  }
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction();
}

function usage() {
  console.log('\nExample commandlines:\n  node sendPaymentsSetupTx.js config_local.js\n')
  process.exit(0)
}

processArguments();