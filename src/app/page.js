'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/layout/Header';
import { useWallet } from '../components/wallet/WalletProvider';

export default function Home() {
  const { wallet, connectWallet } = useWallet();
  const router = useRouter();

  // Redirect to dashboard if already connected
  React.useEffect(() => {
    if (wallet.connected) {
      router.push('/dashboard');
    }
  }, [wallet.connected, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="py-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
          <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-gradient-radial from-primary-500/20 to-transparent blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-gradient-radial from-secondary-500/20 to-transparent blur-3xl"></div>
          
          <div className="container-custom relative z-10">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-5xl md:text-6xl font-bold mb-6">
                <span className="gradient-text">Privacy-First</span> Decentralized Computing Infrastructure
              </h1>
              <p className="text-xl text-gray-300 mb-10">
                AeroNyx Network empowers billions of devices with its privacy-first SDK, establishing a secure foundation for device-to-device collaboration in our global marketplace.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={connectWallet}
                  className="button-primary text-lg py-3 px-8"
                >
                  Connect Wallet to Start
                </button>
                <a
                  href="https://docs.aeronyx.network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button-outline text-lg py-3 px-8"
                >
                  Read Documentation
                </a>
              </div>
            </div>
          </div>
        </section>
