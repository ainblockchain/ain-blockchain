const ainUtil = require('@ainblockchain/ain-util');
const prompt = require('prompt');

async function seedPhraseToAccount(numAccounts) {
  prompt.message = '';
  prompt.delimiter = '';
  prompt.colors = false;
  prompt.start();
  const input = await prompt.get([{
    name: 'seedPhrase',
    description: 'Enter seed phrase:',
    hidden: true,
  }]);
  for (let i = 0; i < numAccounts; i++) {
    const account = ainUtil.mnemonicToAccount(input.seedPhrase, i);
    console.log(`\nAccount #${i}`);
    console.log(account);
  }
}

async function processArguments() {
  if (process.argv.length !== 2 && process.argv.length !== 3) {
    usage();
  }
  const numAccounts = Number(process.argv[2] || 10); // default = 10
  if (isNaN(numAccounts) || numAccounts > 100) {
    console.log(`Invalid number of accounts: ${numAccounts}`);
    process.exit(0);
  }
  await seedPhraseToAccount(numAccounts);
}

function usage() {
  console.log('\nUsage: node seedPhraseToAccount.js [<Number of Accounts>]\n');
  console.log('Example: node seedPhraseToAccount.js');
  console.log('Example: node seedPhraseToAccount.js 1\n');
  process.exit(0);
}

processArguments();
