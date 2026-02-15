import { privateKeyToAccount } from 'viem/accounts';

export type TenantTokenProvider = {
  getToken: () => Promise<string>;
  invalidateToken: () => void;
};

type JwtPayload = {
  exp?: number;
};

function decodeJwtPayload(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length < 2) return {};
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const normalized = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
  try {
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as JwtPayload;
  } catch (_error) {
    return {};
  }
}

function tokenExpiryMs(token: string): number {
  const payload = decodeJwtPayload(token);
  if (!payload.exp) return Date.now() + 55 * 60 * 1000;
  return payload.exp * 1000;
}

function domainFromUrl(url: string): string {
  return new URL(url).host;
}

export function createSiweTenantTokenProvider(opts: {
  tenantRpcBaseUrl: string;
  tenantAddress: `0x${string}`;
  tenantPrivateKey: `0x${string}`;
  audience?: string;
}): TenantTokenProvider {
  const { tenantRpcBaseUrl, tenantAddress, tenantPrivateKey, audience } = opts;
  const account = privateKeyToAccount(tenantPrivateKey);

  if (account.address.toLowerCase() !== tenantAddress.toLowerCase()) {
    throw new Error('TENANT_PRIVATE_KEY does not match tenantAddress');
  }

  let cachedToken: string | null = null;
  let expiresAt = 0;
  let inflight: Promise<string> | null = null;

  async function login(): Promise<string> {
    const domain = domainFromUrl(tenantRpcBaseUrl);
    const msgRes = await fetch(`${tenantRpcBaseUrl}/api/siwe-messages/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: tenantAddress,
        domain,
        ...(audience ? { audience } : {})
      })
    });

    if (!msgRes.ok) {
      throw new Error(
        `Tenant SIWE message request failed (${msgRes.status}). Check TENANT_SIWE_BASE_URL and tenant permissions.`
      );
    }

    const { msg } = (await msgRes.json()) as { msg?: string };
    if (!msg) {
      throw new Error('Tenant SIWE message response did not include msg.');
    }

    const signature = await account.signMessage({ message: msg });

    const loginRes = await fetch(`${tenantRpcBaseUrl}/api/jwt/from-siwe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        signature,
        ...(audience ? { audience } : {})
      })
    });

    if (!loginRes.ok) {
      throw new Error(
        `Tenant SIWE login failed (${loginRes.status}). Verify TENANT_PRIVATE_KEY is allowlisted for tenant access.`
      );
    }

    const { token } = (await loginRes.json()) as { token?: string };
    if (!token) {
      throw new Error('Tenant SIWE login response did not include token.');
    }

    cachedToken = token;
    expiresAt = tokenExpiryMs(token);
    return token;
  }

  return {
    async getToken() {
      const refreshAt = expiresAt - 60_000;
      if (cachedToken && Date.now() < refreshAt) {
        return cachedToken;
      }

      if (!inflight) {
        inflight = login().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
    invalidateToken() {
      cachedToken = null;
      expiresAt = 0;
    }
  };
}
