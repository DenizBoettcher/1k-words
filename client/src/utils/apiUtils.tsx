import { getToken, clearToken } from './authUtils';
// The client is served by the same Worker as the API, so calls are same-origin
// under /api  no CORS, no build-time API URL to configure. An override is only
// needed when running the CRA dev server against a remote worker.
export const ApiUrl = import.meta.env.VITE_API_URL ?? '';

export function getAuthHeader(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function RequestApi(
  segments: string,
  requestInit: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${ApiUrl}/api/${segments}`, {
    ...requestInit,
    headers: { ...requestInit.headers, ...getAuthHeader() },
  });

  if (res.status === 401) {
    // Token expired / invalid  bounce to login.
    clearToken();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  }
  return res;
}

/** Parse a JSON response, throwing the server's { message } on failure. */
export async function jsonOrThrow<T>(res: Response): Promise<T> {
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && (body as any).message) ||
      (typeof body === 'string' ? body : `Request failed (${res.status})`);
    throw new Error(message);
  }
  return body as T;
}
