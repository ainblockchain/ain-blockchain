const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const { BlockchainConsts } = require('../../common/constants');
const { getAccountPrivateKey } = require('../util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');

async function sendAddToDevClientApiIpWhitelistRequest(endpointUrl, privateKey, chainId, ip) {
  const message = {
    timestamp: Date.now(),
    method: JSON_RPC_METHODS.AIN_ADD_TO_WHITELIST_NODE_PARAM,
    param: 'DEV_CLIENT_API_IP_WHITELIST',
    value: ip,
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

async function addToDevClientApiIpWhitelist(endpointUrl, chainId, ip, accountType, keystoreFilepath) {
  const privateKey = await getAccountPrivateKey(accountType, keystoreFilepath);
  const res = await sendAddToDevClientApiIpWhitelistRequest(endpointUrl, privateKey, chainId, ip);
  console.log('Result:', res);
}

async function processArguments() {
  if (process.argv.length !== 6 && process.argv.length !== 7) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const ip = process.argv[4];
  const accountType = process.argv[5];
  const keystoreFilepath = (accountType === 'keystore') ? process.argv[6] : null;
  if (accountType === 'keystore' && !keystoreFilepath) {
    console.error('Please specify keystore filepath.');
    usage();
  }
  await addToDevClientApiIpWhitelist(endpointUrl, chainId, ip, accountType, keystoreFilepath);
}

function usage() {
  console.log('\nUsage: node addToDevClientApiIpWhitelist.js <Endpoint Url> <Chain Id> <Ip Address> <Account Type> [<Keystore Filepath>]\n');
  console.log('Example: node tools/api-access/addToDevClientApiIpWhitelist.js http://localhost:8081 0 127.0.0.1 private_key');
  console.log('Example: node tools/api-access/addToDevClientApiIpWhitelist.js http://localhost:8081 0 127.0.0.1 mnemonic');
  console.log('Example: node tools/api-access/addToDevClientApiIpWhitelist.js http://localhost:8081 0 127.0.0.1 keystore keystore_blockchain_node.json');
  console.log("Example: node tools/api-access/addToDevClientApiIpWhitelist.js http://localhost:8081 0 '*' keystore keystore_blockchain_node.json");
  console.log('Example: node tools/api-access/addToDevClientApiIpWhitelist.js https://staging-api.ainetwork.ai 0 127.0.0.1 keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/addToDevClientApiIpWhitelist.js https://testnet-api.ainetwork.ai 0 127.0.0.1 keystore keystore_blockchain_node.json');
  console.log('Example: node tools/api-access/addToDevClientApiIpWhitelist.js https://mainnet-api.ainetwork.ai 1 127.0.0.1 keystore keystore_blockchain_node.json\n');
  process.exit(0);
}

processArguments();
