const fs = require('fs');
const crypto = require('crypto');
const { newAin, APP, envSnapshot, recordAndVerifyFinal, assertChainPathFree, assertResultFree, writeResult } = require('./common');

async function main() {
  const runId = process.env.RUN_ID;
  if (!runId || !/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('valid RUN_ID required');
  assertResultFree(`ledger-${runId}`);
  const ain = newAin(3, null, 13);
  const target = `/apps/${APP}/ledger_integration/${runId}`;
  await assertChainPathFree(ain, target);
  const before = await envSnapshot();
  const dataset = fs.readFileSync(`${__dirname}/dart-datasets/dart-011-corpcode.jsonl`);
  const value = { runId, dataset: 'dart-011-corpcode', sha256: crypto.createHash('sha256').update(dataset).digest('hex'),
    bytes: dataset.length, purpose: 'SDK ledger integration check; not teach or inference evidence' };
  const verified = await recordAndVerifyFinal(ain, target, value);
  await writeResult(`ledger-${runId}`, { metric: 'ledger_integration', runId, target, submitted: value, verified, pass: true }, before);
  console.log(JSON.stringify({ runId, txHash: verified.txHash, block: verified.blockNumber, pass: true }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
