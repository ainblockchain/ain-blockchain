/**
 * x402 payment server setup.
 * Uses @x402/core + @x402/evm for Base chain USDC payments.
 */

import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

let _server: x402ResourceServer | null = null;

/** Get the singleton x402 resource server (Base mainnet). */
export function getX402Server(): x402ResourceServer {
  if (!_server) {
    const facilitator = new HTTPFacilitatorClient({
      url: process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator',
    });
    _server = new x402ResourceServer(facilitator);
    _server.register('eip155:8453', new ExactEvmScheme());
  }
  return _server;
}
