'use strict';

const http = require('http');
const fs = require('fs');
const { IndexStore } = require('./index-store');
const { RpcError, validateConfig, routeRequest, layerInfo } = require('./protocol');

/** A non-2xx upstream answer. 429 means the node's per-IP rate limiter refused it before any execution. */
class UpstreamError extends RpcError {
  constructor(status) { super(-32050, 'Selected layer upstream unavailable'); this.status = status; }
}
const rateLimited = error => error instanceof UpstreamError && error.status === 429;
// Rate limiting and timeouts say nothing about which chain a node serves; they must not revoke readiness.
const transient = error => rateLimited(error) || error?.name === 'TimeoutError' || error?.name === 'AbortError';

async function upstream(endpoint, request) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new UpstreamError(response.status);
  const json = await response.json();
  if (!json || typeof json !== 'object') throw new RpcError(-32050, 'Invalid upstream response');
  return json;
}

async function read(endpoint, method, params = {}) {
  const json = await upstream(endpoint, { jsonrpc: '2.0', id: 1, method, params: { ...params, protoVer: '1.6.1' } });
  if (json.error || !json.result || (json.result.code && json.result.code !== 0)) throw Error('Upstream read rejected');
  return json.result.result;
}

function createGateway(config, store, transport = upstream, reader = read) {
  validateConfig(config);
  for (const [layer, settings] of Object.entries(config.layers)) store.bind(layer, settings.genesisHash);
  if (config.layers.L2?.validators) store.configureSettlement({ ...config.layers.L2,
    chainId: config.layers.L2.checkpointChainId ?? config.layers.L2.chainId,
    parentChainId: config.layers.L1.chainId, threshold: 4 });
  const readiness = Object.fromEntries(Object.keys(config.layers).map(layer => [layer, { healthy: false }]));
  const targets = {};
  // Genesis and chain id never change for an endpoint: verify them once, then each pass only reads
  // height and consensus. The validators rate-limit reads per source IP (10/s), shared by every
  // service on this host (2026-10-29: re-reading them every 2 s pushed nodes into 429).
  const identities = {};
  let turn = 0;

  async function handle(body) {
    const route = routeRequest(config, body);
    const success = result => ({ jsonrpc: '2.0', id: body.id, result: { result, protoVer: '1.6.1' } });
    if (body.method === 'ain_getLayerInfo') return success({ ...layerInfo(config), status: readiness });
    if (body.method === 'ain_listTransactions') return success(store.list(route.layer, body.params));
    if (body.method === 'ain_getIndexedTransaction') return success(store.transaction(route.layer, body.params?.hash));
    // Never route to an unverified chain or fall back to a different execution layer.
    const status = readiness[route.layer];
    if (!status.healthy || Date.now() - status.checked_at > 60000) throw new RpcError(-32052, 'Selected layer is not ready');
    // Spread requests over the verified witnesses; a 429 was refused before execution, so another
    // witness may take it (writes included). Any other failure is returned, never replayed.
    const witnesses = targets[route.layer]?.length ? targets[route.layer] : route.settings.endpoints.slice(0, 1);
    const start = turn++ % witnesses.length;
    let response;
    for (let i = 0; i < witnesses.length; i++) {
      try { response = await transport(witnesses[(start + i) % witnesses.length], route.request); break; }
      catch (error) { if (!rateLimited(error) || i === witnesses.length - 1) throw error; }
    }
    return { ...response, execution: { layer: route.layer, chain_id: route.settings.chainId,
      genesis_hash: route.settings.genesisHash,
      acknowledgement: route.write ? 'upstream-result-only' : undefined } };
  }

  async function indexLayer(layer) {
    const settings = config.layers[layer];
    try {
      const observations = await Promise.allSettled(settings.endpoints.map(async endpoint => {
        const key = layer + ' ' + endpoint;
        if (!identities[key]) {
          const genesis = await reader(endpoint, 'ain_getBlockByNumber', { number: 0, getFullTransactions: false });
          const chainId = await reader(endpoint, 'net_getChainId');
          if (genesis?.hash !== settings.genesisHash || chainId !== settings.chainId) throw Error('Endpoint serves another chain');
          identities[key] = true;
        }
        return { endpoint, height: await reader(endpoint, 'ain_getLastBlockNumber'),
          consensus: await reader(endpoint, 'net_consensusStatus') };
      }));
      const healthy = observations.filter(x => x.status === 'fulfilled').map(x => x.value).filter(x =>
        x.consensus?.health === true && Number.isSafeInteger(x.height) && x.height >= 0);
      if (healthy.length < 2) {
        const error = Error('Fewer than two healthy chain witnesses');
        if (observations.some(x => x.status === 'rejected' && transient(x.reason))) error.transient = true;
        throw error;
      }
      const height = Math.min(...healthy.map(x => x.height));
      const tips = await Promise.allSettled(healthy.map(async x => ({ endpoint: x.endpoint,
        block: await reader(x.endpoint, 'ain_getBlockByNumber', { number: height, getFullTransactions: false }) })));
      const groups = new Map();
      for (const tip of tips) if (tip.status === 'fulfilled' && tip.value.block?.hash) {
        const hash = tip.value.block.hash;
        if (!groups.has(hash)) groups.set(hash, []);
        groups.get(hash).push(tip.value.endpoint);
      }
      const witnesses = [...groups.values()].sort((a, b) => b.length - a.length)[0];
      if (!witnesses || witnesses.length < 2) {
        const error = Error('Finalized witnesses disagree');
        // Fewer than two answers at all (not two different answers) is the rate limiter again.
        if (groups.size <= 1 && tips.some(x => x.status === 'rejected' && transient(x.reason))) error.transient = true;
        throw error;
      }
      const head = store.head(layer);
      if (head.height > height) throw Error('Witnesses behind indexed history');
      if (head.height >= 0) {
        const old = await reader(witnesses[0], 'ain_getBlockByNumber', { number: head.height, getFullTransactions: false });
        const indexed = store.db.prepare('SELECT hash FROM blocks WHERE layer=? AND number=?').get(layer, head.height);
        if (old?.hash !== indexed.hash) throw Error('Indexed finalized history changed');
      }
      // Bound each pass so a catch-up job cannot starve requests or other layers.
      for (let number = head.height + 1; number <= Math.min(height, head.height + 20); number++) {
        const block = await reader(witnesses[0], 'ain_getBlockByNumber', { number, getFullTransactions: true });
        const witness = await reader(witnesses[1], 'ain_getBlockByNumber', { number, getFullTransactions: false });
        if (!block?.hash || block.hash !== witness?.hash) throw Error('Block witnesses disagree');
        store.append(layer, block);
      }
      readiness[layer] = { healthy: true, checked_at: Date.now(), finalized_height: height,
        indexed_height: store.head(layer).height, genesis_hash: settings.genesisHash,
        healthy_witnesses: witnesses.length };
      targets[layer] = witnesses;
    } catch (error) {
      // A rate-limited or timed-out pass proves nothing new: the last verification stands until its
      // 60 s bound in handle() expires. Disagreement, forks and index faults revoke readiness at once.
      if (!(error.transient || transient(error)))
        readiness[layer] = { healthy: false, checked_at: Date.now(), indexed_height: store.head(layer).height };
      console.error(JSON.stringify({ event: error.transient || transient(error) ? 'layer-check-deferred' : 'layer-unavailable', layer,
        reason: error instanceof RpcError || error.transient || /^(Fewer|Finalized|Witnesses|Indexed|Block|Endpoint|Noncontiguous|Genesis|Finalized history)/.test(error.message || '')
          ? error.message : 'witness-or-index-check-failed' }));
    }
  }

  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (req.method === 'GET' && req.url === '/health_check') return send(readiness[config.defaultLayer].healthy ? 200 : 503, readiness);
    if (req.method !== 'POST' || req.url !== '/json-rpc') return send(404, { error: 'Not found' });
    let body;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) { send(413, { error: 'Request too large' }); req.destroy(); return; }
        chunks.push(chunk);
      }
      try { body = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { throw new RpcError(-32700, 'Invalid JSON'); }
      send(200, await handle(body));
    } catch (error) {
      send(200, { jsonrpc: '2.0', id: body?.id ?? null, error: { code: error instanceof RpcError ? error.code : -32050,
        message: error instanceof RpcError ? error.message : 'Selected layer unavailable' } });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  return { server, handle, indexLayer, readiness };
}

if (require.main === module) {
  const config = validateConfig(JSON.parse(fs.readFileSync(process.env.AIN_LAYER_CONFIG, 'utf8')));
  const store = new IndexStore(process.env.AIN_LAYER_INDEX);
  const gateway = createGateway(config, store);
  let stopped = false;
  (async () => {
    while (!stopped) {
      await Promise.all(Object.keys(config.layers).map(layer => gateway.indexLayer(layer)));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  })().catch(() => { process.exitCode = 1; gateway.server.close(); });
  gateway.server.listen(Number(process.env.PORT || 19077), process.env.HOST || '127.0.0.1');
  const stop = () => { stopped = true; gateway.server.close(() => { store.close(); process.exit(0); }); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

module.exports = { createGateway, read, UpstreamError };
