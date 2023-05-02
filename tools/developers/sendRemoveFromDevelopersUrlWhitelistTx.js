// A tool to deregister a URL from the developers URL whitelist (i.e., REST function URL whitelist).
// This should be executed with developer's keystore files.
// This can be tested with the tool scripts under tools/chatbot.
const path = require('path');
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const { keystoreToAccount, signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildTxBody(timestamp, address, urlKey) {
  const urlPath = CommonUtil.appendPath(
      PathUtil.getDevelopersRestFunctionsUrlWhitelistUserPath(address), urlKey);
  return {
    operation: {
      type: 'SET_VALUE',
      ref: urlPath,
      value: null,
    },
    gas_price: 500,
    timestamp,
    nonce: -1
  };
}

async function sendTransaction(urlKey, keystoreAccount) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  if (!CommonUtil.isCksumAddr(keystoreAccount.address)) {
    console.log(`The developer address is NOT a checksum address: ${keystoreAccount.address}`);
    process.exit(0);
  }
  const txBody = buildTxBody(timestamp, keystoreAccount.address, urlKey);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, keystoreAccount.private_key);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 5) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  const urlKey = process.argv[3];
  if (!CommonUtil.isString(urlKey) || urlKey.length == 0) {
    console.log(`The URL key is NOT a valid one: ${urlKey}`);
    process.exit(0);
  }
  const keystoreAccount = await keystoreToAccount(process.argv[4]);
  console.log(`\nKeystore account address: ${keystoreAccount.address}\n`);
  await sendTransaction(urlKey, keystoreAccount);
}

function usage() {
  console.log('\nUsage: node sendRemoveFromDevelopersUrlWhitelistTx.js <Config File> <URL Key> <Keystore Filepath>\n');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js config_local.js 0 keystore.json\n');
  process.exit(0)
}

processArguments();