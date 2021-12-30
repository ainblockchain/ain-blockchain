const axios = require('axios');
const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const { BlockchainConsts } = require('./common/constants');
const { sleep } = require('./common/common-util');
const readline = require('readline');

let hide = false;
let secret = true;
const readlineInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
// NOTE(liayoo): Show the prompt & hide the password
readlineInterface._writeToOutput = (val) => {
  if (!hide && secret) {
    readlineInterface.output.write(val);
    hide = true;
  } else if (!hide && !secret) {
    readlineInterface.output.write(val);
  }
};

async function sendGetBootstrapPubKeyRequest(endpointUrl) {
  return await axios.post(
      `${endpointUrl}/json-rpc`,
      {
        method: 'ain_getBootstrapPubKey',
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

async function sendInjectAccountFromPrivateKey(endpointUrl, encryptedPrivateKey) {
  return await axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: 'ain_injectAccountFromPrivateKey',
      params: {
        protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
        encryptedPrivateKey,
      },
      jsonrpc: '2.0',
      id: 0
    })
    .then(function(resp) {
      return _.get(resp, 'data.result.result');
    });
}

async function sendInjectAccountRequestWithKeystore(endpointUrl, encryptedPassword) {
  return await axios.post(
      `${endpointUrl}/json-rpc`,
      {
        method: 'ain_injectAccountFromKeystore',
        params: {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          encryptedPassword,
        },
        jsonrpc: '2.0',
        id: 0
      })
      .then(function(resp) {
        return _.get(resp, 'data.result.result');
      });
}

async function sendInjectAccountRequestWithMemonic(endpointUrl, encryptedMnemonic, index) {
  return await axios.post(
      `${endpointUrl}/json-rpc`,
      {
        method: 'ain_injectAccountFromHDWallet',
        params: {
          protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
          encryptedMnemonic,
          index,
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
  let index = null;

  if (accountInjectionOption === '--mnemonic') {
    hide = false;
    secret = false;
    index = await new Promise((resolve) => {
      readlineInterface.question(`Enter index (default: 0): `, (input) => {
        readlineInterface.output.write('\n\r');
        readlineInterface.close();
        resolve(input);
      });
    })
    if (!is_positive_numeric(index)) {
      console.log(`The index is set to the default value of 0.`);
      index = 0;
    }
  }
  while (bootstrapPubKey === null) {
    await sleep(1000);
    bootstrapPubKey = await sendGetBootstrapPubKeyRequest(endpointUrl);
  }
  console.log('bootstrapPubKey:', JSON.stringify(bootstrapPubKey, null, 2));
  const encryptedInput = await ainUtil.encryptWithPublicKey(bootstrapPubKey, input);
  if (accountInjectionOption === '--private-key') {
    res = await sendInjectAccountFromPrivateKey(endpointUrl, encryptedInput);
  } else if (accountInjectionOption === '--keystore') {
    res = await sendInjectAccountRequestWithKeystore(endpointUrl, encryptedInput);
  } else if (accountInjectionOption === '--mnemonic') {
    res = await sendInjectAccountRequestWithMemonic(endpointUrl, encryptedInput, index);
  }
  console.log('injectAccount result:', res);
}

async function processArguments() {
  if (process.argv.length !== 4) {
    usage();
  }
  const endpointUrl = process.argv[2];
  const accountInjectionOption = process.argv[3];
  const input = await new Promise((resolve) => {
    const secret = accountInjectionOption === '--keystore' ? 'password' :
        accountInjectionOption === '--mnemonic' ? 'mnemonic' : 'private key';
    readlineInterface.question(`Enter ${secret}: `, (input) => {
      readlineInterface.output.write('\n\r');
      resolve(input);
    });
  })
  await injectAccount(endpointUrl, accountInjectionOption, input);
}

function is_positive_numeric(str) {
  return /^\d+$/.test(str);
}

function usage() {
  console.log('\nExample commandlines:\n  node inject_account_gcp.js <ENDPOINT_URL> <ACCOUNT_INJECTION_OPTION>\n');
  process.exit(0);
}

processArguments();
