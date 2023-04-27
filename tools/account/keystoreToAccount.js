const { keystoreToAccount } = require('../util');

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  const account = await keystoreToAccount(process.argv[2]);
  console.log(`\nAccount: ${JSON.stringify(account, null, 2)}\n`);
}

function usage() {
  console.log('\nUsage: node keystoreToAccount.js <Keystore Filepath>\n');
  console.log('Example:  node keystoreToAccount.js /path/to/keystore');
  console.log('Example:  node keystoreToAccount.js ../../testnet_dev_staging_keys/keystore_node_0.json');
  process.exit(0);
}

processArguments();
