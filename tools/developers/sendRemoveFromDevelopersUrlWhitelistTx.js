// A tool to deregister a URL from the developers URL whitelist.
// This can be tested with the tool scripts under tools/chatbot.
const path = require('path');
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const { signAndSendTx, confirmTransaction } = require('../util');
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

async function sendTransaction(urlKey) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  if (!CommonUtil.isCksumAddr(config.developerAddr)) {
    console.log(`The developer address is NOT a checksum address: ${config.developerAddr}`);
    process.exit(0);
  }
  const txBody = buildTxBody(timestamp, config.developerAddr, urlKey);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(config.endpointUrl, txBody, config.serviceOwnerPrivateKey);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, txInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 4) {
    usage();
  }
  const urlKey = process.argv[3];
  if (!CommonUtil.isString(urlKey) || urlKey.length == 0) {
    console.log(`The URL key is NOT a valid one: ${urlKey}`);
    process.exit(0);
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction(urlKey);
}

function usage() {
  console.log("\nExample commandlines:\n  node sendRemoveFromDevelopersUrlWhitelistTx.js config_local.js <URL key>")
  console.log("\nExample commandlines:\n  node sendRemoveFromDevelopersUrlWhitelistTx.js config_local.js 0")
  process.exit(0)
}

processArguments();