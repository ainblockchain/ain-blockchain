const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const { BlockchainConsts } = require('../../common/constants');
const { getAccountPrivateKey } = require('./util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');

async function sendAddToWhiteListNodeParamRequest(endpointUrl, privateKey, chainId, param, value) {
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

async function addToWhiteListNodeParam(endpointUrl, chainId, type, keystoreFilePath, param, value) {
  const privateKey = await getAccountPrivateKey(type, keystoreFilePath);
  const res = await sendAddToWhiteListNodeParamRequest(endpointUrl, privateKey, chainId, param, value);
  console.log('Result:', res);
}

async function processArguments() {
  if (process.argv.length !== 7 && process.argv.length !== 8) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const accountType = process.argv[4];
  let keystoreFilePath = null;
  let param = null;
  let value = null;
  if (accountType === 'keystore') {
    keystoreFilePath = process.argv[5];
    param = process.argv[6];
    value = process.argv[7];
  } else {
    param = process.argv[5];
    value = process.argv[6];
  }
  if (!value) {
    console.error('Please specify a value');
    usage();
  }
  await addToWhiteListNodeParam(endpointUrl, chainId, accountType, keystoreFilePath, param, value);
}

function usage() {
  console.log('\nUsage:\n  node addToWhiteListNodeParam.js <NODE_ENDPOINT> <CHAIN_ID> <ACCOUNT_TYPE> [<KEYSTORE_FILE_PATH>] <PARAM> <VALUE>\n');
  console.log('\nExamples:');
  console.log('node tools/api-access/addToWhiteListNodeParam.js http://localhost:8081 0 private_key DEV_CLIENT_API_IP_WHITELIST 127.0.0.1');
  console.log('node tools/api-access/addToWhiteListNodeParam.js http://localhost:8081 0 mnemonic DEV_CLIENT_API_IP_WHITELIST "*"');
  console.log('node tools/api-access/addToWhiteListNodeParam.js http://localhost:8081 0 keystore /path/to/kezystore/file CORS_WHITELIST "https://ainetwork\\.ai"');
  process.exit(0);
}

processArguments();
