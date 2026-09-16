const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { PaymentChannel } = require('/opt/ain-js/lib/state-channel');
const { newAin, APP, KPI_DIR, envSnapshot, recordAndVerifyFinal, assertChainPathFree, writeResult, assertResultFree } = require('./common');

async function main() {
  const phase = process.argv[2];
  const runId = process.argv[3];
  if (!['open', 'settle'].includes(phase) || !runId || !/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error('open|settle and load run ID required');
  const directory = path.join(KPI_DIR, 'evidence', runId);
  const environment = await envSnapshot();
  const ain = newAin(3, null, 13);
  const target = `/apps/${APP}/network_channels/${runId}/${phase}`;
  await assertChainPathFree(ain, target);
  assertResultFree(`channel-${phase}-${runId}`);
  if (phase === 'open') {
    const initial = JSON.parse(fs.readFileSync(path.join(directory, 'initial.json')));
    assert.equal(initial.runId, runId);
    const openingsJson = JSON.stringify(initial.openings);
    const value = { runId, chainId: environment.chain.genesisHash, openingsJson,
      openingsSha256: crypto.createHash('sha256').update(openingsJson).digest('hex'),
      units: 'test credits, not deposited AIN', purpose: 'cooperatively signed microtransaction simulation' };
    assert.ok(value.chainId);
    const verified = await recordAndVerifyFinal(ain, target, value);
    const openings = initial.openings.map(opening => ({ ...opening, chainId: value.chainId, openingReference: verified.txHash.replace(/^0x/, '') }));
    openings.forEach(opening => new PaymentChannel(opening));
    const prepared = { runId, path: target, value, verified, openings };
    fs.writeFileSync(path.join(directory, 'prepared.json'), JSON.stringify(prepared, null, 2), { flag: 'wx' });
    await writeResult(`channel-open-${runId}`, { ...prepared, pass: true }, environment);
    return;
  }
  const prepared = JSON.parse(fs.readFileSync(path.join(directory, 'prepared.json')));
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'load-result.json')));
  assert.equal(report.runId, runId);
  assert.equal(report.channels.length, prepared.openings.length);
  const checkpoints = [];
  for (const [index, opening] of prepared.openings.entries()) {
    const channel = new PaymentChannel(opening);
    const journal = fs.readFileSync(path.join(directory, `journal-${index}.jsonl`));
    for (const line of journal.toString('utf8').split('\n').filter(Boolean)) channel.commit(JSON.parse(line));
    assert.deepEqual(channel.snapshot(), report.channels[index].state);
    assert.deepEqual(channel.snapshot(), report.channels[index].remote);
    checkpoints.push({ index, ...channel.snapshot(), journalSha256: crypto.createHash('sha256').update(journal).digest('hex') });
  }
  assert.equal(checkpoints.reduce((total, checkpoint) => total + checkpoint.sequence, 0), report.acknowledged);
  const checkpointBytes = Buffer.from(JSON.stringify(checkpoints));
  fs.writeFileSync(path.join(directory, 'checkpoints.json'), checkpointBytes, { flag: 'wx' });
  const value = { runId, openingTx: prepared.verified.txHash, channels: checkpoints.length, transfers: report.acknowledged,
    checkpointSha256: crypto.createHash('sha256').update(checkpointBytes).digest('hex'),
    scope: 'co-signed final credit states independently replayed; checkpoint record, not an escrow payout' };
  const verified = await recordAndVerifyFinal(ain, target, value);
  await writeResult(`channel-settle-${runId}`, { value, verified, checkpoints, measurements: report,
    protocolPass: report.correctness, performancePass: report.performancePass, pass: report.correctness && report.performancePass }, environment);
  console.log(JSON.stringify({ recorded: true, transfers: value.transfers, txHash: verified.txHash, performancePass: report.performancePass }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
