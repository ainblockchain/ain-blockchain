/**
 * Environment configuration for the Cogito container.
 */

export const config = {
  ainProviderUrl: process.env.AIN_PROVIDER_URL || 'http://ain-blockchain:8080',
  ainPrivateKey: process.env.AIN_PRIVATE_KEY || '',
  vllmUrl: process.env.VLLM_URL || 'http://vllm:8000',
  vllmModel: process.env.VLLM_MODEL || 'Qwen/Qwen3-32B-AWQ',
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000'),
  x402Port: parseInt(process.env.X402_PORT || '3402'),
  contentPrice: process.env.CONTENT_PRICE || '0.005',
  baseRpcUrl: process.env.BASE_RPC_URL || '',
  basePrivateKey: process.env.BASE_PRIVATE_KEY || '',
};
