import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../utils/bcrypt';
import { getPrisma } from '../prisma/prismaHelper';
import type { AppEnv } from '../types/AppContext';
import { JWT_TTL_REMEMBER, JWT_TTL_SESSION, ROLES } from '../lib/config';

const app = new Hono<AppEnv>();

const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  rememberMe: z.boolean().optional(),
});

const RegisterBody = z.object({
  email: z.string().email(),
  username: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_.-]+$/,
    'Username may use letters, numbers, and . _ -'),
  password: z.string().min(8),
});

function makeToken(
  user: { id: number; email: string; username: string; role: string },
  secret: string,
  rememberMe: boolean,
) {
  return sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + (rememberMe ? JWT_TTL_REMEMBER : JWT_TTL_SESSION),
    },
    secret,
  );
}

/**
 * A user becomes ADMIN if their email matches the ADMIN_EMAIL secret, or if
 * they are the very first account created (bootstrap). Everyone else is USER.
 */
async function resolveRole(
  email: string,
  env: CloudflareBindings,
  userCount: number,
): Promise<string> {
  const adminEmail = env.ADMIN_EMAIL?.toLowerCase().trim();
  if (adminEmail && email.toLowerCase().trim() === adminEmail) return ROLES.admin;
  if (userCount === 0) return ROLES.admin;
  return ROLES.user;
}

app.post('/register', async (c) => {
  const parsed = RegisterBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ message: parsed.error.issues[0]?.message ?? 'Invalid registration' }, 400);
  }
  const email = parsed.data.email.toLowerCase().trim();
  const username = parsed.data.username.trim();
  const { password } = parsed.data;

  const prisma = getPrisma(c.env);
  if (await prisma.user.findUnique({ where: { email } })) {
    return c.json({ message: 'Email already in use' }, 409);
  }
  if (await prisma.user.findUnique({ where: { username } })) {
    return c.json({ message: 'Username already taken' }, 409);
  }

  const userCount = await prisma.user.count();
  const role = await resolveRole(email, c.env, userCount);
  const hash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { email, username, password: hash, role },
  });

  // No token on register the user is sent to the login page afterwards.
  return c.json({ user: { id: user.id, email: user.email, username: user.username, role: user.role } }, 201);
});

app.post('/login', async (c) => {
  const parsed = Credentials.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ message: 'Invalid credentials' }, 401);
  }
  const email = parsed.data.email.toLowerCase().trim();
  const { password } = parsed.data;

  const prisma = getPrisma(c.env);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && (await verifyPassword(password, user.password));
  if (!ok || !user) return c.json({ message: 'Invalid credentials' }, 401);

  return c.json({
    token: await makeToken(user, c.env.JWT_SECRET, parsed.data.rememberMe ?? true),
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
  });
});

app.get('/me', async (c) => {
  const bearer = c.req.header('Authorization');
  if (!bearer?.startsWith('Bearer ')) return c.json({ message: 'Unauthorized' }, 401);

  try {
    const payload = (await verify(bearer.slice(7), c.env.JWT_SECRET)) as {
      sub: number;
      email: string;
      username?: string;
      role: string;
    };
    return c.json({ id: payload.sub, email: payload.email, username: payload.username ?? '', role: payload.role });
  } catch {
    return c.json({ message: 'Unauthorized' }, 401);
  }
});

export default app;
