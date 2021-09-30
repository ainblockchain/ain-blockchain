const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const { CURRENT_PROTOCOL_VERSION } = require('./common/constants');
const { sleep } = require('./common/common-util');

async function sendGetBootstrapPubKeyRequest(endpointUrl) {
  return await axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: 'ain_getBootstrapPubKey',
      params: {
        protoVer: CURRENT_PROTOCOL_VERSION,
      },
      jsonrpc: '2.0',
      id: 0
    }
  )
    .then(function(resp) {
      return _.get(resp, 'data.result.result');
    })
    .catch((e) => {
      console.log(`sendGetBootstrapPubKeyRequest ${e}`);
      if (e.code === 'ECONNREFUSED') {
        return null;
      }
      throw e;
    });
}

async function sendInitAccountRequest(endpointUrl, encryptedPassword) {
  return await axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: 'ain_initAccount',
      params: {
        protoVer: CURRENT_PROTOCOL_VERSION,
        encryptedPassword,
      },
      jsonrpc: '2.0',
      id: 0
    }
  ).then(function(resp) {
    return _.get(resp, 'data.result.result');
  });
}

async function initAccount(endpointUrl, password) {
  let bootstrapPubKey = null;
  while (bootstrapPubKey === null) {
    await sleep(1000);
    bootstrapPubKey = await sendGetBootstrapPubKeyRequest(endpointUrl);
  }
  console.log('bootstrapPubKey:', JSON.stringify(bootstrapPubKey, null, 2));
  const encryptedPassword = await ainUtil.encryptWithPublicKey(bootstrapPubKey, password);
  const res = await sendInitAccountRequest(endpointUrl, encryptedPassword);
  console.log('initAccount result:', res);
}

async function processArguments() {
  if (process.argv.length !== 4) {
    usage();
  }
  await initAccount(process.argv[2], process.argv[3]);
}

function usage() {
  console.log('\nExample commandlines:\n  node init_account_gcp.js <ENDPOINT_URL> <PASSWORD>\n');
  process.exit(0);
}

processArguments();
