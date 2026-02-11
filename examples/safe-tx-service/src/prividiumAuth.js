import { config } from './config.js';
import { privateKeyToAccount } from 'viem/accounts';

let cached = { token: null, expiresAt: 0 };

function getDomainFromUrl(url) {
  return new URL(url).host;
}

export async function getServiceToken() {
  if (cached.token && Date.now() < cached.expiresAt) return cached.token;

  const account = privateKeyToAccount(config.servicePrivateKey);
  const domain = getDomainFromUrl(config.permissionsApiBaseUrl);
  const msgRes = await fetch(`${config.permissionsApiBaseUrl}/api/siwe-messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address, domain })
  });
  if (!msgRes.ok) throw new Error('Failed to request SIWE message for service auth');
  const { msg } = await msgRes.json();

  const signature = await account.signMessage({ message: msg });

  const loginRes = await fetch(`${config.permissionsApiBaseUrl}/api/auth/login/crypto-native`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, signature })
  });
  if (!loginRes.ok) throw new Error('Failed to login service account');
  const { token } = await loginRes.json();
  cached = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return token;
}

export async function authFetch(url, init = {}) {
  const token = await getServiceToken();
  const headers = {
    ...(init.headers || {}),
    Authorization: `Bearer ${token}`
  };
  return fetch(url, { ...init, headers });
}
