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

/** True only if a *present* token is syntactically valid and unexpired */
export function isLoggedIn() {
  const token = localStorage.getItem('token');
  if (!token) return false;

  const data = parseJwt(token);
  if (!data || typeof data.exp !== 'number') return false;

  return data.exp * 1000 > Date.now();
}
