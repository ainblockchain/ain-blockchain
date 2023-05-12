const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const { BlockchainConsts } = require('../../common/constants');
const { getAccountPrivateKey } = require('../util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');

async function sendGetDevClientApiIpWhitelistRequest(endpointUrl, privateKey, chainId) {
  const message = {
    timestamp: Date.now(),
    method: JSON_RPC_METHODS.AIN_GET_NODE_PARAM,
    param: 'DEV_CLIENT_API_IP_WHITELIST',
  };
  const signature = ainUtil.ecSignMessage(stringify(message), Buffer.from(privateKey, 'hex'), chainId);
  const nodeUrl = endpointUrl + (_.endsWith(endpointUrl, '/') ? 'json-rpc' : '/json-rpc');
  return await axios.post(
    nodeUrl,
    {
      method: JSON_RPC_METHODS.AIN_GET_NODE_PARAM,
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

async function getDevClientApiIpWhitelist(endpointUrl, chainId, type, keystoreFilepath) {
  const privateKey = await getAccountPrivateKey(type, keystoreFilepath);
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
  const keystoreFilepath = (accountType === 'keystore') ? process.argv[5] : null;
  if (accountType === 'keystore' && !keystoreFilepath) {
    console.error('Please specify keystore filepath.');
    usage();
  }
  await getDevClientApiIpWhitelist(endpointUrl, chainId, accountType, keystoreFilepath);
}

function usage() {
  console.log('\nUsage: node getDevClientApiIpWhitelist.js <Endpoint Url> <Chain Id> <Account Type> [<Keystore Filepath>]\n');
  console.log('Example: node tools/api-access/getDevClientApiIpWhitelist.js http://localhost:8081 0 private_key');
  console.log('Example: node tools/api-access/getDevClientApiIpWhitelist.js http://localhost:8081 0 mnemonic');
  console.log('Example: node tools/api-access/getDevClientApiIpWhitelist.js http://localhost:8081 0 keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/getDevClientApiIpWhitelist.js https://staging-api.ainetwork.ai 0 keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/getDevClientApiIpWhitelist.js https://testnet-api.ainetwork.ai 0 keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/getDevClientApiIpWhitelist.js https://mainnet-api.ainetwork.ai 1 keystore keystore_blockchain_node.json\n');
  process.exit(0);
}

processArguments();
