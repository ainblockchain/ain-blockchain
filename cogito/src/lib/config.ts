/**
 * Environment configuration for the Cogito container.
 */

export const config = {
  ainProviderUrl: process.env.AIN_PROVIDER_URL || 'http://ain-blockchain:8080',
  ainPrivateKey: process.env.AIN_PRIVATE_KEY || '',
  vllmUrl: process.env.VLLM_URL || 'http://vllm:8000',
  vllmModel: process.env.VLLM_MODEL || 'Qwen/Qwen3-32B-AWQ',
  mcpServerUrl: process.env.MCP_SERVER_URL || 'https://papers-with-claudecode.vercel.app',
  x402Port: parseInt(process.env.X402_PORT || '3402'),
  contentPrice: process.env.CONTENT_PRICE || '0.005',
  baseRpcUrl: process.env.BASE_RPC_URL || '',
  basePrivateKey: process.env.BASE_PRIVATE_KEY || '',
  agentBaseUrl: process.env.AGENT_BASE_URL || 'https://cogito.ainetwork.ai',
};

/** ERC-8004 agent identity constants. */
export const AGENT_ID = 18276;
export const ERC_8004_REGISTRY = 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
export const ERC_8004_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
