const ainUtil = require('@ainblockchain/ain-util');
const prompt = require('prompt');

async function privateKeyToAccount() {
  prompt.message = '';
  prompt.delimiter = '';
  prompt.colors = false;
  prompt.start();
  const input = await prompt.get([{
    name: 'privateKey',
    description: 'Enter private key:',
    hidden: true,
  }]);
  const account = ainUtil.privateToAccount('0x' + input.privateKey);
  console.log('\nAccount:', account, '\n');
}

async function processArguments() {
  if (process.argv.length !== 2) {
    usage();
  }
  await privateKeyToAccount();
}

function usage() {
  console.log('\nUsage: node privateKeyToAccount.js\n');
  process.exit(0);
}

processArguments();
