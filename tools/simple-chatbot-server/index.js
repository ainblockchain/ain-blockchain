// A simple chatbot server based on blockchain REST function calls.
// This can be used with the tool scripts under tools/chatbot.
const express = require('express');
const _ = require('lodash');
const AinJs = require('@ainblockchain/ain-js').default;
const CommonUtil = require('../../common/common-util');
const app = express();
const PORT = 3000;
const BLOCKCHAIN_ENDPOINT = 'http://localhost:8081/';
const CHAIN_ID = 0;
const ain = new AinJs(BLOCKCHAIN_ENDPOINT, CHAIN_ID);
const APP_NAME = 'chatbots';
const BOT_NAME = 'echo-bot';
const BOT_PK = 'ee0b1315d446e5318eb6eb4e9d071cd12ef42d2956d546f9acbdc3b75c469640';
const BOT_ADDRESS = AinJs.utils.toChecksumAddress(ain.wallet.add(BOT_PK)); // 0x09A0d53FDf1c36A131938eb379b98910e55EEfe1
ain.wallet.setDefaultAccount(BOT_ADDRESS);

app.use(express.json());


app.get('/', (req, res, next) => {
  res.status(200)
    .set('Content-Type', 'text/plain')
    .send('Echo Bot is alive!')
    .end();
});

app.post('/trigger', async (req, res) => {
  res.send('Triggered!');

  const body = _.get(req, 'body', null);
  console.log(`\n[][][] >> body: ${JSON.stringify(body, null, 2)}`);
  const tx = _.get(body, 'transaction', null);
  if (!tx || !tx.tx_body || !tx.tx_body.operation) {
    console.log(`Invalid tx: ${JSON.stringify(tx)}`);
    return;
  }
  if (_.get(tx, 'tx_body.operation.type') !== 'SET_VALUE') {
    console.log(`Not supported tx type: ${tx.tx_body.operation.type}`)
    return;
  }
  const ref = _.get(tx, 'tx_body.operation.ref');
  const parsedRef = CommonUtil.parsePath(ref);
  const userVal = _.get(tx, 'tx_body.operation.value');
  if (parsedRef.length !== 6 || parsedRef[0] !== 'apps' || parsedRef[1] !== APP_NAME ||
      parsedRef[3] !== 'messages' || parsedRef[5] !== 'user') {
    console.log(`Not supported path pattern: ${ref}`);
    return;
  }
  const answerRef = CommonUtil.formatPath([...parsedRef.slice(0, parsedRef.length - 1), BOT_NAME]);
  const timestamp = Date.now();
  const result = await ain.db.ref(answerRef).setValue({
    value: `Did you mean ${JSON.stringify(userVal)}?`,
    gas_price: 500,
    timestamp,
    nonce: -1,
  })
  .catch((e) => {
    console.error(`setValue failure:`, e);
  });
  console.log('\n[][][] << result:', JSON.stringify(result, null, 2));
});

app.listen(PORT, () => {
  console.log(`App listening at http://localhost:${PORT}`);
});
