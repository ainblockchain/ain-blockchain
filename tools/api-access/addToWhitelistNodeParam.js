const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const { BlockchainConsts } = require('../../common/constants');
const { getAccountPrivateKey } = require('../util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');

async function sendAddToWhitelistNodeParamRequest(endpointUrl, privateKey, chainId, param, value) {
  const message = {
    timestamp: Date.now(),
    method: JSON_RPC_METHODS.AIN_ADD_TO_WHITELIST_NODE_PARAM,
    param,
    value,
  };
  const signature = ainUtil.ecSignMessage(stringify(message), Buffer.from(privateKey, 'hex'), chainId);
  const nodeUrl = endpointUrl + (_.endsWith(endpointUrl, '/') ? 'json-rpc' : '/json-rpc');
  return await axios.post(
    nodeUrl,
    {
      method: JSON_RPC_METHODS.AIN_ADD_TO_WHITELIST_NODE_PARAM,
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

async function addToWhitelistNodeParam(endpointUrl, chainId, param, value, accountType, keystoreFilepath) {
  const privateKey = await getAccountPrivateKey(accountType, keystoreFilepath);
  const res = await sendAddToWhitelistNodeParamRequest(endpointUrl, privateKey, chainId, param, value);
  console.log('Result:', res);
}

async function processArguments() {
  if (process.argv.length !== 7 && process.argv.length !== 8) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const param = process.argv[4];
  const value = process.argv[5];
  const accountType = process.argv[6];
  const keystoreFilepath = (accountType === 'keystore') ? process.argv[7] : null;
  if (accountType === 'keystore' && !keystoreFilepath) {
    console.error('Please specify keystore filepath.');
    usage();
  }
  await addToWhitelistNodeParam(endpointUrl, chainId, param, value, accountType, keystoreFilepath);
}

function usage() {
  console.log('\nUsage: node addToWhitelistNodeParam.js <Endpoint Url> <Chain Id> <Param> <Value> <Account Type> [<Keystore Filepath>]\n');
  console.log('Example: node tools/api-access/addToWhitelistNodeParam.js http://localhost:8081 0 DEV_CLIENT_API_IP_WHITELIST 127.0.0.1 private_key');
  console.log('Example: node tools/api-access/addToWhitelistNodeParam.js http://localhost:8081 0 DEV_CLIENT_API_IP_WHITELIST 127.0.0.1 mnemonic');
  console.log('Example: node tools/api-access/addToWhitelistNodeParam.js http://localhost:8081 0 DEV_CLIENT_API_IP_WHITELIST 127.0.0.1 keystore keystore keystore_blockchain_node.json');
  console.log("Example: node tools/api-access/addToWhitelistNodeParam.js http://localhost:8081 0 DEV_CLIENT_API_IP_WHITELIST '*' keystore keystore keystore_blockchain_node.json");
  console.log('Example: node tools/api-access/addToWhitelistNodeParam.js https://staging-api.ainetwork.ai 0 DEV_CLIENT_API_IP_WHITELIST 127.0.0.1 keystore keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/addToWhitelistNodeParam.js https://testnet-api.ainetwork.ai 0 DEV_CLIENT_API_IP_WHITELIST 127.0.0.1 keystore keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/addToWhitelistNodeParam.js https://mainnet-api.ainetwork.ai 1 DEV_CLIENT_API_IP_WHITELIST 127.0.0.1 keystore keystore keystore_blockchain_node.json\n');
  process.exit(0);
}

processArguments();
