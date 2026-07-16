function b64urlDecode(str: string) {
  // pad to length divisible by 4
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  );
}

/** Parse a JWT payload safely. Returns `null` on any error. */
export function parseJwt(token: string): null | { exp?: number; [k: string]: unknown } {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(b64urlDecode(payload));
  } catch {
    return null;
  }
}

const TOKEN_KEY = 'token';

/** Read the token from either store (localStorage = remembered, sessionStorage = this session only). */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

/** Store the token: remembered → localStorage (survives restarts), else sessionStorage. */
export function setToken(token: string, remember: boolean): void {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

/** True only if a *present* token is syntactically valid and unexpired */
export function isLoggedIn() {
  const token = getToken();
  if (!token) return false;

  const data = parseJwt(token);
  if (!data || typeof data.exp !== 'number') return false;

  return data.exp * 1000 > Date.now();
}

/** Role from the current token, or null if not logged in. */
export function getRole(): string | null {
  const token = getToken();
  if (!token) return null;
  const data = parseJwt(token);
  return (data?.role as string) ?? null;
}

export function isAdmin(): boolean {
  return getRole() === 'ADMIN';
}

export function logout(): void {
  clearToken();
  localStorage.removeItem('appSettings'); // settings cache belongs to the account
  window.location.assign('/login');
}

/** Username from the current token (display only). */
export function getUsername(): string | null {
  const token = getToken();
  if (!token) return null;
  const data = parseJwt(token);
  return (data?.username as string) ?? null;
}
