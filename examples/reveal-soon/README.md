# RevealSoon (Prividium Example)

RevealSoon demonstrates **public teaser + private reveal** on Prividium: each message stores a public teaser immediately
and a private reveal that stays unreadable until a chosen time. There is **no explicit reveal transaction**—the payloads
are already on-chain and Prividium only changes read access when the reveal time arrives.

## What this demo teaches

- **Dual payloads on-chain**: both `publicText` and `privateText` are stored immediately in contract storage.
- **Public now, private later**: `publicText` is readable immediately; `privateText` becomes readable after `revealAt`.
- **No events needed**: the feed is built entirely from storage reads via view methods.
- **No explicit reveal**: there is no `reveal()` function; read access changes automatically.
- **No browser storage**: payloads are never saved to localStorage/sessionStorage.

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

The payloads are already stored in contract storage. RevealSoon only checks whether the current time is past
`revealAt`. If it is, anyone can read the private payload. If not, the read reverts. There is **no** function
that flips a flag or mutates state; the reveal is purely **view-level gating**.

## Why no events are used

Prividium chains restrict event visibility for privacy. This demo never queries events or past logs; the feed is built
entirely from contract storage view methods so it works within Prividium’s privacy model.

## How dual payload reads work

1. `createMessage(publicText, privateText, delaySeconds)` stores both parts, plus `createdAt` and `revealAt`.
2. `getMessageHeader(id)` and `getMessagesRange(start, count)` return metadata for list views.
3. `getPublicText(id)` is always readable.
4. `getPrivateText(id)` only succeeds after `revealAt` (otherwise it reverts).

## Why the payload is never stored in the browser

The secret message lives in contract storage and is protected by Prividium’s privacy layer. Storing it in
`localStorage` or `sessionStorage` would leak the secret. This demo keeps the payloads only in memory until the
transaction is submitted.

## Shareable message page

Each message has a shareable route at `/message/:id`. The page:

- Shows the public teaser immediately.
- Displays a live countdown to reveal.
- Shows author + timestamps + tx hash (if available in-session).
- Automatically fetches and displays the private text once revealed.
- Includes a **Share** button that copies the current URL.

## How the “Upcoming Unlocks” list is built

The contract only stores messages by incremental id. The UI:

1. Reads `getMessagesCount()`.
2. Fetches the most recent N ids with `getMessagesRange(start, count)`.
3. Reads each `publicText`.
4. Sorts client-side by `revealAt` ascending to show upcoming reveals.

## Notes for operators

- Permissions must allow `createMessage`, `getMessagesCount`, `getMessageHeader`, `getMessagesRange`, `getPublicText`,
  and `getPrivateText`.
- The demo uses storage reads only (no events).
- Payloads are never stored in browser storage; they remain in contract storage under Prividium privacy.
