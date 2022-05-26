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
const { signAndSendTx } = require('../util');
const { JSON_RPC_METHODS } = require('../../json_rpc/constants');
const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));
const testPath = '/apps/loadtest';
const ainPrivateKey = 'b22c95ffc4a5c096f7d7d0487ba963ce6ac945bdc91c79b64ce209de289bec96';
const ainAddress = '0x00ADEc28B6a845a085e03591bE7550dd68673C1C';
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
    method: JSON_RPC_METHODS.AIN_SEND_SIGNED_TRANSACTION,
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
  const setRuleTxBody = {
    operation: {
      type: 'SET_RULE',
      ref: `/apps/loadtest`,
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
      ref: `/manage_app/loadtest/create/${Date.now()}`,
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

  const result = await signAndSendTx(targetUrl, createAppTxBody, ainPrivateKey, 0);
  const result2 = await signAndSendTx(targetUrl, setRuleTxBody, ainPrivateKey, 0);
  console.log(result2);
}

function makeBaseTransaction() {
  return {
    operation: {
      type: 'INC_VALUE',
      ref: `${testPath}/visit_count`,
      value: 1,
    },
    nonce: -1,
    gas_price: 500
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
            const { signedTx } = CommonUtil.signTransaction(baseTx, ainPrivateKey);
            sendTx(targetUrl, signedTx).then((result) => {
              console.log(result);
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
  const numberOfTransactions = args.number_txs || 30;
  console.log(`Initialize loadTestApp (${testPath})`);
  // await initLoadTestApp(targetUrl);
  // console.log(`Start to send transactions (${numberOfTransactions})`);
  // const sendCnt = await sendTxs(targetUrl, duration, numberOfTransactions);
  // console.log(`Finish load test! (${sendCnt}/${numberOfTransactions})`);
}

main();
