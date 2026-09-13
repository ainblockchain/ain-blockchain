const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const { test } = require('node:test');
const { WebSocketServer } = require('ws');
const run = promisify(execFile);
const script = path.join(__dirname, 'profile-consensus.js');

async function withDirectory(action) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'consensus-profile-test-'));
  try {
    await action(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function invoke(args) {
  try {
    return { ...await run(process.execPath, [script, ...args], { timeout: 20000 }), code: 0 };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

test('invalid output, duration and extra arguments fail before connecting', async () =>
  withDirectory(async (directory) => {
    const output = path.join(directory, 'profile.json');
    for (const args of [[], [output, '0'], [output, 'NaN'], [output, '20001'],
      [output, '1000', 'extra']]) {
      assert.equal((await invoke(args)).code, 1);
    }
    assert.equal(fs.existsSync(output), false);
    fs.writeFileSync(output, 'original');
    assert.equal((await invoke([output, '1000'])).code, 1);
    assert.equal(fs.readFileSync(output, 'utf8'), 'original');
  }));

for (const remote of [false, true]) {
  test(`refused evaluation or remote endpoint is cleaned up: remote=${remote}`, async () =>
    withDirectory(async (directory) => {
      const requests = [];
      const server = http.createServer((request, response) => {
        response.end(JSON.stringify([{ webSocketDebuggerUrl:
          `ws://${remote ? 'example.com' : '127.0.0.1'}:9229/test` }]));
      });
      const sockets = new WebSocketServer({ server });
      sockets.on('connection', (socket) => socket.on('message', (bytes) => {
        const request = JSON.parse(bytes.toString());
        requests.push(request);
        socket.send(JSON.stringify({ id: request.id, result:
          requests.length === 1 ? { exceptionDetails: { text: 'sampling refused' } } : {} }));
      }));
      await new Promise((resolve) => server.listen(9229, '127.0.0.1', resolve));
      try {
        const output = path.join(directory, 'profile.json');
        assert.equal((await invoke([output, '1000'])).code, 1);
        assert.equal(fs.existsSync(output), false);
        assert.equal(requests.length, remote ? 0 : 2);
        if (!remote) assert.match(requests[1].params.expression, /\.close\(\)/);
      } finally {
        for (const socket of sockets.clients) socket.terminate();
        sockets.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    }));
}

test('native CPU sampling retains target PID and closes only its inspector', async () =>
  withDirectory(async (directory) => {
    const fixture = path.join(directory, 'target.js');
    fs.writeFileSync(fixture, 'setInterval(() => {\n' +
      '  const deadline = Date.now() + 10;\n' +
      '  while (Date.now() < deadline) Math.sqrt(Date.now());\n' +
      '}, 30);\n');
    const target = spawn(process.execPath, ['--inspect=127.0.0.1:9229', fixture], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const exited = new Promise((resolve) => target.once('exit', resolve));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('fixture inspector timeout')), 5000);
        target.stderr.on('data', (bytes) => {
          if (bytes.toString().includes('Debugger listening')) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      const pid = target.pid;
      const output = path.join(directory, 'profile.json');
      const result = await invoke([output, '1000']);
      assert.equal(result.code, 0, result.stderr);
      const report = JSON.parse(fs.readFileSync(output));
      assert.equal(report.pid, pid);
      assert.equal(report.requestedDurationMs, 1000);
      assert.ok(report.profile.samples.length > 0);
      assert.equal(report.profile.samples.length, report.profile.timeDeltas.length);
      assert.equal(fs.statSync(output).mode & 0o777, 0o600);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.equal(target.exitCode, null);
      assert.doesNotThrow(() => process.kill(pid, 0));
      await assert.rejects(fetch('http://127.0.0.1:9229/json/list', {
        signal: AbortSignal.timeout(1000),
      }));
    } finally {
      target.kill('SIGTERM');
      await exited;
    }
  }));
