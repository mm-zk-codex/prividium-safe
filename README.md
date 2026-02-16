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

3. Configure tenant auth mode:

   - `TENANT_AUTH_MODE=siwe` (recommended/default for privileged RPC)
   - `TENANT_AUTH_MODE=none` (dev mode)

   When `TENANT_AUTH_MODE=siwe` for deployer init, set:

   - `PRIVIDIUM_PERMISSIONS_API_BASE_URL`
   - optional `TENANT_AUDIENCE`

   For runtime tenant-authenticated privileged RPC calls, additionally set:

   - `TENANT_SIWE_BASE_URL`
   - `TENANT_PRIVATE_KEY`

4. Start services:

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

## Tenant SIWE authentication

Why we use it: privileged sequencer/RPC methods require tenant authorization.

- For deployment/init, a **regular Prividium SIWE JWT** is obtained with the deployer wallet.
- The JWT is automatically attached to viem JSON-RPC HTTP calls via a transport wrapper.
- On `401 Unauthorized`, the token is invalidated, refreshed, and the RPC call is retried once automatically.


## Other steps

* create an admin user (or at least with deployment permissions) for DEPLOYER_PRIVATE_KEY
* User for service (SERVICE_PRIVATE_KEY)
   * permissions to access ERC20 and 10004


