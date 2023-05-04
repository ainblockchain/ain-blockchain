// A tool to create a blockchain app.
const moment = require('moment');
const ainUtil = require('@ainblockchain/ain-util');
const CommonUtil = require('../../common/common-util');
const { getAccountPrivateKey, signAndSendTx, confirmTransaction } = require('../util');

function buildCreateAppTxBody(address, appName, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/manage_app/${appName}/create/${timestamp}`,
      value: {
        admin: { [address]: true },
        service: {
          staking: { lockup_duration: moment.duration(1, 'minute').as('milliseconds') }
        }
      }
    },
    gas_price: 500,
    timestamp,
    nonce: -1
  }
}

async function sendTransaction(endpointUrl, chainId, appName, account) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const txBody = buildCreateAppTxBody(account.address, appName, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);
  const txInfo = await signAndSendTx(endpointUrl, txBody, account.private_key, chainId);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Create app transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(endpointUrl, timestamp, txInfo.txHash);
}

async function sendCreateAppTx(endpointUrl, chainId, appName, accountType, keystoreFilepath) {
  const privateKey = await getAccountPrivateKey(accountType, keystoreFilepath);
  const account = ainUtil.privateToAccount(Buffer.from(privateKey, 'hex'));
  console.log(`\nApp admin address: ${account.address}\n`);
  await sendTransaction(endpointUrl, chainId, appName, account);
}

async function processArguments() {
  if (process.argv.length !== 6 && process.argv.length !== 7) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const appName = process.argv[4];
  if (!CommonUtil.isString(appName) || appName.length == 0) {
    console.log(`The app name is NOT a valid one: ${appName}`);
    process.exit(0);
  }
  const accountType = process.argv[5];
  const keystoreFilepath = (accountType === 'keystore') ? process.argv[6] : null;
  if (accountType === 'keystore' && !keystoreFilepath) {
    console.error('Please specify keystore filepath.');
    usage();
  }
  await sendCreateAppTx(endpointUrl, chainId, appName, accountType, keystoreFilepath);
}

function usage() {
  console.log('\nUsage: node sendCreateAppTx.js <Endpoint Url> <Chain Id> <App Name> <Account Type> [<Keystore Filepath>]\n');
  console.log('Example: node sendCreateAppTx.js http://localhost:8081 0 test_app private_key');
  console.log('Example: node sendCreateAppTx.js http://localhost:8081 0 test_app mnemonic');
  console.log('Example: node sendCreateAppTx.js http://localhost:8081 0 test_app keystore keystore_app_admin.json');
  console.log('Example: node sendCreateAppTx.js https://staging-api.ainetwork.ai 0 test_app keystore keystore_app_admin.json');
  console.log('Example: node sendCreateAppTx.js https://testnet-api.ainetwork.ai 0 test_app keystore keystore_app_admin.json');
  console.log('Example: node sendCreateAppTx.js https://mainnet-api.ainetwork.ai 1 test_app keystore keystore_app_admin.json\n');
  process.exit(0)
}

processArguments();
