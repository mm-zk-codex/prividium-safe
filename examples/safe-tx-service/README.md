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



## Safe setup

```shell
git clone https://github.com/safe-global/safe-smart-account.git
npm i
```

create .env file:

```
MNEMONIC="test test test test test test test test test test test junk"
RPC_URL="http://127.0.0.1:5050"
```

```shell
npm run deploy-all custom
```

If this fails with:

```
Error: Safe factory not found for network 6565. You can request a new deployment at https://github.com/safe-global/safe-singleton-factory
```

Then please run the safe singleton factory steps below:


### Safe singleton factory (optional, only if needed)

Safe singleton factory is alrady pre-deployed on many chain ids. If this is not present for yours, you have to do some manual steps below:

```shell
git clone git@github.com:safe-fndn/safe-singleton-factory.git
```

Set the .env file like above:

`.env` file:
```
MNEMONIC="test test test test test test test test test test test junk"
RPC="http://127.0.0.1:5050"
```


```shell
npm i
cast send -r http://localhost:5050 0xe1cb04a0fa36ddd16a06ea828007e35e1a3cbc37  --value 1ether --private-key 0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110

cast send -r http://localhost:5050 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  --value 1ether --private-key 0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110


npm run estimate-compile

npm run submit
# Deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

And copy the deployment json:

```shell
# current dir should be safe-smart-contract dir.
cp -r ../safe-singleton-factory/artifacts/6565  node_modules/@safe-global/safe-singleton-factory/artifacts/ 
```

After this, you can re-run `npm run deploy-all custom` - from the safe-smart-contract dir.


### After deployment

If you run succesful deployment, you'll end up with a list of contracts:

```
deploying "SimulateTxAccessor" (tx: 0x0b5c63761fb7797bdd7723442c29699857b21127f66d960f360b61ef3392a381)...: deployed at 0xe1AFD3020Bbde1dd2351E3951D583Bcd7199aAaC with 237931 gas
deploying "SafeProxyFactory" (tx: 0xbfe30d886ba243ee2a52127455b0df0b05881744aab880d75b4daf3d5d051fdf)...: deployed at 0x2457BedC31105b4EDbCbb9570945CB19d3dA303A with 836332 gas
deploying "TokenCallbackHandler" (tx: 0x3966fa56a04eb35796467e6a7287a99518eec12ff72de2acb5d6868b66dac967)...: deployed at 0x1f29B0e55FAdBf6f2d2A7e387837156481d9e29D with 585229 gas
deploying "CompatibilityFallbackHandler" (tx: 0xc10230e3276643a94206303deacf260e4dfcec0f4314f9232b9e90b689ad5c1c)...: deployed at 0x38ABF96Fb594CFB27329e8FcaD7Dcf5c525E91AD with 1411825 gas
deploying "ExtensibleFallbackHandler" (tx: 0xca1dc1ee415618e61e28fed386ead216b59d56fe77df7c2249995599f4684d71)...: deployed at 0xbC8Bc6271FcE3AaB3eA932a9EC6E3aD5B6c2ecA5 with 2566595 gas
deploying "CreateCall" (tx: 0x6493e2998c98357bd3a27077779e904b1a44297670ccc3207fa58e08b059c0c3)...: deployed at 0xd5F21d1526ac6987D708eb1E4e73D5c046F0bcb4 with 290470 gas
deploying "MultiSend" (tx: 0xdef82e172604002177f98900abce8350a6c5b83a0357319660f08c39b675926a)...: deployed at 0x7075C6C64fF577fD3e8716370619272e6c9A91A7 with 192464 gas
deploying "MultiSendCallOnly" (tx: 0x347d94d4b440dec8b0ff5e15566a83d01220edcefdb78d04b2f39caf15aa3cff)...: deployed at 0xE1F6069eF41eE266f1cED4b356d9375b55fb5408 with 144558 gas
deploying "SignMessageLib" (tx: 0x23784e0aa324159f10d45744a68b6aff52d5f483a5893c5f0339d79be89d05be)...: deployed at 0xDd19e2cc5665238E9Fa94C866a496A6Ac7E2860b with 262417 gas
deploying "SafeToL2Setup" (tx: 0x7168c15a325244285c99f851755dcadf681db01e9ad402ed220cff8601c283f3)...: deployed at 0x63b6182cDc56093d060E22a4430dacFA3955782B with 230863 gas
deploying "Safe" (tx: 0x6e344755083a0022388eabc2c9a00ce5d6da7e324833dce7227c4b7c5046391d)...: deployed at 0xdA647F99c013dD4F2C633687B7f175461F75B1c0 with 4529836 gas
deploying "SafeL2" (tx: 0x4d5807e40e9414ec62df1faddf9a943d52b6ec54b645c0fbfaf0a14a2a736e8c)...: deployed at 0xFe14616941ba84558B77E2B53f0dbFB296C05653 with 4698847 gas
deploying "SafeMigration" (tx: 0x8b913db9ba1404cdbd3ec18e6719fd2628ee787f43b19163ee6a9c7ea00bf436)...: deployed at 0xb025Bf6aC7bAC251510dFe53F87ae89C7060fcc9 with 512882 gas
```

2 of them are the most important ones:

* SafeProxyFactory - this is what we'll be calling to create a new safe
* Safe - this is so called 'safe singleton'.


