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

let tenantCache = { token: null, expiresAt: 0 };
let tenantInflight = null;

function tenantBaseUrl() {
  return config.tenantSiweBaseUrl || config.permissionsApiBaseUrl;
}

function decodeJwtExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.exp ? Number(payload.exp) * 1000 : null;
  } catch (_error) {
    return null;
  }
}

async function loginTenant() {
  if (!config.tenantPrivateKey) {
    throw new Error('TENANT_PRIVATE_KEY is required for TENANT_AUTH_MODE=siwe');
  }

  const account = privateKeyToAccount(config.tenantPrivateKey);
  const baseUrl = tenantBaseUrl();
  const domain = getDomainFromUrl(baseUrl);

  const msgRes = await fetch(`${baseUrl}/api/siwe-messages/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: account.address,
      domain,
      ...(config.tenantAudience ? { audience: config.tenantAudience } : {})
    })
  });
  if (!msgRes.ok) throw new Error(`Failed to request SIWE tenant message (${msgRes.status})`);
  const { msg } = await msgRes.json();

  const signature = await account.signMessage({ message: msg });
  const loginRes = await fetch(`${baseUrl}/api/jwt/from-siwe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: msg,
      signature,
      ...(config.tenantAudience ? { audience: config.tenantAudience } : {})
    })
  });
  if (!loginRes.ok) throw new Error(`Failed to get tenant JWT (${loginRes.status})`);

  const { token } = await loginRes.json();
  const exp = decodeJwtExp(token);
  tenantCache = { token, expiresAt: exp || Date.now() + 55 * 60 * 1000 };
  return token;
}

function invalidateTenantToken() {
  tenantCache = { token: null, expiresAt: 0 };
}

async function getTenantToken() {
  if (config.tenantAuthMode !== 'siwe') return null;

  const refreshAt = tenantCache.expiresAt - 60_000;
  if (tenantCache.token && Date.now() < refreshAt) return tenantCache.token;

  if (!tenantInflight) {
    tenantInflight = loginTenant().finally(() => {
      tenantInflight = null;
    });
  }

  return tenantInflight;
}

function methodFromBody(init) {
  try {
    const body = JSON.parse(init?.body || '{}');
    return body?.method || null;
  } catch (_error) {
    return null;
  }
}

function shouldUseTenantAuth(method) {
  return method === 'eth_getBlockReceipts';
}

async function applyTenantHeaders(headers, method) {
  if (!shouldUseTenantAuth(method) || config.tenantAuthMode === 'none') {
    return { headers, usingTenant: false };
  }

  if (config.tenantAuthMode !== 'siwe') {
    throw new Error('TENANT_AUTH_MODE must be one of: none, siwe');
  }

  const token = await getTenantToken();
  return {
    headers: { ...headers, Authorization: `Bearer ${token}` },
    usingTenant: true
  };
}

export async function authFetch(url, init = {}) {
  const serviceToken = await getServiceToken();
  const method = methodFromBody(init);

  const baseHeaders = {
    ...(init.headers || {}),
    Authorization: `Bearer ${serviceToken}`
  };

  const { headers, usingTenant } = await applyTenantHeaders(baseHeaders, method);
  let response = await fetch(url, { ...init, headers });

  if (usingTenant && response.status === 401) {
    invalidateTenantToken();
    const refreshedTenantToken = await getTenantToken();
    response = await fetch(url, {
      ...init,
      headers: { ...baseHeaders, Authorization: `Bearer ${refreshedTenantToken}` }
    });
  }

  return response;
}
