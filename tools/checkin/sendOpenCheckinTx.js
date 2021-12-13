const path = require('path');
const Accounts = require('web3-eth-accounts');
const stringify = require('fast-json-stable-stringify');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildOpenCheckinTxBody(fromAddr, tokenAmount, checkinId) {
  // NOTE(liayoo): `sender` is the address on `networkName` that will send `tokenId` tokens to the pool.
  //    For example, with the Eth token bridge, it will be an Ethereum address that will send ETH to the pool.
  // NOTE(liayoo): `sender_proof` is a signature of the stringified { ref, amount, sender, timestamp, nonce },
  //    signed with the sender key.
  const ref = `/checkin/requests/ETH/3/0xB16c0C80a81f73204d454426fC413CAe455525A7/${fromAddr}/${checkinId}`;
  const timestamp = Date.now();
  const body = {
    ref,
    amount: tokenAmount,
    sender: config.senderAddr,
    timestamp,
    nonce: -1,
  };
  const ethAccounts = new Accounts();
  const senderProof = ethAccounts.sign(ethAccounts.hashMessage(stringify(body)), '0x' + config.senderPrivateKey).signature;
  return {
    operation: {
      type: 'SET_VALUE',
      ref,
      value: {
        amount: tokenAmount,
        sender: config.senderAddr,
        sender_proof: senderProof,
      },
      is_global: true,
    },
    timestamp,
    nonce: -1
  }
}

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const txBody = buildOpenCheckinTxBody(config.userAddr, config.tokenAmount, config.checkinId);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.userPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Open checkin transaction failed.`);
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
  console.log('\nExample commandlines:\n  node sendOpenCheckinTx.js config_local.js\n')
  process.exit(0)
}

processArguments();
