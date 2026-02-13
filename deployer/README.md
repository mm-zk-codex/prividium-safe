# Deployer

This image compiles and deploys contracts on first run.

## What it does

1. Connects to Postgres using `DATABASE_URL`.
2. Checks `app_config` for required Safe addresses.
3. If already present, writes `/shared/contracts.json` and exits.
4. Otherwise compiles contracts with Hardhat (Safe sources are cloned during image build), deploys contracts, and stores addresses in:
   - `app_config`
   - `/shared/contracts.json`

## Required env vars

- `DATABASE_URL`
- `L2_RPC_URL`
- `CHAIN_ID`
- `DEPLOYER_PRIVATE_KEY`

Optional:

- `MULTISEND_ADDRESS` (skip MultiSend deploy)
- `PRIVATE_CONTRACT_DEPLOYMENTS` JSON array for extra contracts.

Example:

```json
[
  {
    "key": "my_private_contract_address",
    "artifact": "contracts/MyPrivate.sol/MyPrivate.json",
    "constructorArgs": ["arg1"]
  }
]
```

## Private contracts

Place private Solidity contracts in `deployer/contracts/` before building, or mount/clone them into this folder in your CI pipeline.
