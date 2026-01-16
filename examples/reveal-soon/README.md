# RevealSoon (Prividium Example)

RevealSoon demonstrates **time-gated privacy** on Prividium: a secret message is stored immediately in contract storage,
but only becomes publicly readable after a chosen delay. There is **no explicit reveal transaction**—the payload is
already on-chain and Prividium simply changes read access based on time.

## What this demo teaches

- **Time-gated privacy**: payloads are stored immediately, but readable only after `revealAt`.
- **No events needed**: the feed is built entirely from storage reads via view methods.
- **No explicit reveal**: there is no `reveal()` function; read access changes automatically.
- **No browser storage**: secret payloads are never saved to localStorage or sessionStorage.

## Setup

### 1) Install dependencies

```bash
cd examples/reveal-soon
npm install
```

### 2) Deploy the demo contract (once)

Deploy `contracts/RevealSoon.sol` to your Prividium chain and configure method permissions in the admin panel.

Example using Foundry + the Prividium proxy:

```bash
npx prividium proxy \
  -r https://proxy.prividium.dev/ \
  -u https://user-panel.prividium.dev/

# in another terminal
forge create \
  --rpc-url http://127.0.0.1:24101/rpc \
  --private-key <YOUR_KEY> \
  contracts/RevealSoon.sol:RevealSoon \
  --broadcast
```

Copy the deployed contract address.

### 3) Configure environment variables

Create `examples/reveal-soon/.env.local`:

```bash
VITE_PRIVIDIUM_CLIENT_ID=your-client-id
VITE_PRIVIDIUM_RPC_URL=https://proxy.prividium.dev/rpc
VITE_PRIVIDIUM_AUTH_BASE_URL=https://user-panel.prividium.dev
VITE_PRIVIDIUM_PERMISSIONS_API_URL=https://permissions-api.prividium.dev
VITE_PRIVIDIUM_CHAIN_ID=8022834
VITE_PRIVIDIUM_CHAIN_NAME=Prividium
VITE_PRIVIDIUM_EXPLORER_URL=https://explorer.prividium.dev
VITE_REVEAL_SOON_CONTRACT_ADDRESS=0xYourDeployedContract
```

> Note: `VITE_PRIVIDIUM_EXPLORER_URL` should be the base explorer URL; the app appends `/tx/<hash>`.

## Run

```bash
npm run dev
```

Open the URL printed by Vite.

## Why there is no explicit reveal transaction

The payload is already stored in contract storage. RevealSoon only checks whether the current time is past
`revealAt`. If it is, anyone can read the payload. If not, the read reverts or returns empty. There is **no** function
that flips a flag or mutates state; the reveal is purely **view-level gating**.

## Why no events are used

Prividium chains restrict event visibility for privacy. This demo never queries events or past logs; the feed is built
entirely from contract storage view methods so it works within Prividium’s privacy model.

## How time-gated reads work

1. `createMessage(payload, delaySeconds)` stores the payload, `createdAt`, and `revealAt` in contract storage.
2. `getRecentMessages(limit, offset)` reads headers (id, author, createdAt, revealAt, isRevealedNow).
3. If `isRevealedNow` is true, the UI calls `getMessagePayload(id)` to display the text.
4. If `isRevealedNow` is false, the UI shows a placeholder and does **not** reveal the content.

## Why the payload is never stored in the browser

The secret message lives in contract storage and is protected by Prividium’s privacy layer. Storing it in
`localStorage` or `sessionStorage` would leak the secret. This demo keeps the message only in memory until the
transaction is submitted.

## How this differs from a public chain

On a standard public chain, anyone can read transaction calldata and contract storage immediately. With Prividium,
**the payload is still on-chain** but **unreadable until the reveal time**. The chain already holds the data—Prividium
controls when it becomes publicly readable.

## Notes for operators

- The feed uses `getMessagesCount()` + `getRecentMessages(limit, offset)` and **no events**.
- Permissions must allow `createMessage`, `getMessagesCount`, `getRecentMessages`, and `getMessagePayload`.
- Secrets are **not** stored in browser storage; they remain in contract storage under Prividium privacy.
