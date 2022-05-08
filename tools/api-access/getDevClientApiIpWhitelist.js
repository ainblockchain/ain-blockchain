const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const { BlockchainConsts } = require('../../common/constants');
const { getAccountPrivateKey } = require('./util');

async function sendGetDevClientApiIpWhitelistRequest(endpointUrl, privateKey, chainId) {
  const message = {
    timestamp: Date.now(),
    method: 'ain_getDevClientApiIpWhitelist',
  };
  const signature = ainUtil.ecSignMessage(stringify(message), Buffer.from(privateKey, 'hex'), chainId);
  return await axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: 'ain_getDevClientApiIpWhitelist',
      params: {
        protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
        message,
        signature,
      },
      jsonrpc: '2.0',
      id: 0
    }
  ).then(function(resp) {
    return _.get(resp, 'data.result.result');
  });
}

async function getDevClientApiIpWhitelist(endpointUrl, chainId, type, keystoreFilePath) {
  const privateKey = await getAccountPrivateKey(type, keystoreFilePath);
  const res = await sendGetDevClientApiIpWhitelistRequest(endpointUrl, privateKey, chainId);
  console.log('Result:', res);
}

async function processArguments() {
  if (process.argv.length !== 5 && process.argv.length !== 6) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const accountType = process.argv[4];
  const keystoreFilePath = process.argv[5];
  await getDevClientApiIpWhitelist(endpointUrl, chainId, accountType, keystoreFilePath);
}

function usage() {
  console.log('\nUsage:\n  node getDevClientApiIpWhitelist.js <NODE_ENDPOINT> <CHAIN_ID> <ACCOUNT_TYPE> [<KEYSTORE_FILE_PATH>]\n');
  console.log('\nExamples:');
  console.log('node tools/api-access/getDevClientApiIpWhitelist.js http://localhost:8081 0 private_key');
  console.log('node tools/api-access/getDevClientApiIpWhitelist.js http://localhost:8081 0 mnemonic');
  console.log('node tools/api-access/getDevClientApiIpWhitelist.js http://localhost:8081 0 keystore /path/to/keystore/file');
  process.exit(0);
}

processArguments();
