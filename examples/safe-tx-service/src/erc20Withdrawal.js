import { createPublicClient, encodeAbiParameters, getAddress, http } from 'viem';
import { authFetch } from './prividiumAuth.js';
import { config } from './config.js';

export const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
export const L2_ASSET_ROUTER = '0x0000000000000000000000000000000000010003';
export const L2_NATIVE_TOKEN_VAULT = '0x0000000000000000000000000000000000010004';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const L2_NATIVE_TOKEN_VAULT_ABI = [{
  type: 'function',
  name: 'assetId',
  stateMutability: 'view',
  inputs: [{ name: 'token', type: 'address' }],
  outputs: [{ type: 'bytes32' }]
}];

const L2_ASSET_ROUTER_ABI = [{
  type: 'function',
  name: 'withdraw',
  stateMutability: 'payable',
  inputs: [
    { name: 'assetId', type: 'bytes32' },
    { name: 'withdrawalData', type: 'bytes' }
  ],
  outputs: []
}];

const BRIDGEHUB_ABI = [{
  type: 'function',
  name: 'assetRouter',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'address' }]
}];

const L1_ASSET_ROUTER_ABI = [{
  type: 'function',
  name: 'nativeTokenVault',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'address' }]
}];

const L1_NATIVE_TOKEN_VAULT_ABI = [{
  type: 'function',
  name: 'tokenAddress',
  stateMutability: 'view',
  inputs: [{ name: 'assetId', type: 'bytes32' }],
  outputs: [{ type: 'address' }]
}];

const l2Client = createPublicClient({ transport: http(config.rpcUrl, { fetch: authFetch }) });
const l1Client = createPublicClient({ transport: http(config.l1RpcUrl) });

const tokenParamsCache = new Map();
let cachedL1AssetRouter = null;
let cachedL1NativeTokenVault = null;

function normalizeAddress(address) {
  return getAddress(address).toLowerCase();
}

async function getL1AssetRouterAddress() {
  if (cachedL1AssetRouter) return cachedL1AssetRouter;
  if (config.l1AssetRouterAddress) {
    cachedL1AssetRouter = normalizeAddress(config.l1AssetRouterAddress);
    return cachedL1AssetRouter;
  }
  const fromBridgehub = await l1Client.readContract({
    address: normalizeAddress(config.bridgehubAddress),
    abi: BRIDGEHUB_ABI,
    functionName: 'assetRouter'
  });
  cachedL1AssetRouter = normalizeAddress(fromBridgehub);
  return cachedL1AssetRouter;
}

async function getL1NativeTokenVaultAddress() {
  if (cachedL1NativeTokenVault) return cachedL1NativeTokenVault;
  const l1AssetRouter = await getL1AssetRouterAddress();
  const nativeTokenVault = await l1Client.readContract({
    address: l1AssetRouter,
    abi: L1_ASSET_ROUTER_ABI,
    functionName: 'nativeTokenVault'
  });
  cachedL1NativeTokenVault = normalizeAddress(nativeTokenVault);
  return cachedL1NativeTokenVault;
}

export async function getErc20WithdrawalParams(l2TokenAddress) {
  const normalizedToken = normalizeAddress(l2TokenAddress);
  const cached = tokenParamsCache.get(normalizedToken);
  if (cached) return cached;

  const assetId = await l2Client.readContract({
    address: L2_NATIVE_TOKEN_VAULT,
    abi: L2_NATIVE_TOKEN_VAULT_ABI,
    functionName: 'assetId',
    args: [normalizedToken]
  });

  if (!assetId || assetId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    const err = new Error('Token is not registered in the L2 Native Token Vault');
    err.status = 400;
    throw err;
  }

  const l1NativeTokenVault = await getL1NativeTokenVaultAddress();
  const l1TokenAddress = normalizeAddress(await l1Client.readContract({
    address: l1NativeTokenVault,
    abi: L1_NATIVE_TOKEN_VAULT_ABI,
    functionName: 'tokenAddress',
    args: [assetId]
  }));

  const params = {
    spender: L2_NATIVE_TOKEN_VAULT,
    l1TokenAddress,
    withdrawTo: L2_ASSET_ROUTER,
    withdrawDataBuilder: ({ amountBaseUnits, recipient }) => {
      const withdrawalData = encodeAbiParameters(
        [
          { name: 'amount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'token', type: 'address' }
        ],
        [BigInt(amountBaseUnits), normalizeAddress(recipient), ZERO_ADDRESS]
      );

      return {
        abi: L2_ASSET_ROUTER_ABI,
        functionName: 'withdraw',
        args: [assetId, withdrawalData]
      };
    }
  };

  tokenParamsCache.set(normalizedToken, params);
  return params;
}
