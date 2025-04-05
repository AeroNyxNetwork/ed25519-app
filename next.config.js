/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['api.aeronyx.network'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_NETWORK_ID: process.env.NEXT_PUBLIC_NETWORK_ID,
  },
  // Add API route rewrites if using Next.js API routes as a proxy
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.aeronyx.network'}/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
