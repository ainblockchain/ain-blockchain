const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { auditStream } = require('./m3-stream-audit');
const { newAin, APP, KPI_DIR, envSnapshot, recordAndVerifyFinal, assertResultFree, assertChainPathFree, writeResult } = require('./common');

async function main() {
  const runId = process.argv[2];
  assert.ok(runId && /^[A-Za-z0-9_-]+$/.test(runId));
  const directory = path.join(KPI_DIR, 'evidence', runId);
  const file = path.join(KPI_DIR, 'results', `m3-stream-${runId}.json`);
  const reportBytes = fs.readFileSync(file);
  const report = JSON.parse(reportBytes);
  assert.equal(report.runId, runId);
  const lines = name => fs.readFileSync(path.join(directory, name), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const rawRecords = [];
  for (let producer = 1; producer <= 5; producer++) {
    const state = JSON.parse(fs.readFileSync(`${directory}_producer${producer}/state.json`));
    assert.equal(state.ExitCode, 0); assert.equal(state.OOMKilled, false);
    const limits = JSON.parse(fs.readFileSync(`${directory}_producer${producer}/limits.json`));
    assert.ok(limits.NanoCpus > 0 && limits.Memory > 0 && limits.CpusetCpus);
    rawRecords.push(...lines(`producer-${producer}.jsonl`));
  }
  const journal = lines('observer.jsonl');
  const blocks = Object.fromEntries([...new Set(report.samples.map(sample => sample.block))].map(number =>
    [number, JSON.parse(fs.readFileSync(path.join(directory, `node9-block-${number}.json`))).result]));
  const audited = auditStream({ report, rawRecords, blocks, events: journal.filter(entry => entry.kind === 'event'),
    receipts: journal.filter(entry => entry.kind === 'receipt'), finalValues: JSON.parse(fs.readFileSync(path.join(directory, 'node5-final.json'))).result });
  const environment = await envSnapshot();
  const ain = newAin(3, null, 13);
  const target = `/apps/${APP}/container_stream_reports/${runId}`;
  assertResultFree(`m3-stream-verified-${runId}`);
  await assertChainPathFree(ain, target);
  const value = { runId, samples: audited.samples, avgMs: audited.avgMs, p95Ms: audited.p95Ms,
    latencyPass: audited.latencyPass, reportSha256: crypto.createHash('sha256').update(reportBytes).digest('hex') };
  const verified = await recordAndVerifyFinal(ain, target, value);
  await writeResult(`m3-stream-verified-${runId}`, { ...audited, value, verified, pass: audited.latencyPass }, environment);
  console.log(JSON.stringify({ ...audited, txHash: verified.txHash }));
  process.exitCode = audited.latencyPass ? 0 : 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
