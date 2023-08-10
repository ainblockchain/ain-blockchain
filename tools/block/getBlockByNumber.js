// A tool to get block by number
const ainUtil = require('@ainblockchain/ain-util');
const { sendGetBlockByNumberRequest } = require('../util');

async function getBlockByNumber(endpointUrl, blockNumber) {
  console.log(`\n*** Send request with blockNumber: ${blockNumber}`);
  const result = await sendGetBlockByNumberRequest(endpointUrl, blockNumber);
  console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);
}

async function processArguments() {
  if (process.argv.length !== 4) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const blockNumber = process.argv[3];
  await getBlockByNumber(endpointUrl, blockNumber);
}

function usage() {
  console.log('\nUsage: node getBlockByNumber.js <Endpoint Url> <Block Number>');
  console.log('Example: node getBlockByNumber.js http://localhost:8081 2519120');
  console.log('Example: node getBlockByNumber.js https://staging-api.ainetwork.ai 2519120');
  console.log('Example: node getBlockByNumber.js https://testnet-api.ainetwork.ai 2519120');
  console.log('Example: node getBlockByNumber.js https://mainnet-api.ainetwork.ai 2519120');
  console.log('');
  process.exit(0)
}

processArguments();
