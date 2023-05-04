// A tool to deregister a URL from the developers URL whitelist (i.e., REST function URL whitelist).
// This should be executed with developer's keystore files.
// This can be tested with the tool scripts under tools/chatbot.
const ainUtil = require('@ainblockchain/ain-util');
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const { getAccountPrivateKey, signAndSendTx, confirmTransaction } = require('../util');

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

async function sendTransaction(endpointUrl, chainId, urlKey, address, privateKey) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody = buildTxBody(timestamp, address, urlKey);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(endpointUrl, txBody, privateKey, chainId);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(endpointUrl, timestamp, txInfo.txHash);
}

async function sendRemoveFromDevelopersUrlWhitelistTx(endpointUrl, chainId, urlKey, accountType, keystoreFilepath) {
  const privateKey = await getAccountPrivateKey(accountType, keystoreFilepath);
  const account = ainUtil.privateToAccount('0x' + privateKey);
  console.log(`\nAccount address: ${account.address}\n`);
  await sendTransaction(endpointUrl, chainId, urlKey, account.address, privateKey);
}

async function processArguments() {
  if (process.argv.length !== 6 && process.argv.length !== 7) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const urlKey = process.argv[4];
  if (!CommonUtil.isString(urlKey) || urlKey.length == 0) {
    console.log(`The URL key is NOT a valid one: ${urlKey}`);
    process.exit(0);
  }
  const accountType = process.argv[5];
  const keystoreFilepath = (accountType === 'keystore') ? process.argv[6] : null;
  if (accountType === 'keystore' && !keystoreFilepath) {
    console.error('Please specify keystore filepath.');
    usage();
  }
  await sendRemoveFromDevelopersUrlWhitelistTx(endpointUrl, chainId, urlKey, accountType, keystoreFilepath);
}

function usage() {
  console.log('\nUsage: node sendRemoveFromDevelopersUrlWhitelistTx.js <Endpoint Url> <UrL Key> <Account Type> [<Keystore Filepath>]\n');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js http://localhost:8081 0 0 private_key');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js http://localhost:8081 0 0 mnemonic');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js http://localhost:8081 0 0 keystore keystore_developer.json');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js https://staging-api.ainetwork.ai 0 0 keystore keystore_developer.json');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js https://testnet-api.ainetwork.ai 0 0 keystore keystore_developer.json');
  console.log('Example: node sendRemoveFromDevelopersUrlWhitelistTx.js https://mainnet-api.ainetwork.ai 1 0 keystore keystore_developer.json\n');
  process.exit(0)
}

processArguments();