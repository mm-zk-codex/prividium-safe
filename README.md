# prividium-safe

## Quick start

1. Copy env template:

   ```bash
   cp .env.example .env
   ```

2. Fill required variables:

   - `DATABASE_URL`
   - `L2_RPC_URL`
   - `CHAIN_ID`
   - `DEPLOYER_PRIVATE_KEY` (used only by the one-shot `init` service)

   Optional tenant auth variables:

   - `TENANT_AUTH_MODE`
   - `TENANT_API_KEY`
   - `TENANT_WALLET_PRIVATE_KEY`

3. Start services:

   ```bash
   docker compose up --build
   ```

## Contract initialization flow

- `init` builds from `./deployer`.
- On first run it compiles and deploys Safe/private contracts.
- It stores deployed addresses in:
  - Postgres table `app_config`
  - shared volume file `/shared/contracts.json`
- On later runs it detects existing records, prints `already initialized`, and exits without redeploying.

Runtime services do not receive `DEPLOYER_PRIVATE_KEY`.
