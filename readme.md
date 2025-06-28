src/
├── app/                              # Next.js 13 App Router
│   ├── dashboard/                    # Dashboard pages
│   │   ├── page.js                  # Main dashboard (uses DashboardContent)
│   │   ├── nodes/page.js            # Nodes listing (uses NodesContent)
│   │   ├── register/page.js         # Node registration
│   │   ├── network/page.js          # Network statistics
│   │   └── blockchain-integration/  # Blockchain integration pages
│   ├── layout.js                    # Root layout with WalletProvider
│   └── page.js                      # Landing page
│
├── components/
│   ├── dashboard/
│   │   └── DashboardContent.js      # Dashboard UI (uses useAeroNyxWebSocket)
│   ├── nodes/
│   │   └── NodesContent.js          # Nodes listing UI (uses useAeroNyxWebSocket)
│   ├── wallet/
│   │   ├── WalletProvider.js        # Global wallet context (OKX wallet)
│   │   └── ConnectWallet.js         # Wallet connection button
│   └── layout/
│       └── Header.js                # App header (non-dashboard pages only)
│
├── hooks/
│   ├── useAeroNyxWebSocket.js       # ⭐ CRITICAL: Unified WebSocket hook
│   └── useSignature.js              # Wallet signature caching
│
├── lib/
│   ├── api/
│   │   └── nodeRegistration.js      # REST API service (node creation only)
│   ├── utils/
│   │   └── walletSignature.js       # Wallet signing utilities
│   └── services/
│       └── CacheService.js          # Unified caching service
│
└── styles/
└── globals.css                  # Global styles with Tailwind

## 🔑 Critical Components

### 1. **useAeroNyxWebSocket Hook** (`src/hooks/useAeroNyxWebSocket.js`)
- **Purpose**: Centralized WebSocket connection management
- **Used by**: DashboardContent.js, NodesContent.js
- **Features**:
  - Auto-connects when wallet is connected
  - Handles authentication flow
  - Manages real-time node updates
  - Provides refresh functionality
  - Shares single connection across components

### 2. **WebSocket Flow** (MUST follow exactly)
Connect to wss://api.aeronyx.network/ws/aeronyx/user-monitor/
Receive 'connected' message
Send 'get_message' with wallet_address
Receive 'signature_message' with message to sign
Sign message with wallet (extract address from message)
Send 'auth' with signature, message, wallet_type='okx'
Receive 'auth_success' with initial nodes
Send 'start_monitor' to begin monitoring
Receive periodic 'status_update' messages

### 3. **Wallet Integration**
- **Provider**: OKX Wallet (`window.okxwallet`)
- **Context**: WalletProvider.js wraps entire app
- **Signing**: Must extract wallet address from signature message for consistency

## ⚠️ Important Notes

### WebSocket Rules
1. **NO REST API calls for node data** - All node data comes from WebSocket
2. **Single WebSocket connection** - Shared between Dashboard and Nodes pages
3. **Message signing** - MUST extract wallet address from the message itself
4. **Wallet type** - Always send `wallet_type: 'okx'` in auth message

### Deleted Files (DO NOT recreate)
- `/src/lib/websocket/NodeWebSocketService.js`
- `/src/services/websocket/index.js`
- `/src/hooks/useNodeMonitor.js`
- `/src/lib/utils/websocketAuth.js`
- `/src/lib/utils/websocketDataTransformer.js`
- `/src/components/providers/WebSocketProvider.js`

### REST API Usage
Only used for:
- Node creation (`createNode`)
- Registration code generation (`generateRegistrationCode`)
- Signature message generation (`generateSignatureMessage`)

## 🚀 Key Features

1. **Real-time Node Monitoring**
   - Live status updates via WebSocket
   - CPU, memory, disk, network metrics
   - Earnings tracking

2. **Node Management**
   - Register new nodes
   - View node details
   - Blockchain integration (Solana, Monad)

3. **Dashboard Analytics**
   - Total nodes count
   - Active/offline status
   - Resource utilization
   - Earnings summary

## 📝 Code Patterns

### Using the WebSocket Hook
```javascript
const {
  nodes,           // Array of node objects
  stats,           // Statistics object
  wsState,         // WebSocket connection state
  refresh,         // Function to reconnect
  isLoading,       // Loading state
  error           // Error message
} = useAeroNyxWebSocket({
  autoConnect: true,
  autoMonitor: true
});

Node Object Structure
javascript{
  code: "AERO-12345",           // Unique reference code
  name: "My Node",              // User-defined name
  status: "active",             // active, offline, pending
  type: "General Purpose",      // Node type
  performance: {
    cpu: 45,                    // CPU usage %
    memory: 60,                 // Memory usage %
    disk: 30,                   // Disk usage %
    network: 20                 // Network usage %
  },
  earnings: "123.45",           // Total earnings
  last_seen: "2024-01-01..."    // ISO timestamp
}

🔧 Development Tips

WebSocket Debugging

Check browser console for [useAeroNyxWebSocket] logs
Monitor Network tab for WebSocket frames
Verify wallet is connected before WebSocket connects


State Management

All node data comes from useAeroNyxWebSocket hook
No local state for nodes in components
Wallet state is global via WalletProvider


Error Handling

WebSocket auto-reconnects up to 5 times
Signature caching prevents repeated signing
User-friendly error messages with retry options



🚫 Common Pitfalls

DO NOT implement WebSocket logic in components
DO NOT call REST API for node monitoring data
DO NOT modify the WebSocket message flow
DO NOT store nodes in component state
ALWAYS use wallet_type: 'okx' in auth

📊 Performance Optimizations

Single WebSocket connection shared across pages
Signature caching for 30 minutes
Lazy loading for dashboard/nodes pages
Memoized calculations for stats
Optimized re-renders with proper dependencies
