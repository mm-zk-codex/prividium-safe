import { createPrividiumChain } from 'prividium';
import { defineChain } from 'viem';

const chain = defineChain({
  id: Number(import.meta.env.VITE_CHAIN_ID || 7777),
  name: import.meta.env.VITE_CHAIN_NAME || 'Prividium Demo Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_RPC_URL] } },
  blockExplorers: { default: { name: 'Explorer', url: import.meta.env.VITE_EXPLORER_URL || 'https://example.com' } }
});

export const prividium = createPrividiumChain({
  clientId: import.meta.env.VITE_PRIVIDIUM_CLIENT_ID,
  chain,
  rpcUrl: import.meta.env.VITE_RPC_URL,
  authBaseUrl: import.meta.env.VITE_AUTH_BASE_URL,
  permissionsApiBaseUrl: import.meta.env.VITE_PERMISSIONS_API_BASE_URL,
  redirectUrl: import.meta.env.VITE_REDIRECT_URL,
  onAuthExpiry: () => window.location.reload()
});

export const API_BASE_URL = import.meta.env.VITE_SAFE_TX_API_BASE_URL || 'http://localhost:4010';
