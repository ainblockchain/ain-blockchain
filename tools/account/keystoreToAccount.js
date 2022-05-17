const fs = require('fs');
const ainUtil = require('@ainblockchain/ain-util');
const prompt = require('prompt');

async function keystoreToAccount(filePath) {
  prompt.message = '';
  prompt.delimiter = '';
  prompt.colors = false;
  prompt.start();
  const input = await prompt.get([{
    name: 'password',
    description: 'Enter password:',
    hidden: true,
  }]);
  const keystore = JSON.parse(fs.readFileSync(filePath));
  console.log(keystore, input)
  const account = ainUtil.privateToAccount(ainUtil.v3KeystoreToPrivate(keystore, input.password));
  console.log('\nAccount:', account, '\n');
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  await keystoreToAccount(process.argv[2]);
}

function usage() {
  console.log('\nUsage: node keystoreToAccount.js <Keystore Filepath>\n');
  console.log('Example:  node keystoreToAccount.js /path/to/keystore');
  console.log('Example:  node keystoreToAccount.js ../../testnet_dev_staging_keys/keystore_node_0.json');
  process.exit(0);
}

processArguments();
