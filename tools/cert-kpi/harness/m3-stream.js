const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert/strict');
const { isDeepStrictEqual } = require('util');
const { newAin, NODES, APP, KPI_DIR, envSnapshot, writeResult, assertResultFree, assertChainPathFree, sleep, httpJson, recordAndVerifyFinal, percentile } = require('./common');

const role = process.argv[2];
const runId = process.argv[3];
const directory = path.join(KPI_DIR, 'evidence', runId || 'invalid');
const base = `/apps/${APP}/container_streams/${runId}`;
const endpoint = 'http://127.0.0.1:19210';

async function notify(message) {
  const response = await fetch(`${endpoint}/record`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId, ...message }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`observer HTTP ${response.status}`);
}

async function producer() {
  const producerId = Number(process.argv[4]);
  const count = Number(process.argv[5] || 200);
  const intervalMs = Number(process.argv[6] || 250);
  assert.ok(Number.isInteger(producerId) && producerId >= 1 && producerId <= 5);
  assert.ok(Number.isInteger(count) && count > 0 && Number.isInteger(intervalMs) && intervalMs > 0);
  const ain = newAin(producerId, null, 11 + producerId);
  const started = Date.now();
  let failures = 0;
  const raw = fs.openSync(path.join(directory, `producer-${producerId}.jsonl`), 'wx');
  for (let sequence = 0; sequence < count; sequence++) {
    const scheduledTs = started + sequence * intervalMs;
    await sleep(Math.max(0, scheduledTs - Date.now()));
    const payload = Buffer.alloc(1024, (producerId + sequence) % 256);
    const value = { runId, producerId, sequence, kind: 'CPU_HASH_COMPLETED', bytes: payload.length,
      digest: crypto.createHash('sha256').update(payload).digest('hex'), generatedTs: Date.now() };
    const record = { producerId, sequence, scheduledTs, value, submitNode: NODES[producerId], submitTs: Date.now() };
    try {
      const result = await ain.db.ref(`${base}/${producerId}/${sequence}`).setValue({ value, nonce: -1, gas_price: 1 });
      record.ackTs = Date.now();
      record.txHash = result?.tx_hash || null;
      record.accepted = result?.result?.code === 0 && Boolean(record.txHash);
      if (!record.accepted) record.error = result?.result || 'no acknowledgement';
    } catch (error) { record.ackTs = Date.now(); record.accepted = false; record.error = error.message; }
    if (!record.accepted) failures++;
    fs.writeSync(raw, JSON.stringify(record) + '\n');
    await notify({ kind: 'sample', record });
  }
  fs.fsyncSync(raw);
  fs.closeSync(raw);
  await notify({ kind: 'done', producerId, count, failures });
  console.log(JSON.stringify({ producerId, count, failures, elapsedMs: Date.now() - started }));
  process.exitCode = failures ? 1 : 0;
}

