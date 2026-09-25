const http = require('node:http');

const readPaths = new Set(['/healthz', '/readyz', '/api/info', '/api/catalog', '/api/nodes', '/p2p/info', '/p2p/peers', '/p2p/records', '/p2p/blobs', '/p2p/datasets']);
const readPatterns = [
  /^\/api\/patches\/[A-Za-z0-9_-]+(?:\/(?:quote|records|conflicts|dataset(?:\/(?:rows|manifest))?))?$/,
  /^\/api\/teacher\/0x[0-9a-fA-F]{40}$/,
  /^\/p2p\/blob\/[0-9a-f]{64}$/,
  /^\/p2p\/dataset\/[0-9a-f]{64}(?:\/(?:manifest|benchmark))?$/,
  /^\/p2p\/payouts\/[A-Za-z0-9_-]+$/,
  /^\/x402\/patch\/[A-Za-z0-9_-]+$/,
];
const writePaths = new Set(['/p2p/hello', '/p2p/records']);

function publicRequestAllowed(method, target) {
  if (!target || target.length > 8192 || !target.startsWith('/') || target.startsWith('//') || /[\\\r\n]/.test(target)) return false;
  const pathname = target.split('?')[0];
  if (pathname.includes('%') || pathname.split('/').some(part => part === '.' || part === '..')) return false;
  if (method === 'POST') return writePaths.has(pathname);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  return readPaths.has(pathname) || readPatterns.some(pattern => pattern.test(pathname)) || (method === 'OPTIONS' && writePaths.has(pathname));
}

function publicHeaders(headers) {
  const output = { ...headers };
  const connectionTokens = String(headers.connection || '').split(',').map(value => value.trim().toLowerCase());
  for (const key of [...connectionTokens, 'host', 'connection', 'transfer-encoding', 'upgrade', 'proxy-authorization', 'proxy-authenticate', 'keep-alive', 'trailer', 'te', 'authorization', 'cookie', 'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip']) delete output[key];
  output.connection = 'close';
  return output;
}

function createPublicProxy({ upstreamPort = 3410, bodyLimit = 2 * 1024 * 1024 } = {}) {
  const server = http.createServer({ requestTimeout: 30000, headersTimeout: 10000 }, (request, response) => {
    const fail = (status, message) => {
      response.writeHead(status, { 'content-type': 'application/json', connection: 'close', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error: message }));
    };
    if (!publicRequestAllowed(request.method, request.url)) return fail(403, 'This endpoint is not exposed by the public marketplace proxy. Teaching, management and model mutation stay local.');
    if (Number(request.headers['content-length']) > bodyLimit) return fail(413, 'request body too large');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS', 'access-control-allow-headers': 'content-type, x-ainize-auth, x-payment, x-ainize-dataset-intent' });
      return response.end();
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, path: request.url, method: request.method, headers: publicHeaders(request.headers), timeout: 30000 }, incoming => {
      const headers = { ...incoming.headers, 'access-control-allow-origin': '*' };
      delete headers['set-cookie'];
      response.writeHead(incoming.statusCode || 502, headers);
      incoming.on('error', () => response.destroy());
      incoming.pipe(response);
    });
    let received = 0;
    request.on('data', chunk => {
      received += chunk.length;
      if (received > bodyLimit) {
        request.unpipe(upstream);
        if (!response.headersSent) fail(413, 'request body too large');
        upstream.destroy();
      }
    });
    request.on('aborted', () => upstream.destroy());
    upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
    upstream.on('error', () => { if (!response.headersSent) fail(502, 'marketplace node unavailable'); });
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  server.maxConnections = 64;
  server.maxHeadersCount = 64;
  return server;
}

if (require.main === module) {
  const server = createPublicProxy();
  server.listen(3412, '127.0.0.1', () => process.stdout.write('public marketplace proxy listening on 127.0.0.1:3412; upstream 127.0.0.1:3410\n'));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
module.exports = { publicRequestAllowed, publicHeaders, createPublicProxy };
