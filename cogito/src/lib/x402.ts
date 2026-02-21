/**
 * x402 payment server setup.
 * Uses @coinbase/x402 CDP facilitator for Base mainnet USDC payments.
 */

import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { facilitator as cdpFacilitator } from '@coinbase/x402';

let _server: x402ResourceServer | null = null;

const X402_NETWORK = (process.env.X402_NETWORK || 'eip155:8453') as `${string}:${string}`;

/** Get the singleton x402 resource server (CDP facilitator for Base mainnet). */
export function getX402Server(): x402ResourceServer {
  if (!_server) {
    const facilitatorClient = new HTTPFacilitatorClient(cdpFacilitator);
    _server = new x402ResourceServer(facilitatorClient);
    _server.register(X402_NETWORK, new ExactEvmScheme());
  }
  return _server;
}

export { X402_NETWORK };
