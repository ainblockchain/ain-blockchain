/**
 * Cogito Container — Main entry point.
 *
 * General-purpose recipe-driven knowledge enrichment engine.
 * 1. Reads recipes from blockchain state
 * 2. Watches KG for entries matching recipe criteria
 * 3. Enriches via vLLM using recipe system prompts
 * 4. Serves x402-gated content via HTTP
 */

import { AinClient } from './ain-client.js';
import { RecipeWatcher } from './recipe-watcher.js';
import { BaseChain } from './base-chain.js';
import { createServer } from './x402-server.js';
import { config } from './config.js';

async function main() {
  console.log('=== Cogito Container ===');
  console.log('Recipe-driven knowledge enrichment');
  console.log(`AIN Node: ${config.ainProviderUrl}`);
  console.log(`vLLM: ${config.vllmUrl}`);
  console.log('');

  if (!config.ainPrivateKey) {
    console.error('ERROR: AIN_PRIVATE_KEY is required');
    process.exit(1);
  }

  // Init AIN client
  const ain = new AinClient(config.ainProviderUrl, config.ainPrivateKey);
  await ain.init();
  console.log(`[Cogito] Address: ${ain.getAddress()}`);

  // Init Base chain (optional — for ERC-8021 builder code attribution)
  let baseChain: BaseChain | undefined;
  if (config.baseRpcUrl && config.basePrivateKey) {
    baseChain = new BaseChain(config.baseRpcUrl, config.basePrivateKey);
    console.log(`[Cogito] Base chain: ${baseChain.getAddress()}`);
  } else {
    console.log('[Cogito] Base chain: disabled (set BASE_RPC_URL + BASE_PRIVATE_KEY to enable)');
  }

  // Start recipe watcher
  const watcher = new RecipeWatcher(ain, baseChain);
  await watcher.start();

  // Start x402 content server
  const app = createServer(ain, watcher);
  app.listen(config.x402Port, () => {
    console.log(`[Cogito] x402 server listening on port ${config.x402Port}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Cogito] Shutting down...');
    watcher.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
