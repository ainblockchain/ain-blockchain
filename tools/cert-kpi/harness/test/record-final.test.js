const assert = require('assert/strict');
const { recordAndVerifyFinal } = require('../common');

async function main() {
  const value = { dataset: 'fixture', metrics: { accuracy: 0.5 } };
  let submitted = 0;
  const ain = {
    db: { ref: () => ({ setValue: async () => {
      submitted++;
      return { tx_hash: 'fixture-tx', result: { code: 0 } };
    } }) },
    getTransactionByHash: async () => ({ state: 'FINALIZED', number: 12 }),
  };
  let observed = value;
  const reader = { db: { ref: () => ({ getValue: async (unused, options) => {
    assert.equal(options.is_final, true);
    return observed;
  } }) } };
  const originalFetch = global.fetch;
  let transactionPresent = true;
  global.fetch = async () => ({ json: async () => ({ result: {
    hash: 'fixture-block', timestamp: 123,
    transactions: transactionPresent ? [{ hash: 'fixture-tx' }] : [],
  } }) });
  const options = { reader, timeoutMs: 1, blockNode: 'http://fixture' };
  try {
    await assert.rejects(recordAndVerifyFinal(ain, '/fixture', value, () => false), TypeError);
    assert.equal(submitted, 0);
    const result = await recordAndVerifyFinal(ain, '/fixture', value, options);
    assert.equal(result.receipt.state, 'FINALIZED');
    assert.equal(result.blockVerification.ok, true);
    observed = { ...value, metrics: { accuracy: 1 } };
    await assert.rejects(recordAndVerifyFinal(ain, '/fixture', value, options), /mismatch/);
    observed = value;
    await assert.rejects(recordAndVerifyFinal(ain, '/fixture', value, { ...options, check: () => false }), /mismatch/);
    transactionPresent = false;
    await assert.rejects(recordAndVerifyFinal(ain, '/fixture', value, options), /block verification failed/);
    ain.getTransactionByHash = async () => ({ state: 'REVERTED', number: 12 });
    await assert.rejects(recordAndVerifyFinal(ain, '/fixture', value, options), /not finalized/);
  } finally {
    global.fetch = originalFetch;
  }
  console.log('record-final: finalized receipt, independent exact readback, block membership, rejection cases ok');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