async function observer() {
  const expected = Number(process.argv[4] || 1000);
  assert.ok(Number.isInteger(expected) && expected >= 5 && expected % 5 === 0);
  assertResultFree(`m3-stream-${runId}`);
  const environment = await envSnapshot();
  const ain = newAin(0, 0, 11);
  await assertChainPathFree(ain, base);
  const records = new Map();
  const events = new Map();
  const done = new Map();
  const issues = [];
  const journal = fs.openSync(path.join(directory, 'observer.jsonl'), 'wx');
  const append = value => fs.writeSync(journal, JSON.stringify(value) + '\n');
  await ain.em.connect();
  const filter = ain.em.subscribe('VALUE_CHANGED', { path: `${base}/$producer/$sequence`, event_source: 'BLOCK' }, event => {
    const payload = event.payload || event;
    const key = `${payload.params?.producer}:${payload.params?.sequence}`;
    const observed = { eventTs: Date.now(), payload };
    append({ kind: 'event', key, ...observed });
    if (!events.has(key)) events.set(key, observed);
  }, error => { issues.push(`event filter: ${error.message}`); }, () => { issues.push('event filter deleted'); });
  let server;
  try {
    const probe = { runId, kind: 'SUBSCRIPTION_PROBE' };
    await recordAndVerifyFinal(ain, `${base}/probe/0`, probe);
    const probeDeadline = Date.now() + 15000;
    while (!events.has('probe:0') && Date.now() < probeDeadline) await sleep(100);
    assert.ok(events.has('probe:0'), 'subscription not demonstrated; no producers should start');
    server = http.createServer(async (request, response) => {
      try {
        if (request.url === '/ready' && request.method === 'GET') {
          response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ runId, ready: true })); return;
        }
        if (request.url !== '/record' || request.method !== 'POST') { response.writeHead(404).end(); return; }
        let body = '';
        for await (const chunk of request) { body += chunk; if (body.length > 16384) throw new Error('oversized record'); }
        const message = JSON.parse(body);
        assert.equal(message.runId, runId);
        if (message.kind === 'sample') {
          const record = message.record;
          assert.ok(Number.isInteger(record.producerId) && record.producerId >= 1 && record.producerId <= 5);
          assert.ok(Number.isInteger(record.sequence) && record.sequence >= 0 && record.sequence < expected / 5);
          const key = `${record.producerId}:${record.sequence}`;
          assert.ok(!records.has(key), 'duplicate sample');
          records.set(key, record);
        } else if (message.kind === 'done') {
          assert.ok(Number.isInteger(message.producerId) && message.producerId >= 1 && message.producerId <= 5);
          assert.ok(!done.has(message.producerId), 'duplicate done');
          done.set(message.producerId, message);
        } else throw new Error('unknown record kind');
        append({ receivedTs: Date.now(), ...message });
        response.end('ok');
      } catch (error) { issues.push(error.message); response.writeHead(400).end(error.message); }
    });
    await new Promise(resolve => server.listen(19210, '127.0.0.1', resolve));
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      const pending = [...records.values()].filter(record => record.accepted && !record.finalState);
      for (let offset = 0; offset < pending.length; offset += 20) {
        await Promise.all(pending.slice(offset, offset + 20).map(async record => {
          const receipt = await ain.getTransactionByHash(record.txHash).catch(() => null);
          if (receipt && ['FINALIZED', 'REVERTED'].includes(receipt.state)) {
            record.finalizedTs = Date.now(); record.finalState = receipt.state; record.block = receipt.number;
            append({ kind: 'receipt', txHash: record.txHash, observedTs: record.finalizedTs, receipt });
          }
        }));
      }
      if (done.size === 5 && [...records.values()].every(record => !record.accepted || record.finalState)) break;
      await sleep(250);
    }
    if (done.size !== 5 || records.size !== expected) issues.push('stream incomplete at observation deadline');
    const finalValues = await httpJson(`${NODES[5]}/get_value?ref=${encodeURIComponent(base)}&is_final=true`);
    fs.writeFileSync(path.join(directory, 'node5-final.json'), JSON.stringify(finalValues), { flag: 'wx' });
    const blocks = new Map();
    const blockNumbers = [...new Set([...records.values()].filter(record => record.finalState === 'FINALIZED').map(record => record.block))];
    for (const number of blockNumbers) {
      const block = await httpJson(`${NODES[9]}/get_block_by_number?number=${number}`);
      blocks.set(number, block.result);
      fs.writeFileSync(path.join(directory, `node9-block-${number}.json`), JSON.stringify(block), { flag: 'wx' });
    }
    const samples = [...records.entries()].map(([key, record]) => {
      const event = events.get(key);
      const block = blocks.get(record.block);
      const inclusionMs = event ? event.eventTs - record.submitTs : null;
      return { ...record, eventTs: event?.eventTs ?? null, inclusionMs,
        generatedToEventMs: event ? event.eventTs - record.value.generatedTs : null,
        finalizedMs: record.finalState === 'FINALIZED' ? record.finalizedTs - record.submitTs : null,
        schedulingLagMs: record.submitTs - record.scheduledTs,
        eventMatches: Boolean(event && event.payload.event_source === 'BLOCK' && event.payload.transaction?.hash === record.txHash && isDeepStrictEqual(event.payload.values?.after, record.value)),
        finalReadMatches: isDeepStrictEqual(finalValues.result?.[record.producerId]?.[record.sequence], record.value),
        blockMatches: Boolean(block?.transactions?.some(transaction => transaction.hash === record.txHash)),
        blockTimestamp: block?.timestamp ?? null };
    });
    const inclusion = samples.map(sample => sample.inclusionMs).filter(value => value !== null);
    const mean = values => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
    const correctness = samples.length === expected && done.size === 5 && issues.length === 0 && samples.every(sample => sample.accepted && sample.finalState === 'FINALIZED' && sample.eventMatches && sample.finalReadMatches && sample.blockMatches && sample.inclusionMs >= 0);
    const avgMs = mean(inclusion);
    const report = { runId, expected, observed: samples.length, producers: done.size, targetMs: 1500, avgMs,
      p95Ms: inclusion.length ? percentile(inclusion, 0.95) : null, maxMs: inclusion.length ? Math.max(...inclusion) : null,
      overTarget: inclusion.filter(value => value > 1500).length,
      finalizedAvgMs: mean(samples.map(sample => sample.finalizedMs).filter(value => value !== null)),
      schedulingLagMaxMs: samples.length ? Math.max(...samples.map(sample => sample.schedulingLagMs)) : null,
      distinctBlocks: blocks.size, issues, correctness, pass: correctness && avgMs <= 1500,
      definition: 'submit immediately before producer SDK call -> observer VALUE_CHANGED BLOCK receipt; finality separately polled every 250ms plus RPC workload. All containers share the host clock.',
      scope: 'five separate CPU-only Docker event producers; real 1KiB hash task completions, not GPU training or GPU utilization claims', samples };
    fs.fsyncSync(journal);
    await writeResult(`m3-stream-${runId}`, report, environment);
    console.log(JSON.stringify({ ...report, samples: undefined }));
    process.exitCode = report.pass ? 0 : 1;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    try { ain.em.unsubscribe(filter, () => {}); } catch {}
    ain.em.disconnect();
    fs.closeSync(journal);
  }
}

async function main() {
  assert.ok(runId && /^[A-Za-z0-9_-]+$/.test(runId), 'valid run ID required');
  if (role === 'producer') await producer();
  else if (role === 'observer') await observer();
  else throw new Error('observer|producer role required');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
