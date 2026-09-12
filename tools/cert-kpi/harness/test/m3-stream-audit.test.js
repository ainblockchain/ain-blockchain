const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { auditStream } = require('../m3-stream-audit');

function fixture(latency = 1500) {
  const rawRecords = Array.from({ length: 5 }, (_, index) => {
    const producerId = index + 1;
    return { producerId, sequence: 0, accepted: true, txHash: `tx-${producerId}`, submitTs: 1001, ackTs: 1002,
      value: { runId: 'test', generatedTs: 1000, digest: crypto.createHash('sha256').update(Buffer.alloc(1024, producerId)).digest('hex') } };
  });
  const samples = rawRecords.map(raw => ({ ...raw, eventTs: 1001 + latency, inclusionMs: latency, finalizedTs: 6001, finalizedMs: 5000, block: 1 }));
  return {
    rawRecords, report: { runId: 'test', expected: 5, samples, avgMs: latency, p95Ms: latency, maxMs: latency,
      overTarget: latency > 1500 ? 5 : 0, issues: [], correctness: true, pass: latency <= 1500 },
    events: rawRecords.map(raw => ({ key: `${raw.producerId}:0`, eventTs: 1001 + latency,
      payload: { transaction: { hash: raw.txHash }, event_source: 'BLOCK', values: { after: raw.value } } })),
    receipts: rawRecords.map(raw => ({ txHash: raw.txHash, observedTs: 6001, receipt: { state: 'FINALIZED', number: 1 } })),
    finalValues: Object.fromEntries(rawRecords.map(raw => [raw.producerId, { 0: raw.value }])),
    blocks: { 1: { transactions: rawRecords.map(raw => ({ hash: raw.txHash })) } },
  };
}

test('1500ms passes; 1501ms remains a verified target failure', () => {
  assert.equal(auditStream(fixture()).latencyPass, true);
  const result = auditStream(fixture(1501));
  assert.equal(result.protocolPass, true);
  assert.equal(result.latencyPass, false);
});

test('missing samples cannot be dropped from the denominator', () => {
  const data = fixture(); data.report.samples.pop();
  assert.throws(() => auditStream(data));
});

test('mismatched event hashes and USER events are rejected', () => {
  for (const field of ['hash', 'source']) {
    const data = fixture();
    if (field === 'hash') data.events[0].payload.transaction.hash = 'wrong';
    else data.events[0].payload.event_source = 'USER';
    assert.throws(() => auditStream(data));
  }
});

test('reverted receipts or missing independent block membership are rejected', () => {
  const reverted = fixture(); reverted.receipts[0].receipt.state = 'REVERTED';
  assert.throws(() => auditStream(reverted));
  const missing = fixture(); missing.blocks[1].transactions.pop();
  assert.throws(() => auditStream(missing));
});

test('reported averages cannot override the raw timestamps', () => {
  const data = fixture(1800); data.report.avgMs = 1400; data.report.pass = true;
  assert.throws(() => auditStream(data));
});

test('duplicate transactions are rejected', () => {
  const data = fixture(); data.rawRecords[1].txHash = data.rawRecords[0].txHash;
  assert.throws(() => auditStream(data));
});
