function extractAddress(payload) {
  const candidates = [
    payload?.address,
    payload?.walletAddress,
    payload?.wallet?.address,
    payload?.user?.address,
    payload?.user?.walletAddress
  ];
  return candidates.find((v) => typeof v === 'string' && v.startsWith('0x'))?.toLowerCase() || null;
}

function extractUserId(payload) {
  return payload?.userId || payload?.user?.id || null;
}

export async function requireAuth(req, permissionsApiBaseUrl) {
  const auth = req.header('authorization');
  if (!auth?.toLowerCase().startsWith('bearer ')) {
    const err = new Error('Missing bearer token');
    err.status = 401;
    throw err;
  }
  const token = auth.slice('bearer '.length).trim();

  const response = await fetch(`${permissionsApiBaseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = new Error('Invalid Prividium session');
    err.status = 401;
    throw err;
  }
  const payload = await response.json();
  const userAddress = extractAddress(payload);
  if (!userAddress) {
    const err = new Error('Prividium session missing wallet address');
    err.status = 401;
    throw err;
  }
  return { userAddress, userId: extractUserId(payload), raw: payload };
}

export function authMiddleware(permissionsApiBaseUrl) {
  return async (req, _res, next) => {
    try {
      req.auth = await requireAuth(req, permissionsApiBaseUrl);
      next();
    } catch (error) {
      next(error);
    }
  };
}
