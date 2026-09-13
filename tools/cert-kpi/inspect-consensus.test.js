const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { test } = require('node:test');
const { WebSocketServer } = require('ws');
const { EventEmitter } = require('events');
const vm = require('vm');
const run = promisify(execFile);
const script = path.join(__dirname, 'inspect-consensus.js');

async function withDirectory(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'consensus-inspector-test-'));
  try {
    await action(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function invoke(args, env = {}) {
  try {
    const result = await run(process.execPath, [script, ...args], {
      timeout: 10000, env: { ...process.env, ...env },
    });
    return { ...result, code: 0 };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

async function withProtocol(options, action) {
  const methods = [];
  const peerSocket = new EventEmitter();
  let observation;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify([{
      webSocketDebuggerUrl: options.remote ? 'ws://example.com:9229/test' :
        'ws://127.0.0.1:9229/test',
    }]));
  });
  const status = http.createServer((request, response) => response.end('{}'));
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket) => socket.on('message', async (bytes) => {
    const request = JSON.parse(bytes.toString());
    methods.push(request.method);
    let result = {};
    let error;
    if (request.method === 'Debugger.setBreakpointOnFunctionCall') {
      socket.send(JSON.stringify({ method: 'Debugger.paused',
        params: { callFrames: [{ callFrameId: 'frame-1' }] } }));
      result = { breakpointId: 'breakpoint-1' };
    } else if (request.method === 'Runtime.evaluate') {
      result = { result: { objectId: 'function-1' } };
    } else if (request.method === 'Debugger.evaluateOnCallFrame') {
      if (options.message) {
        observation = vm.runInNewContext(request.params.expression, {
          node: {}, inbound: { peer: { socket: peerSocket } }, Buffer, Date, JSON,
          setTimeout: (callback) => setTimeout(callback, 100), clearTimeout,
        });
        result = { result: { objectId: 'observation-1' } };
      } else {
        result = options.evaluateError ? { exceptionDetails: { text: 'capture refused' } } :
          { result: { value: { bounded: true } } };
      }
    } else if (request.method === 'Debugger.resume' && options.message && !options.empty) {
      peerSocket.emit('message', Buffer.from(JSON.stringify({ type: 'CONSENSUS', data: {
        message: { type: 'propose', value: { proposalBlock: 'private'.repeat(180000) } }, tags: [],
      } })));
    } else if (request.method === 'Runtime.awaitPromise') {
      result = { result: { value: await observation } };
    }
    if (options.cleanupError && request.method === 'Debugger.removeBreakpoint') {
      error = { message: 'remove failed' };
    }
    socket.send(JSON.stringify({ id: request.id, result, error }));
  }));
  await new Promise((resolve) => server.listen(9229, '127.0.0.1', resolve));
  await new Promise((resolve) => status.listen(18081, '127.0.0.1', resolve));
  try {
    await action(methods, peerSocket);
  } finally {
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    server.closeAllConnections();
    status.closeAllConnections();
    await Promise.all([server, status].map((service) =>
      new Promise((resolve) => service.close(resolve))));
  }
}

for (const empty of [false, true]) {
  test(`message observer resumes before awaiting and releases its listener: empty=${empty}`, () =>
    withDirectory((directory) => withProtocol({ message: true, empty }, async (methods, peer) => {
      const output = path.join(directory, 'message.json');
      const result = await invoke([output], { INSPECT_P2P_MESSAGE: '1' });
      assert.equal(result.code, 0, result.stderr);
      assert.equal(peer.listenerCount('message'), 0);
      assert.ok(methods.indexOf('Debugger.resume') < methods.indexOf('Runtime.awaitPromise'));
      const raw = fs.readFileSync(output, 'utf8');
      assert.equal(raw.includes('private'), false);
      const report = JSON.parse(raw);
      if (empty) assert.equal(report.noLargeMessage, true);
      else {
        assert.equal(report.type, 'CONSENSUS');
        assert.equal(report.consensusValueBytes.proposalBlock, 1260002);
      }
    })));
}

test('missing output is rejected', async () => {
  const result = await invoke([]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /new output/);
});

test('existing output is never replaced', async () => withDirectory(async (directory) => {
  const output = path.join(directory, 'result.json');
  fs.writeFileSync(output, 'original');
  assert.equal((await invoke([output])).code, 1);
  assert.equal(fs.readFileSync(output, 'utf8'), 'original');
}));

test('invalid private hash is rejected before connecting', async () =>
  withDirectory(async (directory) => {
    assert.equal((await invoke([path.join(directory, 'result.json'), 'bad-hash'])).code, 1);
  }));

test('public snapshot directory is rejected before connecting', async () =>
  withDirectory(async (directory) => {
    fs.chmodSync(directory, 0o755);
    const result = await invoke([path.join(directory, 'result.json'), `0x${'a'.repeat(64)}`]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /0700/);
  }));

test('non-loopback debugger target is rejected', async () => withDirectory(async (directory) =>
  withProtocol({ remote: true }, async (methods) => {
    assert.equal((await invoke([path.join(directory, 'result.json')])).code, 1);
    assert.deepEqual(methods, []);
  })));

for (const options of [{}, { evaluateError: true }, { cleanupError: true }]) {
  test(`early pause and cleanup protocol ${JSON.stringify(options)}`, async () =>
    withDirectory(async (directory) => withProtocol(options, async (methods) => {
      const output = path.join(directory, 'result.json');
      const result = await invoke([output]);
      assert.equal(result.code, options.evaluateError || options.cleanupError ? 1 : 0);
      assert.deepEqual(methods.slice(-5), ['Debugger.removeBreakpoint', 'Debugger.resume',
        'Debugger.disable', 'Runtime.releaseObjectGroup', 'Runtime.evaluate']);
      if (!options.evaluateError) {
        assert.deepEqual(JSON.parse(fs.readFileSync(output)), { bounded: true });
        assert.equal(fs.statSync(output).mode & 0o777, 0o600);
      } else {
        assert.equal(fs.existsSync(output), false);
      }
      if (options.cleanupError) assert.match(result.stderr, /cleanupErrors/);
    })));
}
