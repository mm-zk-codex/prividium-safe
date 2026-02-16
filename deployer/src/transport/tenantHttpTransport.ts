import { type HttpTransportConfig, type Transport, http } from 'viem';
import type { TokenProvider } from '../auth/siweAuth';

export function tenantHttpTransport(
  rpcUrl: string,
  tokenProvider: TokenProvider,
  config?: HttpTransportConfig
): Transport {
  const baseFetch = config?.fetchFn ?? fetch;

  return http(rpcUrl, {
    ...config,
    fetchFn: async (url: RequestInfo | URL, init?: RequestInit) => {
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
