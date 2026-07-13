/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the shared workspace package (it ships raw TS from src).
  transpilePackages: ['@bearboard/shared'],
};

export default nextConfig;
