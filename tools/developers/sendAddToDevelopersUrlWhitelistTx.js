// A tool to register a URL to the developers URL whitelist (i.e., REST function URL whitelist).
// This should be executed with developer's keystore files.
// This can be tested with the tool scripts under tools/chatbot.
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const { keystoreToAccount, signAndSendTx, confirmTransaction } = require('../util');

function buildTxBody(timestamp, address, urlKey, urlValue) {
  const urlPath = CommonUtil.appendPath(
      PathUtil.getDevelopersRestFunctionsUrlWhitelistUserPath(address), urlKey);
  return {
    operation: {
      type: 'SET_VALUE',
      ref: urlPath,
      value: urlValue,
    },
    gas_price: 500,
    timestamp,
    nonce: -1
  };
}

async function sendTransaction(endpointUrl, chainId, urlKey, urlValue, keystoreAccount) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  if (!CommonUtil.isCksumAddr(keystoreAccount.address)) {
    console.log(`The developer address is NOT a checksum address: ${keystoreAccount.address}`);
    process.exit(0);
  }
  const txBody = buildTxBody(timestamp, keystoreAccount.address, urlKey, urlValue);
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
  if (process.argv.length !== 7) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const urlKey = process.argv[4];
  if (!CommonUtil.isString(urlKey) || urlKey.length == 0) {
    console.log(`The URL key is NOT a valid one: ${urlKey}`);
    process.exit(0);
  }
  const urlValue = process.argv[5];
  if (!CommonUtil.isValidUrlWhitelistItem(urlValue)) {
    console.log(`The URL value is NOT a valid whitelist item: ${urlValue}`);
    process.exit(0);
  }
  const keystoreAccount = await keystoreToAccount(process.argv[6]);
  console.log(`\nKeystore account address: ${keystoreAccount.address}\n`);
  await sendTransaction(endpointUrl, chainId, urlKey, urlValue, keystoreAccount);
}

function usage() {
  console.log('\nUsage: node sendAddToDevelopersUrlWhitelistTx.js <Endpoint Url> <Chain Id> <URL Key> <URL Value> <Developer Keystore Filepath>\n');
  console.log('Example: node sendAddToDevelopersUrlWhitelistTx.js http://localhost:8081 0 0 http://localhost:8000 keystore_developer.json');
  console.log('Example: node sendAddToDevelopersUrlWhitelistTx.js https://staging-api.ainetwork.ai 0 0 https://mydomain.com keystore_developer.json');
  console.log('Example: node sendAddToDevelopersUrlWhitelistTx.js https://mainnet-api.ainetwork.ai 1 0 https://mydomain.com keystore_developer.json\n');
  process.exit(0)
}

processArguments();