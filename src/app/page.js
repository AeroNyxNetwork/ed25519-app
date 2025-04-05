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
        
        {/* Features Section */}
        <section className="py-16 bg-background-50">
          <div className="container-custom">
            <h2 className="text-3xl font-bold text-center mb-12">
              <span className="gradient-text">Core Features</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="card glass-effect">
                <div className="mb-4 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3">Privacy-First SDK</h3>
                <p className="text-gray-300">
                  Our lightweight SDK implements state-of-the-art cryptographic protocols that ensure end-to-end privacy while enabling secure device-to-device connections.
                </p>
              </div>
              
              {/* Feature 2 */}
              <div className="card glass-effect">
                <div className="mb-4 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3">Resource Marketplace</h3>
                <p className="text-gray-300">
                  Create new value from underutilized computing resources. Trade GPU, CPU, bandwidth, and storage in a global, decentralized marketplace with instant settlement.
                </p>
              </div>
              
              {/* Feature 3 */}
              <div className="card glass-effect">
                <div className="mb-4 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3">Decentralized AI Infrastructure</h3>
                <p className="text-gray-300">
                  Contribute to and benefit from distributed AI training and inference. Keep data local while participating in global model improvement.
                </p>
              </div>
            </div>
          </div>
        </section>
        
        {/* CTA Section */}
        <section className="py-20 relative">
          <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
          <div className="container-custom relative z-10">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6">Ready to Join the Network?</h2>
              <p className="text-xl text-gray-300 mb-8">
                Connect your wallet, register your nodes, and start earning rewards for contributing to the AeroNyx ecosystem.
              </p>
              <button 
                onClick={connectWallet}
                className="button-primary text-lg py-3 px-8"
              >
                Get Started Now
              </button>
            </div>
          </div>
        </section>
      </main>
      
      {/* Footer */}
      <footer className="bg-background-100 border-t border-background-200 py-8">
        <div className="container-custom">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <div className="w-8 h-8 relative">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-full h-full">
                  <g transform="translate(0,512) scale(0.1,-0.1)" fill="#8A2BE2" stroke="none">
                    <path d="M1277 3833 l-1277 -1278 0 -1275 0 -1275 1280 1280 1280 1280 -2 1273 -3 1272 -1278 -1277z"/>
                    <path d="M3838 3833 l-1278 -1278 0 -1275 0 -1275 1280 1280 1280 1280 -2 1273 -3 1272 -1277 -1277z"/>
                  </g>
                </svg>
              </div>
              <span className="text-lg font-bold text-white">AeroNyx Network</span>
            </div>
            <div className="text-sm text-gray-400">
              © {new Date().getFullYear()} AeroNyx Network. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
