/**
 * For simple load testing
 * This tool increases '/apps/loadtest/visit_count'
 * Usage: 'node index.js --help'
 */
const commandLineArgs = require('command-line-args');
const getUsage = require('command-line-usage');
const { signAndSendTx } = require('../util');
const {
  appName,
  testPath,
  ainPrivateKey,
  ainAddress
} = require('./config');

const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));

const optionDefinitions = [
  {
    name: 'help',
    type: Boolean,
    description: 'Display this usage guide.',
    alias: 'h',
    group: 'options'
  },
  {
    name: 'target_url',
    alias: 't',
    type: String,
    description: 'Target AIN URL (Default: http://localhost:8081)',
    group: 'options',
  },
  {
    name: 'duration',
    alias: 'd',
    type: Number,
    description: 'Duration of load test in seconds, (Default: 60)',
    group: 'options',
  },
  {
    name: 'num_txs',
    alias: 'n',
    type: Number,
    description: 'transactions per second (Default: 2)',
    group: 'options',
  },
];

const sections = [
  {
    header: 'AIN Simple load test',
  },
  {
    header: 'Options',
    optionList: optionDefinitions,
    group: 'options',
  }
];

async function initLoadTestApp(targetUrl) {
  const setRuleTxBody = {
    operation: {
      type: 'SET_RULE',
      ref: `/apps/${appName}`,
      value: {
        '.rule': {
          'write': true,
        },
      },
    },
    timestamp: Date.now(),
    gas_price: 500,
    nonce: -1,
  };

  const createAppTxBody = {
    operation: {
      type: 'SET_VALUE',
      ref: `/manage_app/${appName}/create/${Date.now()}`,
      value: {
        admin: {
          [ainAddress]: true,
        },
      },
    },
    timestamp: Date.now(),
    nonce: -1,
    gas_price: 500,
  };

  const createAppTxResult = await signAndSendTx(targetUrl, createAppTxBody, ainPrivateKey, 0);
  const setRuleTxResult = await signAndSendTx(targetUrl, setRuleTxBody, ainPrivateKey, 0);
  console.log(createAppTxResult);
  console.log(setRuleTxResult);
}

function buildIncTxBody() {
  return {
    operation: {
      type: 'INC_VALUE',
      ref: `${testPath}/visit_count`,
      value: 1,
    },
    timestamp: Date.now(),
    nonce: -1,
    gas_price: 500
  };
}

async function sendTxInSecond(targetUrl, numberOfTransactions) {
  const delayMs = 1000 / numberOfTransactions;
  for (let i = 0; i < numberOfTransactions; i++) {
    const result = signAndSendTx(targetUrl, buildIncTxBody(), ainPrivateKey, 0);
    await delay(delayMs);
  }
  return numberOfTransactions;
}

async function runLoadtest(targetUrl, numberOfTransactionsInSecond, duration) {
  if (numberOfTransactionsInSecond < 0 || duration < 0) {
    return;
  }

  let count = 0;
  for (let i = 0; i < duration; i++) {
    const tmpCount = await sendTxInSecond(targetUrl, numberOfTransactionsInSecond);
    count += tmpCount;
  }
  return count;
}

async function main() {
  const options = commandLineArgs(optionDefinitions);
  const args = options._all;
  if (Object.keys(args).includes('help')) {
    console.log(getUsage(sections));
    process.exit(0);
  }
  const targetUrl = args.target_url || 'http://localhost:8081';
  const duration = args.duration || 60;   // 1 minute by default
  const numberOfTransactionsInSecond = args.num_txs || 2;
  console.log(`Initialize loadTestApp (${testPath})`);
  await initLoadTestApp(targetUrl);
  const total = await runLoadtest(targetUrl, numberOfTransactionsInSecond, duration);

  console.log('===========================REPORT===========================');
  console.log(`Target TPS: ${numberOfTransactionsInSecond}`);
  console.log(`TXS(sent/target): ${total}/${duration * numberOfTransactionsInSecond} in ${duration} seconds`);
  console.log(`TPS: ${total / duration}`);
}

main();
