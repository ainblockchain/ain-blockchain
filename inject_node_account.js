const axios = require('axios');
const fs = require('fs');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const { BlockchainConsts } = require('./common/constants');
const { sleep } = require('./common/common-util');
const prompt = require('prompt');
const { JSON_RPC_METHODS } = require('./json_rpc/constants');

async function sendGetBootstrapPubKeyRequest(endpointUrl) {
  return await axios.post(
      `${endpointUrl}/json-rpc`,
      {
        method: JSON_RPC_METHODS.AIN_GET_BOOTSTRAP_PUB_KEY,
        params: {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
        },
        jsonrpc: '2.0',
        id: 0
      })
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

async function sendInjectAccount(endpointUrl, method, params) {
  return await axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method,
      params: Object.assign(params, { protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION }),
      jsonrpc: '2.0',
      id: 0
    })
    .then(function(resp) {
      return _.get(resp, 'data.result.result');
    });
}

async function injectAccount(endpointUrl, accountInjectionOption) {
  const properties = [];
  switch (accountInjectionOption) {
    case '--private-key':
      properties.push({
        name: 'privateKey',
        description: 'Enter private key:',
        hidden: true
      })
      break;
    case '--keystore':
      properties.push({
        name: 'keystorePath',
        description: 'Enter keystore path:',
      })
      properties.push({
        name: 'password',
        description: 'Enter password:',
        hidden: true
      })
      break;
    case '--mnemonic':
      properties.push({
        name: 'mnemonic',
        description: 'Enter mnemonic:',
        hidden: true
      })
      properties.push({
        name: 'index',
        validator: /^[0-9]*$/,
        description: 'Enter index (default: 0):',
        before: (value) => (value === '' ? 0 : Number(value))
      })
      break;
    default:
      console.log(`\nInvalid account injection option: ${accountInjectionOption}\n`);
      return;
  }

  prompt.message = '';
  prompt.delimiter = '';
  prompt.colors = false;
  prompt.start();
  input = await prompt.get(properties);

  let bootstrapPubKey = null;
  while (bootstrapPubKey === null) {
    bootstrapPubKey = await sendGetBootstrapPubKeyRequest(endpointUrl);
    if (bootstrapPubKey !== null) {
      break;
    }
    await sleep(1000);
  }

  console.log('bootstrapPubKey:', JSON.stringify(bootstrapPubKey, null, 2));

  let method = null;
  const params = {};
  switch (accountInjectionOption) {
    case '--private-key':
      method = JSON_RPC_METHODS.AIN_INJECT_ACCOUNT_FROM_PRIVATE_KEY;
      Object.assign(params, {
        encryptedPrivateKey: await ainUtil.encryptWithPublicKey(bootstrapPubKey, input.privateKey)
      })
      break;
    case '--keystore':
      method = JSON_RPC_METHODS.AIN_INJECT_ACCOUNT_FROM_KEYSTORE;
      const keystore = JSON.stringify(JSON.parse(fs.readFileSync(input.keystorePath)));
      Object.assign(params, {
        encryptedKeystore: await ainUtil.encryptWithPublicKey(bootstrapPubKey, keystore)
      })
      Object.assign(params, {
        encryptedPassword: await ainUtil.encryptWithPublicKey(bootstrapPubKey, input.password)
      })
      break;
    case '--mnemonic':
      method = JSON_RPC_METHODS.AIN_INJECT_ACCOUNT_FROM_HD_WALLET;
      Object.assign(params, {
        encryptedMnemonic: await ainUtil.encryptWithPublicKey(bootstrapPubKey, input.mnemonic),
        index: input.index
      })
      break;
  }

  const result = await sendInjectAccount(endpointUrl, method, params);
  console.log('injectAccount result:', result);
}

async function processArguments() {
  if (process.argv.length !== 4) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const accountInjectionOption = process.argv[3];
  await injectAccount(endpointUrl, accountInjectionOption);
}

function usage() {
  console.log('\nExample commandlines:\n  node inject_node_account.js <ENDPOINT_URL> <ACCOUNT_INJECTION_OPTION>\n');
  process.exit(0);
}

processArguments();
