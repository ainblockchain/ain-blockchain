const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const stringify = require('fast-json-stable-stringify');
const { BlockchainConsts } = require('../../common/constants');
const { getAccountPrivateKey } = require('./util');

async function sendRemoveFromToDevClientApiIpWhitelistRequest(endpointUrl, privateKey, chainId, ipAddresses) {
  const message = {
    timestamp: Date.now(),
    method: 'ain_removeFromDevClientApiIpWhitelist',
    ip: ipAddresses,
  };
  const signature = ainUtil.ecSignMessage(stringify(message), Buffer.from(privateKey, 'hex'), chainId);
  return await axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: 'ain_removeFromDevClientApiIpWhitelist',
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

async function removeFromDevClientApiIpWhitelist(endpointUrl, chainId, type, keystoreFilePath, ipAddresses) {
  const privateKey = await getAccountPrivateKey(type, keystoreFilePath);
  const res = await sendRemoveFromToDevClientApiIpWhitelistRequest(endpointUrl, privateKey, chainId, ipAddresses);
  console.log('Result:', res);
}

async function processArguments() {
  if (process.argv.length !== 5 && process.argv.length !== 6) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const chainId = Number(process.argv[3]);
  const accountType = process.argv[4];
  let keystoreFilePath = null;
  let ipAddresses = null;
  if (accountType === 'keystore') {
    keystoreFilePath = process.argv[5];
    ipAddresses = process.argv[6];
  } else {
    ipAddresses = process.argv[5];
  }
  await removeFromDevClientApiIpWhitelist(endpointUrl, chainId, accountType, keystoreFilePath, ipAddresses);
}

function usage() {
  console.log('\nUsage:\n  node removeFromDevClientApiIpWhitelist.js <NODE_ENDPOINT> <CHAIN_ID> <ACCOUNT_TYPE> [<KEYSTORE_FILE_PATH>] <IP_ADDRESS>\n');
  console.log('\nExamples:');
  console.log('node tools/api-access/getDevClientApiIpWhitelist.js http://localhost:8081 0 private_key 127.0.0.1');
  console.log('node tools/api-access/getDevClientApiIpWhitelist.js http://localhost:8081 0 mnemonic 127.0.0.1');
  console.log('node tools/api-access/getDevClientApiIpWhitelist.js http://localhost:8081 0 keystore /path/to/keystore/file 127.0.0.1');
  process.exit(0);
}

processArguments();