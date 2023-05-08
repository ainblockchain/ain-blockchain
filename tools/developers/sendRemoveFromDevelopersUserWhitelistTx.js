// A tool to deregister an address from the developers user whitelist.
// This should be executed with blockchain owner's keystore files.
// This can be tested with the tool scripts under tools/chatbot.
const ainUtil = require('@ainblockchain/ain-util');
const CommonUtil = require('../../common/common-util');
const PathUtil = require('../../common/path-util');
const { getAccountPrivateKey, signAndSendTx, confirmTransaction } = require('../util');

function buildTxBody(timestamp, address) {
  const userPath = PathUtil.getDevelopersRestFunctionsUserWhitelistUserPath(address);
  return {
    operation: {
      type: 'SET_VALUE',
      ref: userPath,
      value: null,
    },
    gas_price: 500,
    timestamp,
    nonce: -1
  };
}

async function sendTransaction(endpointUrl, chainId, developerAddr, account) {
  console.log('\n*** sendTransaction():');
  const timestamp = Date.now();

  const txBody = buildTxBody(timestamp, developerAddr);
  console.log(`txBody: ${JSON.stringify(txBody, null, 2)}`);

  const txInfo = await signAndSendTx(endpointUrl, txBody, account.private_key, chainId);
  console.log(`txInfo: ${JSON.stringify(txInfo, null, 2)}`);
  if (!txInfo.success) {
    console.log(`Transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(endpointUrl, timestamp, txInfo.txHash);
}

async function sendRemoveFromDevelopersUserWhitelistTx(endpointUrl, chainId, developerAddr, accountType, keystoreFilepath) {
  const privateKey = await getAccountPrivateKey(accountType, keystoreFilepath);
  const account = ainUtil.privateToAccount(Buffer.from(privateKey, 'hex'));
  console.log(`\nAccount address: ${account.address}\n`);
  await sendTransaction(endpointUrl, chainId, developerAddr, account);
}

async function processArguments() {
  if (process.argv.length !== 6 && process.argv.length !== 7) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const developerAddr = process.argv[4];
  if (!CommonUtil.isCksumAddr(developerAddr)) {
    console.log(`The developer address is NOT a checksum address: ${developerAddr}`);
    process.exit(0);
  }
  const accountType = process.argv[5];
  const keystoreFilepath = (accountType === 'keystore') ? process.argv[6] : null;
  if (accountType === 'keystore' && !keystoreFilepath) {
    console.error('Please specify keystore filepath.');
    usage();
  }
  await sendRemoveFromDevelopersUserWhitelistTx(endpointUrl, chainId, developerAddr, accountType, keystoreFilepath);
}

function usage() {
  console.log('\nUsage: node sendRemoveFromDevelopersUserWhitelistTx.js <Endpoint Url> <Developer Address> <Account Type> [<Keystore Filepath>]\n');
  console.log('Example: node sendRemoveFromDevelopersUserWhitelistTx.js http://localhost:8081 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b private_key');
  console.log('Example: node sendRemoveFromDevelopersUserWhitelistTx.js http://localhost:8081 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b mnemonic');
  console.log('Example: node sendRemoveFromDevelopersUserWhitelistTx.js http://localhost:8081 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b keystore keystore_blockchain_owner.json');
  console.log('Example: node sendRemoveFromDevelopersUserWhitelistTx.js https://staging-api.ainetwork.ai 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b keystore keystore_blockchain_owner.json');
  console.log('Example: node sendRemoveFromDevelopersUserWhitelistTx.js https://testnet-api.ainetwork.ai 0 0x08Aed7AF9354435c38d52143EE50ac839D20696b keystore keystore_blockchain_owner.json');
  console.log('Example: node sendRemoveFromDevelopersUserWhitelistTx.js https://mainnet-api.ainetwork.ai 1 0x08Aed7AF9354435c38d52143EE50ac839D20696b keystore keystore_blockchain_owner.json\n');
  process.exit(0)
}

processArguments();