const fs = require('fs');
const readline = require('readline');
const ainUtil = require('@ainblockchain/ain-util');
const FileUtil = require('../../common/file-util');

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
      if (!keystoreFilePath || fs.existsSync(keystoreFilePath)) {
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

module.exports = {
  getAccountPrivateKey,
};
