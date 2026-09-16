const assert = require('assert/strict');
const fs = require('fs');
const WebSocket = require('ws');

async function main() {
  const [output, durationValue = '5000'] = process.argv.slice(2);
  const duration = Number(durationValue);
  assert.ok(process.argv.length <= 4, 'usage: profile-consensus.js NEW_OUTPUT [DURATION_MS]');
  assert.ok(output && !fs.existsSync(output), 'pass a NEW output file');
  assert.ok(Number.isSafeInteger(duration) && duration >= 1000 && duration <= 20000);
  const listing = await fetch('http://127.0.0.1:9229/json/list', {
    signal: AbortSignal.timeout(5000),
  });
  assert.ok(listing.ok);
  const targets = await listing.json();
  assert.equal(targets.length, 1, 'exactly one explicitly selected local inspector required');
  const endpoint = new URL(targets[0].webSocketDebuggerUrl);
  assert.equal(endpoint.protocol, 'ws:');
  assert.equal(endpoint.hostname, '127.0.0.1');
  assert.equal(endpoint.port, '9229');
  const socket = new WebSocket(endpoint, { maxPayload: 16 * 1024 ** 2, handshakeTimeout: 5000 });
  const pending = new Map();
  let sequence = 0;
  const rejectPending = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };
  socket.on('error', rejectPending);
  socket.on('close', () => rejectPending(new Error('inspector disconnected')));
  socket.on('message', (bytes) => {
    const message = JSON.parse(bytes.toString());
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 90000);
    pending.set(id, { timer, resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  try {
    const result = await call('Runtime.evaluate', {
      awaitPromise: true, returnByValue: true,
      expression: `(async function() {
        const { Session } = process.mainModule.require('node:inspector/promises');
        const session = new Session();
        session.connect();
        let active = false;
        try {
          await session.post('Profiler.enable');
          await session.post('Profiler.setSamplingInterval', { interval: 2000 });
          const startedAt = new Date().toISOString();
          await session.post('Profiler.start');
          active = true;
          await new Promise(resolve => setTimeout(resolve, ${duration}));
          const { profile } = await session.post('Profiler.stop');
          active = false;
          return { startedAt, completedAt: new Date().toISOString(), pid: process.pid,
            node: process.version, requestedDurationMs: ${duration}, samplingIntervalUs: 2000,
            memory: process.memoryUsage(), profile,
            scope: 'local CPU sampling diagnostic, not benchmark throughput or latency',
            caveat: 'includes profiler startup, GC, idle and off-CPU delays; not CPU utilization' };
        } finally {
          if (active) await session.post('Profiler.stop').catch(() => null);
          await session.post('Profiler.disable').catch(() => null);
          session.disconnect();
        }
      })()`,
    });
    assert.ok(!result.exceptionDetails, result.exceptionDetails?.text);
    fs.writeFileSync(output, JSON.stringify(result.result.value, null, 2) + '\n', {
      flag: 'wx', mode: 0o600,
    });
    console.log(JSON.stringify({ output, samples: result.result.value.profile.samples.length,
      startedAt: result.result.value.startedAt, completedAt: result.result.value.completedAt }));
  } finally {
    try {
      await call('Runtime.evaluate', {
        expression: 'setTimeout(() => process.mainModule.require(\'node:inspector\')' +
          '.close(), 1000).unref(); undefined',
      });
    } finally {
      socket.terminate();
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
