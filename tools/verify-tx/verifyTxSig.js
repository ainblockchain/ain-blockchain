/**
 * Verifies the transaction's siganture, given a response of the transanction getter APIs.
 */

const path = require('path');
const ainUtil = require('@ainblockchain/ain-util');
const sizeof = require('object-sizeof');

function verifySignature(txInfo) {
  if (!txInfo || !txInfo.transaction || !txInfo.transaction.tx_body || !txInfo.transaction.signature || !txInfo.transaction.address) {
    console.log(`Invalid txInfo: ${JSON.stringify(txInfo, null, 2)}`);
    return;
  }
  const tx = txInfo.transaction;
  const value = tx.tx_body.operation.value ? tx.tx_body.operation.value :
      tx.tx_body.operation.op_list.reduce((acc, op) => acc + op.value, 0);
  console.log(`* Trying to verify tx signature...`);
  console.log(`  > Tx Body: \n${JSON.stringify(tx.tx_body, null, 2)}`);
  console.log(`  > Tx Signature: ${tx.signature}`);
  console.log(`  > Tx Address: ${tx.address}`);
  console.log(`  > Tx Value Size: ${sizeof(value)}\n\n`)
  const verified = ainUtil.ecVerifySig(tx.tx_body, tx.signature, tx.address);
  if (verified === true) {
    console.log(`  *************`);
    console.log(`  * VERIFIED! *`);
    console.log(`  *************`);
  } else {
    console.log(`  *****************`);
    console.log(`  * NOT-VERIFIED! *`);
    console.log(`  *****************`);
  }
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  const txInfo = require(path.resolve(__dirname, process.argv[2]));
  verifySignature(txInfo);
}

function usage() {
  console.log('\nUsage: node verifyTxSig.js <get_transaction result json file name>\n');
  console.log('Example:  node verifyTxSig.js ./sample_tx.json ');
  process.exit(0)
}

processArguments();
