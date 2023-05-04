// A tool to stake AIN tokens for a blockchain app.
const ainUtil = require('@ainblockchain/ain-util');
const CommonUtil = require('../../common/common-util');
const { getAccountPrivateKey, signAndSendTx, confirmTransaction } = require('../util');

function buildStakeTxBody(address, appName, ainAmount, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/staking/${appName}/${address}/0/stake/${timestamp}/value`,
      value: ainAmount
    },
    gas_price: 500,
    timestamp,
    nonce: -1
  }
}

async function sendTransaction(endpointUrl, chainId, appName, ainAmount, account) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();
  const txBody = buildStakeTxBody(account.address, appName, ainAmount, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);
  const txInfo = await signAndSendTx(endpointUrl, txBody, account.private_key, chainId);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Stake transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(endpointUrl, timestamp, txInfo.txHash);
}

async function sendStakeTx(endpointUrl, chainId, appName, ainAmount, accountType, keystoreFilepath) {
  const privateKey = await getAccountPrivateKey(accountType, keystoreFilepath);
  const account = ainUtil.privateToAccount(Buffer.from(privateKey, 'hex'));
  console.log(`\nStaking address: ${account.address}\n`);
  await sendTransaction(endpointUrl, chainId, appName, ainAmount, account);
}

async function processArguments() {
  if (process.argv.length !== 7 && process.argv.length !== 8) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const appName = process.argv[4];
  if (!CommonUtil.isString(appName) || appName.length == 0) {
    console.log(`The app name is NOT a valid one: ${appName}`);
    process.exit(0);
  }
  const ainAmount = Number(process.argv[5]);
  if (!CommonUtil.isNumber(ainAmount) || ainAmount <= 0) {
    console.log(`The AIN amount is NOT a valid one: ${ainAmount}`);
    process.exit(0);
  }
  const accountType = process.argv[6];
  const keystoreFilepath = (accountType === 'keystore') ? process.argv[7] : null;
  if (accountType === 'keystore' && !keystoreFilepath) {
    console.error('Please specify keystore filepath.');
    usage();
  }
  await sendStakeTx(endpointUrl, chainId, appName, ainAmount, accountType, keystoreFilepath);
}

function usage() {
  console.log('\nUsage: node sendStakeTx.js <Endpoint Url> <Chain Id> <App Name> <Ain Amount> <Account Type> [<Keystore Filepath>]\n');
  console.log('Example: node sendStakeTx.js http://localhost:8081 0 test_app 100 private_key');
  console.log('Example: node sendStakeTx.js http://localhost:8081 0 test_app 100 mnemonic');
  console.log('Example: node sendStakeTx.js http://localhost:8081 0 test_app 100 keystore keystore_user.json');
  console.log('Example: node sendStakeTx.js https://staging-api.ainetwork.ai 0 test_app 100 keystore keystore_user.json');
  console.log('Example: node sendStakeTx.js https://testnet-api.ainetwork.ai 0 test_app 100 keystore keystore_user.json');
  console.log('Example: node sendStakeTx.js https://mainnet-api.ainetwork.ai 1 test_app 100 keystore keystore_user.json\n');
  process.exit(0);
}

processArguments();
