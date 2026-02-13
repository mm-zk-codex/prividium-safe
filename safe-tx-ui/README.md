# safe-tx-ui (Prividium login + Safe-like UX)

Minimal frontend with familiar Safe flow:

1. Login with Prividium
2. List safes where you are owner
3. Create or register safe
4. Propose tx
5. Sign confirmations
6. Execute once threshold is met

## Important architecture note

- UI **does not read events directly**.
- UI only calls backend endpoints from `safe-tx-service`.
- Backend is source of truth for proposal and confirmation collaboration state.

## Env

Create `.env.local`:

```bash
VITE_SAFE_TX_API_BASE_URL=http://localhost:4010
VITE_PRIVIDIUM_CLIENT_ID=...
VITE_RPC_URL=https://<prividium-rpc>/rpc
VITE_AUTH_BASE_URL=https://<auth-base>
VITE_PERMISSIONS_API_BASE_URL=https://<permissions-api-base>
VITE_REDIRECT_URL=http://localhost:5173/auth/callback.html
VITE_CHAIN_ID=7777
VITE_CHAIN_NAME="Prividium Demo"
VITE_EXPLORER_URL=https://<explorer>
```

## Run

```bash
npm install
npm run dev
```

## Security + demo notes

- Signatures in this demo are a simplified flow over `safeTxHash` for readability.
- Backend performs owner checks and signature verification before storing confirmations.
- Production builds should add stronger validation/UX for calldata construction and tx simulation.
