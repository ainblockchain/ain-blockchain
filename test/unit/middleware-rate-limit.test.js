const chai = require('chai');
const expect = chai.expect;
const express = require('express');
const { NodeConfigs } = require('../../common/constants');
const Middleware = require('../../client/middleware');

// 2026-10-29: every service on the layer gateway host shares one source IP, so the per-IP limit
// (20/s per node) refused AINspace storage reads and the whole L2 layer was reported not ready.
// Listed internal hosts are exempt; everyone else keeps the limit.
describe('Express rate limit exemption', () => {
  const saved = {};
  const set = (values) => { for (const [k, v] of Object.entries(values)) { saved[k] = NodeConfigs[k]; NodeConfigs[k] = v; } };
  afterEach(() => { Object.assign(NodeConfigs, saved); });

  async function hits(exempt, n = 5) {
    set({ ENABLE_EXPRESS_RATE_LIMIT: true, EXPRESS_RATE_LIMIT_WINDOW_SECS: 1, MAX_BLOCKCHAIN_API_RATE_LIMIT: 2,
      MAX_JSON_RPC_API_READ_RATE_LIMIT: 2, RATE_LIMIT_EXEMPT_IPS: exempt });
    const middleware = new Middleware();
    const app = express();
    app.use(middleware.blockchainApiRateLimiter);
    app.post('/json-rpc', express.json(), middleware.jsonRpcRateLimiter, (req, res) => res.json({ ok: true }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const statuses = [];
    try {
      for (let i = 0; i < n; i++) {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/json-rpc`, { method: 'POST',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'ain_get' }) });
        statuses.push(res.status);
      }
    } finally { server.close(); }
    return statuses;
  }

  it('a listed internal host is never rate limited', async () => {
    expect(await hits(['192.168.1.49', '127.0.0.1'])).to.deep.equal([200, 200, 200, 200, 200]);
  });
  it('other hosts keep the per-IP limit', async () => {
    expect(await hits([])).to.include(429);
    expect(await hits(['192.168.1.49'])).to.include(429);
  });
});
