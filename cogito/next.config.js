/** @type {import('next').NextConfig} */
const nextConfig = {
  // API-only server — no React pages needed
  reactStrictMode: false,
  // Allow server-side external packages
  serverExternalPackages: ['@ainblockchain/ain-js', 'ethers'],
};

export default nextConfig;
