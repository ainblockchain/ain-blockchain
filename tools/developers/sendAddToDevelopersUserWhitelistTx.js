// A tool to register an address to the developers user whitelist.
// This can be tested with the tool scripts under tools/chatbot.
const path = require('path');
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const { keystoreToAccount, signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildTxBody(timestamp, address) {
  const userPath = PathUtil.getDevelopersRestFunctionsUserWhitelistUserPath(address);
  return {
    operation: {
      type: 'SET_VALUE',
      ref: userPath,
      value: true,
    },
    gas_price: 500,
    timestamp,
    nonce: -1
  };
}

async function sendTransaction(developerAddr, keystoreAccount) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody = buildTxBody(timestamp, developerAddr);
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
  const developerAddr = process.argv[3];
  if (!CommonUtil.isCksumAddr(developerAddr)) {
    console.log(`The developer address is NOT a checksum address: ${developerAddr}`);
    process.exit(0);
  }
  const keystoreAccount = await keystoreToAccount(process.argv[4]);
  console.log(`\nKeystore account address: ${keystoreAccount.address}\n`);
  await sendTransaction(developerAddr, keystoreAccount);
}

function usage() {
  console.log('\nUsage: node sendAddToDevelopersUserWhitelistTx.js <Config File> <Developer Address> <Keystore Filepath>\n');
  console.log('Example: node sendAddToDevelopersUserWhitelistTx.js config_local.js 0x09A0d53FDf1c36A131938eb379b98910e55EEfe1 keystore.json\n');
  process.exit(0)
}

processArguments();