// A tool to register an address to the developers user whitelist.
// This should be executed with blockchain owner's keystore files.
// This can be tested with the tool scripts under tools/chatbot.
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const { keystoreToAccount, signAndSendTx, confirmTransaction } = require('../util');

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

async function sendTransaction(endpointUrl, chainId, developerAddr, keystoreAccount) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody = buildTxBody(timestamp, developerAddr);
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
  const developerAddr = process.argv[4];
  if (!CommonUtil.isCksumAddr(developerAddr)) {
    console.log(`The developer address is NOT a checksum address: ${developerAddr}`);
    process.exit(0);
  }
  const keystoreAccount = await keystoreToAccount(process.argv[5]);
  console.log(`\nKeystore account address: ${keystoreAccount.address}\n`);
  await sendTransaction(endpointUrl, chainId, developerAddr, keystoreAccount);
}

function usage() {
  console.log('\nUsage: node sendAddToDevelopersUserWhitelistTx.js <Endpoint Url> <Developer Address> <Blockchain Owner Keystore Filepath>\n');
  console.log('Example: node sendAddToDevelopersUserWhitelistTx.js http://localhost:8081 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b keystore_blockchain_owner.json');
  console.log('Example: node sendAddToDevelopersUserWhitelistTx.js https://staging-api.ainetwork.ai 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b keystore_blockchain_owner.json');
  console.log('Example: node sendAddToDevelopersUserWhitelistTx.js https://mainnet-api.ainetwork.ai 1 0x08Aed7AF9354435c38d52143EE50ac839D20696b keystore_blockchain_owner.json\n');
  process.exit(0)
}

processArguments();