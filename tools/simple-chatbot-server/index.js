const express = require('express');
const AinJs = require('@ainblockchain/ain-js').default;
const CommonUtil = require('../../common/common-util');
const app = express();
const port = 80;
const blockchainEndpoint = 'http://dev-node.ainetwork.ai:8080/';
const ain = new AinJs(blockchainEndpoint, 0);
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

  const tx = req.body.transaction;
  if (!tx || !tx.tx_body || !tx.tx_body.operation) {
    console.log(`Invalid tx: ${JSON.stringify(tx)}`);
    return;
  }
  if (tx.tx_body.operation.type !== 'SET_VALUE') {
    console.log(`Not supported tx type: ${tx.tx_body.operation.type}`)
    return;
  }
  const ref = tx.tx_body.operation.ref;
  const parsedRef = CommonUtil.parsePath(ref);
  const userVal = tx.tx_body.operation.value;
  if (parsedRef.length !== 6 || parsedRef[0] !== 'apps' || parsedRef[2] !== 'messages' ||
      parsedRef[5] !== 'user') {
    console.log(`Not supported path pattern: ${ref}`);
    return;
  }
  const answerRef = CommonUtil.formatPath([...parsedRef.slice(0, parsedRef.length - 1), BOT_NAME]);
  const result = await ain.db.ref(answerRef).setValue({
    value: `Did you mean ${JSON.stringify(userVal)}?`,
    nonce: -1,
  })
  .catch((e) => {
    console.error(`setValue failure:`, e);
  });
  console.log('result:', result);
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
