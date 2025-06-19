/**
 * Next.js Configuration for AeroNyx Platform
 * 
 * File Path: next.config.js
 * 
 * Production-optimized configuration with proper build settings,
 * environment variables, and performance optimizations.
 * 
 * @version 1.0.0
 * @author AeroNyx Development Team
 * @since 2025-01-19
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // React configuration
  reactStrictMode: true,
  swcMinify: true,
  
  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.aeronyx.network',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'wss://api.aeronyx.network',
  },

  // Image optimization
  images: {
    domains: ['api.aeronyx.network'],
    unoptimized: true, // For static export compatibility
  },

  // Experimental features
  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'd3',
      'three',
      'lodash',
      'mathjs'
    ],
  },

  // Headers configuration
  async headers() {
    return [
      {
        // Dashboard routes should not be cached
        source: '/dashboard/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, must-revalidate',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      {
        // API routes
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/dashboard',
        has: [
          {
            type: 'host',
            value: 'localhost',
          },
        ],
        permanent: false,
        destination: '/',
      },
    ];
  },

  // Webpack configuration
  webpack: (config, { isServer, dev }) => {
    // Resolve fallbacks for client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        util: false,
        events: require.resolve('events/'),
      };
    }

    // Production optimizations
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20,
            },
            // Common chunk
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true,
            },
            // React runtime chunk
            react: {
              name: 'react',
              chunks: 'all',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
              reuseExistingChunk: true,
            },
            // Chart libraries chunk
            charts: {
              name: 'charts',
              chunks: 'all',
              test: /[\\/]node_modules[\\/](recharts|d3|victory)[\\/]/,
              priority: 25,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }

    return config;
  },

  // TypeScript configuration (for future migration)
  typescript: {
    ignoreBuildErrors: true, // Temporarily ignore TS errors during migration
  },

  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: false,
  },

  // Output configuration
  output: 'standalone',
  
  // Trailing slash configuration
  trailingSlash: false,

  // Power by header
  poweredByHeader: false,

  // Compression
  compress: true,

  // Generate build ID
  generateBuildId: async () => {
    return process.env.BUILD_ID || `build-${Date.now()}`;
  },
};

module.exports = nextConfig;
