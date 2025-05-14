/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Remove the duplicate 'optimizeCss' at the top level as it's already in experimental
  images: {
    // Combine the images configuration to avoid duplication
    domains: ['api.aeronyx.network'],
    unoptimized: true, // This is needed for static export
  },
  // Keep the static export option since you're generating generateStaticParams
  output: 'export',
  // Improve asset handling with trailing slashes
  trailingSlash: true,
  // Disable sourcemaps in production for better performance
  productionBrowserSourceMaps: false,
  // Ensure proper loading of CSS - this is the correct place for optimizeCss
  experimental: {
    optimizeCss: false,
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
