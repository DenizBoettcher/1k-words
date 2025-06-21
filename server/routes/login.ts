import {
  Router,
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { z } from 'zod';
import { PrismaClient, User } from '@prisma/client';
import type { Secret } from 'jsonwebtoken';
import { RequestWithUser } from './types/RequestWithUser';

const JWT_SECRET: Secret =
  process.env.JWT_SECRET ?? (() => { throw new Error('JWT_SECRET missing'); })();

const JWT_LIFETIME = '2h' as const;        // literal → OK for expiresIn

const prisma = new PrismaClient();

/* ─────────── 2. SMALL HELPERS ─────────── */
// Minimal async wrapper so we don’t repeat try/catch
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

// Create a JWT for one user
const makeToken = (user: User) =>
  jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_LIFETIME,
  });

// Guard middleware for protected routes
export const authenticateJWT: RequestHandler = (req, res, next) => {
  const bearer = req.headers.authorization;          // "Bearer <jwt>"

  /* 1 ─ Reject missing / malformed header */
  if (!bearer?.startsWith('Bearer ')) {
    res.sendStatus(401);     // <<< do NOT “return res.…”
    return;                  // <<< explicit void
  }

  /* 2 ─ Verify token */
  try {
    const payload = jwt.verify(bearer.slice(7), JWT_SECRET) as unknown as {
      sub: number;
      email: string;
    };

    (req as RequestWithUser).user = {
      id: payload.sub,
      email: payload.email,
    };

    next();                  // hand off to the real handler
  } catch {
    res.sendStatus(401);     // again, don’t return its value
  }
};


/* ─────────── 3. VALIDATION SCHEMAS ─────────── */
const Credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/* ─────────── 4. RATE LIMITER FOR /login ─────────── */
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 minutes
  max: 20,               // 20 requests / window / IP
  standardHeaders: true,
  legacyHeaders: false,
});

/* ─────────── 5. ROUTER ─────────── */
const router = Router();

/* ==== REGISTER ==== */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { email, password } = Credentials.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }

    const hash = await argon2.hash(password);
    const user = await prisma.user.create({
      data: { email, password: hash },
    });

    res
      .status(201)
      .json({ token: makeToken(user), user: { id: user.id, email: user.email } });
  }),
);

/* ==== LOGIN ==== */
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = Credentials.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user && (await argon2.verify(user.password, password));
    if (!ok) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    res.json({ token: makeToken(user), user: { id: user.id, email: user.email } });
  }),
);

/* ==== WHO-AM-I ==== */
router.get('/me', authenticateJWT, (req, res) => {
  res.json((req as RequestWithUser).user);   // cast only here
});


export default router;
