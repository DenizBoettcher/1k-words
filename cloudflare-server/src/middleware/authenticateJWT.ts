import type { MiddlewareHandler } from 'hono';
import { verify } from 'hono/jwt';
import { getPrisma } from '../prisma/prismaHelper';
import { User } from '../generated/prisma';
import { JwtPayload } from '../types/JwtPayload';


export const authenticateJWT: MiddlewareHandler<
  { Bindings: CloudflareBindings; Variables: { user?: User } }
> = async (c, next) => {
  /* 1. ── Extract the raw token ─────────────────────────────────── */
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') && authHeader.slice(7).trim()

  if (!token) {
    return c.json({ message: 'Missing auth token' }, 401);
  }

  /* 2. ── Verify signature & expiration ─────────────────────────── */
  let payload: JwtPayload;
  try {
    payload = (await verify(token, c.env.JWT_SECRET)) as JwtPayload;
  } catch {
    return c.json({ message: 'Invalid or expired token' }, 401);
  }

  /* 3. ── Basic sanity check on payload ─────────────────────────── */
  if (typeof payload.sub !== 'number' || !payload.email) {
    return c.json({ message: 'Malformed token' }, 401);
  }

  /* 4. ── Look the user up in DB ────────────────────────────────── */
  const prisma = await getPrisma(c.env);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });

  if (!user) {
    // Account was deleted or never existed
    return c.json({ message: 'User no longer exists' }, 401);
  }

  /* 6. ── Attach user to context & continue ─────────────────────── */
  c.set('user', user);
  await next();
};
