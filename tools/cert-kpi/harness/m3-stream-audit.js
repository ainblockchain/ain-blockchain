const assert = require('assert/strict');
const crypto = require('crypto');

function auditStream({ report, rawRecords, events, receipts, finalValues, blocks }) {
  assert.equal(rawRecords.length, report.expected);
  assert.equal(report.samples.length, report.expected);
  assert.equal(new Set(rawRecords.map(record => `${record.producerId}:${record.sequence}`)).size, report.expected);
  assert.equal(new Set(rawRecords.map(record => record.txHash)).size, report.expected);
  assert.equal(new Set(rawRecords.map(record => record.producerId)).size, 5);
  const rawByHash = new Map(rawRecords.map(record => [record.txHash, record]));
  const sampleHashes = new Set();
  const latencies = [];
  for (const sample of report.samples) {
    assert.ok(!sampleHashes.has(sample.txHash));
    sampleHashes.add(sample.txHash);
    const raw = rawByHash.get(sample.txHash);
    assert.ok(raw && raw.accepted);
    for (const field of Object.keys(raw)) assert.deepEqual(sample[field], raw[field]);
    const digest = crypto.createHash('sha256').update(Buffer.alloc(1024, (raw.producerId + raw.sequence) % 256)).digest('hex');
    assert.equal(raw.value.digest, digest);
    assert.equal(raw.value.runId, report.runId);
    assert.ok(raw.value.generatedTs <= raw.submitTs && raw.submitTs <= raw.ackTs);
    const event = events.find(entry => entry.key === `${raw.producerId}:${raw.sequence}`);
    assert.ok(event);
    assert.equal(event.payload.transaction.hash, raw.txHash);
    assert.equal(event.payload.event_source, 'BLOCK');
    assert.deepEqual(event.payload.values.after, raw.value);
    assert.equal(sample.eventTs, event.eventTs);
    assert.equal(sample.inclusionMs, event.eventTs - raw.submitTs);
    assert.ok(sample.inclusionMs >= 0);
    const receipt = receipts.find(entry => entry.txHash === raw.txHash);
    assert.ok(receipt);
    assert.equal(receipt.receipt.state, 'FINALIZED');
    assert.equal(sample.block, receipt.receipt.number);
    assert.equal(sample.finalizedTs, receipt.observedTs);
    assert.equal(sample.finalizedMs, receipt.observedTs - raw.submitTs);
    assert.deepEqual(finalValues[raw.producerId][raw.sequence], raw.value);
    assert.ok(blocks[sample.block]?.transactions.some(transaction => transaction.hash === raw.txHash));
    latencies.push(sample.inclusionMs);
  }
  const sorted = [...latencies].sort((left, right) => left - right);
  const avgMs = latencies.reduce((total, latency) => total + latency, 0) / latencies.length;
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
  assert.equal(report.avgMs, avgMs);
  assert.equal(report.p95Ms, p95Ms);
  assert.equal(report.maxMs, Math.max(...latencies));
  assert.equal(report.overTarget, latencies.filter(latency => latency > 1500).length);
  assert.deepEqual(report.issues, []);
  assert.equal(report.correctness, true);
  assert.equal(report.pass, avgMs <= 1500);
  return { samples: latencies.length, avgMs, p95Ms, protocolPass: true, latencyPass: avgMs <= 1500 };
}

module.exports = { auditStream };
