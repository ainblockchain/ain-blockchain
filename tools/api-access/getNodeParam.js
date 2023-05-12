const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const { BlockchainConsts } = require('../../common/constants');
const { getAccountPrivateKey } = require('../util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');

async function sendGetNodeParamRequest(endpointUrl, privateKey, chainId, param) {
  const message = {
    timestamp: Date.now(),
    method: JSON_RPC_METHODS.AIN_GET_NODE_PARAM,
    param,
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

async function getNodeParam(endpointUrl, chainId, param, accountType, keystoreFilepath) {
  const privateKey = await getAccountPrivateKey(accountType, keystoreFilepath);
  const res = await sendGetNodeParamRequest(endpointUrl, privateKey, chainId, param);
  console.log('Result:', res);
}

async function processArguments() {
  if (process.argv.length !== 6 && process.argv.length !== 7) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const param = process.argv[4];
  const accountType = process.argv[5];
  const keystoreFilepath = (accountType === 'keystore') ? process.argv[6] : null;
  if (accountType === 'keystore' && !keystoreFilepath) {
    console.error('Please specify keystore filepath.');
    usage();
  }
  await getNodeParam(endpointUrl, chainId, param, accountType, keystoreFilepath);
}

function usage() {
  console.log('\nUsage: node getNodeParam.js <Endpoint Url> <Chain Id> <Param> <Account Type> [<Keystore Filepath>]\n');
  console.log('Example: node tools/api-access/getNodeParam.js http://localhost:8081 0 DEV_CLIENT_API_IP_WHITELIST private_key');
  console.log('Example: node tools/api-access/getNodeParam.js http://localhost:8081 0 DEV_CLIENT_API_IP_WHITELIST mnemonic');
  console.log('Example: node tools/api-access/getNodeParam.js http://localhost:8081 0 DEV_CLIENT_API_IP_WHITELIST keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/getNodeParam.js http://localhost:8081 0 P2P_MESSAGE_TIMEOUT_MS keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/getNodeParam.js http://localhost:8081 0 SYNC_MODE keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/getNodeParam.js https://staging-api.ainetwork.ai 0 DEV_CLIENT_API_IP_WHITELIST keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/getNodeParam.js https://testnet-api.ainetwork.ai 0 DEV_CLIENT_API_IP_WHITELIST keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/getNodeParam.js https://mainnet-api.ainetwork.ai 1 DEV_CLIENT_API_IP_WHITELIST keystore keystore_blockchain_node.json\n');
  process.exit(0);
}

processArguments();
