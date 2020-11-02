const ainUtil = require('@ainblockchain/ain-util');
const _ = require('lodash');

function createAccount(prefix) {
  console.log(`Creating an account with prefix ${prefix}..`);
  let count = 0;
  while (true) {
    const account = ainUtil.createAccount(); // { private_key, public_key, address }
    const address = account.address.substring(2);
    if (_.startsWith(address, prefix)) {
      console.log(`Account: ${JSON.stringify(account, null, 2)}`);
      return account;
    }
    count++;
    if (count % 10000 === 0) {
      console.log(`Tried ${count} times..`)
    }
  }
}

function createAccounts(num, isPrefixed) {
  const accounts = [];
  for (let i = 0; i < num; i++) {
    const prefix = isPrefixed ? _.padStart(i, 2, '0') + 'A' : '';
    accounts.push(createAccount(prefix));
  }
  console.log(`Generated accounts:\n${JSON.stringify(accounts, null, 2)}`);
}

async function processArguments() {
  if (process.argv.length !== 3 && process.argv.length !== 4) {
    usage();
  }
  const num = Number(process.argv[2])
  console.log('Number of accounts to generate: ' + num)
  if (isNaN(num) || num === 0) {
    console.log('Invalid value: ' + num)
    usage();
  }
  let isPrefixed = true;
  if (process.argv.length === 4) {
    const inputIsPrefixed = process.argv[3];
    isPrefixed = inputIsPrefixed === 'true';
  }
  createAccounts(num, isPrefixed);
}

function usage() {
  console.log('\nExample commandlines:\n  node generateAccounts.js 10 false\n')
  process.exit(0)
}

processArguments();
