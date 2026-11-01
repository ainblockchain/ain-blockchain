'use strict';
async function rpc(endpoint, method, params = {}) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { ...params, protoVer: '1.6.1' } }),
    signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error(`RPC HTTP ${response.status}`);
  const result = await response.json();
  if (result.error || !result.result || (result.result.code !== undefined && result.result.code !== 0)) {
    throw Error(result.error?.message || result.result?.message || 'Invalid RPC response');
  }
  return result.result.result;
}
const value = (endpoint, ref) => rpc(endpoint, 'ain_get', { type: 'GET_VALUE', ref, is_final: true });
module.exports = { rpc, value };
