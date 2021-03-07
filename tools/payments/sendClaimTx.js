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

function buildOpenEscrowTxBody(source, target, address, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/escrow/${source}/${target}/0/open`,
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
    const openEscrowTxBody = buildOpenEscrowTxBody(`payments|test_service|${config.userAddr}|0`,
        config.serviceOwnerAddr, config.serviceOwnerAddr, timestamp);
    console.log(`openEscrow tx body: ${JSON.stringify(openEscrowTxBody, null, 2)}`);
    const openEscrowTxInfo = await signAndSendTx(config.endpointUrl, openEscrowTxBody, config.serviceOwnerPrivateKey);
    if (!openEscrowTxInfo.success) {
      console.log(`Open escrow failed: ${JSON.stringify(openEscrowTxInfo, null, 2)}`);
      process.exit(0);
    }
    await confirmTransaction(config.endpointUrl, timestamp, openEscrowTxInfo.txHash);
    timestamp = Date.now();
  }

  const txBody = buildClaimTxBody(config.serviceOwnerAddr, config.userAddr, timestamp, escrow ? '0' : undefined);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.serviceOwnerPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (txInfo.success) {
    await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
  }
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
  await sendTransaction(process.argv[3]);
}

function usage() {
  console.log('\nExample commandlines:\n  node sendClaimTx.js config_local.js --escrow\n')
  console.log('Options:')
  console.log('  --escrow: Hold payments in escrow')
  process.exit(0)
}

processArguments();