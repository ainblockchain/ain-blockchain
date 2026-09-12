const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { publicRequestAllowed, publicHeaders, createPublicProxy } = require('../ainize-public-proxy');

test('only marketplace read/download and native P2P writes are exposed', () => {
  for (const target of ['/api/info', '/api/catalog?limit=100', '/api/patches/taught-1/quote', '/x402/patch/taught-1', '/p2p/blob/' + 'a'.repeat(64)]) assert.equal(publicRequestAllowed('GET', target), true);
  for (const target of ['/p2p/hello', '/p2p/records']) assert.equal(publicRequestAllowed('POST', target), true);
  for (const target of ['/api/auth/setup', '/api/teach/datasets', '/api/me/patches', '/api/chat', '/api/runtime/apply']) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) assert.equal(publicRequestAllowed(method, target), false);
  }
});

test('encoded paths, dot segments, authority URLs and non-read methods cannot bypass the allowlist', () => {
  for (const target of ['//evil.invalid/api/info', 'http://evil.invalid/api/info', '/api/me/../info', '/api/%69nfo', '/api/info%2f..', '/api\\info', '/api/info\r\nX: 1']) assert.equal(publicRequestAllowed('GET', target), false);
  assert.equal(publicRequestAllowed('DELETE', '/api/catalog'), false);
  assert.equal(publicRequestAllowed('POST', '/api/info'), false);
});

test('operator credentials and spoofed forwarding headers are not sent upstream', () => {
  const result = publicHeaders({ authorization: 'Bearer fixture', cookie: 'session=fixture', connection: 'x-remove', 'x-remove': 'drop', 'x-forwarded-for': '127.0.0.1', 'x-ainize-auth': 'signed-fixture', 'x-payment': 'payment-fixture' });
  assert.equal(result.authorization, undefined);
  assert.equal(result.cookie, undefined);
  assert.equal(result['x-forwarded-for'], undefined);
  assert.equal(result['x-remove'], undefined);
  assert.equal(result['x-ainize-auth'], 'signed-fixture');
  assert.equal(result['x-payment'], 'payment-fixture');
});

test('real HTTP forwarding preserves bytes and gates mutation, credentials and body size', async context => {
  const seen = [];
  const upstream = http.createServer((request, response) => {
    seen.push({ method: request.method, url: request.url, headers: request.headers });
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'set-cookie': 'operator=fixture' });
      response.end(request.method === 'POST' ? Buffer.concat(chunks) : Buffer.from([0, 1, 255]));
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = createPublicProxy({ upstreamPort: upstream.address().port, bodyLimit: 64 });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    proxy.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
  });
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  const response = await fetch(`${origin}/p2p/blob/${'a'.repeat(64)}`, { headers: { authorization: 'Bearer fixture', 'x-ainize-auth': 'signed-fixture' } });
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([0, 1, 255]));
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(seen[0].headers.authorization, undefined);
  assert.equal(seen[0].headers['x-ainize-auth'], 'signed-fixture');
  const denied = await fetch(`${origin}/api/teach/datasets`, { method: 'POST', body: 'data' });
  assert.equal(denied.status, 403);
  const oversized = await fetch(`${origin}/p2p/records`, { method: 'POST', body: 'x'.repeat(65) });
  assert.equal(oversized.status, 413);
  assert.equal(seen.length, 1);
  const posted = await fetch(`${origin}/p2p/records`, { method: 'POST', body: '{"records":[]}' });
  assert.equal(await posted.text(), '{"records":[]}');
  assert.equal(seen.length, 2);
});
