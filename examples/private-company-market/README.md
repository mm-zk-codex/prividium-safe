# PrivateCompanyMarket (Prividium Example)

A lightweight internal prediction market designed for company teams. Individuals place private bets, while the YES/NO totals stay visible for everyone who is a member. It is meant for motivation, fun, and honest participation — not high-frequency trading.

## Why private internal markets work better

Prediction markets are powerful for surfacing honest opinions, but in a workplace context people often hesitate to bet publicly. This example uses Prividium's private storage so:

- **Individual bets remain private** (no social pressure).
- **Aggregate totals remain public** (so the team still sees sentiment).
- **Trust stays high** — even admins cannot read individual positions directly from storage.

## Public vs. private data

**Public to members** (readable via view methods):

- Market question
- Close time
- Status (Open / Closed / Resolved / Cancelled)
- `totalYes`, `totalNo`
- Derived probability (computed in the UI from totals)

**Private (Prividium storage)**:

- User YES amount
- User NO amount
- Claim status

The contract only exposes per-user data through `getMyPosition` and `quotePayout`, which require the caller to be the same address.

## Why no one can see individual bets

Prividium stores per-user positions in private storage. The contract does **not** emit events with bet data, and all UI queries read from storage-based view methods. That means:

- No public log contains individual wagers.
- Even resolvers and admins cannot read another user’s position.

## What’s included

- One contract (`PrivateCompanyMarket.sol`) managing many markets.
- Parimutuel payouts (winners split the total pool proportionally).
- Manual resolution by a trusted role.
- Member-only market listing.
- Simple React + Vite UI with markets list and detail views.

## Running locally

```bash
cd examples/private-company-market
npm install
npm run dev
```

### Environment variables

Create a `.env` file (or set these variables in your shell):

```
VITE_PRIVIDIUM_CLIENT_ID=your-client-id
VITE_PRIVATE_MARKET_CONTRACT_ADDRESS=0x...
VITE_PRIVIDIUM_CHAIN_ID=8022834
VITE_PRIVIDIUM_CHAIN_NAME=Prividium
VITE_PRIVIDIUM_RPC_URL=https://proxy.prividium.dev/rpc
VITE_PRIVIDIUM_AUTH_BASE_URL=https://user-panel.prividium.dev
VITE_PRIVIDIUM_PERMISSIONS_API_URL=https://permissions-api.prividium.dev
VITE_PRIVIDIUM_REDIRECT_URL=http://localhost:5173/auth/callback.html
```

## Creating a sample market

You can create markets using the UI if your wallet is on the creator allowlist. Otherwise, use a script or console to call `createMarket(question, closeTime)`.

Example questions:

- “Will Feature X ship by Friday?”
- “Will incident ABC be resolved today?”
- “Will we hit the sprint goal?”

### Example close time

If you are calling from a console, remember the contract expects a **UNIX timestamp** in seconds:

```
const closeTime = Math.floor(Date.now() / 1000) + 60 * 60 * 24; // 24 hours from now
```

## Acceptance checklist

- ✅ One contract manages many markets
- ✅ Private individual bets
- ✅ Public aggregate totals
- ✅ No events used
- ✅ Storage-based market listing
- ✅ Simple, friendly UI
- ✅ Uses `prividium@0.1.8`
