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
  permissionsApiBaseUrl: required('PRIVIDIUM_PERMISSIONS_API_BASE_URL'),
  chainId: Number(process.env.CHAIN_ID || 7777),
  servicePrivateKey: required('SERVICE_PRIVATE_KEY'),
  safeFactoryAddress: process.env.SAFE_FACTORY_ADDRESS || null,
  safeSingletonAddress: process.env.SAFE_SINGLETON_ADDRESS || null,
  allowAdminSync: process.env.ALLOW_ADMIN_SYNC === 'true',
  syncPollMs: Number(process.env.SYNC_POLL_MS || 0)
};
