// A tool to transfer native AIN tokens between accounts.
const ainUtil = require('@ainblockchain/ain-util');
const CommonUtil = require('../../common/common-util');
const {
  getAccountPrivateKey,
  signAndDryrunTx,
  signAndSendTx,
  confirmTransaction
} = require('../util');

function buildTransferTxBody(fromAddr, toAddr, key, amount, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/transfer/${fromAddr}/${toAddr}/${key}/value`,
      value: amount,
    },
    gas_price: 500,
    timestamp,
    nonce: -1
  }
}

async function executeTransaction(endpointUrl, chainId, toAddr, ainAmount, account, isDryrun) {
  console.log('\n*** executeTransaction():');
  const timestamp = Date.now();

  const txBody =
      buildTransferTxBody(account.address, toAddr, timestamp, ainAmount, timestamp);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  let txInfo = null;
  if (isDryrun) {
    txInfo = await signAndDryrunTx(endpointUrl, txBody, account.private_key, chainId);
  } else {
    txInfo = await signAndSendTx(endpointUrl, txBody, account.private_key, chainId);
  }
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Transfer transaction failed.`);
    process.exit(0);
  }
  if (!isDryrun) {
    await confirmTransaction(endpointUrl, timestamp, txInfo.txHash);
  }
}

async function executeTransferTx(
    endpointUrl, chainId, toAddr, ainAmount, accountType, keystoreFilepath, isDryrun) {
  const privateKey = await getAccountPrivateKey(accountType, keystoreFilepath);
  const account = ainUtil.privateToAccount(Buffer.from(privateKey, 'hex'));
  console.log(`\nFrom-address: ${account.address}\n`);
  await executeTransaction(endpointUrl, chainId, toAddr, ainAmount, account, isDryrun);
}

async function processArguments() {
  if (process.argv.length < 7 || process.argv.length > 9) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const toAddr = process.argv[4];
  if (!CommonUtil.isCksumAddr(toAddr)) {
    console.log(`The to-address is NOT a checksum address: ${toAddr}`);
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
  let dryrunOption = null;
  if (accountType === 'keystore') {
    if (process.argv.length === 9) {
      dryrunOption = process.argv[8];
    }
  } else {
    if (process.argv.length === 8) {
      dryrunOption = process.argv[7];
    }
  }
  const isDryrun = dryrunOption === '--dryrun';
  await executeTransferTx(endpointUrl, chainId, toAddr, ainAmount, accountType, keystoreFilepath, isDryrun);
}

function usage() {
  console.log('\nUsage: node executeTransferTx.js <Endpoint Url> <Chain Id> <To Address> <Ain Amount> <Account Type> [<Keystore Filepath>] [--dryrun]\n');
  console.log('Example: node executeTransferTx.js http://localhost:8081 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b 10 private_key');
  console.log('Example: node executeTransferTx.js http://localhost:8081 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b 10 mnemonic');
  console.log('Example: node executeTransferTx.js http://localhost:8081 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b 10 keystore keystore_from_account.json');
  console.log('Example: node executeTransferTx.js http://localhost:8081 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b 10 keystore keystore_from_account.json --dryrun');
  console.log('Example: node executeTransferTx.js https://staging-api.ainetwork.ai 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b 10 keystore keystore_from_account.json');
  console.log('Example: node executeTransferTx.js https://testnet-api.ainetwork.ai 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b 10 keystore keystore_from_account.json');
  console.log('Example: node executeTransferTx.js https://mainnet-api.ainetwork.ai 1 0x08Aed7AF9354435c38d52143EE50ac839D20696b 10 keystore keystore_from_account.json\n');
  console.log('Example: node executeTransferTx.js https://mainnet-api.ainetwork.ai 1 0x08Aed7AF9354435c38d52143EE50ac839D20696b 10 keystore keystore_from_account.json --dryrun\n');
  process.exit(0)
}

processArguments();
