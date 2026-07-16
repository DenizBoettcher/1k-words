import type { MiddlewareHandler } from 'hono';
import { verify } from 'hono/jwt';
import { getPrisma } from '../prisma/prismaHelper';
import type { AppEnv } from '../types/AppContext';
import type { JwtPayload } from '../types/JwtPayload';
import { ROLES } from '../lib/config';

/**
 * Verifies the bearer token AND confirms the user still exists, reading the
 * fresh role/username from the database. The extra PK lookup per request is
 * cheap and eliminates stale-token bugs (e.g. after a DB reset) — a 401 makes
 * the client log out and return to the login page automatically.
 */
export const authenticateJWT: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const token =
    authHeader?.startsWith('Bearer ') && authHeader.slice(7).trim();

  if (!token) {
    return c.json({ message: 'Missing auth token' }, 401);
  }

  let payload: JwtPayload;
  try {
    payload = (await verify(token, c.env.JWT_SECRET)) as JwtPayload;
  } catch {
    return c.json({ message: 'Invalid or expired token' }, 401);
  }

  if (typeof payload.sub !== 'number') {
    return c.json({ message: 'Malformed token' }, 401);
  }

  const prisma = getPrisma(c.env);
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, username: true, role: true },
  });
  if (!user) {
    return c.json({ message: 'Account no longer exists — please sign in again' }, 401);
  }

  c.set('user', {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role ?? ROLES.user,
  });
  await next();
};

/** Guard that additionally requires the ADMIN role. Chain after authenticateJWT. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user || user.role !== ROLES.admin) {
    return c.json({ message: 'Admin only' }, 403);
  }
  await next();
};
