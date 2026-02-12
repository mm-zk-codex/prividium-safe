import dotenv from 'dotenv';
import { getAddress } from 'viem';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function normalizeAddress(address) {
  return getAddress(address).toLowerCase();
}

function resolveMultiSendAddress(chainId) {
  const direct = process.env.MULTISEND_ADDRESS;
  if (direct) return normalizeAddress(direct);

  const byChainRaw = process.env.MULTISEND_ADDRESS_BY_CHAIN;
  if (!byChainRaw) {
    throw new Error('Missing env var: MULTISEND_ADDRESS (or MULTISEND_ADDRESS_BY_CHAIN)');
  }
  let parsed;
  try {
    parsed = JSON.parse(byChainRaw);
  } catch (_error) {
    throw new Error('MULTISEND_ADDRESS_BY_CHAIN must be valid JSON');
  }
  const chainAddress = parsed?.[String(chainId)];
  if (!chainAddress) {
    throw new Error(`Missing MultiSend address for chain ${chainId} in MULTISEND_ADDRESS_BY_CHAIN`);
  }
  return normalizeAddress(chainAddress);
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
  multisendAddress: resolveMultiSendAddress(Number(required('CHAIN_ID'))),
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
