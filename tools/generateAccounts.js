const ainUtil = require('@ainblockchain/ain-util');

function createAccounts(num) {
  const accounts = [];
  for (let i = 0; i < num; i++) {
    accounts.push(ainUtil.createAccount()); // { private_key, public_key, address }
  }
  console.log(`Generated accounts:\n${JSON.stringify(accounts, null, 2)}`);
}

async function processArguments() {
  if (process.argv.length != 3) {
    usage();
  }
  const num = Number(process.argv[2])
  console.log('Number of accounts to generate: ' + num)
  if (isNaN(num) || num === 0) {
    console.log('Invalid value: ' + num)
    usage();
  }
  createAccounts(num);
}

function usage() {
  console.log('\nExample commandlines:\n  node generateAccounts.js 10\n')
  process.exit(0)
}

processArguments()