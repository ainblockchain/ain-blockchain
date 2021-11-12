const _ = require('lodash');
const ainUtil = require('@ainblockchain/ain-util');
const CommonUtil = require('../../common/common-util');

const PADDING_LENGTH = 2;

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

function createAccounts(numAccounts, prefixStr) {
  const accounts = [];
  for (let i = 0; i < numAccounts; i++) {
    const prefixWithPadding = _.padStart(i, PADDING_LENGTH, '0') + prefixStr;
    accounts.push(createAccount(prefixWithPadding));
  }
  console.log(`Generated accounts:\n${JSON.stringify(accounts, null, 2)}`);
}

async function processArguments() {
  if (process.argv.length !== 4) {
    usage();
  }
  const numAccounts = Number(process.argv[2])
  console.log('Number of accounts to generate: ' + numAccounts)
  if (!CommonUtil.isNumber(numAccounts) || numAccounts <= 0) {
    console.log('Invalid value: ' + numAccounts)
    usage();
  }
  const prefixStr = String(process.argv[3])
  console.log('Prefix string: ' + prefixStr)
  if (!CommonUtil.isString(prefixStr)) {
    console.log('Invalid value: ' + prefixStr)
    usage();
  }
  createAccounts(numAccounts, prefixStr);
}

function usage() {
  console.log('\nUsage: node generateAccounts.js <Account Number> <Prefix String>\n')
  console.log('Example:  node generateAccounts.js 10 A');
  console.log('Example:  node generateAccounts.js 10 AA');
  process.exit(0)
}

processArguments();
