import { type HttpTransportConfig, type Transport, http } from 'viem';
import type { TenantTokenProvider } from '../tenant/siweTenantAuth';

export function tenantHttpTransport(
  rpcUrl: string,
  tokenProvider: TenantTokenProvider,
  config?: HttpTransportConfig
): Transport {
  const baseFetch = config?.fetch ?? fetch;

  return http(rpcUrl, {
    ...config,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      const sendWithToken = async (token: string) => {
        const headers = new Headers(init?.headers as HeadersInit);
        headers.set('Authorization', `Bearer ${token}`);

        return baseFetch(url, {
          ...init,
          headers
        });
      };

      let token = await tokenProvider.getToken();
      let response = await sendWithToken(token);

      if (response.status === 401) {
        tokenProvider.invalidateToken();
        token = await tokenProvider.getToken();
        response = await sendWithToken(token);
      }

      return response;
    }
  });
}
