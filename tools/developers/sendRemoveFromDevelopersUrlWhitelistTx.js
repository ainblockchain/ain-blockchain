// A tool to deregister a URL from the developers URL whitelist (i.e., REST function URL whitelist).
// This should be executed with developer's keystore files.
// This can be tested with the tool scripts under tools/chatbot.
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const { keystoreToAccount, signAndSendTx, confirmTransaction } = require('../util');

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

async function sendTransaction(endpointUrl, chainId, urlKey, keystoreAccount) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  if (!CommonUtil.isCksumAddr(keystoreAccount.address)) {
    console.log(`The developer address is NOT a checksum address: ${keystoreAccount.address}`);
    process.exit(0);
  }
  const txBody = buildTxBody(timestamp, keystoreAccount.address, urlKey);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(endpointUrl, txBody, keystoreAccount.private_key, chainId);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(endpointUrl, timestamp, txInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 6) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const urlKey = process.argv[4];
  if (!CommonUtil.isString(urlKey) || urlKey.length == 0) {
    console.log(`The URL key is NOT a valid one: ${urlKey}`);
    process.exit(0);
  }
  const keystoreAccount = await keystoreToAccount(process.argv[5]);
  console.log(`\nKeystore account address: ${keystoreAccount.address}\n`);
  await sendTransaction(endpointUrl, chainId, urlKey, keystoreAccount);
}

function usage() {
  console.log('\nUsage: node sendRemoveFromDevelopersUrlWhitelistTx.js <Endpoint Url> <URL Key> <Developer Keystore Filepath>\n');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js http://localhost:8081 0 0 keystore_developer.json');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js https://staging-api.ainetwork.ai 0 0 keystore_developer.json');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js https://mainnet-api.ainetwork.ai 1 0 keystore_developer.json\n');
  process.exit(0)
}

processArguments();