import { formatEther } from 'viem';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function formatAddress(address) {
  if (!address) return 'Unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTimestamp(seconds) {
  if (!seconds) return 'Unknown';
  return new Date(Number(seconds) * 1000).toLocaleString();
}

export function formatCountdown(seconds) {
  if (!seconds) return 'Unknown';
  const diffMs = Number(seconds) * 1000 - Date.now();
  if (diffMs <= 0) return 'Closed';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `Closes in ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Closes in ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Closes in ${diffDays}d`;
}

export function formatEth(amount) {
  if (amount === undefined || amount === null) return '0.0';
  const value = Number(formatEther(amount));
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function percentShare(yesTotal, noTotal) {
  const total = yesTotal + noTotal;
  if (total === 0n) return { yes: 0, no: 0 };
  const yesPct = Number((yesTotal * 10000n) / total) / 100;
  return { yes: yesPct, no: 100 - yesPct };
}
