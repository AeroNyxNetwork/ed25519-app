// This is a Server Component - remove 'use client'
import React from 'react';
import Link from 'next/link';

// This function tells Next.js which paths to pre-generate at build time
export async function generateStaticParams() {
  // Pre-generate pages for these blockchain types
  return [
    { blockchain: 'solana' },
    { blockchain: 'monad' }
  ];
}

// Client component wrapper for the page content
import BlockchainIntegrationClient from './client-page';

// Server component
export default function BlockchainIntegrationPage({ params }) {
  const { blockchain } = params;
  
  return <BlockchainIntegrationClient blockchainId={blockchain} />;
}
