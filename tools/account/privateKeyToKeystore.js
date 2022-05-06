const ainUtil = require('@ainblockchain/ain-util');
const prompt = require('prompt');

async function privateKeyToKeystore() {
  prompt.message = '';
  prompt.delimiter = '';
  prompt.colors = false;
  prompt.start();
  const input = await prompt.get([
    {
      name: 'privateKey',
      description: 'Enter private key:',
      hidden: true,
    },
    {
      name: 'password',
      description: 'Enter password:',
      hidden: true,
    }
  ]);
  const privateKey = Buffer.from(input.privateKey, 'hex');
  const keystore = ainUtil.privateToV3Keystore(privateKey, input.password);
  console.log('\nKeystore object:', keystore);
  console.log(`\nKeystore string: ${JSON.stringify(keystore)}`);
}

async function processArguments() {
  if (process.argv.length !== 2) {
    usage();
  }
  await privateKeyToKeystore();
}

async function usage() {
  console.log('\nUsage: node privateKeyToKeystore.js\n');
  process.exit(0);
}

processArguments();
