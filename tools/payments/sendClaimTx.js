const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildClaimTxBody(ownerAddr, userAddr, timestamp, escrowKey) {
  const value = {
    amount: 10000,
    target: ownerAddr
  };
  if (escrowKey !== undefined) {
    value.escrow_key = escrowKey;
  }
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/payments/test_service/${userAddr}/0/claim/${timestamp}`,
      value: value
    },
    timestamp,
    nonce: -1
  };
}

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

async function sendTransaction(escrow) {
  console.log('\n*** sendTransaction():');
  let timestamp = Date.now();

  if (escrow) {
    const escrowConfigTxBody = buildEscrowConfigTxBody(`payments|test_service|${config.userAddr}|0`,
        config.serviceOwnerAddr, config.serviceOwnerAddr, timestamp);
    console.log(`escrowConfigTxBody: ${JSON.stringify(escrowConfigTxBody, null, 2)}`);
    const escrowConfigTxInfo = await signAndSendTx(config.endpointUrl, escrowConfigTxBody, config.serviceOwnerPrivateKey);
  console.log(`escrowConfigTxInfo: ${JSON.stringify(escrowConfigTxInfo, null, 2)}`);
    if (!escrowConfigTxInfo.success) {
      console.log(`Escrow config transaction failed.`);
      process.exit(0);
    }
    await confirmTransaction(config.endpointUrl, timestamp, escrowConfigTxInfo.txHash);
    timestamp = Date.now();
  }

  const claimTxBody = buildClaimTxBody(config.serviceOwnerAddr, config.userAddr, timestamp, escrow ? '0' : undefined);
  console.log(`claimTxBody: ${JSON.stringify(claimTxBody, null, 2)}`);

  const claimTxInfo = await signAndSendTx(config.endpointUrl, claimTxBody, config.serviceOwnerPrivateKey);
  console.log(`claimTxInfo: ${JSON.stringify(claimTxInfo, null, 2)}`);
  if (!claimTxInfo.success) {
    console.log(`Claim transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, claimTxInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 3 && process.argv.length !== 4) {
    usage();
  }
  if (process.argv.length === 4 && process.argv[3] !== '--escrow') {
    console.log('Invalid option:', process.argv[3]);
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction(!!process.argv[3]);
}

function usage() {
  console.log('\nExample commandlines:\n  node sendClaimTx.js config_local.js --escrow\n')
  console.log('Options:')
  console.log('  --escrow: Hold payments in escrow')
  process.exit(0)
}

processArguments();