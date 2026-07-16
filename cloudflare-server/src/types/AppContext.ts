/**
 * Shared Hono generics. Import this everywhere instead of re-declaring the
 * Bindings/Variables shape per route, and read the authenticated user with
 * the typed `c.get('user')`.
 */
export interface AuthUser {
  id: number;
  email: string;
  username: string;
  role: string;
}

export interface AppEnv {
  Bindings: CloudflareBindings;
  Variables: { user: AuthUser };
}
