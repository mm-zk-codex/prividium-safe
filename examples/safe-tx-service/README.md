# safe-tx-service (Prividium + Safe-style transaction service)

Minimal backend service that mirrors Safe Transaction Service concepts while using Prividium-authenticated sessions.

## What this example demonstrates

- **Prividium-backed auth** for every API call (`Authorization: Bearer <prividium_jwt>`).
- **Safe-style API** under `/v1` (`/me`, `/safes`, proposals, confirmations, execute).
- **Postgres collaboration layer** for proposals/signatures.
- **Optional sequencer sync loop** (`POST /v1/admin/sync` or polling) to process chain logs and keep local state aligned.

## Auth model

`src/auth.js` verifies the bearer token against the Prividium Permissions API endpoint `GET /api/auth/me`, then extracts
wallet identity and attaches it as `req.auth`.

This keeps backend session verification aligned with Prividium's token model (same session token issued by the
Permissions API).

## API (summary)

All routes require auth:

- `GET /v1/me`
- `GET /v1/safes`
- `GET /v1/safes/:safeAddress`
- `POST /v1/safes`
- `POST /v1/safes/:safeAddress/register`
- `GET /v1/safes/:safeAddress/transactions`
- `POST /v1/safes/:safeAddress/transactions`
- `POST /v1/transactions/:safeTxHash/confirmations`
- `POST /v1/transactions/:safeTxHash/execute`
- `POST /v1/admin/sync` (disabled unless `ALLOW_ADMIN_SYNC=true`)

## Signature scheme

This demo uses **raw `eth_sign`/EIP-191 style signatures over `safeTxHash` bytes**:

1. Backend computes `safeTxHash = keccak256(abi.encode(safeAddress,to,value,data,operation,nonce))`.
2. Owner signs that hash in the UI (`signMessage({ message: { raw: safeTxHash } })`).
3. Backend recovers signer with `recoverAddress({ hash: safeTxHash, signature })` and requires it to match
   authenticated owner address.

> This is intentionally minimal and not a full Safe EIP-712 implementation.

## Environment

```bash
DATABASE_URL=postgres://...
PRIVIDIUM_RPC_URL=https://<prividium-rpc>/rpc
PRIVIDIUM_PERMISSIONS_API_BASE_URL=https://<permissions-api-base>
SERVICE_PRIVATE_KEY=0x...
CHAIN_ID=7777
PORT=4010
SAFE_FACTORY_ADDRESS=0x...        # required for POST /v1/safes create
SAFE_SINGLETON_ADDRESS=0x...      # required for POST /v1/safes create
ALLOW_ADMIN_SYNC=false
SYNC_POLL_MS=0
```

## Run

```bash
npm install
npm run db:init
npm run dev
```

## DB schema/migrations

- SQL init file: `sql/init.sql`
- Init command: `npm run db:init`

## Event sync notes

- Sync currently scans logs from `fromBlock` to latest, and stores checkpoint in `sync_state.last_synced_block`.
- Endpoint: `POST /v1/admin/sync` (must enable `ALLOW_ADMIN_SYNC=true`).
- Polling mode: set `SYNC_POLL_MS` and `ALLOW_ADMIN_SYNC=true`.

This is deliberately lightweight for demo use.

## Security notes (demo-only)

- Service key signs/executes transactions; secure it with proper secret management.
- Add rate limiting, CORS origin allowlists, and hardened auth checks for production.
- Do not expose `/v1/admin/sync` publicly without stronger admin auth.
