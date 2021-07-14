/**
 * For simple load testing
 * This tool increases '/apps/loadtest/visit_count'
 * Usage: 'node index.js --help'
 */
const _ = require('lodash');
const axios = require('axios');
const commandLineArgs = require('command-line-args');
const getUsage = require('command-line-usage');
const CommonUtil = require('../../common/common-util');
const {signTx} = require('../util');
const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));
const testPath = '/apps/loadtest';
const ainPrivateKey = '4207f5dcacb1b601d3a1f8cb10afaca158f6ebe383c0b30d02b39f8d2060cce3';
const ainAddress = '0xF2be7f1356347a8960630c112AcB6Da61eE94632';
const TIMEOUT_MS = 10 * 1000;
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
    name: 'number_txs',
    alias: 'n',
    type: Number,
    description: 'Number of transactions (Default: 300)',
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

function sendTx(endpointUrl, signedTx) {
  return axios.post(`${endpointUrl}/json-rpc`, {
    method: 'ain_sendSignedTransaction',
    params: signedTx,
    jsonrpc: '2.0',
    id: 0,
  }, {
    timeout: TIMEOUT_MS,
  }).then((result) => {
    return _.get(result, 'data.result.result.result', false);
  }).catch((err) => {
    console.error(err);
    return false;
  });
}

async function initPermission(targetUrl) {
  const setOwnerTx = {
    operation: {
      type: 'SET_OWNER',
      ref: testPath,
      value: {
        '.owner': {
          owners: {
            '*': {
              write_owner: true,
              write_rule: true,
              write_function: true,
              branch_owner: true,
            },
          },
        },
      },
    },
    timestamp: Date.now(),
    nonce: -1,
  };
  const setRuleTx = {
    operation: {
      type: 'SET_RULE',
      ref: testPath,
      value: {
        '.rule': {
          'write': true,
        }
      },
    },
    timestamp: Date.now(),
    nonce: -1,
  };
  const setValueTx = {
    operation: {
      type: 'SET_VALUE',
      ref: testPath,
      value: 0,
    },
    timestamp: Date.now(),
    nonce: -1,
  };
  const {signedTx: signedSetOwnerTx} = CommonUtil.signTransaction(setOwnerTx, ainPrivateKey);
  const {signedTx: signedSetRuleTx} = CommonUtil.signTransaction(setRuleTx, ainPrivateKey);
  const {signedTx: signedSetValueTx} = CommonUtil.signTransaction(setValueTx, ainPrivateKey);
  const promiseList = [];
  promiseList.push(sendTx(targetUrl, signedSetOwnerTx));
  promiseList.push(sendTx(targetUrl, signedSetRuleTx));
  promiseList.push(sendTx(targetUrl, signedSetValueTx));
  const resultList = await Promise.all(promiseList);
  if (resultList.includes(false)) {
    throw Error(`Error while init permission`);
  }
  await delay(10 * 1000);
}

function makeBaseTransaction() {
  return {
    operation: {
      type: 'INC_VALUE',
      ref: `${testPath}/visit_count`,
      value: 1,
    },
    nonce: -1,
  };
}

async function sendTxs(targetUrl, duration, numberOfTransactions) {
  const delayTime = duration / numberOfTransactions * 1000;
  const sendTxPromiseList = [];
  const timestamp = Date.now();
  const baseTx = makeBaseTransaction();
  let sendCnt = 0;

  for (let i = 0; i < numberOfTransactions; i++) {
    await delay(delayTime);
    if (i % 1000 === 0) {
      console.log(`[${i}/${numberOfTransactions}]`);
    }

    sendTxPromiseList.push(
        new Promise((resolve, reject) => {
          setTimeout((txTimestamp) => {
            baseTx.timestamp = txTimestamp;
            const {signedTx} = CommonUtil.signTransaction(baseTx, ainPrivateKey);
            sendTx(targetUrl, signedTx).then((result) => {
              if (result === true) {
                sendCnt++;
              }
              resolve(result);
            }).catch((err) => {
              console.error(err);
              resolve(false);
            });
          }, 0, timestamp + i);
        }),
    );
  }

  await Promise.all(sendTxPromiseList);
  return sendCnt;
}

async function main() {
  const options = commandLineArgs(optionDefinitions);
  const args = options._all;
  if (Object.keys(args).includes('help')) {
    console.log(getUsage(sections));
    process.exit(0);
  }
  const targetUrl = args.target_url || 'http://localhost:8081';
  const duration = args.duration || 60; // 60: 1min
  const numberOfTransactions = args.number_txs || 300;
  console.log(`Initialize permission (${testPath})`);
  await initPermission(targetUrl);
  console.log(`Start to send transactions (${numberOfTransactions})`);
  const sendCnt = await sendTxs(targetUrl, duration, numberOfTransactions);
  console.log(`Finish load test! (${sendCnt}/${numberOfTransactions})`);
}

main();
