# AeroNyx Network - Node Management Platform

AeroNyx Network is a privacy-first decentralized computing infrastructure that empowers billions of devices with a secure foundation for device-to-device collaboration in a global marketplace.

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Key Features](#key-features)
- [Components](#components)
- [API Integration](#api-integration)
- [Wallet Integration](#wallet-integration)
- [Blockchain Integration](#blockchain-integration)
- [Development](#development)

## Project Overview

AeroNyx Network is built as a web platform that allows users to register and manage nodes, integrate with various blockchain networks, and monitor performance and earnings. The platform enables users to contribute their computing resources to the network and earn rewards.

The application is built with:
- **Next.js 13** with App Router
- **React** for UI components
- **Tailwind CSS** for styling
- **Web3 wallet integration** for authentication
- **Static export** for maximum compatibility

## Architecture

The application follows a modern client-server architecture with Next.js App Router:

1. **Server Components**: Handle data fetching, static site generation, and SEO optimization.
2. **Client Components**: Handle interactivity, state management, and user interface elements.
3. **API Integration**: Communicates with the AeroNyx backend API for node registration and management.
4. **Wallet Integration**: Uses Web3 wallets (e.g., OKX Wallet) for authentication and signing transactions.
5. **Static Export**: The application is configured for static export, making it deployable to any static hosting service.

## Project Structure

```
src/
├── app/                     # Next.js App Router structure
│   ├── dashboard/           # Dashboard pages
│   │   ├── blockchain-integration/  # Blockchain integration pages
│   │   ├── network/         # Network statistics page
│   │   ├── nodes/           # Node management pages
│   │   ├── register/        # Node registration page
│   │   └── page.js          # Main dashboard page
│   ├── layout.js            # Root layout component
│   └── page.js              # Homepage
├── components/              # Reusable UI components
│   ├── dashboard/           # Dashboard-specific components
│   ├── layout/              # Layout components like Header
│   └── wallet/              # Wallet-related components
├── hooks/                   # Custom React hooks
├── lib/                     # Utility libraries
│   ├── api/                 # API service functions
│   ├── constants/           # Application constants
│   └── utils/               # Utility functions
└── styles/                  # Global styles
    └── globals.css          # Tailwind CSS and global styles
```

## Key Features

1. **Wallet Authentication**: Users connect their Web3 wallet to access the platform.
2. **Node Registration**: Register computing devices to the AeroNyx network.
3. **Node Management**: Monitor and manage registered nodes.
4. **Blockchain Integration**: Connect nodes to blockchain networks like Solana and Monad.
5. **Network Statistics**: View global network statistics and performance metrics.

## Components

### Layout Components

- **Header (`components/layout/Header.js`)**: 
  - Main navigation component
  - Handles responsive menu toggle
  - Integrates with wallet connection

### Wallet Components

- **WalletProvider (`components/wallet/WalletProvider.js`)**: 
  - Context provider for wallet state
  - Methods: `connectWallet()`, `disconnectWallet()`
  - Manages wallet connection state

- **ConnectWallet (`components/wallet/ConnectWallet.js`)**: 
  - UI component for wallet connection
  - Displays wallet address and connection status

### Dashboard Components

- **NodeStatusCard (`components/dashboard/NodeStatusCard.js`)**: 
  - Displays node status and key metrics
  - Shows resource utilization

- **NodeList (`components/dashboard/NodeList.js`)**: 
  - Lists all user nodes
  - Handles node filtering and expansion
  - Contains node action controls

- **NetworkStatusChart (`components/dashboard/NetworkStatusChart.js`)**: 
  - Visualizes network statistics
  - Supports different time ranges
  - Handles chart type switching

- **BlockchainIntegrationModule (`components/dashboard/BlockchainIntegrationModule.js`)**: 
  - Modal for blockchain network selection
  - Displays blockchain details and requirements

## Page Components

### Dashboard Pages

- **Dashboard (`app/dashboard/page.js`)**: 
  - Main dashboard overview
  - Shows node stats and quick actions

- **Nodes Page (`app/dashboard/nodes/page.js`)**: 
  - List of all user nodes
  - Blockchain integration module
  - Node management controls

- **Register Page (`app/dashboard/register/page.js`)**: 
  - Multi-step node registration workflow
  - Resource selection
  - Registration code generation

- **Network Page (`app/dashboard/network/page.js`)**: 
  - Network-wide statistics
  - Resource utilization graphs
  - Geographic distribution data

### Blockchain Integration Pages

- **Blockchain Integration Page (`app/dashboard/blockchain-integration/page.js`)**: 
  - Lists available blockchain networks
  - Blockchain selection interface

- **Blockchain Detail Page (`app/dashboard/blockchain-integration/[blockchain]/page.js`)**: 
  - Server component that uses `generateStaticParams()` to pre-generate routes
  - Imports and renders the client component

- **Blockchain Detail Client (`app/dashboard/blockchain-integration/[blockchain]/client-page.js`)**: 
  - Client component with UI logic
  - Multi-step blockchain integration process
  - Requirements check, setup instructions, and completion

## API Integration

The application communicates with the AeroNyx backend API through service modules:

- **API Service (`lib/api/index.js`)**: 
  - Base API service with authentication
  - Methods for various endpoints

- **Node Registration Service (`lib/api/nodeRegistration.js`)**: 
  - Specialized service for node registration
  - Methods: `createNode()`, `generateRegistrationCode()`, `checkNodeStatus()`

## Wallet Integration

The wallet integration is handled through:

- **Wallet Provider Context**: Manages wallet state and connection
- **Message Signing**: Uses `signMessage()` for authentication
- **Transaction Handling**: For blockchain integration

## Blockchain Integration

The platform supports integration with multiple blockchain networks:

1. **Solana**: High-throughput blockchain optimized for scalability
2. **Monad**: Next-gen blockchain for high-frequency financial applications
3. More coming soon (Ethereum, etc.)

Each integration follows a three-step process:
1. **Requirements Check**: Ensures node meets hardware requirements
2. **Setup Instructions**: Guides user through validator setup
3. **Integration Completion**: Finalizes the integration process

## Development

### Key Configuration

The project uses a custom Next.js configuration to support static export:

```javascript
// next.config.js
const nextConfig = {
  output: 'export',  // Static export
  images: {
    unoptimized: true,  // Required for static export
    domains: ['api.aeronyx.network'],
  },
  experimental: {
    optimizeCss: false,
  },
  // Other configurations...
}
```

### Server and Client Component Pattern

The application follows Next.js App Router's pattern of separating:

1. **Server Components**: For static generation and data fetching
2. **Client Components**: For interactive elements with hooks and state

This is particularly important for pages with dynamic routes that use `generateStaticParams()`, which must be a server component, while UI logic with hooks must be in client components.

### Utility Functions

The `lib/utils` directory contains several utility modules:

- **Blockchain Utilities (`lib/utils/blockchain.js`)**: 
  - Functions for blockchain interactions
  - Methods: `sendRegistrationTransaction()`, `waitForTransaction()`

- **Wallet Signature Utilities (`lib/utils/walletSignature.js`)**: 
  - Functions for message signing
  - Methods: `signMessage()`, `formatMessageForSigning()`, `createSignatureMessage()`

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`
4. Build for production: `npm run build`

## Deployment

The application is configured for static export, making it deployable to any static hosting service, including:

- Vercel
- Netlify
- GitHub Pages
- Amazon S3
- And many more

Simply run `npm run build` to generate the static export files.
