const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const { CURRENT_PROTOCOL_VERSION } = require('./common/constants');
const { sleep } = require('./common/common-util');
const readline = require('readline');

let hide = false;
const readlineInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
// NOTE(liayoo): Show the prompt & hide the password
readlineInterface._writeToOutput = (val) => {
  if (!hide) {
    readlineInterface.output.write(val);
    hide = true;
  }
};

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

async function sendInjectAccountRequest(endpointUrl, encryptedPassword) {
  return await axios.post(
      `${endpointUrl}/json-rpc`,
      {
        method: 'ain_injectAccount',
        params: {
          protoVer: CURRENT_PROTOCOL_VERSION,
          encryptedPassword,
        },
        jsonrpc: '2.0',
        id: 0
      })
      .then(function(resp) {
        return _.get(resp, 'data.result.result');
      });
}

async function sendInjectAccountRequestWithMemonic(endpointUrl, encryptedMnemonic) {
  return await axios.post(
      `${endpointUrl}/json-rpc`,
      {
        method: 'ain_injectAccountFromHDWallet',
        params: {
          protoVer: CURRENT_PROTOCOL_VERSION,
          encryptedMnemonic,
        },
        jsonrpc: '2.0',
        id: 0
      })
      .then(function(resp) {
        return _.get(resp, 'data.result.result');
      });
}

async function injectAccount(endpointUrl, accountInjectionOption, input) {
  let bootstrapPubKey = null;
  let res = null;
  while (bootstrapPubKey === null) {
    await sleep(1000);
    bootstrapPubKey = await sendGetBootstrapPubKeyRequest(endpointUrl);
  }
  console.log('bootstrapPubKey:', JSON.stringify(bootstrapPubKey, null, 2));
  const encryptedInput = await ainUtil.encryptWithPublicKey(bootstrapPubKey, input);
  if (accountInjectionOption === '--keystore') {
    res = await sendInjectAccountRequest(endpointUrl, encryptedInput);
  } else if (accountInjectionOption === '--mnemonic') {
    res = await sendInjectAccountRequestWithMemonic(endpointUrl, encryptedInput);
  }
  console.log('injectAccount result:', res);
}

async function processArguments() {
  if (process.argv.length != 4) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const accountInjectionOption = process.argv[3];
  const input = await new Promise((resolve) => {
    readlineInterface.question(`Enter ${accountInjectionOption === '--keystore' ? 'password' : 'mnemonic'}: `, (input) => {
      readlineInterface.output.write('\n\r');
      readlineInterface.close();
      resolve(input);
    });
  })
  await injectAccount(endpointUrl, accountInjectionOption, input);
}

function usage() {
  console.log('\nExample commandlines:\n  node inject_account_gcp.js <ENDPOINT_URL> <ACCOUNT_INJECTION_OPTION>\n');
  process.exit(0);
}

processArguments();
