import { privateKeyToAccount } from 'viem/accounts';

export type TokenProvider = {
  getToken: () => Promise<string>;
  invalidateToken: () => void;
};

type JwtPayload = { exp?: number };

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

function expiryMs(token: string): number {
  const exp = decodeJwtPayload(token).exp;
  return exp ? exp * 1000 : Date.now() + 55 * 60 * 1000;
}

function domainFromUrl(url: string): string {
  return new URL(url).host;
}

export function createSiweTokenProvider(opts: {
  permissionsApiBaseUrl: string;
  privateKey: `0x${string}`;
  audience?: string;
}): TokenProvider {
  const { permissionsApiBaseUrl, privateKey, audience } = opts;
  const account = privateKeyToAccount(privateKey);

  let token: string | null = null;
  let expiresAt = 0;
  let inflight: Promise<string> | null = null;

  const login = async (): Promise<string> => {
    const domain = domainFromUrl(permissionsApiBaseUrl);

    const msgRes = await fetch(`${permissionsApiBaseUrl}/api/siwe-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: account.address,
        domain,
        ...(audience ? { audience } : {})
      })
    });

    if (!msgRes.ok) {
      throw new Error(`SIWE message request failed (${msgRes.status}). Check PRIVIDIUM_PERMISSIONS_API_BASE_URL.`);
    }

    const { msg } = (await msgRes.json()) as { msg?: string };
    if (!msg) throw new Error('SIWE message response missing msg.');

    const signature = await account.signMessage({ message: msg });
    const loginRes = await fetch(`${permissionsApiBaseUrl}/api/auth/login/crypto-native`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        signature,
        ...(audience ? { audience } : {})
      })
    });

    if (!loginRes.ok) {
      throw new Error(`SIWE login failed (${loginRes.status}). Verify DEPLOYER_PRIVATE_KEY has access.`);
    }

    const { token: nextToken } = (await loginRes.json()) as { token?: string };
    if (!nextToken) throw new Error('SIWE login response missing token.');

    token = nextToken;
    expiresAt = expiryMs(nextToken);
    return nextToken;
  };

  return {
    async getToken() {
      if (token && Date.now() < expiresAt - 60_000) {
        return token;
      }
      if (!inflight) {
        inflight = login().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
    invalidateToken() {
      token = null;
      expiresAt = 0;
    }
  };
}
