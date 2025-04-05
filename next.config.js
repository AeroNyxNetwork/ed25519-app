/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['api.aeronyx.network'],
  },
  // The environment variables will be automatically included
  // by Next.js if they start with NEXT_PUBLIC_
  // No need to explicitly define them here
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
