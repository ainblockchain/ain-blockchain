/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  serverExternalPackages: [
    '@ainblockchain/ain-js',
    '@a2a-js/sdk',
    '@modelcontextprotocol/sdk',
    '@coinbase/x402',
    '@x402/core',
    '@x402/evm',
    'ethers',
  ],
};

export default nextConfig;
