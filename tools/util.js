const _ = require('lodash');
const fs = require('fs');
const readline = require('readline');
const prompt = require('prompt');
const axios = require('axios');
const ainUtil = require('@ainblockchain/ain-util');
const FileUtil = require('../common/file-util');
const { BlockchainConsts } = require('../common/constants');
const CommonUtil = require('../common/common-util');
const { JSON_RPC_METHODS } = require('../json_rpc/constants');

async function getAccountPrivateKey(type, keystoreFilePath) {
  let privateKey = '';
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
  switch (type) {
    case 'private_key':
      privateKey = await new Promise((resolve) => {
        readlineInterface.question(`Enter private key: `, (privateKey) => {
          readlineInterface.output.write('\n\r');
          readlineInterface.close();
          resolve(privateKey);
        });
      });
      break;
    case 'keystore':
      if (!keystoreFilePath || !fs.existsSync(keystoreFilePath)) {
        throw Error(`Invalid keystore file path: ${keystoreFilePath}`);
      }
      const password = await new Promise((resolve) => {
        readlineInterface.question(`Enter keystore file password: `, (password) => {
          readlineInterface.output.write('\n\r');
          readlineInterface.close();
          resolve(password);
        });
      });
      const accountFromKeystore = FileUtil.getAccountFromKeystoreFile(keystoreFilePath, password);
      privateKey = accountFromKeystore.private_key;
      break;
    case 'mnemonic':
      const [mnemonic, mnemonicAccountIndex] = await new Promise((resolve) => {
        readlineInterface.question(`Enter mnemonic: `, (mnemonic) => {
          readlineInterface.output.write('\n\r');
          hide = false;
          secret = false;
          readlineInterface.question(`Enter account index (default: 0): `, (index) => {
            readlineInterface.output.write('\n\r');
            readlineInterface.close();
            resolve([mnemonic, index]);
          });
        });
      });
      const accountFromHDWallet = ainUtil.mnemonicToAccount(mnemonic, mnemonicAccountIndex || 0);
      privateKey = accountFromHDWallet.private_key;
      break;
  }
  return privateKey;
}

async function keystoreToAccount(filePath) {
  const keystore = JSON.parse(fs.readFileSync(filePath));
  console.log(`\nKeystore: ${JSON.stringify(keystore, null, 2)}\n`)

  prompt.message = '';
  prompt.delimiter = '';
  prompt.colors = false;
  prompt.start();
  const input = await prompt.get([{
    name: 'password',
    description: 'Enter password:',
    hidden: true,
  }]);

  return ainUtil.privateToAccount(ainUtil.v3KeystoreToPrivate(keystore, input.password));
}

// FIXME(minsulee2): this is duplicated function see: ./common/network-util.js
function signAndSendTx(endpointUrl, txBody, privateKey, chainId) {
  console.log('\n*** signAndSendTx():');
  const { txHash, signedTx } = CommonUtil.signTransaction(txBody, privateKey, chainId);
  console.log(`signedTx: ${JSON.stringify(signedTx, null, 2)}`);
  console.log(`txHash: ${txHash}`);
  console.log('Sending transaction...');

  return axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION,
      params: signedTx,
      jsonrpc: '2.0',
      id: 0
    }
  ).then((resp) => {
    console.log(`resp:`, _.get(resp, 'data'));
    const result = _.get(resp, 'data.result.result.result', {});
    console.log(`result: ${JSON.stringify(result, null, 2)}`);
    const success = !CommonUtil.isFailedTx(result);
    return { txHash, signedTx, success, errMsg: result.message };
  }).catch((err) => {
    console.log(`Failed to send transaction: ${err}`);
    return { txHash, signedTx, success: false, errMsg: err.message };
  });
}

async function sendGetTxByHashRequest(endpointUrl, txHash) {
  return await axios.post(
    `${endpointUrl}/json-rpc`,
    {
      method: JSON_RPC_METHODS.AIN_GET_TRANSACTION_BY_HASH,
      params: {
        protoVer: BlockchainConsts.CURRENT_PROTOCOL_VERSION,
        hash: txHash,
      },
      jsonrpc: '2.0',
      id: 0
    }
  ).then(function(resp) {
    return _.get(resp, 'data.result.result', null);
  });
}

async function confirmTransaction(endpointUrl, timestamp, txHash) {
  console.log('\n*** confirmTransaction():');
  console.log(`txHash: ${txHash}`);
  let iteration = 0;
  let result = null;
  while (true) {
    iteration++;
    result = await sendGetTxByHashRequest(endpointUrl, txHash);
    await CommonUtil.sleep(1000);
    if (_.get(result, 'is_finalized')) {
      break;
    }
  }
  console.log(`iteration = ${iteration}, result: ${JSON.stringify(result, null, 2)}`);
  console.log(`elapsed time (ms) = ${result.finalized_at - timestamp}`);
}

module.exports = {
  getAccountPrivateKey,
  keystoreToAccount,
  signAndSendTx,
  sendGetTxByHashRequest,
  confirmTransaction,
};