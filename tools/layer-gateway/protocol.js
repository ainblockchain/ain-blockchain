'use strict';

const READ_METHODS = new Set([
  'ain_get', 'ain_getBalance', 'ain_getNonce', 'ain_getTimestamp',
  'ain_getBlockByHash', 'ain_getBlockByNumber', 'ain_getBlockList', 'ain_getBlockHeadersList',
  'ain_getLastBlock', 'ain_getLastBlockNumber', 'ain_getBlockTransactionCountByNumber',
  'ain_getTransactionByHash', 'ain_getTransactionByBlockNumberAndIndex',
  'ain_getValidatorsByNumber', 'ain_getValidatorInfo', 'ain_getProofHash', 'ain_getStateProof',
  'ain_getStateInfo', 'ain_getStateUsage', 'ain_matchFunction', 'ain_matchOwner', 'ain_matchRule',
  'ain_evalRule', 'ain_evalOwner', 'ain_validateAppName', 'ain_getStateChannel',
  'ain_getStateChannelEvents', 'ain_getProtocolVersion', 'ain_checkProtocolVersion',
  'net_getChainId', 'net_getNetworkId', 'net_peerCount', 'net_consensusStatus', 'net_syncing',
  'net_listening', 'net_getEventHandlerNetworkInfo',
]);
const WRITE_METHODS = new Set([
  'ain_sendSignedTransaction', 'ain_sendSignedTransactionBatch', 'ain_sendSignedTransactionDryrun',
]);
const LOCAL_METHODS = new Set(['ain_getLayerInfo', 'ain_listTransactions', 'ain_getIndexedTransaction']);

class RpcError extends Error {
  constructor(code, message, data) { super(message); this.code = code; this.data = data; }
}

function validateConfig(config) {
  if (!config || !['mainnet', 'testnet'].includes(config.network)) throw Error('Network is required');
  if (!['L1', 'L2'].includes(config.defaultLayer)) throw Error('Explicit defaultLayer is required');
  if (!config.layers?.[config.defaultLayer]) throw Error('Default layer is not configured');
  const ids = new Set();
  for (const [layer, settings] of Object.entries(config.layers)) {
    if (!['L1', 'L2'].includes(layer)) throw Error('Invalid layer');
    if (!Number.isSafeInteger(settings.chainId) || settings.chainId < 0 || settings.chainId > 109 || ids.has(settings.chainId)) {
      throw Error('Layers must have distinct signing chain IDs in the native encoding range 0..109');
    }
    ids.add(settings.chainId);
    if (!/^0x[a-f0-9]{64}$/.test(settings.genesisHash)) throw Error('Expected genesis hash is required');
    if (!Array.isArray(settings.endpoints) || settings.endpoints.length < 2) {
      throw Error('At least two independent witnesses are required');
    }
    if (new Set(settings.endpoints).size !== settings.endpoints.length) throw Error('Duplicate witness');
    for (const endpoint of settings.endpoints) {
      const url = new URL(endpoint);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
        throw Error('Invalid upstream URL');
      }
    }
  }
  return config;
}

function routeRequest(config, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.jsonrpc !== '2.0' ||
      !['string', 'number'].includes(typeof body.id) || typeof body.method !== 'string') {
    throw new RpcError(-32600, 'A JSON-RPC 2.0 request with an id is required');
  }
  const params = body.params === undefined ? {} : body.params;
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new RpcError(-32602, 'params must be an object');
  }
  const layer = params.layer === undefined ? config.defaultLayer : params.layer;
  if (!['L1', 'L2'].includes(layer)) throw new RpcError(-32602, 'layer must be L1 or L2');
  if (!config.layers[layer]) throw new RpcError(-32052, `${layer} is not available`);
  if (!READ_METHODS.has(body.method) && !WRITE_METHODS.has(body.method) && !LOCAL_METHODS.has(body.method)) {
    throw new RpcError(-32601, 'Unsupported public method');
  }
  // Layer is a routing hint, not signing authority. Each upstream verifies its
  // own distinct chain ID. Never rewrite the signed body or retry on another layer.
  const { layer: ignored, ...nativeParams } = params;
  return { layer, settings: config.layers[layer], local: LOCAL_METHODS.has(body.method),
    write: WRITE_METHODS.has(body.method), request: { ...body, params: nativeParams } };
}

function layerInfo(config) {
  return { version: 1, network: config.network, default_layer: config.defaultLayer,
    inbox: { enabled: config.l1Inbox === true },
    layers: Object.fromEntries(Object.entries(config.layers).map(([layer, settings]) => [layer, {
      chain_id: settings.chainId, genesis_hash: settings.genesisHash,
      execution: 'native-consensus', trust_model: layer === 'L2' ? 'operator-validated' : 'L1-consensus',
      // A root recorded on L1 is not proof of execution or withdrawal finality.
      settlement: layer === 'L2' ? 'see-transaction-anchor' : 'native-finality',
    }])) };
}

module.exports = { READ_METHODS, WRITE_METHODS, RpcError, validateConfig, routeRequest, layerInfo };
