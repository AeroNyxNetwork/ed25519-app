/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['api.aeronyx.network'],
  },
  // Output as a static export for maximum compatibility
  output: 'export',
  // Fix for static export
  images: {
    unoptimized: true,
  },
  // Improve asset handling with trailing slashes
  trailingSlash: true,
  // Disable sourcemaps in production for better performance
  productionBrowserSourceMaps: false,
  // Ensure proper loading of CSS
  experimental: {
    optimizeCss: true,
  },
  // Simple rewrites if needed but commented out for static export
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/:path*',
  //       destination: `${process.env.NEXT_PUBLIC_API_URL || 'https://api.aeronyx.network'}/:path*`,
  //     },
  //   ];
  // },
}

module.exports = nextConfig
