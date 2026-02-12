import { concatHex, getAddress, hexToBytes, pad, toHex } from 'viem';

function normalizeAddress(address) {
  return getAddress(address).toLowerCase();
}

function encodeSubcall(call) {
  const data = call.data || '0x';
  const dataBytes = hexToBytes(data);
  const value = call.value ?? 0n;

  return concatHex([
    toHex(call.operation, { size: 1 }),
    normalizeAddress(call.to),
    pad(toHex(value), { size: 32 }),
    pad(toHex(dataBytes.length), { size: 32 }),
    data
  ]);
}

export function encodeMultiSendTransactions(calls) {
  if (!Array.isArray(calls) || calls.length === 0) {
    return '0x';
  }
  return calls.reduce((acc, call) => concatHex([acc, encodeSubcall(call)]), '0x');
}
