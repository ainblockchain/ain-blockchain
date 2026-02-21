/**
 * Global singletons for the Cogito Next.js server.
 * Initialized lazily on first access.
 */

import { AinClient } from './ain-client';
import { BaseChain } from './base-chain';
import { McpClient } from './mcp-client';
import { config, AGENT_ID, ERC_8004_REGISTRY } from './config';

let _ain: AinClient | null = null;
let _baseChain: BaseChain | undefined;
let _mcpClient: McpClient | null = null;
let _initPromise: Promise<void> | null = null;

async function doInit(): Promise<void> {
  if (_ain) return;

  if (!config.ainPrivateKey) {
    throw new Error('AIN_PRIVATE_KEY is required');
  }

  // AIN client
  _ain = new AinClient(config.ainProviderUrl, config.ainPrivateKey);
  await _ain.init();
  console.log(`[Cogito] Address: ${_ain.getAddress()}`);

  // Base chain (optional)
  if (config.baseRpcUrl && config.basePrivateKey) {
    _baseChain = new BaseChain(config.baseRpcUrl, config.basePrivateKey);
    console.log(`[Cogito] Base chain: ${_baseChain.getAddress()}`);
  }

  // Ensure on-chain ERC-8004 registration on Base, then record in AIN agents list
  if (_baseChain) {
    try {
      await _baseChain.ensureRegistration();
      await _ain.registerAgentId(AGENT_ID, ERC_8004_REGISTRY, _baseChain.getAddress());
    } catch (err: any) {
      console.log(`[Cogito] Base registration skipped: ${err.message}`);
    }
  }

  // MCP client connecting to remote cogito-mcp server
  _mcpClient = new McpClient(`${config.mcpServerUrl}/api/mcp`);
  try {
    await _mcpClient.connect();
    console.log('[Cogito] MCP client connected');
  } catch (err: any) {
    console.log(`[Cogito] MCP client connection deferred: ${err.message}`);
  }
}

/** Get the initialized AIN client (initializes on first call). */
export async function getAin(): Promise<AinClient> {
  if (!_initPromise) _initPromise = doInit();
  await _initPromise;
  return _ain!;
}

/** Get the MCP client (initializes on first call). */
export async function getMcpClient(): Promise<McpClient> {
  if (!_initPromise) _initPromise = doInit();
  await _initPromise;
  return _mcpClient!;
}
