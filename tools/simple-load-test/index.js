/**
 For simple load testing
 This tool increases '/apps/loadtest/visit_count'
 Please modify numberOfTransactions & duration
 Example command line: 'node index.js'
 */
const Ain = require('@ainblockchain/ain-js').default;
const delay = (time) => new Promise((resolve) => setTimeout(resolve, time));
const testPath = '/apps/loadtest';
const targetUrl = 'http://localhost:8081';
const ainPrivateKey = '4207f5dcacb1b601d3a1f8cb10afaca158f6ebe383c0b30d02b39f8d2060cce3';
const ainAddress = '0xF2be7f1356347a8960630c112AcB6Da61eE94632';
const numberOfTransactions = 300;
const duration = 10; // 60: 1min
const ain = new Ain(targetUrl);

function initAinJs() {
  ain.wallet.add(ainPrivateKey);
  ain.wallet.setDefaultAccount(ainAddress);
  ain.provider.setDefaultTimeoutMs(60 * 1000);
}

async function initPermission() {
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
    nonce: -1,
  };
  const setRuleTx = {
    operation: {
      type: 'SET_RULE',
      ref: testPath,
      value: {
        '.write': true,
      },
    },
    nonce: -1,
  };
  const setValueTx = {
    operation: {
      type: 'SET_VALUE',
      ref: testPath,
      value: 0,
    },
    nonce: -1,
  };
  await ain.sendTransactionBatch([
    setOwnerTx,
    setRuleTx,
    setValueTx,
  ]);

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

async function sendTxs() {
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
            ain.sendTransaction(baseTx).then((result) => {
              if (!result || !result.hasOwnProperty('tx_hash')) {
                throw Error(`Wrong format`);
              } else if (!result.result) {
                throw Error('result !== true');
              }
              sendCnt++;
              resolve(true);
            }).catch((err) => {
              resolve(false);
            });
          }, 0, timestamp + i);
        }),
    );
  }

  await Promise.all(sendTxPromiseList);
  return sendCnt;
}

function usage() {
  console.log('Please modify numberOfTransactions & duration according to your test environment.');
  console.log('Example command line:\n  node index.js\n');
  process.exit(0);
}

async function main() {
  if (process.argv.length !== 2) {
    usage();
  }
  initAinJs();
  console.log(`Initialize permission (${testPath})`);
  await initPermission();
  console.log(`Start to send transactions (${numberOfTransactions})`);
  const sendCnt = await sendTxs();
  console.log(`Finish load test! (${sendCnt}/${numberOfTransactions})`);
}

main();
