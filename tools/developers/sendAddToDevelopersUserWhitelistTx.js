// A tool to register an address to the developers user whitelist.
// This can be tested with the tool scripts under tools/chatbot.
const path = require('path');
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const { signAndSendTx, confirmTransaction } = require('../util');
let config = {};

function buildMessageTxBody(timestamp, address) {
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

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  if (!CommonUtil.isCksumAddr(config.developerAddr)) {
    console.log(`The developer address is NOT a checksum address: ${config.developerAddr}`);
    process.exit(0);
  }
  const txBody = buildMessageTxBody(timestamp, config.developerAddr);
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
  if (process.argv.length !== 3) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction();
}

function usage() {
  console.log("\nExample commandlines:\n  node sendAddToDevelopersUserWhitelistTx.js config_local.js")
  process.exit(0)
}

processArguments();