const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');

let config = {};

function buildEscrowConfigTxBody(source, target, address, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/escrow/${source}/${target}/0/config`,
      value: {
        admin: {
          [address]: true
        }
      }
    },
    timestamp,
    nonce: -1
  }
}

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody = buildEscrowConfigTxBody(config.sourceAddr, config.targetAddr, config.serviceOwnerAddr, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.serviceOwnerPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Excrow config transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction();
}

function usage() {
  console.log('\nExample commandlines:\n  node sendEscrowConfigTx.js config_local.js\n')
  process.exit(0)
}

processArguments();