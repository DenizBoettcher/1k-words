import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../utils/bcrypt';
import { getPrisma } from '../prisma/prismaHelper';
// import { rateLimiter } from 'hono-rate-limiter';


const app = new Hono<{ Bindings: CloudflareBindings; Variables: { user?: { id: number; email: string } } }>();
const JWT_TTL = 60 * 60 * 2; // 2 h in seconds
const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const makeToken = (
  user: { id: number; email: string },
  secret: string,
) =>
  sign(
    {
      sub: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + JWT_TTL,
    },
    secret,
  );

const keyByIP = (c: any) =>
  c.req.header('CF-Connecting-IP') ??
  c.req.header('X-Forwarded-For') ??
  crypto.randomUUID();

app.post('/register', async (c) => {
  const body = await c.req.json();
  const { email, password } = Credentials.parse(body);

  const prisma = await getPrisma(c.env);
  if (await prisma.user.findUnique({ where: { email } })) {
    return c.json({ message: 'Email already in use' }, 409);
  }

  const hash = await hashPassword(password); 
  const user = await prisma.user.create({ data: { email, password: hash } });

  return c.json(
    {
      token: makeToken(user, c.env.JWT_SECRET),
      user: { id: user.id, email: user.email },
    },
    201,
  );
});

/* === /login  (15 min / 20 requests) === */
app.post(
  '/login',
  // rateLimiter({
  //   windowMs: 15 * 60_000,      // 15-minute sliding window
  //   limit: 20,                  // 20 requests per window
  //   keyGenerator: keyByIP,      // ← REQUIRED
  //   standardHeaders: true,      // adds RateLimit-* response headers
  // }),
  async (c) => {
    const body = await c.req.json();
    const { email, password } = Credentials.parse(body);

    const prisma = await getPrisma(c.env);
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user && (await verifyPassword(password, user.password));
    if (!ok) return c.json({ message: 'Invalid credentials' }, 401);

    return c.json({
      token: makeToken(user, c.env.JWT_SECRET),
      user: { id: user.id, email: user.email },
    });
  },
);

app.use('/me', async (c, next) => {
  const bearer = c.req.header('Authorization');
  if (!bearer?.startsWith('Bearer ')) return c.json({ message: 'Unauthorized' }, 401);

  try {
    const payload = await verify(
      bearer.slice(7),
      c.env.JWT_SECRET
    ) as { sub: number; email: string };

    c.set('user', { id: payload.sub, email: payload.email });
    await next();
  } catch {
    return c.json({ message: 'Unauthorized' }, 401);
  }
});

app.get('/me', (c) => c.json(c.get('user')!));

export default app;
