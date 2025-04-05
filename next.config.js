/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['api.aeronyx.network'],
  },
  // Improve asset handling with trailing slashes
  trailingSlash: true,
  // Optimize CSS and JS asset loading
  optimizeFonts: true,
  // Add custom headers for better caching
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*.css',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
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
