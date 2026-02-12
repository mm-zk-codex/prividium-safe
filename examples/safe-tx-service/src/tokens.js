import { getAddress } from 'viem';
import { config } from './config.js';
import { SUPPORTED_TOKENS, WITHDRAWABLE_TOKENS } from './config/tokens.js';
import { authFetch } from './prividiumAuth.js';
import { createPublicClient, http } from 'viem';

const ERC20_METADATA_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }
];

const metadataCache = new Map();
const authTransport = http(config.rpcUrl, { fetch: authFetch });
const publicClient = createPublicClient({ transport: authTransport });

function normalize(address) {
  return getAddress(address).toLowerCase();
}

export function getSupportedTokenAddresses() {
  return (SUPPORTED_TOKENS[config.chainId] || []).map(normalize);
}

export function isSupportedToken(address) {
  const supported = getSupportedTokenAddresses();
  return supported.includes(normalize(address));
}

export function getWithdrawableTokenAddresses() {
  return (WITHDRAWABLE_TOKENS[config.chainId] || []).map(normalize);
}

export function isWithdrawableToken(address) {
  const supported = getWithdrawableTokenAddresses();
  return supported.includes(normalize(address));
}

export async function getTokenMetadata(address) {
  const normalized = normalize(address);
  if (metadataCache.has(normalized)) {
    return metadataCache.get(normalized);
  }

  const [name, symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: normalized, abi: ERC20_METADATA_ABI, functionName: 'name' }),
    publicClient.readContract({ address: normalized, abi: ERC20_METADATA_ABI, functionName: 'symbol' }),
    publicClient.readContract({ address: normalized, abi: ERC20_METADATA_ABI, functionName: 'decimals' })
  ]);

  const metadata = {
    address: normalized,
    name,
    symbol,
    decimals: Number(decimals)
  };
  metadataCache.set(normalized, metadata);
  return metadata;
}

export async function listSupportedTokens() {
  const supported = getSupportedTokenAddresses();
  const withdrawable = new Set(getWithdrawableTokenAddresses());
  const tokens = await Promise.all(supported.map((address) => getTokenMetadata(address)));
  return tokens.map((token) => ({
    ...token,
    withdrawToL1: withdrawable.has(token.address)
  }));
}
