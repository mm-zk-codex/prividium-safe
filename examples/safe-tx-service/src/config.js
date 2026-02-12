import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 4010),
  databaseUrl: required('DATABASE_URL'),
  rpcUrl: required('PRIVIDIUM_RPC_URL'),
  l1RpcUrl: required('L1_RPC_URL'),
  bridgehubAddress: process.env.L1_BRIDGEHUB_ADDRESS || null,
  l1AssetRouterAddress: process.env.L1_ASSET_ROUTER_ADDRESS || null,
  l1NullifierAddress: process.env.L1_NULLIFIER_ADDRESS || null,
  l1RelayerPrivateKey: required('L1_RELAYER_PRIVATE_KEY'),
  permissionsApiBaseUrl: required('PRIVIDIUM_PERMISSIONS_API_BASE_URL'),
  chainId: Number(required('CHAIN_ID')),
  l2ChainId: Number(required('L2_CHAIN_ID')),
  servicePrivateKey: required('SERVICE_PRIVATE_KEY'),
  safeFactoryAddress: process.env.SAFE_FACTORY_ADDRESS || null,
  safeSingletonAddress: process.env.SAFE_SINGLETON_ADDRESS || null,
  allowAdminSync: process.env.ALLOW_ADMIN_SYNC === 'true',
  syncPollMs: Number(process.env.SYNC_POLL_MS || 0),
  nativeSymbol: process.env.NATIVE_SYMBOL || 'ETH',
  nativeDecimals: Number(process.env.NATIVE_DECIMALS || 18),
  withdrawalPollMs: Number(process.env.WITHDRAWAL_POLL_MS || 10000)
};

if (!config.l1NullifierAddress && !config.bridgehubAddress && !config.l1AssetRouterAddress) {
  throw new Error('Set L1_NULLIFIER_ADDRESS or provide L1_BRIDGEHUB_ADDRESS / L1_ASSET_ROUTER_ADDRESS for nullifier discovery');
}
