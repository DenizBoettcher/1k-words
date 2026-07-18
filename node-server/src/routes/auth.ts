import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../prisma';
import { JWT_SECRET, asyncHandler, authenticateJWT } from '../middleware/auth';
import { JWT_TTL_REMEMBER, JWT_TTL_SESSION, ROLES } from '../lib/config';
import type { RequestWithUser } from '../types';

const router = Router();

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
  rememberMe: boolean,
) {
  return jwt.sign(
    { sub: user.id, email: user.email, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: rememberMe ? JWT_TTL_REMEMBER : JWT_TTL_SESSION },
  );
}

/** ADMIN if the email matches ADMIN_EMAIL, or if it's the first-ever account. */
async function resolveRole(email: string, userCount: number): Promise<string> {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (adminEmail && email.toLowerCase().trim() === adminEmail) return ROLES.admin;
  if (userCount === 0) return ROLES.admin;
  return ROLES.user;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid registration' });
      return;
    }
    const email = parsed.data.email.toLowerCase().trim();
    const username = parsed.data.username.trim();
    const { password } = parsed.data;

    if (await prisma.user.findUnique({ where: { email } })) {
      res.status(409).json({ message: 'Email already in use' });
      return;
    }
    if (await prisma.user.findUnique({ where: { username } })) {
      res.status(409).json({ message: 'Username already taken' });
      return;
    }

    const role = await resolveRole(email, await prisma.user.count());
    const hash = await argon2.hash(password);
    const user = await prisma.user.create({ data: { email, username, password: hash, role } });

    // No token on register the user is sent to the login page afterwards.
    res.status(201).json({ user: { id: user.id, email: user.email, username: user.username, role: user.role } });
  }),
);

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = Credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }
    const email = parsed.data.email.toLowerCase().trim();
    const { password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user && (await argon2.verify(user.password, password));
    if (!ok || !user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    res.json({
      token: makeToken(user, parsed.data.rememberMe ?? true),
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    });
  }),
);

router.get('/me', authenticateJWT, (req, res) => {
  res.json((req as RequestWithUser).user);
});

export default router;
