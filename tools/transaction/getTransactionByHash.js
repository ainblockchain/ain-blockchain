// A tool to get transaction by hash
const ainUtil = require('@ainblockchain/ain-util');
const { sendGetTxByHashRequest } = require('../util');

async function getTransactionByHash(endpointUrl, txHash) {
  console.log(`\n*** Send request with txHash: ${txHash}`);
  const result = await sendGetTxByHashRequest(endpointUrl, txHash);
  console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);
}

async function processArguments() {
  if (process.argv.length !== 4) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const txHash = process.argv[3];
  await getTransactionByHash(endpointUrl, txHash);
}

function usage() {
  console.log('\nUsage: node getTransactionByHash.js <Endpoint Url> <Transaction Hash>');
  console.log('Example: node getTransactionByHash.js http://localhost:8081 0x40f68c794e8844b48aeefa3a14e62cc2baae95ce1e5e80659f94a75589a3f7de');
  console.log('Example: node getTransactionByHash.js https://staging-api.ainetwork.ai 0x40f68c794e8844b48aeefa3a14e62cc2baae95ce1e5e80659f94a75589a3f7de');
  console.log('Example: node getTransactionByHash.js https://testnet-api.ainetwork.ai 0x40f68c794e8844b48aeefa3a14e62cc2baae95ce1e5e80659f94a75589a3f7de');
  console.log('Example: node getTransactionByHash.js https://mainnet-api.ainetwork.ai 0x40f68c794e8844b48aeefa3a14e62cc2baae95ce1e5e80659f94a75589a3f7de');
  console.log('');
  process.exit(0)
}

processArguments();
