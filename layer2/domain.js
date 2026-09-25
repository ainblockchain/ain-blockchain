'use strict';

// Consensus and checkpoint identities remain bound to the original genesis.
// The public transaction signing domain can be changed once, by an on-chain
// governor command. Historical replay reads the configuration of its base DB.
function isConsensusBody(body) {
  const op = body?.operation;
  return !!op && (op.type === 'SET_VALUE' || op.type === undefined) && !op.is_global &&
    /^\/consensus\/number\/\d+\/(propose|0x[a-f0-9]{64}\/vote\/0x[a-fA-F0-9]{40})$/.test(op.ref);
}
function executionChainId(config) { return config?.executionDomain?.chainId ?? config?.chainId; }
function transactionChainId(body, genesisChainId, config) {
  return config?.role === 'L2' && config.executionDomain && !isConsensusBody(body) ?
    (executionChainId(config) ?? genesisChainId) : genesisChainId;
}
module.exports = { isConsensusBody, executionChainId, transactionChainId };
