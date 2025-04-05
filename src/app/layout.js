import '@/styles/globals.css'
import { Inter } from 'next/font/google'
import { WalletProvider } from '../components/wallet/WalletProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'AeroNyx Network - Node Management Platform',
  description: 'Privacy-First Decentralized Computing Infrastructure',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet" />
      </head>
      <body className={inter.className}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  )
}
